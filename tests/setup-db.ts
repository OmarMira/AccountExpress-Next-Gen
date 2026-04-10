// ============================================================
// TEST DATABASE SETUP
// Creates and migrates the bookkeeping_test database.
// Run with: bun run test:db:setup
// Requires DATABASE_ADMIN_URL in .env
// ============================================================

import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Client } = pkg;

const TEST_DB_NAME = "bookkeeping_test";

async function setupTestDatabase(): Promise<void> {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) {
    console.error("ERROR: DATABASE_ADMIN_URL is required to create the test database.");
    process.exit(1);
  }

  // 1. Connect as admin and recreate the test DB
  const adminClient = new Client({ connectionString: adminUrl });
  await adminClient.connect();

  console.log(`Dropping database '${TEST_DB_NAME}' if exists...`);
  // WITH (FORCE) is available in PostgreSQL 13+ to kill active connections.
  await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);

  console.log(`Creating database '${TEST_DB_NAME}'...`);
  await adminClient.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  await adminClient.end();

  // 2. Run migrations against the test DB
  // Build the test DB URL by replacing the DB name in the admin URL
  const testUrl = adminUrl.replace(/\/[^/]+$/, `/${TEST_DB_NAME}`);
  
  // FORCE OVERRIDE: clear admin URL so migrate.ts falls back to our test DATABASE_URL
  delete process.env.DATABASE_ADMIN_URL;
  process.env.DATABASE_URL = testUrl;

  console.log("Running migrations...");
  // Use dynamic import to ensure runMigrations picks up the updated process.env.DATABASE_URL
  const { runMigrations } = await import("../src/db/migrate.ts");
  await runMigrations();

  console.log(`\n✅ Test database '${TEST_DB_NAME}' ready.`);
  console.log(`   DATABASE_TEST_URL=${testUrl}`);
  console.log("   Add this to your .env and run: bun run test:integration");
}

setupTestDatabase().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
