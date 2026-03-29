// ============================================================
// ENVIRONMENT VARIABLE VALIDATOR (ZOD)
// Ensures the server fails fast if critical config is missing.
// ============================================================

import { z } from "zod";

const envSchema = z.object({
  // Database configuration (PostgreSQL)
  DATABASE_URL:         z.string().url(),
  DATABASE_ADMIN_URL:   z.string().url().optional(),

  // Server and Performance
  PORT:                 z.string().default("3000").transform(Number).pipe(z.number().int().positive()),
  BCRYPT_ROUNDS:        z.string().default("12").transform(Number).pipe(z.number().int().min(4).max(18)),

  // Security and Branding
  SESSION_SECRET:       z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  APP_NAME:             z.string().min(1, "APP_NAME is required for UI display"),

  // Initial Seed Data (Super Admin)
  SUPER_ADMIN_USERNAME: z.string().min(1),
  SUPER_ADMIN_PASSWORD: z.string().min(8),
  SUPER_ADMIN_EMAIL:    z.string().email().default("admin@localhost"),

  // Environment mode
  NODE_ENV:             z.enum(["development", "production", "test"]).default("development"),
  ALLOW_BYPASS:         z.string().optional().default("false"),
});

export function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("\n❌ CRITICAL: Environment configuration is invalid or missing variables!\n");
    console.error("Please check your .env file and ensure it matches .env.example.\n");
    
    result.error.issues.forEach((issue) => {
      console.error(`   [${issue.path.join(".")}] — ${issue.message}`);
    });

    console.log("\nServer startup aborted.\n");
    process.exit(1);
  }
}

// Execute immediately on import
validateEnv();
