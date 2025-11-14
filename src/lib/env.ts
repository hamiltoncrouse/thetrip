import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  HOTEL_API_KEY: z.string().optional(),
  AMADEUS_CLIENT_ID: z.string().optional(),
  AMADEUS_CLIENT_SECRET: z.string().optional(),
  AMADEUS_ENV: z.enum(["test", "production"]).default("test"),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  STARTING_CREDITS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 50)),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("The Trip"),
  NEXT_PUBLIC_DEFAULT_HOME_CITY: z.string().default("Paris"),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

const clientEnvValues = {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_DEFAULT_HOME_CITY: process.env.NEXT_PUBLIC_DEFAULT_HOME_CITY,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

const clientResult = clientSchema.safeParse(clientEnvValues);
if (!clientResult.success) {
  console.error("❌ Invalid client environment variables", clientResult.error.flatten().fieldErrors);
  throw new Error("Invalid client environment variables");
}

const isServer = typeof window === "undefined";

let serverEnv: ServerEnv;
if (isServer) {
  const serverResult = serverSchema.safeParse(process.env);
  if (!serverResult.success) {
    console.error("❌ Invalid server environment variables", serverResult.error.flatten().fieldErrors);
    throw new Error("Invalid server environment variables");
  }

  if (!serverResult.data.DATABASE_URL) {
    console.warn("⚠️ DATABASE_URL is not set. Prisma calls will fail until it is configured.");
  }

  serverEnv = serverResult.data satisfies ServerEnv;
} else {
  // Provide a proxy on the client to avoid accidental access to server-only envs
  serverEnv = new Proxy(
    {},
    {
      get() {
        throw new Error("serverEnv is not available in the browser. Use clientEnv instead.");
      },
    },
  ) as ServerEnv;
}

export { serverEnv };
export const clientEnv = clientResult.data satisfies ClientEnv;

export const isFirebaseClientConfigured = Boolean(
  clientEnv.NEXT_PUBLIC_FIREBASE_API_KEY &&
    clientEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    clientEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    clientEnv.NEXT_PUBLIC_FIREBASE_APP_ID &&
    clientEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
);
