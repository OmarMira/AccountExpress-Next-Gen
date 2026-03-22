// Usar base de datos de test, NUNCA la de produccion
process.env.DATABASE_PATH = "./data/test.db";
import { db, rawDb } from "../src/db/connection.ts";
import { users, companies, userCompanyRoles, roles, permissions, rolePermissions, sessions, fiscalPeriods } from "../src/db/schema/system.schema.ts";
import { createDraft, post, voidEntry, getEntryWithLines, ValidationError } from "../src/services/journal.service.ts";
import { getAccountTree, getAccountBalance } from "../src/services/accounts.service.ts";
import { v4 as uuidv4 } from "uuid";
import { eq, and } from "drizzle-orm";

async function setupTestContext() {
  const companyId = uuidv4();
  const userId = uuidv4();
  
  // Create company
  const now = new Date().toISOString();
  rawDb.prepare("INSERT INTO companies (id, legal_name, fiscal_year_start, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(companyId, "Test Company", "01-01", now, now);

  // Create User for FK created_by
  rawDb.prepare(`INSERT INTO users (id, username, email, password_hash, password_salt, first_name, last_name, created_at, updated_at) VALUES (?, ?, ?, 'hash', 'salt', 'Test', 'User', ?, ?)`).run(userId, "test" + userId.substring(0,6), userId.substring(0,6) + "@test.com", now, now);
  
  // Create Session for FK session_id
  const sessionId = uuidv4();
  rawDb.prepare(`INSERT INTO sessions (id, user_id, ip_address, created_at, expires_at, last_active_at) VALUES (?, ?, '127.0.0.1', ?, ?, ?)`).run(sessionId, userId, now, now, now);
  
  // Seed GAAP accounts
  const { seedGaapForCompany } = await import("../src/services/accounts.service.ts");
  seedGaapForCompany(companyId);

  // Open a fiscal period
  const periodId = uuidv4();
  rawDb.prepare("INSERT INTO fiscal_periods (id, company_id, name, period_type, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)")
       .run(periodId, companyId, "Test Period", "annual", "2026-01-01", "2026-12-31", now);
       
  return { companyId, userId, periodId, sessionId };
}

async function runTests() {
  console.log("========================================");
  console.log("   LAYER 3: JOURNAL ENGINE TESTS        ");
  console.log("========================================");

  const { companyId, userId, periodId, sessionId } = await setupTestContext();
  const accounts = getAccountTree(companyId) as any[];
  
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
    const draftId = createDraft(
      { companyId, entryDate: "2026-03-21", description: "Venta de servicios", reference: "INV-001", isAdjusting: false, periodId, createdBy: userId },
      [
        { accountId: cashAcct.id, debitAmount: 150.75, creditAmount: 0, lineNumber: 1, description: null },
        { accountId: revenueAcct.id, debitAmount: 0, creditAmount: 150.75, lineNumber: 2, description: null }
      ]
    );
    post(draftId, userId, sessionId, "127.0.0.1");
    const { entry } = getEntryWithLines(draftId);
    if ((entry as any).status === "posted" && (entry as any).entry_number === `JE-2026-0001`) {
      console.log("✅ PASSED: Balanced entry posted successfully -> " + (entry as any).entry_number);
      successCount++;
    } else {
      console.log("❌ FAILED: Entry did not post correctly.");
    }
  } catch(e) { console.log("❌ FAILED:", e); }

  // TEST 2: Unbalanced Entry
  try {
    console.log("\n[Test 2] Creating Unbalanced Entry (Float precision attack)...");
    const draft2Id = createDraft(
      { companyId, entryDate: "2026-03-21", description: "Float issue", reference: null, isAdjusting: false, periodId, createdBy: userId },
      [
        { accountId: cashAcct.id, debitAmount: 100.03, creditAmount: 0, lineNumber: 1, description: null },
        { accountId: revenueAcct.id, debitAmount: 0, creditAmount: 100.04, lineNumber: 2, description: null }
      ]
    );
    post(draft2Id, userId, sessionId, "127.0.0.1");
    console.log("❌ FAILED: Unbalanced entry was allowed!");
  } catch(e: any) {
    if (e.message.includes("Descuadre de partida doble")) {
      console.log(`✅ PASSED: Entry rejected with correct error -> ${e.message}`);
      successCount++;
    } else {
      console.log("❌ FAILED: Unexpected error:", e.message);
    }
  }

  // TEST 3: Voiding Reversal
  let originalDraftId = "";
  try {
    console.log("\n[Test 3] Anulando Asiento Posted (Automated Reversal)...");
    originalDraftId = createDraft(
      { companyId, entryDate: "2026-03-21", description: "Error humano", reference: null, isAdjusting: false, periodId, createdBy: userId },
      [
        { accountId: cashAcct.id, debitAmount: 50.00, creditAmount: 0, lineNumber: 1, description: null },
        { accountId: revenueAcct.id, debitAmount: 0, creditAmount: 50.00, lineNumber: 2, description: null }
      ]
    );
    post(originalDraftId, userId, sessionId, "127.0.0.1");
    voidEntry(originalDraftId, userId, sessionId, "127.0.0.1");
    
    // Check if reversal exists
    const reversals = rawDb.query("SELECT * FROM journal_entries WHERE company_id = ? AND is_reversing = 1").all(companyId) as any[];
    if (reversals.length === 1 && reversals[0].status === "posted" && reversals[0].entry_number.startsWith("JE-2026-")) {
      console.log("✅ PASSED: Reversal entry mechanically created -> " + reversals[0].entry_number);
      successCount++;
    } else {
      console.log("❌ FAILED: Reversal NOT created correctly or sequence failed.");
    }
  } catch(e) { console.log("❌ FAILED:", e); }

  // TEST 4: Closed Period
  try {
    console.log("\n[Test 4] Closed Period Insertion Prevention...");
    // Create new closed period
    const closedPeriodId = uuidv4();
    const now = new Date().toISOString();
    rawDb.prepare("INSERT INTO fiscal_periods (id, company_id, name, period_type, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'closed', ?)")
         .run(closedPeriodId, companyId, "Closed 2025", "annual", "2025-01-01", "2025-12-31", now);
         
    createDraft(
      { companyId, entryDate: "2025-12-31", description: "Late entry", reference: null, isAdjusting: false, periodId: closedPeriodId, createdBy: userId },
      [
        { accountId: cashAcct.id, debitAmount: 10, creditAmount: 0, lineNumber: 1, description: null },
        { accountId: revenueAcct.id, debitAmount: 0, creditAmount: 10, lineNumber: 2, description: null }
      ]
    );
    console.log("❌ FAILED: Saved draft in closed period!");
  } catch(e: any) {
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
    // Test 1 added 150.75 to Cash (debit). 
    // Test 3 added 50.00 to Cash and immediately reversed it (-50.00).
    const cashBalance = getAccountBalance(companyId, cashAcct.id);
    const revBalance = getAccountBalance(companyId, revenueAcct.id);
    
    if (cashBalance === 150.75 && revBalance === 150.75) {
      console.log(`✅ PASSED: Cash=$${cashBalance} Revenue=$${revBalance} perfectly matched integer aggregations!`);
      successCount++;
    } else {
      console.log(`❌ FAILED: Cash expected 150.75, got ${cashBalance}. Revenue expected 150.75, got ${revBalance}`);
    }
  } catch(e) { console.log("❌ FAILED:", e); }

  console.log(`\nTests Results: ${successCount}/5 PASSED.`);
  if (successCount === 5) {
    console.log("========================================");
    console.log("   LAYER 3 FULLY VERIFIED. SUCCESS.     ");
    console.log("========================================\n");
  }
}

runTests().catch(console.error);
