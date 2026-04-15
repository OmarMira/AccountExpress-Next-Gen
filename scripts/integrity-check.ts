import { db } from "../src/db/connection.ts";
import { auditLogs, journalEntries, journalLines, companies } from "../src/db/schema/index.ts";
import { eq, isNull, desc } from "drizzle-orm";
import { verifyAuditChain } from "../src/services/audit.service.ts";
import { hmacSha256 as computeJournalHmac } from "../src/services/journal-hash.service.ts";

async function runIntegrityCheck() {
  console.log("============================================================");
  console.log("ACCOUNT EXPRESS — CRYPTOGRAPHIC VAULT INTEGRITY CHECK");
  console.log("============================================================\n");

  const start = Date.now();
  let totalIssues = 0;

  // 1. Verify ALL Companies
  const allCompanies = await db.select({ id: companies.id, legalName: companies.legalName }).from(companies);
  
  // Also check system-level audit logs
  console.log("🔍 PHASE 1: System-Level Audit Logs...");
  const systemAuditResult = await verifyAuditChain(null);
  if (systemAuditResult.valid) {
    console.log(`✅ System Audit: OK (${systemAuditResult.totalEntries} entries verified)`);
  } else {
    console.error(`❌ System Audit: BROKEN! ${systemAuditResult.message}`);
    totalIssues++;
  }

  for (const company of allCompanies) {
    console.log(`\n🏢 Company: ${company.legalName} (${company.id})`);
    
    // 2. Audit Chain Verification
    console.log("  🔍 Verifying Audit Chain...");
    const auditResult = await verifyAuditChain(company.id);
    if (auditResult.valid) {
      console.log(`  ✅ Audit Chain: OK (${auditResult.totalEntries} entries)`);
    } else {
      console.error(`  ❌ Audit Chain: BROKEN! ${auditResult.message}`);
      totalIssues++;
    }

    // 3. Journal (Ledger) Chain Verification
    console.log("  🔍 Verifying Financial Ledger (Journal Entries)...");
    const jes = await db
      .select({
        id: journalEntries.id,
        companyId: journalEntries.companyId,
        entryNumber: journalEntries.entryNumber,
        entryDate: journalEntries.entryDate,
        description: journalEntries.description,
        entryHash: journalEntries.entryHash,
        prevHash: journalEntries.prevHash,
        createdAt: journalEntries.createdAt,
      })
      .from(journalEntries)
      .where(eq(journalEntries.companyId, company.id))
      .orderBy(journalEntries.createdAt);

    if (jes.length === 0) {
      console.log("  ⚪ Journal: Empty (No entries to verify)");
    } else {
      let expectedPrevHash = "GENESIS";
      let jeErrorCount = 0;

      for (const je of jes) {
        // A. Linkage check
        if (je.prevHash !== expectedPrevHash) {
          console.error(`    ❌ JE Link Broken at ${je.entryNumber}: Expected prev_hash ${expectedPrevHash}, found ${je.prevHash}`);
          jeErrorCount++;
          totalIssues++;
        }

        // B. Payload integrity check (recompute hash)
        // Get lines for this JE
        const lines = await db
          .select({
            accountId: journalLines.accountId,
            debitAmount: journalLines.debitAmount,
            creditAmount: journalLines.creditAmount,
            lineNumber: journalLines.lineNumber,
          })
          .from(journalLines)
          .where(eq(journalLines.journalEntryId, je.id))
          .orderBy(journalLines.lineNumber);

        const linesFingerprint = lines
          .map((l) => `${l.accountId}|${l.debitAmount}|${l.creditAmount}`)
          .join(",");

        const hashInput = [
          je.id,
          je.companyId,
          je.entryDate,
          je.description,
          linesFingerprint,
          je.prevHash,
        ].join("|");

        const computedHash = computeJournalHmac(hashInput);

        if (je.entryHash !== computedHash) {
          console.error(`    ❌ JE Tampered at ${je.entryNumber}: Hash mismatch! Calculated: ${computedHash}, Stored: ${je.entryHash}`);
          jeErrorCount++;
          totalIssues++;
        }

        expectedPrevHash = je.entryHash;
      }

      if (jeErrorCount === 0) {
        console.log(`  ✅ Journal Chain: OK (${jes.length} entries verified)`);
      } else {
        console.error(`  ❌ Journal Chain: FOUND ${jeErrorCount} ISSUES!`);
      }
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  console.log("\n============================================================");
  if (totalIssues === 0) {
    console.log(`🏆 INTEGRITY CHECK PASSED! All systems are green. (${duration}s)`);
  } else {
    console.error(`🚨 INTEGRITY CHECK FAILED! Found ${totalIssues} security issues. (${duration}s)`);
    process.exit(1);
  }
}

runIntegrityCheck().catch(err => {
  console.error("FATAL ERROR during integrity check:", err);
  process.exit(1);
});
