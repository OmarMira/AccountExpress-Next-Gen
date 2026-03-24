// ============================================================
// JOURNAL VOID SERVICE
// Anulación de asientos contables con reversión automática.
// SRP: solo lógica de anulación e inmutabilidad.
// ============================================================

import { rawDb } from "../db/connection.ts";
import { createAuditEntry } from "./audit.service.ts";
import { v4 as uuidv4 } from "uuid";
import { ValidationError, JournalEntryInput } from "./journal.service.ts";
import { nextEntryNumber, getJournalChainTip, computeEntryHash } from "./journal-hash.service.ts";

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

  const period = rawDb.query("SELECT status FROM fiscal_periods WHERE id = ?").get(entry.period_id) as { status: string } | null;
  if (!period) throw new ValidationError("Periodo fiscal no encontrado.");
  if (period.status === "closed" || period.status === "locked") throw new ValidationError("No se puede anular porque el periodo fiscal original ya fue cerrado.");

  const originalLines = rawDb.query("SELECT * FROM journal_lines WHERE journal_entry_id = ?").all(entryId) as any[];
  const now = new Date().toISOString();
  const revId = uuidv4();
  const revNumber = nextEntryNumber(entry.company_id);
  const prevHash = getJournalChainTip(entry.company_id).hash;

  const formattedLinesForHash = originalLines.map((l: any) => ({
    accountId:    l.account_id,
    debitAmount:  l.credit_amount,
    creditAmount: l.debit_amount,
    description:  `Reversión de línea ${l.line_number}`,
    lineNumber:   l.line_number
  }));

  const revInputForHash: JournalEntryInput = {
    companyId:   entry.company_id,
    entryDate:   now.substring(0, 10),
    description: `Reversión automática de asiento ${entry.entry_number}`,
    reference:   entry.entry_number,
    isAdjusting: false,
    periodId:    entry.period_id,
    createdBy:   voidedBy
  };

  const revHash = computeEntryHash(revId, revInputForHash, formattedLinesForHash, prevHash);

  const insertEntry  = rawDb.prepare(
    `INSERT INTO journal_entries
       (id, company_id, entry_number, entry_date, description, reference,
        status, is_adjusting, is_reversing, period_id, created_by, posted_by, posted_at,
        entry_hash, prev_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'posted', 0, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertLine   = rawDb.prepare(
    `INSERT INTO journal_lines
       (id, journal_entry_id, company_id, account_id,
        debit_amount, credit_amount, description, line_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const updateOriginal = rawDb.prepare(
    `UPDATE journal_entries SET status = 'voided', updated_at = ? WHERE id = ?`
  );

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
