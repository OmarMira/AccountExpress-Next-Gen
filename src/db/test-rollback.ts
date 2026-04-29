import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { validateEnv } from "../config/validate.ts";
import * as fs from "fs";

export async function runRollback() {
  validateEnv();
  const connectionString = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  const migrationClient = postgres(connectionString!, { max: 1 });
  const migrationDb = drizzle(migrationClient);

  console.log("[ROLLBACK] Running rollback for 0009_useful_zzzax...");
  
  await migrationDb.execute(sql.raw(`
    ALTER TABLE "bank_transactions" DROP COLUMN IF EXISTS "reconciled_at";
    DELETE FROM "drizzle"."__drizzle_migrations" WHERE id IN (SELECT id FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1);
  `));
  
  console.log("[ROLLBACK] Rollback successful.");
  process.exit(0);
}

runRollback().catch(err => {
  console.error(err);
  process.exit(1);
});
