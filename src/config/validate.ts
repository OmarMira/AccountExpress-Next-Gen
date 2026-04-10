// ============================================================
// ENVIRONMENT VARIABLE VALIDATOR (ZOD)
// Ensures the server fails fast if critical config is missing.
// ============================================================

import { z } from "zod";
import { logger } from "../lib/logger.ts";

const envSchema = z.object({
  // Database configuration (PostgreSQL)
  DATABASE_URL:         z.string().url(),
  DATABASE_ADMIN_URL:   z.string().url().optional(),

  // Server and Performance
  PORT:                 z.string().default("3000").transform(Number).pipe(z.number().int().positive()),
  BCRYPT_ROUNDS:        z.string().default("12").transform(Number).pipe(z.number().int().min(4).max(18)),

  // Security and Branding
  SESSION_SECRET:       z.string().min(32, "SESSION_SECRET must be at least 32 characters for HMAC security")
    .refine(v => v !== "change-this-to-a-long-random-string-in-production", {
      message: "SESSION_SECRET must be changed from the default value before starting the server",
    }),
  AUTO_BACKUP_SECRET:   z.string().min(32, "AUTO_BACKUP_SECRET must be at least 32 characters")
    .refine(v => v !== "change-me-for-production", {
      message: "AUTO_BACKUP_SECRET must be changed from the default value before starting the server",
    }),
  AUDIT_HMAC_SECRET:    z.string().min(32, "AUDIT_HMAC_SECRET must be at least 32 characters")
    .refine(v => v !== "change-me-for-production", {
      message: "AUDIT_HMAC_SECRET must be changed from the default value before starting the server",
    }),
  APP_NAME:             z.string().min(1, "APP_NAME is required for UI display"),

  // Initial Seed Data (Super Admin)
  SUPER_ADMIN_USERNAME: z.string().min(1),
  SUPER_ADMIN_PASSWORD: z.string().min(8),
  SUPER_ADMIN_EMAIL:    z.string().email().default("admin@localhost"),

  // Environment mode
  NODE_ENV:             z.enum(["development", "production", "test"]).default("development"),

  // AI Configuration (Ollama)
  OLLAMA_URL:           z.string().url().optional(),
  OLLAMA_MODEL:         z.string().optional(),
});

export function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    logger.error("config", "CRITICAL: Environment configuration is invalid or missing variables");
    logger.error("config", "Please check your .env file and ensure it matches .env.example");
    
    result.error.issues.forEach((issue) => {
      logger.error("config", "Env validation issue", { field: issue.path.join("."), error: issue.message });
    });

    logger.info("config", "Server startup aborted due to configuration errors");
    process.exit(1);
  }
}

// Execute immediately on import
validateEnv();

// Parsed and validated environment — import this instead of process.env directly
export const env = envSchema.parse(process.env);
