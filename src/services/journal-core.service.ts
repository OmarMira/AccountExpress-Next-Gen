// ============================================================
// JOURNAL CORE SERVICE — PostgreSQL 16 / Drizzle ORM
// createDraft y post aceptan tx opcional para atomicidad externa.
// ============================================================

import { db, sql }        from "../db/connection.ts";
import { journalEntries, journalLines, fiscalPeriods } from "../db/schema/index.ts";
import { eq }             from "drizzle-orm";
import { createAuditEntry } from "./audit.service.ts";
import { v4 as uuidv4 }   from "uuid";
import { validateDoubleEntry } from "./journal-math.service.ts";
import { nextEntryNumber, getJournalChainTip, computeEntryHash } from "./journal-hash.service.ts";
import { AppError } from "../lib/errors.ts";
import type { JournalEntryInput, JournalLineInput } from "../lib/journal-types.ts";

export type { JournalEntryInput, JournalLineInput };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── Create a draft journal entry ─────────────────────────────
export async function createDraft(
  entry: JournalEntryInput,
  lines: JournalLineInput[],
  tx?: Tx
): Promise<string> {
  if (lines.length === 0) throw AppError.validation("Al menos una línea es requerida.");
  validateDoubleEntry(lines);

  const runner = tx ?? db;

  const [period] = await runner
    .select({ status: fiscalPeriods.status })
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.id, entry.periodId))
    .limit(1);

  if (!period) throw AppError.validation("Periodo fiscal no encontrado.");
  if (period.status === "closed" || period.status === "locked")
    throw AppError.validation("El periodo contable se encuentra cerrado. No se permiten nuevos asientos.");

  const id          = uuidv4();
  const now         = new Date();
  const entryNumber = await nextEntryNumber(entry.companyId);
  const prevHash    = (await getJournalChainTip(entry.companyId)).hash;
  const entryHash   = computeEntryHash(id, entry, lines, prevHash);

  const insert = async (t: Tx) => {
    await t.insert(journalEntries).values({
      id,
      companyId:   entry.companyId,
      entryNumber,
      entryDate:   entry.entryDate,
      description: entry.description,
      reference:   entry.reference ?? null,
      status:      "draft",
      isAdjusting: entry.isAdjusting,
      isReversing: false,
      periodId:    entry.periodId,
      createdBy:   entry.createdBy,
      entryHash,
      prevHash,
      createdAt:   now,
      updatedAt:   now,
    });

    for (const line of lines) {
      await t.insert(journalLines).values({
        id:             uuidv4(),
        journalEntryId: id,
        companyId:      entry.companyId,
        accountId:      line.accountId,
        debitAmount:    String(line.debitAmount),
        creditAmount:   String(line.creditAmount),
        description:    line.description ?? null,
        lineNumber:     line.lineNumber,
        createdAt:      now,
      });
    }
  };

  if (tx) {
    await insert(tx);
  } else {
    await db.transaction(async (t) => insert(t));
  }

  return id;
}

// ── Post a draft journal entry ────────────────────────────────
export async function post(
  entryId:   string,
  postedBy:  string,
  sessionId: string,
  ipAddress: string,
  tx?: Tx
): Promise<void> {
  const runner = tx ?? db;

  const [entry] = await runner
    .select({ companyId: journalEntries.companyId, status: journalEntries.status, periodId: journalEntries.periodId })
    .from(journalEntries)
    .where(eq(journalEntries.id, entryId))
    .limit(1);

  if (!entry) throw AppError.validation(`Journal entry ${entryId} not found`);
  if (entry.status !== "draft") throw AppError.validation(`Entry is ${entry.status} — only drafts can be posted`);

  // ── Re-verify fiscal period is still open at post time ───────
  const [period] = await runner
    .select({ status: fiscalPeriods.status })
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.id, entry.periodId))
    .limit(1);

  if (!period) throw AppError.validation("Periodo fiscal no encontrado.");
  if (period.status === "closed" || period.status === "locked")
    throw AppError.validation("El periodo contable se cerró después de crear el borrador. No se puede postear.");

  const lines = await runner
    .select({
      accountId:    journalLines.accountId,
      debitAmount:  journalLines.debitAmount,
      creditAmount: journalLines.creditAmount,
      lineNumber:   journalLines.lineNumber,
    })
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, entryId));

  validateDoubleEntry(
    lines.map((l) => ({
      accountId:    l.accountId,
      debitAmount:  parseFloat(l.debitAmount ?? "0"),
      creditAmount: parseFloat(l.creditAmount ?? "0"),
      description:  null,
      lineNumber:   l.lineNumber,
    }))
  );

  const now = new Date();
  await runner.update(journalEntries)
    .set({ status: "posted", postedBy, postedAt: now, updatedAt: now })
    .where(eq(journalEntries.id, entryId));

  await createAuditEntry({
    companyId:   entry.companyId,
    userId:      postedBy,
    sessionId,
    action:      "journal:approve",
    module:      "journal",
    entityType:  "journal_entry",
    entityId:    entryId,
    beforeState: { status: "draft" },
    afterState:  { status: "posted", postedAt: now.toISOString() },
    ipAddress,
  });
}

