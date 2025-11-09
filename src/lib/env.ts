import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  HOTEL_API_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  STARTING_CREDITS: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 50)),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("The Trip"),
  NEXT_PUBLIC_DEFAULT_HOME_CITY: z.string().default("Paris"),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

const serverResult = serverSchema.safeParse(process.env);
if (!serverResult.success) {
  console.error("❌ Invalid server environment variables", serverResult.error.flatten().fieldErrors);
  throw new Error("Invalid server environment variables");
}

const clientResult = clientSchema.safeParse(process.env);
if (!clientResult.success) {
  console.error("❌ Invalid client environment variables", clientResult.error.flatten().fieldErrors);
  throw new Error("Invalid client environment variables");
}

if (!serverResult.data.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is not set. Prisma calls will fail until it is configured.");
}

export const serverEnv = serverResult.data satisfies ServerEnv;
export const clientEnv = clientResult.data satisfies ClientEnv;
