// Usar base de datos de test, NUNCA la de produccion
process.env.DATABASE_PATH = "./data/test.db";
import { v4 as uuidv4 } from "uuid";
import { rawDb } from "../src/db/connection.ts";
import { seedGaapForCompany } from "../src/services/accounts.service.ts";
import { openPeriod, closePeriod } from "../src/services/fiscal-period.service.ts";
import { importTransactions } from "../src/services/bank/csv-import.service.ts";
import { matchTransaction } from "../src/services/bank/reconciliation.service.ts";
import { generateCpaSummary } from "../src/services/reports/cpa-summary.service.ts";
import { verifyAuditChain } from "../src/services/audit.service.ts";

async function runTests() {
  console.log("========================================");
  console.log("   LAYER 5: THE FINAL MASTER TEST       ");
  console.log("========================================\n");

  // ─────────────────────────────────────────────────────────────
  // 1. SETUP COMPANY, USER & ROOT FIXTURES
  // ─────────────────────────────────────────────────────────────
  let successCount = 0;
  const companyId = uuidv4();
  const userId = uuidv4();
  const sessionId = uuidv4();

  const now = new Date().toISOString();
  
  // Create mock company
  rawDb.prepare(
    "INSERT INTO companies (id, legal_name, fiscal_year_start, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(companyId, "Acme Final Corp", "01-01", now, now);

  // Create mock user
  rawDb.prepare(
    `INSERT INTO users (id, username, email, password_hash, password_salt, first_name, last_name, created_at, updated_at) VALUES (?, ?, ?, 'hash', 'salt', 'Test', 'User', ?, ?)`
  ).run(userId, "contador_" + userId.substring(0,6), "contador_" + userId.substring(0,6) + "@final.com", now, now);

  // Mock Session
  rawDb.prepare(
    `INSERT INTO sessions (id, user_id, company_id, ip_address, created_at, expires_at, last_active_at) VALUES (?, ?, ?, '127.0.0.1', ?, ?, ?)`
  ).run(sessionId, userId, companyId, now, new Date(Date.now() + 10000000).toISOString(), now);

  // Seed standard US GAAP Accounts
  seedGaapForCompany(companyId);

  // Open Fiscal Period
  const periodId = openPeriod({
    companyId,
    name: "FY-2026-FINAL",
    periodType: "annual",
    startDate: "2026-01-01",
    endDate: "2026-12-31"
  });

  // Get specific accounts we need from GAAP
  const chaseBankAcct = rawDb.query("SELECT id FROM chart_of_accounts WHERE company_id = ? AND code = '1010'").get(companyId) as { id: string };
  const maintenanceAcct = rawDb.query("SELECT id FROM chart_of_accounts WHERE company_id = ? AND code = '5200'").get(companyId) as { id: string };
  const hardwareAcct = rawDb.query("SELECT id FROM chart_of_accounts WHERE company_id = ? AND code = '5160'").get(companyId) as { id: string };

  const bankAcctId = chaseBankAcct.id;
  const repairsAcctId = maintenanceAcct.id;
  const equipmentAcctId = hardwareAcct.id;

  // Add tax categories to test CPA Export aggregations
  rawDb.prepare(`UPDATE chart_of_accounts SET tax_category = 'Schedule C - Pt II Line 21' WHERE id = ?`).run(repairsAcctId);
  rawDb.prepare(`UPDATE chart_of_accounts SET tax_category = 'Schedule C - Pt IV' WHERE id = ?`).run(equipmentAcctId);

  // ─────────────────────────────────────────────────────────────
  // TEST 1: COMPLETE BANK RECONCILIATION -> CLOSURE
  // ─────────────────────────────────────────────────────────────
  try {
    const csvData = `Date,Description,Amount\n2026-06-10,Plumbing Fix,-155.00\n2026-06-15,New Office Servers,-2500.00`;
    
    // Import
    const importRes = importTransactions(companyId, bankAcctId, csvData);
    
    // Get pending transactions back from DB
    const pendings = rawDb.query(`SELECT id, description, amount FROM bank_transactions WHERE company_id = ? AND status = 'pending'`).all(companyId) as any[];
    
    // Match both transactions
    for (const trx of pendings) {
        matchTransaction(companyId, trx.id, trx.amount === -155.00 ? repairsAcctId : equipmentAcctId, bankAcctId, periodId, userId, sessionId, "127.0.0.1");
    }

    // Attempt Period Close
    closePeriod(periodId, userId);

    const closedCheck = rawDb.query(`SELECT status FROM fiscal_periods WHERE id = ?`).get(periodId) as { status: string };

    if (importRes.imported === 2 && closedCheck.status === 'closed') {
      console.log("✅ PASSED: Full Bank Reconciliations triggered correct Double-Entry bindings allowing period closure.");
      successCount++;
    } else {
      console.log(`❌ FAILED: Unexpected state. Imports: ${importRes.imported}, Status: ${closedCheck.status}`);
    }

  } catch(e) {
    console.log("❌ FAILED TEST 1:", e);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2: CPA TAX EXPORT & DISCLAIMER
  // ─────────────────────────────────────────────────────────────
  try {
    const summary = generateCpaSummary(companyId, periodId);
    
    const hasDisclaimer = summary.disclaimer.includes("LEGAL DISCLAIMER");
    const hasHash = summary.sha256ChainResult.length === 64; // SHA-256 standard hex length
    
    const repairTaxCat = summary.taxes.find(t => t.taxCategory.includes("Line 21"));
    const hardwareTaxCat = summary.taxes.find(t => t.taxCategory.includes("Pt IV"));
    
    // Remember, expenses are Debits -> they should equal Positive 155.00
    if (hasDisclaimer && hasHash && repairTaxCat && hardwareTaxCat && repairTaxCat.totalBalance === 155) {
      console.log(`✅ PASSED: CPA Summary successfully mapped IRS tax categories and injected Cryptographic Hash [${summary.sha256ChainResult.substring(0,8)}...]`);
      successCount++;
    } else {
      console.log(`❌ FAILED: CPA Mapping incorrect or missing fingerprint bounding arrays.`, summary.taxes);
    }
  } catch(e) {
    console.log("❌ FAILED TEST 2:", e);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 3: CRYPTOGRAPHIC FORENSIC INTEGRITY
  // ─────────────────────────────────────────────────────────────
  try {
    const check = verifyAuditChain();
    if (check.valid && check.totalEntries > 0) {
      console.log(`✅ PASSED: Blockchain immutable Audit Log verified ${check.totalEntries} sequentially valid AES/SHA-256 hooks.`);
      successCount++;
    } else {
      console.log(`❌ FAILED: Forensic Engine failed validating hash chain => ${check.message}`);
    }
  } catch(e) {
    console.log("❌ FAILED TEST 3:", e);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 4: VIOLATION EXCEPTIONS ON CLOSED PERIODS
  // ─────────────────────────────────────────────────────────────
  try {
    let rejected = false;
    try {
        const { createDraft } = await import("../src/services/journal.service.ts");
        createDraft({
            companyId,
            entryDate: "2026-06-20",
            description: "Illegal Entry",
            reference: null,
            isAdjusting: false,
            periodId,
            createdBy: userId
        }, [{ accountId: bankAcctId, debitAmount: 100, creditAmount: 0, lineNumber: 1, description: null }, { accountId: repairsAcctId, debitAmount: 0, creditAmount: 100, lineNumber: 2, description: null }]);
    } catch (e: any) {
        if (e.message.includes("cerrado")) {
            rejected = true;
        }
    }
    
    if (rejected) {
      console.log("✅ PASSED: Application architecture firmly rejected Double-Entry Journal creation natively enforcing 'closed' Period states.");
      successCount++;
    } else {
        console.log("❌ FAILED: System illegally allowed mutating mathematically closed periods.");
    }
  } catch(e) {
    console.log("❌ FAILED TEST 4:", e);
  }

  console.log(`\nTests Results: ${successCount}/4 PASSED.`);
}

runTests();
