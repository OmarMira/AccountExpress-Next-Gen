import { rawDb } from "../src/db/connection.ts";

const testCompanies = rawDb.query(
  `SELECT id, legal_name FROM companies WHERE legal_name LIKE 'Test%' OR legal_name LIKE '%test%' OR id LIKE 'test%'`
).all() as { id: string, legal_name: string }[];

for (const company of testCompanies) {
  if (company.legal_name !== "Demo Company LLC") {
    try {
      const deleteCompany = rawDb.transaction(() => {
        rawDb.prepare("DELETE FROM user_company_roles WHERE company_id = ?").run(company.id);
        rawDb.prepare("DELETE FROM sessions WHERE company_id = ?").run(company.id);
        rawDb.prepare("DELETE FROM bank_transactions WHERE company_id = ?").run(company.id);
        
        const entries = rawDb.query("SELECT id FROM journal_entries WHERE company_id = ?").all(company.id) as {id: string}[];
        for (const e of entries) {
           rawDb.prepare("DELETE FROM journal_lines WHERE journal_entry_id = ?").run(e.id);
        }
        rawDb.prepare("DELETE FROM journal_entries WHERE company_id = ?").run(company.id);
        
        rawDb.prepare("DELETE FROM chart_of_accounts WHERE company_id = ?").run(company.id);
        rawDb.prepare("DELETE FROM fiscal_periods WHERE company_id = ?").run(company.id);
        rawDb.prepare("DELETE FROM audit_logs WHERE company_id = ?").run(company.id);
        
        rawDb.prepare("DELETE FROM companies WHERE id = ?").run(company.id);
      });
      
      deleteCompany();
      console.log(`Eliminada: ${company.legal_name} (${company.id})`);
    } catch (err: any) {
      console.error(`FAILED to delete ${company.legal_name}:`, err);
    }
  }
}

const remaining = rawDb.query(`SELECT id, legal_name FROM companies`).all() as { id: string, legal_name: string }[];
console.log(`\nEmpresas restantes: ${remaining.length}`);
remaining.forEach(r => console.log(`  - ${r.legal_name} (${r.id})`));
