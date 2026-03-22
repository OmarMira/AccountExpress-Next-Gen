// ============================================================
// JOURNAL SERVICE
// The double-entry bookkeeping engine.
// INVARIANT: This is mathematically impossible to bypass.
// SUM(debits) MUST equal SUM(credits) to the cent.
// If they don't match — nothing is written to the database.
// ============================================================

import { rawDb } from "../db/connection.ts";
import { createAuditEntry } from "./audit.service.ts";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

// ── Types ────────────────────────────────────────────────────

export interface JournalLineInput {
  accountId:    string;
  debitAmount:  number; // 0 if credit line
  creditAmount: number; // 0 if debit line
  description:  string | null;
  lineNumber:   number;
}

export interface JournalEntryInput {
  companyId:   string;
  entryDate:   string; // ISO 8601 date
  description: string;
  reference:   string | null;
  isAdjusting: boolean;
  periodId:    string;
  createdBy:   string; // user_id
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// ── SHA-256 for journal chain ────────────────────────────────
function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

// ── Get next journal entry number for a company ──────────────
function nextEntryNumber(companyId: string): string {
  const row = rawDb
    .query(
      `SELECT COUNT(*) as c FROM journal_entries WHERE company_id = ?`
    )
    .get(companyId) as { c: number };
  const year = new Date().getFullYear();
  const seq  = String(row.c + 1).padStart(4, "0");
  return `JE-${year}-${seq}`;
}

// ── Get chain tip for journal entry chain ────────────────────
function getJournalChainTip(companyId: string): { hash: string } {
  const row = rawDb
    .query(
      `SELECT entry_hash FROM journal_entries
       WHERE company_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(companyId) as { entry_hash: string } | null;
  return { hash: row?.entry_hash ?? "GENESIS" };
}

// ── Validate double-entry balance ────────────────────────────
// INVARIANT: SUM(debits) == SUM(credits) to 2 decimal places.
// Throws ValidationError if not balanced — nothing written.
function validateDoubleEntry(lines: JournalLineInput[]): void {
  if (lines.length < 2) {
    throw new ValidationError("Un asiento de diario requiere al menos 2 líneas.");
  }

  let totalDebitsCents  = 0;
  let totalCreditsCents = 0;

  for (const line of lines) {
    if (line.debitAmount < 0 || line.creditAmount < 0) {
      throw new ValidationError("Los montos de línea no pueden ser negativos.");
    }
    if (line.debitAmount > 0 && line.creditAmount > 0) {
      throw new ValidationError(
        `Línea ${line.lineNumber}: una línea no puede ser débito y crédito simultáneamente.`
      );
    }
    if (line.debitAmount === 0 && line.creditAmount === 0) {
      throw new ValidationError(`Línea ${line.lineNumber}: debe tener un monto mayor a cero.`);
    }
    
    // Aritmética entera estricta al 100% (centavos) para evitar la pérdida de flotantes
    totalDebitsCents  += Math.round(line.debitAmount * 100);
    totalCreditsCents += Math.round(line.creditAmount * 100);
  }

  if (totalDebitsCents !== totalCreditsCents) {
    const roundedDebits  = totalDebitsCents / 100;
    const roundedCredits = totalCreditsCents / 100;
    const diff = Math.abs(roundedDebits - roundedCredits);
    
    throw new ValidationError(
      `Descuadre de partida doble: débitos=${roundedDebits.toFixed(2)}, créditos=${roundedCredits.toFixed(2)}. Diferencia: ${diff.toFixed(2)}`
    );
  }
}

// ── Compute entry hash (header + all lines) ──────────────────
function computeEntryHash(
  entryId:  string,
  entry:    JournalEntryInput,
  lines:    JournalLineInput[],
  prevHash: string
): string {
  const linesFingerprint = lines
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map((l) => `${l.accountId}|${l.debitAmount}|${l.creditAmount}`)
    .join(",");

  const data = [
    entryId,
    entry.companyId,
    entry.entryDate,
    entry.description,
    linesFingerprint,
    prevHash,
  ].join("|");

  return sha256(data);
}

// ── Create a draft journal entry ─────────────────────────────
export function createDraft(
  entry: JournalEntryInput,
  lines: JournalLineInput[]
): string {
  // Structural validation (not balance check — drafts may be incomplete)
  if (lines.length === 0) {
    throw new ValidationError("Al menos una línea es requerida.");
  }

  // Pre-Validation: Is period closed?
  const period = rawDb.query("SELECT status FROM fiscal_periods WHERE id = ?").get(entry.periodId) as { status: string } | null;
  if (!period) throw new ValidationError("Periodo fiscal no encontrado.");
  if (period.status === "closed" || period.status === "locked") throw new ValidationError("El periodo contable se encuentra cerrado. No se permiten nuevos asientos.");

  const id          = uuidv4();
  const now         = new Date().toISOString();
  const entryNumber = nextEntryNumber(entry.companyId);
  const prevHash    = getJournalChainTip(entry.companyId).hash;
  const entryHash   = computeEntryHash(id, entry, lines, prevHash);

  // Atomic transaction — all or nothing
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

// ── Post (approve) a journal entry ───────────────────────────
// THE CRITICAL STEP: validates double-entry balance before posting.
// If debits ≠ credits → throws ValidationError. Nothing is written.
export function post(
  entryId:    string,
  postedBy:   string,
  sessionId:  string,
  ipAddress:  string
): void {
  const entry = rawDb
    .query("SELECT * FROM journal_entries WHERE id = ?")
    .get(entryId) as {
      company_id: string;
      status: string;
      period_id: string;
    } | null;

  if (!entry) throw new ValidationError(`Journal entry ${entryId} not found`);
  if (entry.status !== "draft") {
    throw new ValidationError(`Entry is ${entry.status} — only drafts can be posted`);
  }

  // Load all lines
  const lines = rawDb
    .query(
      "SELECT account_id, debit_amount, credit_amount, line_number FROM journal_lines WHERE journal_entry_id = ?"
    )
    .all(entryId) as {
      account_id: string;
      debit_amount: number;
      credit_amount: number;
      line_number: number;
    }[];

  // *** CRITICAL: Double-entry balance validation ***
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

  rawDb
    .prepare(
      `UPDATE journal_entries SET
         status    = 'posted',
         posted_by = ?,
         posted_at = ?,
         updated_at = ?
       WHERE id = ?`
    )
    .run(postedBy, now, now, entryId);

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

// ── Void a posted entry ───────────────────────────────────────
// Cannot modify — only void. Creates audit trail + REVERSAL ENTRY!
export function voidEntry(
  entryId:   string,
  voidedBy:  string,
  sessionId: string,
  ipAddress: string
): void {
  const entry = rawDb
    .query("SELECT * FROM journal_entries WHERE id = ?")
    .get(entryId) as {
      company_id: string;
      status: string;
      period_id: string;
      entry_number: string;
    } | null;

  if (!entry) throw new ValidationError(`Asiento de diario ${entryId} no encontrado.`);
  if (entry.status === "voided") throw new ValidationError("El asiento ya se encuentra anulado.");
  if (entry.status === "draft")  throw new ValidationError("Los borradores deben ser eliminados, no anulados.");

  // Check period open context for the reversing entry
  const period = rawDb.query("SELECT status FROM fiscal_periods WHERE id = ?").get(entry.period_id) as { status: string } | null;
  if (!period) throw new ValidationError("Periodo fiscal no encontrado.");
  if (period.status === "closed" || period.status === "locked") throw new ValidationError("No se puede anular porque el periodo fiscal original ya fue cerrado.");

  const originalLines = rawDb.query("SELECT * FROM journal_lines WHERE journal_entry_id = ?").all(entryId) as any[];

  const now = new Date().toISOString();

  const revId = uuidv4();
  const revNumber = nextEntryNumber(entry.company_id);
  const prevHash = getJournalChainTip(entry.company_id).hash;
  
  const formattedLinesForHash = originalLines.map((l: any) => ({
    accountId: l.account_id,
    debitAmount: l.credit_amount,   // Math Reversal
    creditAmount: l.debit_amount,   // Math Reversal
    description: `Reversión de línea ${l.line_number}`,
    lineNumber: l.line_number
  }));

  const revInputForHash: JournalEntryInput = {
    companyId: entry.company_id,
    entryDate: now.substring(0,10),
    description: `Reversión automática de asiento ${entry.entry_number}`,
    reference: entry.entry_number,
    isAdjusting: false,
    periodId: entry.period_id,
    createdBy: voidedBy
  };
  
  const revHash = computeEntryHash(revId, revInputForHash, formattedLinesForHash, prevHash);

  const insertEntry = rawDb.prepare(
    `INSERT INTO journal_entries
       (id, company_id, entry_number, entry_date, description, reference,
        status, is_adjusting, is_reversing, period_id, created_by, posted_by, posted_at,
        entry_hash, prev_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'posted', 0, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertLine = rawDb.prepare(
    `INSERT INTO journal_lines
       (id, journal_entry_id, company_id, account_id,
        debit_amount, credit_amount, description, line_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const updateOriginal = rawDb.prepare(
    `UPDATE journal_entries SET status = 'voided', updated_at = ? WHERE id = ?`
  );

  // Use a transactional lock to ensure immutability standards are met
  const transaction = rawDb.transaction(() => {
    updateOriginal.run(now, entryId);

    insertEntry.run(
      revId, entry.company_id, revNumber, revInputForHash.entryDate,
      revInputForHash.description, revInputForHash.reference,
      entry.period_id, voidedBy, voidedBy, now,
      revHash, prevHash, now, now
    );

    for (const l of originalLines) {
      insertLine.run(
        uuidv4(), revId, entry.company_id, l.account_id,
        l.credit_amount, l.debit_amount,
        `Reversión de línea ${l.line_number}`, l.line_number, now
      );
    }
  });

  transaction();

  createAuditEntry({
    companyId:   entry.company_id,
    userId:      voidedBy,
    sessionId,
    action:      "journal:close",
    module:      "journal",
    entityType:  "journal_entry",
    entityId:    entryId,
    beforeState: { status: entry.status },
    afterState:  { status: "voided", voidedAt: now, reversalEntryId: revId },
    ipAddress,
  });
}

// ── Get entry with lines ──────────────────────────────────────
export function getEntryWithLines(entryId: string) {
  const entry = rawDb
    .query("SELECT * FROM journal_entries WHERE id = ?")
    .get(entryId);
  const lines = rawDb
    .query(
      "SELECT * FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_number"
    )
    .all(entryId);
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

  if (opts?.status) {
    sql += " AND e.status = ?";
    params.push(opts.status);
  }
  if (opts?.periodId) {
    sql += " AND e.period_id = ?";
    params.push(opts.periodId);
  }

  sql += " GROUP BY e.id";
  sql += " ORDER BY e.entry_date DESC, e.entry_number DESC";
  sql += ` LIMIT ${opts?.limit ?? 100} OFFSET ${opts?.offset ?? 0}`;

  return rawDb.query(sql).all(...params);
}

// ── Export validation for testing ────────────────────────────
export { validateDoubleEntry };
