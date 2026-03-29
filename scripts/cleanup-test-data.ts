import { db, sql } from "../src/db/connection.ts";
import { like, or } from "drizzle-orm";
import { companies, userCompanyRoles, sessions, bankTransactions, journalEntries, journalLines, chartOfAccounts, fiscalPeriods, auditLogs } from "../src/db/schema/index.ts";

async function main() {
  const testCompanies = await db.query.companies.findMany({
    where: or(
      like(companies.legalName, 'Test%'),
      like(companies.legalName, '%test%'),
      like(companies.id, 'test%')
    ),
    columns: { id: true, legalName: true }
  });

  for (const company of testCompanies) {
    if (company.legalName !== "Demo Company LLC") {
      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`DELETE FROM user_company_roles WHERE company_id = ${company.id}`);
          await tx.execute(sql`DELETE FROM sessions WHERE company_id = ${company.id}`);
          await tx.execute(sql`DELETE FROM bank_transactions WHERE company_id = ${company.id}`);
          
          const entries = await tx.execute(sql`SELECT id FROM journal_entries WHERE company_id = ${company.id}`);
          for (const e of entries) {
             await tx.execute(sql`DELETE FROM journal_lines WHERE journal_entry_id = ${(e as any).id}`);
          }
          await tx.execute(sql`DELETE FROM journal_entries WHERE company_id = ${company.id}`);
          
          await tx.execute(sql`DELETE FROM chart_of_accounts WHERE company_id = ${company.id}`);
          await tx.execute(sql`DELETE FROM fiscal_periods WHERE company_id = ${company.id}`);
          await tx.execute(sql`DELETE FROM audit_logs WHERE company_id = ${company.id}`);
          
          await tx.execute(sql`DELETE FROM companies WHERE id = ${company.id}`);
        });
        
        console.log(`Eliminada: ${company.legalName} (${company.id})`);
      } catch (err: any) {
        console.error(`FAILED to delete ${company.legalName}:`, err);
      }
    }
  }

  const remaining = await db.query.companies.findMany({
    columns: { id: true, legalName: true }
  });
  console.log(`\nEmpresas restantes: ${remaining.length}`);
  remaining.forEach(r => console.log(`  - ${r.legalName} (${r.id})`));
}

main().catch(console.error);
