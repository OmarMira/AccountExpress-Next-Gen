// ============================================================
// FISCAL PERIOD SERVICE
// Controls the open → closed → locked lifecycle per company.
// RULES:
//   - No overlapping periods of the same type in the same company
//   - "locked" is terminal — cannot be re-opened
//   - Journal entries rejected if period is not "open"
// ============================================================

import { rawDb } from "../db/connection.ts";
import { v4 as uuidv4 } from "uuid";

export type PeriodStatus = "open" | "closed" | "locked";
export type PeriodType   = "monthly" | "quarterly" | "annual";

// ── Create a new fiscal period ───────────────────────────────
export function openPeriod(opts: {
  companyId:  string;
  name:       string;
  periodType: PeriodType;
  startDate:  string; // ISO 8601
  endDate:    string; // ISO 8601
}): string {
  // Validate: no overlap with existing periods of same type for same company
  const overlapping = rawDb
    .query(
      `SELECT id FROM fiscal_periods
       WHERE company_id  = ?
         AND period_type = ?
         AND status      != 'closed'
         AND status      != 'locked'
         AND NOT (end_date < ? OR start_date > ?)`
    )
    .get(
      opts.companyId,
      opts.periodType,
      opts.startDate,  // end_date < startDate  → no overlap before
      opts.endDate     // start_date > endDate   → no overlap after
    );

  if (overlapping) {
    throw new Error(
      `An active ${opts.periodType} period already exists that overlaps with ` +
      `${opts.startDate} – ${opts.endDate}`
    );
  }

  const id = uuidv4();
  rawDb
    .prepare(
      `INSERT INTO fiscal_periods
         (id, company_id, name, period_type, start_date, end_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`
    )
    .run(id, opts.companyId, opts.name, opts.periodType, opts.startDate, opts.endDate, new Date().toISOString());

  return id;
}

// ── Close a period ───────────────────────────────────────────
export function closePeriod(periodId: string, closedByUserId: string): void {
  const period = getPeriod(periodId);
  if (!period) throw new Error(`Fiscal period ${periodId} not found`);
  if (period.status === "locked") throw new Error("Cannot close a locked period");
  if (period.status === "closed") throw new Error("Period is already closed");

  // Check all bank transactions are reconciled or ignored
  const pendingTransactions = rawDb
    .query(
      `SELECT COUNT(*) as c FROM bank_transactions
       WHERE company_id = ?
         AND status = 'pending'
         AND transaction_date >= ?
         AND transaction_date <= ?`
    )
    .get(period.company_id, period.start_date, period.end_date) as { c: number };

  if (pendingTransactions.c > 0) {
    throw new Error(
      `Cannot close period: ${pendingTransactions.c} bank transaction(s) still pending reconciliation`
    );
  }

  rawDb
    .prepare(
      `UPDATE fiscal_periods SET
         status    = 'closed',
         closed_by = ?,
         closed_at = ?
       WHERE id = ?`
    )
    .run(closedByUserId, new Date().toISOString(), periodId);
}

// ── Lock a period (terminal — cannot be undone) ──────────────
export function lockPeriod(periodId: string): void {
  const period = getPeriod(periodId);
  if (!period) throw new Error(`Fiscal period ${periodId} not found`);
  if (period.status === "locked") throw new Error("Period is already locked");
  if (period.status === "open")   throw new Error("Period must be closed before locking");

  rawDb
    .prepare("UPDATE fiscal_periods SET status = 'locked' WHERE id = ?")
    .run(periodId);
}

// ── Get a period by ID ────────────────────────────────────────
export function getPeriod(periodId: string) {
  return rawDb
    .query("SELECT * FROM fiscal_periods WHERE id = ?")
    .get(periodId) as {
      id: string;
      company_id: string;
      name: string;
      period_type: string;
      start_date: string;
      end_date: string;
      status: PeriodStatus;
      closed_by: string | null;
      closed_at: string | null;
    } | null;
}

// ── Find the open period containing a specific date ──────────
// Returns the period ID or throws if none found or period is not open.
export function findOpenPeriodForDate(
  companyId: string,
  entryDate: string
): string {
  const period = rawDb
    .query(
      `SELECT id, status FROM fiscal_periods
       WHERE company_id = ?
         AND start_date <= ?
         AND end_date   >= ?
       ORDER BY start_date DESC
       LIMIT 1`
    )
    .get(companyId, entryDate, entryDate) as {
      id: string;
      status: PeriodStatus;
    } | null;

  if (!period) {
    throw new Error(
      `No fiscal period found covering date ${entryDate} for company ${companyId}`
    );
  }

  if (period.status !== "open") {
    throw new Error(
      `The fiscal period covering ${entryDate} is ${period.status} — cannot create entries`
    );
  }

  return period.id;
}

// ── List periods for a company ────────────────────────────────
export function listPeriods(companyId: string, status?: PeriodStatus) {
  if (status) {
    return rawDb
      .query(
        `SELECT * FROM fiscal_periods
         WHERE company_id = ? AND status = ?
         ORDER BY start_date DESC`
      )
      .all(companyId, status);
  }
  return rawDb
    .query("SELECT * FROM fiscal_periods WHERE company_id = ? ORDER BY start_date DESC")
    .all(companyId);
}

