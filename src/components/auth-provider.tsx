"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { GoogleAuthProvider, onIdTokenChanged, signInWithPopup, signOut } from "firebase/auth";

import { getFirebaseAuthClient, isFirebaseClientConfigured } from "@/lib/firebase-client";

interface AuthContextValue {
  status: "loading" | "ready" | "error";
  user: User | null;
  idToken: string | null;
  error?: string;
  firebaseConfigured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!isFirebaseClientConfigured) {
      setStatus("ready");
      setError("Firebase client config missing. Add NEXT_PUBLIC_FIREBASE_* when ready.");
      return () => {};
    }

    const auth = getFirebaseAuthClient();
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIdToken(null);
        setStatus("ready");
        return;
      }

      setUser(firebaseUser);
      const token = await firebaseUser.getIdToken();
      setIdToken(token);
      setStatus("ready");
    });

    return () => unsubscribe();
  }, []);

  const actions = useMemo(() => {
    if (!isFirebaseClientConfigured) {
      return {
        async signInWithGoogle() {
          throw new Error("Firebase client config missing.");
        },
        async signOut() {
          setUser(null);
          setIdToken(null);
        },
      };
    }
    const auth = getFirebaseAuthClient();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    return {
      async signInWithGoogle() {
        await signInWithPopup(auth, provider);
      },
      async signOut() {
        await signOut(auth);
      },
    };
  }, []);

  const value: AuthContextValue = {
    status,
    user,
    idToken,
    error,
    firebaseConfigured: isFirebaseClientConfigured,
    signInWithGoogle: actions.signInWithGoogle,
    signOut: actions.signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
