import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc } from 'firebase/firestore';

// ... I can't easily run it outside of the app context without setting up the environment.
