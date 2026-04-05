// ============================================================
// FISCAL PERIOD SERVICE — PostgreSQL 16 / Drizzle ORM
// Controls the open → closed → locked lifecycle per company.
// All functions are async.
// ============================================================

import { db, sql } from "../db/connection.ts";
import { fiscalPeriods, bankTransactions, journalEntries } from "../db/schema/index.ts";
import { eq, and, ne, lte, gte, count } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export type PeriodStatus = "open" | "closed" | "locked";
export type PeriodType   = "monthly" | "quarterly" | "annual";

export interface PeriodRow {
  id:         string;
  companyId:  string;
  name:       string;
  periodType: string;
  startDate:  string;
  endDate:    string;
  status:     string;
  closedBy:   string | null;
  closedAt:   Date | null;
  createdAt:  Date;
}

// ── Create a new fiscal period ───────────────────────────────
export async function openPeriod(opts: {
  companyId:  string;
  name:       string;
  periodType: PeriodType;
  startDate:  string; // ISO 8601 date YYYY-MM-DD
  endDate:    string;
}): Promise<string> {
  // Validate: no overlap with existing active periods of same type
  interface OverlapRow { id: string }
  const [overlapping] = await db.execute(sql`
    SELECT id FROM fiscal_periods
    WHERE company_id  = ${opts.companyId}
      AND period_type = ${opts.periodType}
      AND status NOT IN ('closed', 'locked')
      AND NOT (end_date < ${opts.startDate} OR start_date > ${opts.endDate})
    LIMIT 1
  `) as unknown as OverlapRow[];

  if (overlapping) {
    throw new Error(
      `An active ${opts.periodType} period already exists that overlaps with ` +
      `${opts.startDate} – ${opts.endDate}`
    );
  }

  const id  = uuidv4();
  const now = new Date();

  await db.insert(fiscalPeriods).values({
    id,
    companyId:  opts.companyId,
    name:       opts.name,
    periodType: opts.periodType,
    startDate:  opts.startDate,
    endDate:    opts.endDate,
    status:     "open",
    createdAt:  now,
  });

  return id;
}

// ── Close a period ───────────────────────────────────────────
export async function closePeriod(periodId: string, closedByUserId: string): Promise<void> {
  const period = await getPeriod(periodId);
  if (!period) throw new Error(`Fiscal period ${periodId} not found`);
  if (period.status === "locked") throw new Error("Cannot close a locked period");
  if (period.status === "closed") throw new Error("Period is already closed");

  // Check no pending bank transactions in the period date range
  const [pendingTxResult] = await db
    .select({ c: count() })
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.companyId, period.companyId),
        eq(bankTransactions.status, "pending"),
        gte(bankTransactions.transactionDate, period.startDate),
        lte(bankTransactions.transactionDate, period.endDate)
      )
    );

  const pendingTxCount = pendingTxResult?.c ?? 0;
  if (pendingTxCount > 0) {
    throw new Error(
      `Cannot close period: ${pendingTxCount} bank transaction(s) still pending reconciliation`
    );
  }

  // Check no draft journal entries remain in this period
  const [pendingDraftsResult] = await db
    .select({ c: count() })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.periodId, periodId),
        eq(journalEntries.status, "draft")
      )
    );

  const pendingDraftCount = pendingDraftsResult?.c ?? 0;
  if (pendingDraftCount > 0) {
    throw new Error(
      `Cannot close period: ${pendingDraftCount} journal entry/entries ` +
      `still in draft status. Post or delete them before closing.`
    );
  }

  await db.update(fiscalPeriods)
    .set({ status: "closed", closedBy: closedByUserId, closedAt: new Date() })
    .where(eq(fiscalPeriods.id, periodId));
}

// ── Lock a period (terminal — cannot be undone) ──────────────
export async function lockPeriod(periodId: string): Promise<void> {
  const period = await getPeriod(periodId);
  if (!period) throw new Error(`Fiscal period ${periodId} not found`);
  if (period.status === "locked") throw new Error("Period is already locked");
  if (period.status === "open")   throw new Error("Period must be closed before locking");

  await db.update(fiscalPeriods)
    .set({ status: "locked" })
    .where(eq(fiscalPeriods.id, periodId));
}

// ── Get a period by ID ────────────────────────────────────────
export async function getPeriod(periodId: string): Promise<PeriodRow | null> {
  const [result] = await db
    .select()
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.id, periodId))
    .limit(1);
  return (result as PeriodRow) ?? null;
}

// ── Find the open period containing a specific date ──────────
export async function findOpenPeriodForDate(
  companyId: string,
  entryDate: string
): Promise<string> {
  interface RawPeriodRow { id: string; status: string }
  const rRows = await db.execute(sql`
    SELECT id, status FROM fiscal_periods
    WHERE company_id = ${companyId}
      AND start_date <= ${entryDate}
      AND end_date   >= ${entryDate}
    ORDER BY start_date DESC
    LIMIT 1
  `);
  const [period] = rRows as unknown as RawPeriodRow[];

  if (!period) {
    throw new Error(`No fiscal period found covering date ${entryDate} for company ${companyId}`);
  }
  if (period.status !== "open") {
    throw new Error(`The fiscal period covering ${entryDate} is ${period.status} — cannot create entries`);
  }

  return period.id;
}

// ── List periods for a company ────────────────────────────────
export async function listPeriods(companyId: string, status?: PeriodStatus): Promise<PeriodRow[]> {
  const conditions = status
    ? and(eq(fiscalPeriods.companyId, companyId), eq(fiscalPeriods.status, status))
    : eq(fiscalPeriods.companyId, companyId);

  const results = await db
    .select()
    .from(fiscalPeriods)
    .where(conditions)
    .orderBy(fiscalPeriods.startDate);
  
  return results as PeriodRow[];
}
