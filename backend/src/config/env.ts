/**
 * Environment variable loading and validation for the SIJIL backend.
 * Centralizes all process.env access so other modules stay config-free.
 */
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env.local") });

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

const booleanFromEnv = z.preprocess((val: unknown) => {
  if (val === true || val === false) return val;
  if (val === undefined || val === "") return false;
  if (typeof val === "string") {
    const normalized = val.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}, z.boolean());

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1)
    .refine(
      (v) => !v.includes("PASTE_") && !v.includes("your_service_role"),
      "Set SUPABASE_SERVICE_ROLE_KEY in backend/.env (Supabase Dashboard → API → service_role)",
    ),
  SUPABASE_ANON_KEY: z.string().min(1),
  CORS_ORIGIN: z.string().default("http://localhost:8080"),
  FRONTEND_URL: z.string().default("http://localhost:8080"),
  PRESENTATION_SIGNING_SECRET: z.string().min(32, "PRESENTATION_SIGNING_SECRET must be at least 32 characters"),
  ISSUER_ED25519_PRIVATE_KEY: z.string().min(1).optional(),
  ISSUER_ED25519_PUBLIC_KEY: z.string().min(1).optional(),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASS: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  GITHUB_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  APPLE_PASS_CERT: z.string().min(1).optional(),
  APPLE_PASS_KEY: z.string().min(1).optional(),
  APPLE_PASS_TYPE_ID: z.string().min(1).optional(),
  APPLE_PASS_TEAM_ID: z.string().min(1).optional(),
  APPLE_PASS_WWDR: z.string().min(1).optional(),
  APPLE_PASS_KEY_PASSPHRASE: z.string().min(1).optional(),
  GOOGLE_WALLET_ISSUER_ID: z.string().min(1).optional(),
  GOOGLE_WALLET_SA_KEY: z.string().min(1).optional(),
  FABRIC_ENABLED: booleanFromEnv,
  FABRIC_PEER_ENDPOINT: z.string().min(1).optional(),
  FABRIC_MSP_ID: z.string().min(1).optional(),
  FABRIC_CHANNEL: z.string().min(1).optional(),
  FABRIC_CHAINCODE: z.string().min(1).optional(),
  FABRIC_CONTRACT_NAME: z.string().min(1).default("CredentialAnchor"),
  FABRIC_CERT_PATH: z.string().min(1).optional(),
  FABRIC_KEY_PATH: z.string().min(1).optional(),
  FABRIC_TLS_CERT_PATH: z.string().min(1).optional(),
  FABRIC_TLS_OVERRIDE_HOST: z.string().min(1).optional(),
  FABRIC_ANCHOR_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  FABRIC_ANCHOR_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  FABRIC_ANCHOR_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
  FABRIC_ANCHOR_BACKOFF_MS: z.coerce.number().int().nonnegative().default(5_000),
  TRUST_PROXY: booleanFromEnv,
});

const parsed = envSchema.safeParse({
  ...process.env,
  SUPABASE_URL: firstEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
  SUPABASE_ANON_KEY: firstEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: firstEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
  ),
  GITHUB_OAUTH_CLIENT_ID: firstEnv("GITHUB_OAUTH_CLIENT_ID", "VITE_GITHUB_CLIENT_ID"),
  GITHUB_OAUTH_CLIENT_SECRET: firstEnv("GITHUB_OAUTH_CLIENT_SECRET"),
});

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (parsed.data.FABRIC_ENABLED) {
  const requiredWhenEnabled = [
    "FABRIC_PEER_ENDPOINT",
    "FABRIC_MSP_ID",
    "FABRIC_CHANNEL",
    "FABRIC_CHAINCODE",
    "FABRIC_CERT_PATH",
    "FABRIC_KEY_PATH",
    "FABRIC_TLS_CERT_PATH",
  ] as const;
  const missing = requiredWhenEnabled.filter((key) => !parsed.data[key]);
  if (missing.length > 0) {
    console.error("FABRIC_ENABLED=true requires:", missing.join(", "));
    process.exit(1);
  }
}

export const env = parsed.data;

if (env.NODE_ENV === "production" && !env.ISSUER_ED25519_PRIVATE_KEY) {
  console.error("ISSUER_ED25519_PRIVATE_KEY is required in production");
  process.exit(1);
}
