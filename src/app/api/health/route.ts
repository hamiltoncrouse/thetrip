import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverEnv, isFirebaseClientConfigured } from "@/lib/env";
import { isFirebaseConfigured } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status: "ok",
      database: "connected",
      latencyMs,
      geminiConfigured: Boolean(serverEnv.GEMINI_API_KEY),
      firebaseConfigured: isFirebaseConfigured,
      firebaseClientConfigured: isFirebaseClientConfigured,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("/api/health failure", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Database connectivity failed",
      },
      { status: 500 },
    );
  }
}
