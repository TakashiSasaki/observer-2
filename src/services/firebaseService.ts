import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { signInWithPopup, signInAnonymously, signOut, User } from 'firebase/auth';
import { db, auth, googleProvider } from '../firebase';
import { ObservationSet, VisibilityType, ObserverUser } from '../types';
import { ObservationSetModel } from '../models/ObservationModel';
import { processImageToWebP } from '../utils/imageUtils';

const COLLECTION_NAME = 'observations';
const LOCAL_STORAGE_KEY = 'observation_hub_local_cache';

// User Auth Helpers
export async function loginWithGoogle(): Promise<ObserverUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return formatUser(result.user);
}

export async function loginAnonymously(): Promise<ObserverUser> {
  const result = await signInAnonymously(auth);
  return formatUser(result.user);
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function formatUser(user: User): ObserverUser {
  return {
    uid: user.uid,
    displayName: user.displayName || (user.isAnonymous ? '匿名観測者' : '観測者'),
    photoURL: user.photoURL || undefined,
    email: user.email || undefined,
    isAnonymous: user.isAnonymous,
  };
}

// Local Storage Cache Helpers (for instant UI feel & offline fallback)
function getLocalObservations(): ObservationSet[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const list: Record<string, any>[] = JSON.parse(raw);
    return list.map((item) => ObservationSetModel.fromFirestore(item.id, item).toJSON());
  } catch {
    return [];
  }
}

function saveLocalObservations(items: ObservationSet[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}

// Save ObservationSet using ObservationSetModel and converting image to WebP (1024x768)
export async function createObservation(obsData: Omit<ObservationSet, 'id'> & { id?: string }): Promise<ObservationSet> {
  // Client-side image WebP 1024x768 processing
  let processedImageUrl = obsData.imageUrl;
  if (obsData.imageUrl) {
    try {
      processedImageUrl = await processImageToWebP(obsData.imageUrl, 1024, 768, 0.85);
    } catch (err) {
      console.warn('WebP image conversion fallback:', err);
    }
  }

  const model = new ObservationSetModel({
    ...obsData,
    imageUrl: processedImageUrl,
  });

  try {
    if (auth.currentUser) {
      const batch = writeBatch(db);

      // 1. Save main observation set with canonical model.id
      const setRef = doc(db, COLLECTION_NAME, model.id);
      batch.set(setRef, {
        ...model.toFirestoreData(),
        createdAt: Timestamp.now(),
      });

      // 2. Save individual sub-observations to /singleObservations collection if present
      if (model.observations && model.observations.length > 0) {
        for (const singleObs of model.observations) {
          const singleRef = doc(db, 'singleObservations', singleObs.id);
          batch.set(singleRef, {
            ...singleObs,
            parentSetId: model.id,
            uid: model.uid,
            userId: model.uid,
            schemaVersion: singleObs.schemaVersion || '1.0.0',
            createdAt: Timestamp.now(),
          });
        }
      }

      await batch.commit();
    }
  } catch (e) {
    console.warn('Firestore write warning, fallback to local storage:', e);
  }

  const newObs = model.toJSON();

  // Update local cache
  const local = getLocalObservations();
  local.unshift(newObs);
  saveLocalObservations(local);

  return newObs;
}

// Fetch Observations
export async function fetchObservations(
  filterMode: 'mine' | 'shared' | 'authenticated' | 'public',
  currentUserUid?: string,
  currentUserEmail?: string
): Promise<ObservationSet[]> {
  const localList = getLocalObservations();

  try {
    const colRef = collection(db, COLLECTION_NAME);
    let q;

    if (filterMode === 'mine' && currentUserUid) {
      q = query(
        colRef,
        where('uid', '==', currentUserUid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    } else if (filterMode === 'authenticated') {
      q = query(
        colRef,
        where('visibility', '==', 'authenticated'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    } else if (filterMode === 'shared') {
      if (currentUserEmail) {
        q = query(
          colRef,
          where('visibility', '==', 'shared'),
          where('allowedEmails', 'array-contains', currentUserEmail),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
      } else {
        q = query(
          colRef,
          where('visibility', '==', 'shared'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
      }
    } else if (filterMode === 'public') {
      q = query(
        colRef,
        where('visibility', '==', 'public'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    }

    if (q) {
      const snapshot = await getDocs(q);
      const firestoreItems: ObservationSet[] = snapshot.docs.map((d) => {
        const model = ObservationSetModel.fromFirestore(d.id, d.data());
        return model.toJSON();
      });

      if (firestoreItems.length > 0) {
        return firestoreItems;
      }
    }
  } catch (e) {
    console.warn('Firestore query error, using local fallback:', e);
  }

  // Fallback filtering from local cache
  return localList.filter((item) => {
    if (filterMode === 'mine') {
      return currentUserUid ? (item.uid === currentUserUid || (item as any).userId === currentUserUid) : true;
    } else if (filterMode === 'authenticated') {
      return item.visibility === 'authenticated';
    } else if (filterMode === 'shared') {
      if (item.visibility !== 'shared') return false;
      if (!currentUserEmail) return true;
      return Array.isArray(item.allowedEmails) && item.allowedEmails.includes(currentUserEmail);
    } else {
      return item.visibility === 'public';
    }
  });
}

// Update Visibility & Allowed Emails
export async function updateObservationVisibility(
  id: string,
  newVisibility: VisibilityType,
  allowedEmails: string[] = []
): Promise<void> {
  const sanitizedAllowedEmails = newVisibility === 'shared' ? allowedEmails : [];
  try {
    if (auth.currentUser) {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, { visibility: newVisibility, allowedEmails: sanitizedAllowedEmails });
    }
  } catch (e) {
    console.warn('Firestore update error:', e);
  }

  // Sync local cache
  const local = getLocalObservations();
  const updated = local.map((item) => (item.id === id ? { ...item, visibility: newVisibility, allowedEmails: sanitizedAllowedEmails } : item));
  saveLocalObservations(updated);
}

// Delete Observation
export async function deleteObservation(id: string): Promise<void> {
  try {
    if (auth.currentUser) {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
    }
  } catch (e) {
    console.warn('Firestore delete error:', e);
  }

  // Sync local cache
  const local = getLocalObservations();
  const filtered = local.filter((item) => item.id !== id);
  saveLocalObservations(filtered);
}
