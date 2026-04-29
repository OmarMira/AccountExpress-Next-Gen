// ============================================================
// ROLLBACK FASE 1 — AccountExpress
// Atomic rollback for migrations 0008 and 0009.
// This script reverts schema changes and cleanup the migration log.
// ============================================================

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

const connectionString = process.env["DATABASE_ADMIN_URL"] ?? process.env["DATABASE_URL"];

async function rollback() {
  if (!connectionString) {
    console.error("[ROLLBACK] DATABASE_URL is not set.");
    process.exit(1);
  }

  const migrationClient = postgres(connectionString!, { max: 1 });
  const migrationDb = drizzle(migrationClient);

  console.log("[ROLLBACK] Starting atomic rollback for Fase 1 (Migrations 0008 & 0009)...");

  try {
    await migrationDb.execute(sql.raw(`
      -- 1. Revert changes in bank_transactions (Migration 0009)
      ALTER TABLE "bank_transactions" DROP COLUMN IF EXISTS "reconciled_at";

      -- 2. Revert changes in journal_lines (Migration 0008)
      ALTER TABLE "journal_lines" DROP COLUMN IF EXISTS "cleared_at";
      ALTER TABLE "journal_lines" DROP COLUMN IF EXISTS "is_reconciled";

      -- 3. Cleanup Drizzle migration log (Last 2 entries)
      DELETE FROM "drizzle"."__drizzle_migrations" 
      WHERE id IN (
        SELECT id FROM "drizzle"."__drizzle_migrations" 
        ORDER BY created_at DESC 
        LIMIT 2
      );
    `));

    console.log("[ROLLBACK] Atomic rollback successful.");
  } catch (error) {
    console.error("[ROLLBACK] Rollback failed:", error);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }

  process.exit(0);
}

rollback();
