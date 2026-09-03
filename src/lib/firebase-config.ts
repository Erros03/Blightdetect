/**
 * Firebase Configuration for BlightDetect+ Tomato Vision Stream
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const env = (typeof import.meta !== 'undefined' && import.meta.env) || (typeof process !== 'undefined' && process.env) || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.apiKey !== 'MY_FIREBASE_API_KEY'
  );
}

/**
 * Check if Cloud Firestore is explicitly enabled.
 * NOTE: The primary database for this application is Firebase Realtime Database
 * (https://blightdetect-4b3a6-default-rtdb.firebaseio.com).
 * In project blightdetect-4b3a6, Cloud Firestore API is not activated.
 * To prevent "Could not reach Cloud Firestore backend" / "code=unavailable" errors,
 * Firestore is only initialized if explicitly enabled via VITE_ENABLE_FIRESTORE="true".
 */
export function isFirestoreEnabled(): boolean {
  return env.VITE_ENABLE_FIRESTORE === 'true';
}

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  if (!isFirebaseConfigured()) return null;

  if (!app && getApps().length === 0) {
    try {
      app = initializeApp(firebaseConfig);
    } catch (e) {
      console.warn('Firebase initialization warning:', e);
      return null;
    }
  } else if (getApps().length > 0) {
    app = getApps()[0];
  }
  return app;
}

export function getFirestoreDb(): Firestore | null {
  if (!isFirestoreEnabled()) return null;
  if (db) return db;
  const currentApp = getFirebaseApp();
  if (currentApp) {
    try {
      db = getFirestore(currentApp);
      return db;
    } catch (e) {
      console.warn('Firestore initialization warning:', e);
      return null;
    }
  }
  return null;
}
