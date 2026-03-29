import { db, sql } from "../src/db/connection.ts";
import { companies, users, fiscalPeriods, journalEntries } from "../src/db/schema/index.ts";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ FAIL: ${name} — ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

async function main() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Test: Fiscal Period Protection Trigger");
  console.log("═══════════════════════════════════════════════\n");

  const companyId = uuidv4();
  const userId    = uuidv4();
  const now       = new Date();

  // Seed minimal required data
  await db.insert(companies).values({
    id: companyId,
    legalName: "Test Corp",
    fiscalYearStart: "01-01",
    currency: "USD",
    isActive: true,
    createdAt: now,
    updatedAt: now
  });

  await db.insert(users).values({
    id: userId,
    username: "testuser_" + uuidv4().substring(0, 4),
    email: "test_" + uuidv4().substring(0, 4) + "@test.com",
    passwordHash: "hash",
    passwordSalt: "salt",
    firstName: "Test",
    lastName: "User",
    isActive: true,
    createdAt: now,
    updatedAt: now
  });

  // Create an open period
  const openPeriodId = uuidv4();
  await db.insert(fiscalPeriods).values({
    id: openPeriodId,
    companyId: companyId,
    name: "January 2026",
    periodType: "monthly",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    status: "open",
    createdAt: now
  });

  // Create a closed period
  const closedPeriodId = uuidv4();
  await db.insert(fiscalPeriods).values({
    id: closedPeriodId,
    companyId: companyId,
    name: "December 2025",
    periodType: "monthly",
    startDate: "2025-12-01",
    endDate: "2025-12-31",
    status: "closed",
    createdAt: now
  });

  // Create a locked period
  const lockedPeriodId = uuidv4();
  await db.insert(fiscalPeriods).values({
    id: lockedPeriodId,
    companyId: companyId,
    name: "November 2025",
    periodType: "monthly",
    startDate: "2025-11-01",
    endDate: "2025-11-30",
    status: "locked",
    createdAt: now
  });

  async function insertJournalEntry(periodId: string): Promise<void> {
    await db.insert(journalEntries).values({
      id: uuidv4(),
      companyId: companyId,
      entryNumber: `JE-TEST-${uuidv4().substring(0, 4)}`,
      entryDate: "2026-01-15",
      description: "Test entry",
      status: "draft",
      isAdjusting: false,
      isReversing: false,
      periodId: periodId,
      createdBy: userId,
      entryHash: "testhash",
      prevHash: "GENESIS",
      createdAt: now,
      updatedAt: now
    });
  }

  // Test 1: Can insert into open period
  await test("Can insert journal entry into OPEN period", async () => {
    await insertJournalEntry(openPeriodId);
  });

  // Test 2: Cannot insert into closed period
  await test("INSERT into CLOSED period is rejected by trigger", async () => {
    let threw = false;
    try {
      await insertJournalEntry(closedPeriodId);
    } catch (e) {
      if (e instanceof Error && (e.message.includes("closed") || e.message.includes("cerrado"))) {
        threw = true;
      }
    }
    if (!threw) throw new Error("Expected trigger to reject INSERT into closed period");
  });

  // Test 3: Cannot insert into locked period
  await test("INSERT into LOCKED period is rejected by trigger", async () => {
    let threw = false;
    try {
      await insertJournalEntry(lockedPeriodId);
    } catch (e) {
      if (e instanceof Error && (e.message.includes("closed") || e.message.includes("locked") || e.message.includes("cerrado") || e.message.includes("bloqueado"))) {
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
}

main().catch(console.error);
