// ============================================================
// DATABASE CONNECTION
// Opens SQLite via Bun's built-in driver.
// Enables WAL mode for concurrent reads + FK enforcement.
// ============================================================

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema/index.ts";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = process.env["DATABASE_PATH"] ?? "./data/bookkeeping.db";

// Ensure data directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

// Open the SQLite database
const sqlite = new Database(DB_PATH, { create: true });

// Performance and correctness pragmas
sqlite.exec("PRAGMA journal_mode=WAL;");         // write-ahead log: concurrent reads
sqlite.exec("PRAGMA foreign_keys=ON;");           // enforce FK constraints
sqlite.exec("PRAGMA synchronous=NORMAL;");        // balance safety vs speed in WAL
sqlite.exec("PRAGMA busy_timeout=5000;");         // wait up to 5s on lock contention
sqlite.exec("PRAGMA cache_size=-32000;");         // 32 MB page cache

// Drizzle ORM instance with full schema type inference
export const db = drizzle(sqlite, { schema });

// Expose raw SQLite handle for migrations and raw SQL (triggers, indexes)
export const rawDb = sqlite;

console.log(`[DB] Connected to SQLite at: ${DB_PATH}`);

