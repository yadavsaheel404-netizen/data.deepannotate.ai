import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  RecaptchaVerifier,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyFirebaseApiKeyToPreventCrashing",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dummy-project.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dummy-project",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "dummy-project.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:1234567890abcdef",
};

// Check if credentials are missing and output a clean console guide
if (!import.meta.env.VITE_FIREBASE_API_KEY) {
  console.warn(
    "⚠️ Firebase configuration environment variables are missing! " +
    "Please add VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, etc. to your .env file."
  );
}

// Initialize Firebase App
export const firebaseApp = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const firebaseAuth = getAuth(firebaseApp);

// Initialize Firebase DB (Firestore) and Storage
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// Configure Google Provider
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: "select_account" });

// Recaptcha utility for Phone OTP verification
export function createRecaptchaVerifier(containerId: string, callback?: () => void) {
  try {
    return new RecaptchaVerifier(firebaseAuth, containerId, {
      size: "invisible",
      callback: () => {
        if (callback) callback();
      },
    });
  } catch (error) {
    console.error("Failed to initialize RecaptchaVerifier:", error);
    return null;
  }
}
