import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyD7LuGDeeoWKxmk0hClebp7RDHEA75-Bfc",
  authDomain: "chat-b15e6.firebaseapp.com",
  databaseURL: "https://chat-b15e6-default-rtdb.firebaseio.com",
  projectId: "chat-b15e6",
  storageBucket: "chat-b15e6.firebasestorage.app",
  messagingSenderId: "578024069077",
  appId: "1:578024069077:web:630d432253228eb8cd8f5c"
};

// Initialize Firebase safely
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Helper to ensure Firebase Auth session is active
export async function ensureAuthSession() {
  try {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
  } catch (err) {
    // If anonymous auth is disabled in the Firebase console, RTDB can still work with database rules
    console.warn("Auth initialization note:", err);
  }
}