// ── Get entry with its lines ──────────────────────────────────
export async function getEntryWithLines(entryId: string) {
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, entryId))
    .limit(1);

  const lines = await db
    .select()
    .from(journalLines)
    .where(eq(journalLines.journalEntryId, entryId))
    .orderBy(journalLines.lineNumber);

  return { entry: entry ?? null, lines };
}

// ── List entries with optional filters ───────────────────────
export async function listEntries(
  companyId: string,
  opts?: { status?: string; periodId?: string; limit?: number; offset?: number }
) {
  const safeLimit  = Number.isFinite(opts?.limit)  && (opts?.limit  ?? 0) > 0  ? opts!.limit!  : 100;
  const safeOffset = Number.isFinite(opts?.offset) && (opts?.offset ?? 0) >= 0 ? opts!.offset! : 0;

  interface JournalRow {
    id:            string;
    entry_number:  number;
    entry_date:    string;
    description:   string;
    reference:     string | null;
    status:        string;
    is_adjusting:  boolean;
    is_reversing:  boolean;
    period_id:     string;
    created_by:    string;
    total_amount:  string;
    total_debits:  string;
    total_credits: string;
  }

  const rows = await db.execute(sql`
    SELECT e.*,
           (COALESCE(SUM(l.debit_amount), 0) + COALESCE(SUM(l.credit_amount), 0)) / 2 as total_amount,
           COALESCE(SUM(l.debit_amount), 0) as total_debits,
           COALESCE(SUM(l.credit_amount), 0) as total_credits
    FROM journal_entries e
    LEFT JOIN journal_lines l ON e.id = l.journal_entry_id
    WHERE e.company_id = ${companyId}
      ${opts?.status   ? sql`AND e.status = ${opts.status}`      : sql``}
      ${opts?.periodId ? sql`AND e.period_id = ${opts.periodId}` : sql``}
    GROUP BY e.id
    ORDER BY e.entry_date DESC, e.entry_number DESC
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `) as unknown as JournalRow[];

  return rows.map(row => ({
    ...row,
    total_amount:  parseFloat(row.total_amount),
    total_debits:  parseFloat(row.total_debits),
    total_credits: parseFloat(row.total_credits),
    entryNumber:   row.entry_number,
    entryDate:     row.entry_date,
    isAdjusting:   row.is_adjusting,
    isReversing:   row.is_reversing,
    periodId:      row.period_id,
    createdBy:     row.created_by,
  }));
}

// ── Get financial summary for dashboard ──────────────────────
export async function getDashboardSummary(companyId: string) {
  interface SummaryRow {
    account_type: "asset" | "liability" | "equity" | "revenue" | "expense";
    sum_debits:   string;
    sum_credits:  string;
  }

  const rows = await db.execute(sql`
    SELECT
      c.account_type,
      COALESCE(SUM(jl.debit_amount), 0)  as sum_debits,
      COALESCE(SUM(jl.credit_amount), 0) as sum_credits
    FROM chart_of_accounts c
    LEFT JOIN journal_lines   jl ON c.id = jl.account_id
    LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id
    WHERE c.company_id = ${companyId}
      AND (je.status = 'posted' OR jl.id IS NULL)
    GROUP BY c.account_type
  `) as unknown as SummaryRow[];

  const sums = { asset: 0, liability: 0, equity: 0, revenue: 0, expense: 0 };

  for (const row of rows) {
    const d = parseFloat(row.sum_debits);
    const c = parseFloat(row.sum_credits);
    if (row.account_type === "asset")     sums.asset     += (d - c);
    if (row.account_type === "liability") sums.liability += (c - d);
    if (row.account_type === "equity")    sums.equity    += (c - d);
    if (row.account_type === "revenue")   sums.revenue   += (c - d);
    if (row.account_type === "expense")   sums.expense   += (d - c);
  }

  return {
    totalAssets:      sums.asset,
    totalLiabilities: sums.liability,
    totalEquity:      sums.equity,
    totalRevenue:     sums.revenue,
    totalExpense:     sums.expense,
    netIncome:        sums.revenue - sums.expense,
  };
}
