import { db, sql } from "../src/db/connection.ts";
import { users, companies, sessions, fiscalPeriods, chartOfAccounts, journalEntries } from "../src/db/schema/index.ts";
import { createDraft, post, voidEntry, getEntryWithLines } from "../src/services/journal.service.ts";
import { getAccountTree, getAccountBalance, seedGaapForCompany } from "../src/services/accounts.service.ts";
import { v4 as uuidv4 } from "uuid";
import { eq, and } from "drizzle-orm";

async function setupTestContext() {
  const companyId = uuidv4();
  const userId = uuidv4();
  const sessionId = uuidv4();
  const now = new Date();

  // Create company
  await db.insert(companies).values({
    id: companyId,
    legalName: "Test Company",
    fiscalYearStart: "01-01",
    isActive: true,
    createdAt: now,
    updatedAt: now
  });

  // Create User
  await db.insert(users).values({
    id: userId,
    username: "test" + userId.substring(0, 6),
    email: userId.substring(0, 6) + "@test.com",
    passwordHash: "hash",
    passwordSalt: "salt",
    firstName: "Test",
    lastName: "User",
    isActive: true,
    createdAt: now,
    updatedAt: now
  });

  // Create Session
  await db.insert(sessions).values({
    id: sessionId,
    userId: userId,
    ipAddress: "127.0.0.1",
    createdAt: now,
    expiresAt: new Date(now.getTime() + 3600000),
    lastActiveAt: now,
    isValid: true
  });

  // Seed GAAP accounts
  await seedGaapForCompany(companyId);

  // Open a fiscal period
  const periodId = uuidv4();
  await db.insert(fiscalPeriods).values({
    id: periodId,
    companyId: companyId,
    name: "Test Period",
    periodType: "annual",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "open",
    createdAt: now
  });

  return { companyId, userId, periodId, sessionId };
}

