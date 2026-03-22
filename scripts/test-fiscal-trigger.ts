// Usar base de datos de test, NUNCA la de produccion
process.env.DATABASE_PATH = "./data/test.db";
// ============================================================
// TEST: FISCAL PERIOD PROTECTION TRIGGER
// Verifies that SQLite blocks journal_entry inserts into closed periods.
// ============================================================

process.env["DATABASE_PATH"] = "./data/test-fiscal.db";

import { rawDb } from "../src/db/connection.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { v4 as uuidv4 } from "uuid";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ FAIL: ${name} — ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

console.log("\n═══════════════════════════════════════════════");
console.log("  Test: Fiscal Period Protection Trigger");
console.log("═══════════════════════════════════════════════\n");

runMigrations();

// Setup test data
const companyId = uuidv4();
const userId    = uuidv4();
const now       = new Date().toISOString();

// Seed minimal required data
rawDb.prepare("INSERT OR IGNORE INTO companies (id, legal_name, fiscal_year_start, currency, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)").run(companyId, "Test Corp", "01-01", "USD", now, now);
rawDb.prepare("INSERT OR IGNORE INTO users (id, username, email, password_hash, password_salt, first_name, last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(userId, "testuser", "test@test.com", "hash", "salt", "Test", "User", now, now);

// Create an open period
const openPeriodId = uuidv4();
rawDb.prepare("INSERT INTO fiscal_periods (id, company_id, name, period_type, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(openPeriodId, companyId, "January 2026", "monthly", "2026-01-01", "2026-01-31", "open", now);

// Create a closed period
const closedPeriodId = uuidv4();
rawDb.prepare("INSERT INTO fiscal_periods (id, company_id, name, period_type, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(closedPeriodId, companyId, "December 2025", "monthly", "2025-12-01", "2025-12-31", "closed", now);

// Create a locked period
const lockedPeriodId = uuidv4();
rawDb.prepare("INSERT INTO fiscal_periods (id, company_id, name, period_type, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(lockedPeriodId, companyId, "November 2025", "monthly", "2025-11-01", "2025-11-30", "locked", now);

function insertJournalEntry(periodId: string): void {
  rawDb.prepare(
    `INSERT INTO journal_entries
       (id, company_id, entry_number, entry_date, description, status,
        is_adjusting, is_reversing, period_id, created_by,
        entry_hash, prev_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', 0, 0, ?, ?, ?, 'GENESIS', ?, ?)`
  ).run(uuidv4(), companyId, `JE-TEST-${uuidv4().substring(0, 4)}`, "2026-01-15", "Test entry", periodId, userId, "testhash", now, now);
}

// Test 1: Can insert into open period
test("Can insert journal entry into OPEN period", () => {
  insertJournalEntry(openPeriodId);
  // No error = pass
});

// Test 2: Cannot insert into closed period
test("INSERT into CLOSED period is rejected by trigger", () => {
  let threw = false;
  try {
    insertJournalEntry(closedPeriodId);
  } catch (e) {
    if (e instanceof Error && e.message.includes("closed")) {
      threw = true;
    }
  }
  if (!threw) throw new Error("Expected trigger to reject INSERT into closed period");
});

// Test 3: Cannot insert into locked period
test("INSERT into LOCKED period is rejected by trigger", () => {
  let threw = false;
  try {
    insertJournalEntry(lockedPeriodId);
  } catch (e) {
    if (e instanceof Error && e.message.includes("closed")) {
      threw = true;
    }
  }
  if (!threw) throw new Error("Expected trigger to reject INSERT into locked period");
});

console.log(`\n  Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("  ❌ Some tests failed!");
  process.exit(1);
} else {
  console.log("  ✅ All fiscal period trigger tests passed!\n");
}
