// ============================================================
// JOURNAL SERVICE
// Orquestador principal del motor contable.
// SRP: creación de borradores, aprobación y consultas.
// Delega matemática → journal-math.service.ts
// Delega hashing   → journal-hash.service.ts
// Delega anulación → journal-void.service.ts
// ============================================================

import { rawDb } from "../db/connection.ts";
import { createAuditEntry } from "./audit.service.ts";
import { v4 as uuidv4 } from "uuid";
import { validateDoubleEntry } from "./journal-math.service.ts";
import { nextEntryNumber, getJournalChainTip, computeEntryHash } from "./journal-hash.service.ts";

export interface JournalLineInput {
  accountId:    string;
  debitAmount:  number;
  creditAmount: number;
  description:  string | null;
  lineNumber:   number;
}

export interface JournalEntryInput {
  companyId:   string;
  entryDate:   string;
  description: string;
  reference:   string | null;
  isAdjusting: boolean;
  periodId:    string;
  createdBy:   string;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function createDraft(
  entry: JournalEntryInput,
  lines: JournalLineInput[]
): string {
  if (lines.length === 0) throw new ValidationError("Al menos una línea es requerida.");

  const period = rawDb.query("SELECT status FROM fiscal_periods WHERE id = ?").get(entry.periodId) as { status: string } | null;
  if (!period) throw new ValidationError("Periodo fiscal no encontrado.");
  if (period.status === "closed" || period.status === "locked") throw new ValidationError("El periodo contable se encuentra cerrado. No se permiten nuevos asientos.");

  const id          = uuidv4();
  const now         = new Date().toISOString();
  const entryNumber = nextEntryNumber(entry.companyId);
  const prevHash    = getJournalChainTip(entry.companyId).hash;
  const entryHash   = computeEntryHash(id, entry, lines, prevHash);

  const insertEntry = rawDb.prepare(
    `INSERT INTO journal_entries
       (id, company_id, entry_number, entry_date, description, reference,
        status, is_adjusting, is_reversing, period_id, created_by,
        entry_hash, prev_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, 0, ?, ?, ?, ?, ?, ?)`
  );
  const insertLine = rawDb.prepare(
    `INSERT INTO journal_lines
       (id, journal_entry_id, company_id, account_id,
        debit_amount, credit_amount, description, line_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const transaction = rawDb.transaction(() => {
    insertEntry.run(
      id, entry.companyId, entryNumber, entry.entryDate,
      entry.description, entry.reference ?? null,
      entry.isAdjusting ? 1 : 0,
      entry.periodId, entry.createdBy,
      entryHash, prevHash, now, now
    );
    for (const line of lines) {
      insertLine.run(
        uuidv4(), id, entry.companyId, line.accountId,
        line.debitAmount, line.creditAmount,
        line.description ?? null, line.lineNumber, now
      );
    }
  });

  transaction();
  return id;
}

export function post(
  entryId:   string,
  postedBy:  string,
  sessionId: string,
  ipAddress: string
): void {
  const entry = rawDb
    .query("SELECT * FROM journal_entries WHERE id = ?")
    .get(entryId) as { company_id: string; status: string; period_id: string } | null;

  if (!entry) throw new ValidationError(`Journal entry ${entryId} not found`);
  if (entry.status !== "draft") throw new ValidationError(`Entry is ${entry.status} — only drafts can be posted`);

  const lines = rawDb
    .query("SELECT account_id, debit_amount, credit_amount, line_number FROM journal_lines WHERE journal_entry_id = ?")
    .all(entryId) as { account_id: string; debit_amount: number; credit_amount: number; line_number: number }[];

  validateDoubleEntry(
    lines.map((l) => ({
      accountId:    l.account_id,
      debitAmount:  l.debit_amount,
      creditAmount: l.credit_amount,
      description:  null,
      lineNumber:   l.line_number,
    }))
  );

  const now = new Date().toISOString();
  rawDb.prepare(
    `UPDATE journal_entries SET status = 'posted', posted_by = ?, posted_at = ?, updated_at = ? WHERE id = ?`
  ).run(postedBy, now, now, entryId);

  createAuditEntry({
    companyId:   entry.company_id,
    userId:      postedBy,
    sessionId,
    action:      "journal:approve",
    module:      "journal",
    entityType:  "journal_entry",
    entityId:    entryId,
    beforeState: { status: "draft" },
    afterState:  { status: "posted", postedAt: now },
    ipAddress,
  });
}

export function getEntryWithLines(entryId: string) {
  const entry = rawDb.query("SELECT * FROM journal_entries WHERE id = ?").get(entryId);
  const lines = rawDb.query("SELECT * FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_number").all(entryId);
  return { entry, lines };
}

export function listEntries(
  companyId: string,
  opts?: { status?: string; periodId?: string; limit?: number; offset?: number }
) {
  let sql = `
    SELECT e.*, COALESCE(SUM(l.debit_amount), 0) as total_amount
    FROM journal_entries e
    LEFT JOIN journal_lines l ON e.id = l.journal_entry_id
    WHERE e.company_id = ?
  `;
  const params: (string | number)[] = [companyId];
  if (opts?.status)   { sql += " AND e.status = ?";    params.push(opts.status); }
  if (opts?.periodId) { sql += " AND e.period_id = ?"; params.push(opts.periodId); }
  sql += " GROUP BY e.id ORDER BY e.entry_date DESC, e.entry_number DESC";
  
  const safeLimit = Number.isFinite(opts?.limit) && (opts?.limit ?? 0) > 0 ? opts!.limit! : 100;
  const safeOffset = Number.isFinite(opts?.offset) && (opts?.offset ?? 0) >= 0 ? opts!.offset! : 0;
  
  sql += " LIMIT ? OFFSET ?";
  params.push(safeLimit, safeOffset);
  
  return rawDb.query(sql).all(...params);
}

export { validateDoubleEntry };
