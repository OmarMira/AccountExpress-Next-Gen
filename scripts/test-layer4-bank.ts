import { db, sql } from "../src/db/connection.ts";
import { v4 as uuidv4 } from "uuid";
import { companies, users, sessions, fiscalPeriods, bankTransactions, journalEntries } from "../src/db/schema/index.ts";
import { importTransactions } from "../src/services/bank/csv-import.service.ts";
import { matchTransaction } from "../src/services/bank/reconciliation.service.ts";
import { suggestAccountBatch } from "../src/services/bank/smart-match.service.ts";
import { getAccountTree, getAccountBalance, seedGaapForCompany } from "../src/services/accounts.service.ts";
import { eq, and, like } from "drizzle-orm";

async function setupTestContext() {
  const companyId = uuidv4();
  const userId = uuidv4();
  const sessionId = uuidv4();
  const now = new Date();
  
  await db.insert(companies).values({
    id: companyId,
    legalName: "Test Company",
    fiscalYearStart: "01-01",
    isActive: true,
    createdAt: now,
    updatedAt: now
  });

  await db.insert(users).values({
    id: userId,
    username: "test" + userId.substring(0,6),
    email: userId.substring(0,6) + "@test.com",
    passwordHash: "hash",
    passwordSalt: "salt",
    firstName: "Test",
    lastName: "User",
    isActive: true,
    createdAt: now,
    updatedAt: now
  });
  
  await db.insert(sessions).values({
    id: sessionId,
    userId: userId,
    ipAddress: "127.0.0.1",
    createdAt: now,
    expiresAt: new Date(now.getTime() + 3600000),
    lastActiveAt: now,
    isValid: true
  });
  
  await seedGaapForCompany(companyId);

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

// Chase CSV Mock
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
  const accounts = await getAccountTree(companyId) as any[];
  
  const repairsAcct = accounts.find(a => a.code === "5200")!; 
  const chaseBankAcct = accounts.find(a => a.code === "1010")!; 
  
  let successCount = 0;

  // TEST 1: CSV Import (5 rows)
  try {
    const res = await importTransactions(companyId, chaseBankAcct.id, MOCK_CSV);
    if (res.imported === 5 && res.duplicates === 0) {
      console.log("✅ PASSED: 5 pending transactions imported correctly.");
      successCount++;
    } else {
      console.log(`❌ FAILED: Imported ${res.imported} vs 5.`);
    }
  } catch(e) {
    console.log("❌ FAILED CSV IMPORT:", e);
  }

  // TEST 2: Duplicate detection
  try {
    const res = await importTransactions(companyId, chaseBankAcct.id, MOCK_CSV);
    if (res.imported === 0 && res.duplicates === 5) {
      console.log("✅ PASSED: Duplicate detection works.");
      successCount++;
    } else {
      console.log(`❌ FAILED: Expected 5 duplicates, got ${res.duplicates}.`);
    }
  } catch(e) {
    console.log("❌ FAILED DUPLICATE TEST:", e);
  }

  // Fetch target transaction
  const [homeDepot1] = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.companyId, companyId), like(bankTransactions.description, '%HOME DEPOT REPAIRS%')))
    .limit(1);

  // TEST 3: Reconciliation
  try {
    const draftId = await matchTransaction(companyId, homeDepot1.id, repairsAcct.id, chaseBankAcct.id, periodId, userId, sessionId, "127.0.0.1");
    const [verified] = await db.select().from(journalEntries).where(and(eq(journalEntries.id, draftId), eq(journalEntries.status, 'posted'))).limit(1);
    const [txConfirm] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, homeDepot1.id)).limit(1);
    
    if (verified && txConfirm.status === "reconciled") {
      console.log("✅ PASSED: Reconciliation successful -> " + verified.entryNumber);
      successCount++;
    } else {
      console.log("❌ FAILED RECONCILIATION");
    }
  } catch(e) {
    console.log("❌ FAILED RECONCILE:", e);
  }

  // TEST 4: Smart Match
  try {
    const hitsMap = await suggestAccountBatch(companyId, ["HOME DEPOT SUPPLY"]);
    const hits = hitsMap.get("HOME DEPOT SUPPLY") ?? [];
    if (hits.length > 0 && hits[0].accountId === repairsAcct.id) {
      console.log(`✅ PASSED: Smart Match found correct account mapping.`);
      successCount++;
    } else {
      console.log("❌ FAILED SMART MATCH: Suggestion missing or wrong", hits);
    }
  } catch(e) {
    console.log("❌ FAILED SMART MATCH FATAL:", e);
  }

  // TEST 5: Balance Integrity
  try {
    const bankBal = await getAccountBalance(companyId, chaseBankAcct.id);
    const expBal = await getAccountBalance(companyId, repairsAcct.id);
    
    if (Number(bankBal) === -155 && Number(expBal) === 155) {
      console.log("✅ PASSED: Balance integrity verified.");
      successCount++;
    } else {
      console.log(`❌ FAILED BALANCES: Bank ${bankBal} != -155 OR Exp ${expBal} != 155`);
    }
  } catch(e) {
    console.log("❌ FAILED LEDGER CALCULATION:", e);
  }

  console.log(`\nTests Results: ${successCount}/5 PASSED.`);
}

runTests().catch(console.error);
