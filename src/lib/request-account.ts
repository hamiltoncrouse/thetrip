import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { AuthError, authenticateRequest } from "@/lib/auth";

const demoIdentitySchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
});

const DEMO_HEADER = "x-trip-demo-user";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function resolveAccount(request: Request) {
  try {
    return await authenticateRequest(request);
  } catch (error) {
    if (!(error instanceof AuthError) || error.status !== 401) {
      throw error;
    }

    const header = request.headers.get(DEMO_HEADER);
    if (!header) {
      throw error;
    }

    let payload;
    try {
      payload = JSON.parse(header);
    } catch {
      throw new AuthError(401, "Invalid demo user payload.");
    }

    const parsed = demoIdentitySchema.safeParse(payload);
    if (!parsed.success) {
      throw new AuthError(401, "Invalid demo user payload.");
    }

    const { id, name, email } = parsed.data;
    const baseId = id?.trim() || slugify(name || email || "guest");
    if (!baseId) {
      throw new AuthError(401, "Demo user identifier missing.");
    }
    const demoId = baseId.startsWith("demo-") ? baseId : `demo-${baseId}`;
    const demoEmail = email?.trim() || `${demoId}@demo.thetrip`;

    const account = await prisma.user.upsert({
      where: { id: demoId },
      update: {
        email: demoEmail,
        displayName: name || null,
      },
      create: {
        id: demoId,
        email: demoEmail,
        displayName: name || null,
      },
    });

    return { account };
  }
}

export function buildDemoHeader(identity: { id?: string; name?: string | null; email?: string | null } | null) {
  if (!identity) return null;
  return JSON.stringify(identity);
}

export const demoHeaderName = DEMO_HEADER;
