import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Demo fallback configuration when Firebase project is not provisioned yet
let firebaseConfig: any = {
  apiKey: "demo-api-key",
  authDomain: "demo-app.firebaseapp.com",
  projectId: "demo-app",
  storageBucket: "demo-app.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:demo"
};

// Dynamically import config if generated
try {
  const configs = (import.meta as any).glob('../firebase-applet-config.json', { eager: true }) as Record<string, any>;
  if (configs['../firebase-applet-config.json']) {
    firebaseConfig = configs['../firebase-applet-config.json'].default || configs['../firebase-applet-config.json'];
  }
} catch (err) {
  console.warn('firebase-applet-config.json not found, utilizing fallback config.', err);
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export default app;
