// ============================================================
// CHART OF ACCOUNTS SERVICE — PostgreSQL 16 / Drizzle ORM
// CRUD for the account tree. is_system=true accounts read-only.
// ============================================================

import { db, type DbTransaction } from "../db/connection.ts";
import { chartOfAccounts, journalLines, journalEntries } from "../db/schema/index.ts";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { GAAP_ACCOUNTS } from "../db/seed/chart-of-accounts.seed.ts";

// ── Seed GAAP accounts for a company ─────────────────────────
export async function seedGaapForCompany(companyId: string, tx?: DbTransaction): Promise<void> {
  const client = tx ?? db;
  const codeToId = new Map<string, string>();

  const accountsWithIds = GAAP_ACCOUNTS.map((a) => ({
    ...a,
    id: `acct-${companyId.substring(0, 8)}-${a.code}`,
  }));

  for (const a of accountsWithIds) {
    codeToId.set(a.code, a.id);
  }

  const now = new Date();

  // Insert all accounts, ignoring conflicts (idempotent)
  for (const a of accountsWithIds) {
    const parentId = a.parentCode ? (codeToId.get(a.parentCode) ?? null) : null;
    await client.insert(chartOfAccounts)
      .values({
        id:            a.id,
        companyId,
        code:          a.code,
        name:          a.name,
        accountType:   a.accountType,
        normalBalance: a.normalBalance,
        parentId,
        level:         a.level,
        isSystem:      true,
        isActive:      true,
        taxCategory:   a.taxCategory ?? null,
        description:   a.description ?? null,
        createdAt:     now,
        updatedAt:     now,
      })
      .onConflictDoNothing();
  }
}

interface AccountRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  parent_id: string | null;
  level: number;
  is_system: boolean;
  is_active: boolean;
  tax_category: string | null;
  description: string | null;
  total_debits: string;
  total_credits: string;
}

// ── Get all accounts with their calculated balances ────────
export async function getAccountsWithBalances(companyId: string): Promise<AccountRow[]> {
  // Use a raw SQL aggregate to compute balances efficiently in a single query
  const rows = await db.execute(sql`
    SELECT
      c.id, c.company_id, c.code, c.name, c.account_type, c.normal_balance,
      c.parent_id, c.level, c.is_system, c.is_active, c.tax_category, c.description,
      COALESCE(SUM(CASE WHEN je.status = 'posted' THEN jl.debit_amount ELSE 0 END), 0) as total_debits,
      COALESCE(SUM(CASE WHEN je.status = 'posted' THEN jl.credit_amount ELSE 0 END), 0) as total_credits
    FROM chart_of_accounts c
    LEFT JOIN journal_lines jl ON c.id = jl.account_id
    LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id
    WHERE c.company_id = ${companyId} AND c.is_active = true
    GROUP BY c.id
    ORDER BY c.code ASC
  `) as unknown as AccountRow[];

  return rows.map((row) => {
    const debitCents  = Math.round(parseFloat(row.total_debits)  * 100);
    const creditCents = Math.round(parseFloat(row.total_credits) * 100);
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
export async function findByCode(companyId: string, code: string) {
  const [result] = await db
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)))
    .limit(1);
  return result ?? null;
}

// ── Add a custom sub-account ─────────────────────────────────
export async function addAccount(opts: {
  companyId:     string;
  code:          string;
  name:          string;
  accountType:   "asset" | "liability" | "equity" | "revenue" | "expense";
  normalBalance: "debit" | "credit";
  parentCode:    string | null;
  taxCategory:   string | null;
  description:   string | null;
}): Promise<string> {
  const existing = await findByCode(opts.companyId, opts.code);
  if (existing) throw new Error(`Account code ${opts.code} already exists`);

  let parentId: string | null = null;
  let level = 1;

  if (opts.parentCode) {
    const parent = await findByCode(opts.companyId, opts.parentCode);
    if (!parent) throw new Error(`Parent account ${opts.parentCode} not found`);
    parentId = parent.id;
    level    = (parent.level ?? 1) + 1;
  }

  const id  = uuidv4();
  const now = new Date();

  await db.insert(chartOfAccounts).values({
    id,
    companyId:     opts.companyId,
    code:          opts.code,
    name:          opts.name,
    accountType:   opts.accountType,
    normalBalance: opts.normalBalance,
    parentId,
    level,
    isSystem:      false,
    isActive:      true,
    taxCategory:   opts.taxCategory,
    description:   opts.description,
    createdAt:     now,
    updatedAt:     now,
  });

  return id;
}

// ── Deactivate an account (soft delete) ──────────────────────
export async function deactivateAccount(accountId: string, companyId: string): Promise<void> {
  const [account] = await db
    .select({ isSystem: chartOfAccounts.isSystem })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)))
    .limit(1);

  if (!account) throw new Error(`Account ${accountId} not found`);
  if (account.isSystem) throw new Error("System accounts cannot be deactivated");

  // Verify no posted journal lines reference this account
  const [usage] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(journalLines)
    .where(eq(journalLines.accountId, accountId))
    .limit(1);

  if (usage && usage.count > 0) {
    throw new Error(`Account cannot be deactivated: it has ${usage.count} journal line(s) referencing it`);
  }

  await db.update(chartOfAccounts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(chartOfAccounts.id, accountId));
}

// ── Get realtime balance from posted entries ─────────────────
export async function getAccountBalance(companyId: string, accountId: string): Promise<number> {
  const [account] = await db
    .select({ normalBalance: chartOfAccounts.normalBalance })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)))
    .limit(1);

  if (!account) throw new Error(`Account ${accountId} not found`);

  interface BalanceRow {
    total_debits: string;
    total_credits: string;
  }

  const [result] = await db.execute(sql`
    SELECT
      COALESCE(SUM(jl.debit_amount), 0)  as total_debits,
      COALESCE(SUM(jl.credit_amount), 0) as total_credits
    FROM journal_lines jl
    JOIN journal_entries je ON jl.journal_entry_id = je.id
    WHERE jl.account_id = ${accountId}
      AND jl.company_id = ${companyId}
      AND je.status IN ('posted', 'voided')
  `) as unknown as BalanceRow[];

  const debitCents  = Math.round(parseFloat(result.total_debits)  * 100);
  const creditCents = Math.round(parseFloat(result.total_credits) * 100);

  if (account.normalBalance === "debit") {
    return (debitCents - creditCents) / 100;
  } else {
    return (creditCents - debitCents) / 100;
  }
}