async function runTests() {
  console.log("========================================");
  console.log("   LAYER 3: JOURNAL ENGINE TESTS        ");
  console.log("========================================");

  const { companyId, userId, periodId, sessionId } = await setupTestContext();
  const accounts = await getAccountTree(companyId) as any[];

  if (accounts.length === 0) {
    console.error(`❌ FATAL: 0 accounts loaded for company ${companyId}. Seeding failed!`);
    process.exit(1);
  }

  const cashAcct = accounts.find(a => a.code === "1000")!; // Cash
  const revenueAcct = accounts.find(a => a.code === "4000")!; // Revenue

  console.log(`[Setup] Successfully loaded ${accounts.length} GAAP accounts.`);

  let successCount = 0;

  // TEST 1: Balanced Entry
  try {
    console.log("\n[Test 1] Creating Balanced Entry...");
    const draftId = await createDraft(
      { companyId, entryDate: "2026-03-21", description: "Venta de servicios", reference: "INV-001", isAdjusting: false, periodId, createdBy: userId },
      [
        { accountId: cashAcct.id, debitAmount: 150.75, creditAmount: 0, lineNumber: 1, description: null },
        { accountId: revenueAcct.id, debitAmount: 0, creditAmount: 150.75, lineNumber: 2, description: null }
      ]
    );
    await post(draftId, userId, sessionId, "127.0.0.1");
    const { entry } = await getEntryWithLines(draftId);
    if ((entry as any).status === "posted" && (entry as any).entryNumber === `JE-2026-0001`) {
      console.log("✅ PASSED: Balanced entry posted successfully -> " + (entry as any).entryNumber);
      successCount++;
    } else {
      console.log("❌ FAILED: Entry did not post correctly.");
    }
  } catch (e) { console.log("❌ FAILED:", e); }

  // TEST 2: Unbalanced Entry
  try {
    console.log("\n[Test 2] Creating Unbalanced Entry (Float precision attack)...");
    const draft2Id = await createDraft(
      { companyId, entryDate: "2026-03-21", description: "Float issue", reference: null, isAdjusting: false, periodId, createdBy: userId },
      [
        { accountId: cashAcct.id, debitAmount: 100.03, creditAmount: 0, lineNumber: 1, description: null },
        { accountId: revenueAcct.id, debitAmount: 0, creditAmount: 100.04, lineNumber: 2, description: null }
      ]
    );
    await post(draft2Id, userId, sessionId, "127.0.0.1");
    console.log("❌ FAILED: Unbalanced entry was allowed!");
  } catch (e: any) {
    if (e.message.includes("Descuadre de partida doble")) {
      console.log(`✅ PASSED: Entry rejected with correct error -> ${e.message}`);
      successCount++;
    } else {
      console.log("❌ FAILED: Unexpected error:", e.message);
    }
  }

  // TEST 3: Voiding Reversal
  try {
    console.log("\n[Test 3] Anulando Asiento Posted (Automated Reversal)...");
    const originalDraftId = await createDraft(
      { companyId, entryDate: "2026-03-21", description: "Error humano", reference: null, isAdjusting: false, periodId, createdBy: userId },
      [
        { accountId: cashAcct.id, debitAmount: 50.00, creditAmount: 0, lineNumber: 1, description: null },
        { accountId: revenueAcct.id, debitAmount: 0, creditAmount: 50.00, lineNumber: 2, description: null }
      ]
    );
    await post(originalDraftId, userId, sessionId, "127.0.0.1");
    await voidEntry(originalDraftId, userId, sessionId, "127.0.0.1");

    // Check if reversal exists
    const reversals = await db.select().from(journalEntries).where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.isReversing, true)));
    if (reversals.length === 1 && reversals[0].status === "posted" && reversals[0].entryNumber.startsWith("JE-2026-")) {
      console.log("✅ PASSED: Reversal entry mechanically created -> " + reversals[0].entryNumber);
      successCount++;
    } else {
      console.log("❌ FAILED: Reversal NOT created correctly or sequence failed.");
    }
  } catch (e) { console.log("❌ FAILED:", e); }

  // TEST 4: Closed Period
  try {
    console.log("\n[Test 4] Closed Period Insertion Prevention...");
    // Create new closed period
    const closedPeriodId = uuidv4();
    await db.insert(fiscalPeriods).values({
      id: closedPeriodId,
      companyId: companyId,
      name: "Closed 2025",
      periodType: "annual",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      status: "closed",
      createdAt: new Date()
    });

    await createDraft(
      { companyId, entryDate: "2025-12-31", description: "Late entry", reference: null, isAdjusting: false, periodId: closedPeriodId, createdBy: userId },
      [
        { accountId: cashAcct.id, debitAmount: 10, creditAmount: 0, lineNumber: 1, description: null },
        { accountId: revenueAcct.id, debitAmount: 0, creditAmount: 10, lineNumber: 2, description: null }
      ]
    );
    console.log("❌ FAILED: Saved draft in closed period!");
  } catch (e: any) {
    if (e.message.includes("El periodo contable se encuentra cerrado")) {
      console.log(`✅ PASSED: Domain boundary protected -> ${e.message}`);
      successCount++;
    } else {
      console.log("❌ FAILED: Unexpected error format:", e.message);
    }
  }

  // TEST 5: Realtime Balance Sync
  try {
    console.log("\n[Test 5] Verifying 100-base Integer Arithmetics on getAccountBalance...");
    const cashBalance = await getAccountBalance(companyId, cashAcct.id);
    const revBalance = await getAccountBalance(companyId, revenueAcct.id);

    if (Number(cashBalance) === 150.75 && Number(revBalance) === 150.75) {
      console.log(`✅ PASSED: Cash=$${cashBalance} Revenue=$${revBalance} perfectly matched calculations!`);
      successCount++;
    } else {
      console.log(`❌ FAILED: Cash expected 150.75, got ${cashBalance}. Revenue expected 150.75, got ${revBalance}`);
    }
  } catch (e) { console.log("❌ FAILED:", e); }

  console.log(`\nTests Results: ${successCount}/5 PASSED.`);
  if (successCount === 5) {
    console.log("========================================");
    console.log("   LAYER 3 FULLY VERIFIED. SUCCESS.     ");
    console.log("========================================\n");
  }
}

runTests().catch(console.error);
