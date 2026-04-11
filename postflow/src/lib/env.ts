import { z } from "zod";

// ── Schema ─────────────────────────────────────────────────────────────────────
// All required environment variables validated at startup.
// Optional vars (R2, etc.) are validated lazily when the feature is used.

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Redis
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // NextAuth
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),

  // Meta OAuth
  META_APP_ID: z.string().min(1, "META_APP_ID is required"),
  META_APP_SECRET: z.string().min(1, "META_APP_SECRET is required"),
  META_OAUTH_CALLBACK_URL: z
    .string()
    .url("META_OAUTH_CALLBACK_URL must be a valid URL"),

  // Token encryption — must be a 64-char hex string (32 bytes)
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "TOKEN_ENCRYPTION_KEY must be a 64-character hex string"),

  // Cloudflare R2 (optional — only required if media upload is used)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),

  // Node environment
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

// ── Validation ─────────────────────────────────────────────────────────────────

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment variables:\n${errors}\n\nCheck your .env file against .env.example.`
    );
  }

  return result.data;
}

// ── Singleton ──────────────────────────────────────────────────────────────────
// Validated once at module load time. Any missing var surfaces immediately on
// startup rather than at the first request that uses it.

let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}

// Named exports for convenience — avoids repetitive getEnv() calls at usage sites.
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
