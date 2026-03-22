// Usar base de datos de test, NUNCA la de produccion
process.env.DATABASE_PATH = "./data/test.db";
// ============================================================
// INTEGRATION TESTS: BANK (Layer 4)
// ============================================================
import { rawDb } from "../src/db/connection.ts";
import { v4 as uuidv4 } from "uuid";
import { importTransactions } from "../src/services/bank/csv-import.service.ts";
import { matchTransaction } from "../src/services/bank/reconciliation.service.ts";
import { suggestAccount } from "../src/services/bank/smart-match.service.ts";
import { getAccountTree } from "../src/services/accounts.service.ts";

async function setupTestContext() {
  const companyId = uuidv4();
  const userId = uuidv4();
  
  const now = new Date().toISOString();
  rawDb.prepare("INSERT INTO companies (id, legal_name, fiscal_year_start, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(companyId, "Test Company", "01-01", now, now);
  rawDb.prepare(`INSERT INTO users (id, username, email, password_hash, password_salt, first_name, last_name, created_at, updated_at) VALUES (?, ?, ?, 'hash', 'salt', 'Test', 'User', ?, ?)`).run(userId, "test" + userId.substring(0,6), userId.substring(0,6) + "@test.com", now, now);
  
  const sessionId = uuidv4();
  rawDb.prepare(`INSERT INTO sessions (id, user_id, ip_address, created_at, expires_at, last_active_at) VALUES (?, ?, '127.0.0.1', ?, ?, ?)`).run(sessionId, userId, now, now, now);
  
  const { seedGaapForCompany } = await import("../src/services/accounts.service.ts");
  seedGaapForCompany(companyId);

  const periodId = uuidv4();
  rawDb.prepare("INSERT INTO fiscal_periods (id, company_id, name, period_type, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)")
       .run(periodId, companyId, "Test Period", "annual", "2026-01-01", "2026-12-31", now);
       
  return { companyId, userId, periodId, sessionId };
}

// Chase CSV Mock exactly matching requirements
const MOCK_CSV = `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT,03/01/2026,HOME DEPOT REPAIRS,-155.00,ACH,-155.00,
DEBIT,03/02/2026,AMAZON AWS,-55.00,ACH,-210.00,
CREDIT,03/03/2026,CLIENT DEPOSIT,1000.00,ACH,790.00,
DEBIT,03/04/2026,HOME DEPOT SUPPLY,-200.00,ACH,590.00,
CREDIT,03/05/2026,REFUND X,50.00,ACH,640.00,`;

async function runTests() {
  console.log("========================================");
  console.log("   LAYER 4: BANK ENGINE TESTS           ");
  console.log("========================================");

  const { companyId, userId, periodId, sessionId } = await setupTestContext();
  const accounts = getAccountTree(companyId) as any[];
  
  const repairsAcct = accounts.find(a => a.code === "5200")!; // Reparaciones
  const chaseBankAcct = accounts.find(a => a.code === "1010")!; // Checking
  
  let successCount = 0;

  // TEST 1: CSV Import (5 rows)
  try {
    const res = importTransactions(companyId, chaseBankAcct.id, MOCK_CSV);
    if (res.imported === 5 && res.duplicates === 0) {
      console.log("✅ PASSED: 5 pending transactions imported natively identifying Chase array.");
      successCount++;
    } else {
      console.log(`❌ FAILED: Derived ${res.imported} imports vs 5.`);
    }
  } catch(e) {
    console.log("❌ FAILED CSV IMPORT:", e);
  }

  // TEST 2: Duplicate detection
  try {
    const res = importTransactions(companyId, chaseBankAcct.id, MOCK_CSV);
    if (res.imported === 0 && res.duplicates === 5) {
      console.log("✅ PASSED: Duplicate boundary rejected insertion.");
      successCount++;
    } else {
      console.log(`❌ FAILED: Duplicate collision failed (${res.duplicates} caught).`);
    }
  } catch(e) {
    console.log("❌ FAILED DUPLICATE TEST:", e);
  }

  // Fetch target transaction (HOME DEPOT REPAIRS)
  const homeDepot1 = rawDb.query("SELECT * FROM bank_transactions WHERE company_id = ? AND description LIKE '%HOME DEPOT REPAIRS%' LIMIT 1").get(companyId) as any;

  // TEST 3: Mechanic Reconciliation
  try {
    const draftId = matchTransaction(companyId, homeDepot1.id, repairsAcct.id, chaseBankAcct.id, periodId, userId, sessionId, "127.0.0.1");
    // Verify journal existence exactly mimicking -155 debit/credit arrays
    const verified = rawDb.query("SELECT * FROM journal_entries WHERE id = ? AND status = 'posted'").get(draftId) as any;
    
    // Check if tx is marking 'reconciled'
    const txConfirm = rawDb.query("SELECT status FROM bank_transactions WHERE id = ?").get(homeDepot1.id) as any;
    
    if (verified && txConfirm.status === "reconciled") {
      console.log("✅ PASSED: Double-entry mechanically generated capturing reconcile constraint -> " + verified.entry_number);
      successCount++;
    } else {
      console.log("❌ FAILED RECONCILIATION MATCHER");
    }
  } catch(e) {
    console.log("❌ FAILED RECONCILE:", e);
  }

  // TEST 4: Smart Match Reference Validation
  try {
    const hits = suggestAccount(companyId, "HOME DEPOT SUPPLY");
    if (hits.length > 0 && hits[0].accountId === repairsAcct.id && hits[0].confidence > 0) {
      console.log(`✅ PASSED: Smart Matching Semantic Engine returned confidence ${hits[0].confidence}% targeting ${repairsAcct.id}`);
      successCount++;
    } else {
      console.log("❌ FAILED SMART MATCH: Expected account mapping missing", hits);
    }
  } catch(e) {
    console.log("❌ FAILED SMART MATCH FATAL:", e);
  }

  // TEST 5: Verify global balance integrity confirming double entry was respected inside generic ledgers
  try {
    // getAccountBalance sums posted. Reconciled tx was -155.00 (expense).
    // Expense (5200) -> Debit side increases
    // Asset (1010) -> Credit side increases
    const { getAccountBalance } = await import("../src/services/accounts.service.ts");
    
    const bankBal = getAccountBalance(companyId, chaseBankAcct.id);
    const expBal = getAccountBalance(companyId, repairsAcct.id);
    
    const bankFinalNum = bankBal;
    const expFinalNum = expBal;

    // In my Layer 3, validateDoubleEntry checks against integer precision. Math.round(155.00 * 100).
    // They are returned directly. So bankFinalNum should literally equal -155.
    // Wait, Asset (Checking) -> Initial was 0. We credited 155 (outflow).
    // So Asset balance is -155!
    // Expense (Repairs) -> Initial was 0. We debited 155 (incurred).
    // So Expense balance is 155!
    
    if (bankFinalNum === -155 && expFinalNum === 155) {
      console.log("✅ PASSED: 100% strict balance integrity observed across implicit match bindings");
      successCount++;
    } else {
      console.log(`❌ FAILED BALANCES: Bank ${bankFinalNum} != -155 OR Exp ${expFinalNum} != 155`);
    }
    
  } catch(e) {
    console.log("❌ FAILED LEDGER CALCULATION:", e);
  }

  console.log(`\nTests Results: ${successCount}/5 PASSED.`);
}

runTests();
