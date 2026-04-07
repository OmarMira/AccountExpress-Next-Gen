import { v4 as uuidv4 } from "uuid";
import { db, sql } from "../src/db/connection.ts";
import { companies, users, sessions, fiscalPeriods, chartOfAccounts, bankTransactions } from "../src/db/schema/index.ts";
import { seedGaapForCompany } from "../src/services/accounts.service.ts";
import { openPeriod, closePeriod } from "../src/services/fiscal-period.service.ts";
import { importTransactions } from "../src/services/bank/csv-import.service.ts";
import { matchTransaction } from "../src/services/bank/reconciliation.service.ts";
import { createDraft } from "../src/services/journal-core.service.ts";
import { generateCpaSummary } from "../src/services/reports/cpa-summary.service.ts";
import { verifyAuditChain } from "../src/services/audit.service.ts";
import { eq, and } from "drizzle-orm";

async function runTests() {
  console.log("========================================");
  console.log("   LAYER 5: THE FINAL MASTER TEST       ");
  console.log("========================================\n");

  let successCount = 0;
  const companyId = uuidv4();
  const userId = uuidv4();
  const sessionId = uuidv4();
  const now = new Date();
  
  // Create mock company
  await db.insert(companies).values({
    id: companyId,
    legalName: "Acme Final Corp",
    fiscalYearStart: "01-01",
    isActive: true,
    createdAt: now,
    updatedAt: now
  });

  // Create mock user
  await db.insert(users).values({
    id: userId,
    username: "contador_" + userId.substring(0,6),
    email: "contador_" + userId.substring(0,6) + "@final.com",
    passwordHash: "hash",
    passwordSalt: "salt",
    firstName: "Test",
    lastName: "User",
    isActive: true,
    createdAt: now,
    updatedAt: now
  });

  // Mock Session
  await db.insert(sessions).values({
    id: sessionId,
    userId: userId,
    companyId: companyId,
    ipAddress: "127.0.0.1",
    createdAt: now,
    expiresAt: new Date(now.getTime() + 10000000),
    lastActiveAt: now,
    isValid: true
  });

  // Seed standard US GAAP Accounts
  await seedGaapForCompany(companyId);

  // Open Fiscal Period
  const periodId = await openPeriod({
    companyId,
    name: "FY-2026-FINAL",
    periodType: "annual",
    startDate: "2026-01-01",
    endDate: "2026-12-31"
  });

  // Get specific accounts we need from GAAP
  const [chaseBankAcct] = await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, '1010'))).limit(1);
  const [maintenanceAcct] = await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, '5200'))).limit(1);
  const [hardwareAcct] = await db.select().from(chartOfAccounts).where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, '5160'))).limit(1);

  const bankAcctId = chaseBankAcct.id;
  const repairsAcctId = maintenanceAcct.id;
  const equipmentAcctId = hardwareAcct.id;

  // Add tax categories
  await db.update(chartOfAccounts).set({ taxCategory: 'Schedule C - Pt II Line 21' }).where(eq(chartOfAccounts.id, repairsAcctId));
  await db.update(chartOfAccounts).set({ taxCategory: 'Schedule C - Pt IV' }).where(eq(chartOfAccounts.id, equipmentAcctId));

  // TEST 1: COMPLETE BANK RECONCILIATION -> CLOSURE
  try {
    const csvData = `Date,Description,Amount\n2026-06-10,Plumbing Fix,-155.00\n2026-06-15,New Office Servers,-2500.00`;
    
    // Import
    const importRes = await importTransactions(companyId, bankAcctId, csvData);
    
    // Get pending transactions back from DB
    const pendings = await db.select().from(bankTransactions).where(and(eq(bankTransactions.companyId, companyId), eq(bankTransactions.status, 'pending')));
    
    // Match both transactions
    for (const trx of pendings) {
        await matchTransaction(companyId, trx.id, Number(trx.amount) === -155.00 ? repairsAcctId : equipmentAcctId, bankAcctId, periodId, userId, sessionId, "127.0.0.1");
    }

    // Attempt Period Close
    await closePeriod(periodId, userId);

    const [closedCheck] = await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, periodId)).limit(1);

    if (importRes.imported === 2 && closedCheck.status === 'closed') {
      console.log("✅ PASSED: Full Bank Reconciliations triggered correct Double-Entry bindings allowing period closure.");
      successCount++;
    } else {
      console.log(`❌ FAILED: Unexpected state. Imports: ${importRes.imported}, Status: ${closedCheck.status}`);
    }

  } catch(e) {
    console.log("❌ FAILED TEST 1:", e);
  }

  // TEST 2: CPA TAX EXPORT
  try {
    const summary = await generateCpaSummary(companyId, periodId);
    
    const hasDisclaimer = summary.disclaimer.includes("LEGAL DISCLAIMER");
    const hasHash = summary.sha256ChainResult.length === 64; 
    const repairTaxCat = summary.taxes.find(t => t.taxCategory?.includes("Line 21"));
    const hardwareTaxCat = summary.taxes.find(t => t.taxCategory?.includes("Pt IV"));
    
    if (hasDisclaimer && hasHash && repairTaxCat && hardwareTaxCat && Number(repairTaxCat.totalBalance) === 155) {
      console.log(`✅ PASSED: CPA Summary successfully mapped IRS tax categories and fingerprint [${summary.sha256ChainResult.substring(0,8)}...]`);
      successCount++;
    } else {
      console.log(`❌ FAILED: CPA Mapping incorrect.`, summary.taxes);
    }
  } catch(e) {
    console.log("❌ FAILED TEST 2:", e);
  }

  // TEST 3: CRYPTOGRAPHIC FORENSIC INTEGRITY
  try {
    const check = await verifyAuditChain(companyId);
    if (check.valid && check.totalEntries > 0) {
      console.log(`✅ PASSED: Blockchain immutable Audit Log verified ${check.totalEntries} valid hooks.`);
      successCount++;
    } else {
      console.log(`❌ FAILED: Forensic Engine failed validating hash chain => ${check.message}`);
    }
  } catch(e) {
    console.log("❌ FAILED TEST 3:", e);
  }

  // TEST 4: VIOLATION EXCEPTIONS ON CLOSED PERIODS
  try {
    let rejected = false;
    try {
        await createDraft({
            companyId,
            entryDate: "2026-06-20",
            description: "Illegal Entry",
            reference: null,
            isAdjusting: false,
            periodId,
            createdBy: userId
        }, [
          { accountId: bankAcctId, debitAmount: 100, creditAmount: 0, lineNumber: 1, description: null }, 
          { accountId: repairsAcctId, debitAmount: 0, creditAmount: 100, lineNumber: 2, description: null }
        ]);
    } catch (e: any) {
        if (e.message.includes("cerrado") || e.message.includes("closed")) {
            rejected = true;
        }
    }
    
    if (rejected) {
      console.log("✅ PASSED: Application architecture firmly rejected mutation on 'closed' Period states.");
      successCount++;
    } else {
        console.log("❌ FAILED: System illegally allowed mutating mathematically closed periods.");
    }
  } catch(e) {
    console.log("❌ FAILED TEST 4:", e);
  }

  console.log(`\nTests Results: ${successCount}/4 PASSED.`);
}

runTests().catch(console.error);
