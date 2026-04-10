// ============================================================
// DATABASE CONNECTION — PostgreSQL 16
// Uses postgres.js (postgresjs) as the driver.
// Drizzle ORM wraps it for type-safe queries.
// No rawDb exported — all access goes through the ORM.
// ============================================================

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.ts";
import { logger } from "../lib/logger.ts";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://postgres:postgres@localhost:5432/bookkeeping";

// postgres.js client — used internally by Drizzle
// max: 10 pool connections (suitable for a backend API process)
const client = postgres(DATABASE_URL, { max: 10 });

// Drizzle ORM instance with full schema type inference
export const db = drizzle(client, { schema });

// Re-export sql tag for raw SQL fragments when needed in complex queries
export { sql } from "drizzle-orm";
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

logger.info("db", "Connected to PostgreSQL");
