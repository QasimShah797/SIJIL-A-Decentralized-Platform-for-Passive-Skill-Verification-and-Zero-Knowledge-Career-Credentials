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
  PRESENTATION_SIGNING_SECRET: z.string().min(16).optional(),
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

export const env = parsed.data;
