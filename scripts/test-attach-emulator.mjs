import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, runTransaction, doc, setDoc, connectFirestoreEmulator } from 'firebase/firestore';
import { connectAuthEmulator } from 'firebase/auth';
import { v7 as uuidv7 } from 'uuid';

const app = initializeApp({ projectId: 'demo-test' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

async function run() {
  const email = `test-${Date.now()}@example.com`;
  await createUserWithEmailAndPassword(auth, email, 'password');
  console.log('Signed in as', auth.currentUser.uid);
  const uid = auth.currentUser.uid;

  const setId = uuidv7();
  const obsId = uuidv7();

  const setPayload = {
    id: setId, uid, observerName: null, observerPhoto: null, type: 'manual', title: 'set', summary: '', rawContent: '',
    imageUrl: null, imagePath: null, location: null, visibility: 'private', allowedEmails: [], tags: [], metadata: {},
    schemaVersion: '2.0.0', createdAt: new Date(), updatedAt: new Date(), deletedAt: null
  };
  const obsPayload = {
    id: obsId, uid, observerName: null, observerPhoto: null, type: 'manual', title: 'obs', summary: '', rawContent: '',
    imageUrl: null, imagePath: null, location: null, visibility: 'private', allowedEmails: [], metadata: {},
    schemaVersion: '2.0.0', createdAt: new Date(), updatedAt: new Date(), deletedAt: null
  };

  await setDoc(doc(db, 'observationSets', setId), setPayload);
  await setDoc(doc(db, 'observations', obsId), obsPayload);
  console.log('Created endpoints');

  const memId = `${setId}__${obsId}`;
  await runTransaction(db, async (t) => {
    t.set(doc(db, 'observationSetMemberships', memId), {
      id: memId,
      observationSetId: setId,
      observationId: obsId,
      uid,
      position: 0,
      schemaVersion: '2.0.0',
      createdAt: new Date()
    });
  });
  console.log('Membership created in transaction!');
}
run().catch(console.error);
