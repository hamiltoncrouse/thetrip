"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

import { clientEnv, isFirebaseClientConfigured } from "@/lib/env";

const firebaseConfig = {
  apiKey: clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

export function getFirebaseApp() {
  if (!isFirebaseClientConfigured) {
    throw new Error("Firebase client config is missing. Set NEXT_PUBLIC_FIREBASE_* env vars.");
  }
  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return firebaseApp;
}

export function getFirebaseAuthClient() {
  if (!isFirebaseClientConfigured) {
    throw new Error("Firebase client config is missing.");
  }
  if (!firebaseAuth) {
    firebaseAuth = getAuth(getFirebaseApp());
    firebaseAuth.useDeviceLanguage();
  }
  return firebaseAuth;
}

export { isFirebaseClientConfigured };
