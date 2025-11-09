import admin from "firebase-admin";
import { serverEnv } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __firebase_admin_app__: admin.app.App | undefined;
}

const serviceAccountJson = serverEnv.FIREBASE_SERVICE_ACCOUNT;
export const isFirebaseConfigured = Boolean(serviceAccountJson);

function initializeFirebase() {
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured.");
  }

  if (!globalThis.__firebase_admin_app__) {
    try {
      const credentials = JSON.parse(serviceAccountJson);
      globalThis.__firebase_admin_app__ = admin.initializeApp({
        credential: admin.credential.cert(credentials),
      });
    } catch (error) {
      throw new Error(`Failed to initialize Firebase Admin SDK: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return globalThis.__firebase_admin_app__;
}

export function getFirebaseAuth() {
  const app = initializeFirebase();
  return admin.auth(app);
}
