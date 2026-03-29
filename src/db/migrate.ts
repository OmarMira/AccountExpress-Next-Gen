// ============================================================
// MIGRATION RUNNER — PostgreSQL 16
// Uses Drizzle Kit's official migrator for PostgreSQL.
// Applies schema migrations from ./drizzle/migrations/
// Then applies PL/pgSQL triggers as raw SQL.
// ============================================================

import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { db, sql } from "./connection.ts";
import { TRIGGERS } from "./triggers.ts";
import { INDEXES } from "./indexes.ts";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runMigrations(): Promise<void> {
  console.log("[MIGRATE] Starting PostgreSQL migration runner...");

  const connectionString = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  const migrationClient = postgres(connectionString as string, { max: 1 });
  const migrationDb = drizzle(migrationClient);

  // Run Drizzle Kit migrations
  await migrate(migrationDb, {
    migrationsFolder: join(__dirname, "../../drizzle/migrations"),
  });

  console.log("[MIGRATE] Schema migrations applied.");

  // Apply indexes (idempotent — CREATE INDEX IF NOT EXISTS)
  console.log("[MIGRATE] Applying indexes...");
  for (const idx of INDEXES) {
    await migrationDb.execute(sql.raw(idx));
  }

  // Apply PL/pgSQL triggers (idempotent — CREATE OR REPLACE)
  console.log("[MIGRATE] Applying PL/pgSQL triggers...");
  for (const trg of TRIGGERS) {
    await migrationDb.execute(sql.raw(trg));
  }

  console.log("[MIGRATE] Done. Schema, indexes and triggers are up to date.");
}

// ── DIRECT RUN ───────────────────────────────────────────────
// Allow: bun run src/db/migrate.ts
if (import.meta.main) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[MIGRATE] ❌ Fatal error:", err);
      process.exit(1);
    });
}
