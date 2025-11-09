import type { DecodedIdToken } from "firebase-admin/auth";
import type { User } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase-admin";
import { serverEnv } from "@/lib/env";

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthContext {
  token: DecodedIdToken;
  account: User;
}

function coerceEmail(uid: string, email?: string | null) {
  if (email && email.includes("@")) {
    return email;
  }
  return `${uid}@thetrip.local`;
}

function coerceHomeCity(token: DecodedIdToken) {
  const cityClaim = token["homeCity"];
  return typeof cityClaim === "string" && cityClaim.length ? cityClaim : null;
}

export async function authenticateRequest(request: Request): Promise<AuthContext> {
  if (!isFirebaseConfigured) {
    throw new AuthError(500, "Authentication is not configured on the server.");
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) {
    throw new AuthError(401, "Missing or invalid authorization token.");
  }

  const firebaseAuth = getFirebaseAuth();
  let decoded: DecodedIdToken;
  try {
    decoded = await firebaseAuth.verifyIdToken(match[1], true);
  } catch {
    throw new AuthError(401, "Invalid or expired authentication token.");
  }

  const email = coerceEmail(decoded.uid, decoded.email);
  const homeCity = coerceHomeCity(decoded);
  const account = await prisma.user.upsert({
    where: { id: decoded.uid },
    update: {
      email,
      displayName: decoded.name ?? null,
      homeCity,
    },
    create: {
      id: decoded.uid,
      email,
      displayName: decoded.name ?? null,
      homeCity,
      credits: serverEnv.STARTING_CREDITS ?? 50,
    },
  });

  return { token: decoded, account };
}
