// ============================================================
// CHART OF ACCOUNTS SERVICE
// CRUD for the account tree. is_system=1 accounts are read-only.
// Each company seeds the full US GAAP chart on creation.
// ============================================================

import { rawDb } from "../db/connection.ts";
import { v4 as uuidv4 } from "uuid";
import { GAAP_ACCOUNTS } from "../db/seed/chart-of-accounts.seed.ts";

// ── Seed GAAP accounts for a company ─────────────────────────
export function seedGaapForCompany(companyId: string): void {
  // Build code → id map for parent resolution
  const codeToId = new Map<string, string>();

  // Assign IDs to all accounts first
  const accountsWithIds = GAAP_ACCOUNTS.map((a) => ({
    ...a,
    id: `acct-${companyId.substring(0, 8)}-${a.code}`,
  }));

  for (const a of accountsWithIds) {
    codeToId.set(a.code, a.id);
  }

  const stmt = rawDb.prepare(
    `INSERT OR IGNORE INTO chart_of_accounts
       (id, company_id, code, name, account_type, normal_balance,
        parent_id, level, is_system, is_active, tax_category, description,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`
  );

  const now = new Date().toISOString();

  const transaction = rawDb.transaction(() => {
    for (const a of accountsWithIds) {
      const parentId = a.parentCode ? (codeToId.get(a.parentCode) ?? null) : null;
      stmt.run(
        a.id, companyId, a.code, a.name, a.accountType, a.normalBalance,
        parentId, a.level, a.taxCategory ?? null, a.description ?? null,
        now, now
      );
    }
  });

  transaction();
}

// ── Get the full account tree for a company ──────────────────
export function getAccountTree(companyId: string) {
  const rows = rawDb
    .query(
      `SELECT 
         c.*,
         COALESCE(SUM(CASE WHEN je.status IN ('posted', 'voided') THEN jl.debit_amount ELSE 0 END), 0) as total_debits,
         COALESCE(SUM(CASE WHEN je.status IN ('posted', 'voided') THEN jl.credit_amount ELSE 0 END), 0) as total_credits
       FROM chart_of_accounts c
       LEFT JOIN journal_lines jl ON c.id = jl.account_id
       LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE c.company_id = ? AND c.is_active = 1
       GROUP BY c.id
       ORDER BY c.code ASC`
    )
    .all(companyId) as any[];

  return rows.map(row => {
    const debitCents = Math.round(row.total_debits * 100);
    const creditCents = Math.round(row.total_credits * 100);
    let balance = 0;
    if (row.normal_balance === "debit") {
      balance = (debitCents - creditCents) / 100;
    } else {
      balance = (creditCents - debitCents) / 100;
    }
    return { ...row, balance };
  });
}

// ── Find account by code ─────────────────────────────────────
export function findByCode(companyId: string, code: string) {
  return rawDb
    .query(
      "SELECT * FROM chart_of_accounts WHERE company_id = ? AND code = ?"
    )
    .get(companyId, code);
}

// ── Add a custom sub-account ─────────────────────────────────
export function addAccount(opts: {
  companyId:     string;
  code:          string;
  name:          string;
  accountType:   "asset" | "liability" | "equity" | "revenue" | "expense";
  normalBalance: "debit" | "credit";
  parentCode:    string | null;
  taxCategory:   string | null;
  description:   string | null;
}): string {
  // Validate code not already used
  const existing = findByCode(opts.companyId, opts.code);
  if (existing) throw new Error(`Account code ${opts.code} already exists`);

  let parentId: string | null = null;
  let level = 1;

  if (opts.parentCode) {
    const parent = findByCode(opts.companyId, opts.parentCode) as {
      id: string;
      level: number;
    } | null;
    if (!parent) throw new Error(`Parent account ${opts.parentCode} not found`);
    parentId = parent.id;
    level    = parent.level + 1;
  }

  const id  = uuidv4();
  const now = new Date().toISOString();

  rawDb
    .prepare(
      `INSERT INTO chart_of_accounts
         (id, company_id, code, name, account_type, normal_balance,
          parent_id, level, is_system, is_active, tax_category, description,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)`
    )
    .run(
      id, opts.companyId, opts.code, opts.name, opts.accountType,
      opts.normalBalance, parentId, level,
      opts.taxCategory ?? null, opts.description ?? null, now, now
    );

  return id;
}

// ── Deactivate an account (soft delete) ──────────────────────
export function deactivateAccount(accountId: string, companyId: string): void {
  const account = rawDb
    .query(
      "SELECT is_system FROM chart_of_accounts WHERE id = ? AND company_id = ?"
    )
    .get(accountId, companyId) as { is_system: number } | null;

  if (!account) throw new Error(`Account ${accountId} not found`);
  if (account.is_system) throw new Error("System accounts cannot be deactivated");

  // Check for active journal lines referencing this account
  // Accounts with movements can be deactivated, but never hard deleted. 
  // We allow soft-deletion (deactivation) here natively.

  rawDb
    .prepare(
      "UPDATE chart_of_accounts SET is_active = 0, updated_at = ? WHERE id = ?"
    )
    .run(new Date().toISOString(), accountId);
}

// ── Get realtime balance from posted entries ─────────────────
export function getAccountBalance(companyId: string, accountId: string): number {
  const account = rawDb
    .query("SELECT normal_balance FROM chart_of_accounts WHERE id = ? AND company_id = ?")
    .get(accountId, companyId) as { normal_balance: string } | null;

  if (!account) throw new Error(`Account ${accountId} not found`);

  // We rely on 100-basis integer math later, but DB currently stores floats/reals in SQLite.
  // Converting DB sums to cents and computing difference safely:
  const result = rawDb
    .query(
      `SELECT 
         COALESCE(SUM(jl.debit_amount), 0) as total_debits,
         COALESCE(SUM(jl.credit_amount), 0) as total_credits
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE jl.account_id = ? AND jl.company_id = ? AND je.status IN ('posted', 'voided')`
    )
    .get(accountId, companyId) as { total_debits: number; total_credits: number };

  const debitCents = Math.round(result.total_debits * 100);
  const creditCents = Math.round(result.total_credits * 100);

  if (account.normal_balance === "debit") {
    return (debitCents - creditCents) / 100;
  } else {
    return (creditCents - debitCents) / 100;
  }
}

