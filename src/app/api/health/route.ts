import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverEnv } from "@/lib/env";

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
