// ============================================================
// JOURNAL VOID SERVICE — PostgreSQL 16 / Drizzle ORM
// Anulación de asientos contables con reversión automática.
// SRP: solo lógica de anulación e inmutabilidad.
// ============================================================

import { db, sql }          from "../db/connection.ts";
import { journalEntries, journalLines, fiscalPeriods } from "../db/schema/index.ts";
import { eq }               from "drizzle-orm";
import { createAuditEntry } from "./audit.service.ts";
import { v4 as uuidv4 }     from "uuid";
import { ValidationError } from "../lib/errors.ts";
import { nextEntryNumber, getJournalChainTip, computeEntryHash } from "./journal-hash.service.ts";
import type { JournalEntryInput } from "../lib/journal-types.ts";

export async function voidEntry(
  entryId:   string,
  voidedBy:  string,
  sessionId: string,
  ipAddress: string
): Promise<void> {
  await db.transaction(async (tx) => {
    // Lock entry row — prevents concurrent void of the same entry
    const [entry] = await tx.execute(sql`
      SELECT company_id, status, period_id, entry_number
      FROM journal_entries WHERE id = ${entryId} FOR UPDATE
    `) as unknown as Array<{ company_id: string; status: string; period_id: string; entry_number: string }>;

    if (!entry) throw new ValidationError(`Asiento de diario ${entryId} no encontrado.`);
    if (entry.status === "voided") throw new ValidationError("El asiento ya se encuentra anulado.");
    if (entry.status === "draft")  throw new ValidationError("Los borradores deben ser eliminados, no anulados.");

    // Lock period row — prevents voiding into a period that closes concurrently
    const [period] = await tx.execute(sql`
      SELECT status FROM fiscal_periods WHERE id = ${entry.period_id} FOR UPDATE
    `) as unknown as Array<{ status: string }>;

    if (!period) throw new ValidationError("Periodo fiscal no encontrado.");
    if (period.status === "closed" || period.status === "locked")
      throw new ValidationError("No se puede anular porque el periodo fiscal original ya fue cerrado.");

    const originalLines = await tx
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, entryId));

    const now       = new Date();
    const revId     = uuidv4();
    const revNumber = await nextEntryNumber(entry.company_id);
    const prevHash  = (await getJournalChainTip(entry.company_id)).hash;

    const formattedLinesForHash = originalLines.map((l) => ({
      accountId:    l.accountId,
      debitAmount:  parseFloat(l.creditAmount ?? "0"),
      creditAmount: parseFloat(l.debitAmount  ?? "0"),
      description:  `Reversión de línea ${l.lineNumber}`,
      lineNumber:   l.lineNumber,
    }));

    const revInputForHash: JournalEntryInput = {
      companyId:   entry.company_id,
      entryDate:   now.toISOString().substring(0, 10),
      description: `Reversión automática de asiento ${entry.entry_number}`,
      reference:   entry.entry_number,
      isAdjusting: false,
      periodId:    entry.period_id,
      createdBy:   voidedBy,
    };

    const revHash = computeEntryHash(revId, revInputForHash, formattedLinesForHash, prevHash);

    await tx.update(journalEntries)
      .set({ status: "voided", updatedAt: now })
      .where(eq(journalEntries.id, entryId));

    await tx.insert(journalEntries).values({
      id:          revId,
      companyId:   entry.company_id,
      entryNumber: revNumber,
      entryDate:   revInputForHash.entryDate,
      description: revInputForHash.description,
      reference:   revInputForHash.reference,
      status:      "posted",
      isAdjusting: false,
      isReversing: true,
      reversesId:  entryId,
      periodId:    entry.period_id,
      createdBy:   voidedBy,
      postedBy:    voidedBy,
      postedAt:    now,
      entryHash:   revHash,
      prevHash,
      createdAt:   now,
      updatedAt:   now,
    });

    for (const l of originalLines) {
      await tx.insert(journalLines).values({
        id:             uuidv4(),
        journalEntryId: revId,
        companyId:      entry.company_id,
        accountId:      l.accountId,
        debitAmount:    l.creditAmount,   // reversed: credit becomes debit
        creditAmount:   l.debitAmount,    // reversed: debit becomes credit
        description:    `Reversión de línea ${l.lineNumber}`,
        lineNumber:     l.lineNumber,
        createdAt:      now,
      });
    }

    await createAuditEntry({
      companyId:   entry.company_id,
      userId:      voidedBy,
      sessionId,
      action:      "journal:void",
      module:      "journal",
      entityType:  "journal_entry",
      entityId:    entryId,
      beforeState: { status: entry.status },
      afterState:  { status: "voided", voidedAt: now.toISOString(), reversalEntryId: revId },
      ipAddress,
    }, tx);
  });
}
