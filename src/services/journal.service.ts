// ============================================================
// JOURNAL SERVICE — PostgreSQL 16 / Drizzle ORM
// Core accounting engine: draft creation, posting, queries.
// All functions are async.
// ============================================================

import { db, sql }        from "../db/connection.ts";
import { journalEntries, journalLines, fiscalPeriods } from "../db/schema/index.ts";
import { eq, and, desc }  from "drizzle-orm";
import { createAuditEntry } from "./audit.service.ts";
import { v4 as uuidv4 }   from "uuid";
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

// ── Create a draft journal entry ─────────────────────────────
export async function createDraft(
  entry: JournalEntryInput,
  lines: JournalLineInput[]
): Promise<string> {
  if (lines.length === 0) throw new ValidationError("Al menos una línea es requerida.");

  const [period] = await db
    .select({ status: fiscalPeriods.status })
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.id, entry.periodId))
    .limit(1);

  if (!period) throw new ValidationError("Periodo fiscal no encontrado.");
  if (period.status === "closed" || period.status === "locked")
    throw new ValidationError("El periodo contable se encuentra cerrado. No se permiten nuevos asientos.");

  const id          = uuidv4();
  const now         = new Date();
  const entryNumber = await nextEntryNumber(entry.companyId);
  const prevHash    = (await getJournalChainTip(entry.companyId)).hash;
  const entryHash   = computeEntryHash(id, entry, lines, prevHash);

  await db.transaction(async (tx) => {
    await tx.insert(journalEntries).values({
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
      await tx.insert(journalLines).values({
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
  });

  return id;
}

// ── Post a draft journal entry ────────────────────────────────
export async function post(
  entryId:   string,
  postedBy:  string,
  sessionId: string,
  ipAddress: string
): Promise<void> {
  const [entry] = await db
    .select({ companyId: journalEntries.companyId, status: journalEntries.status, periodId: journalEntries.periodId })
    .from(journalEntries)
    .where(eq(journalEntries.id, entryId))
    .limit(1);

  if (!entry) throw new ValidationError(`Journal entry ${entryId} not found`);
  if (entry.status !== "draft") throw new ValidationError(`Entry is ${entry.status} — only drafts can be posted`);

  const lines = await db
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
  await db.update(journalEntries)
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

// ── Void/Reverse a journal entry ─────────────────────────────
export async function voidEntry(
  entryId:   string,
  userId:    string,
  sessionId: string,
  ipAddress: string
): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Get original entry
    const { entry, lines } = await getEntryWithLines(entryId);
    if (!entry) throw new ValidationError(`Entry ${entryId} not found`);
    if (entry.status !== "posted") throw new ValidationError("Only posted entries can be voided");

    // 2. Create reversal draft
    const reversalId = uuidv4();
    const now = new Date();
    const revNumber = await nextEntryNumber(entry.companyId);

    const reversedLines = lines.map(line => ({
      accountId:    line.accountId,
      debitAmount:  parseFloat(line.creditAmount ?? "0"),
      creditAmount: parseFloat(line.debitAmount ?? "0"),
      description:  `Voiding line ${line.lineNumber}`,
      lineNumber:   line.lineNumber,
    }));

    const tip = await getJournalChainTip(entry.companyId);
    const finalHash = computeEntryHash(
      reversalId,
      {
        companyId:   entry.companyId,
        entryDate:   entry.entryDate,
        description: `VOID: ${entry.description}`,
        reference:   entry.id,
        isAdjusting: false,
        periodId:    entry.periodId,
        createdBy:   userId,
      },
      reversedLines,
      tip.hash
    );

    await tx.insert(journalEntries).values({
      id:          reversalId,
      companyId:   entry.companyId,
      entryNumber: revNumber,
      entryDate:   entry.entryDate,
      description: `VOID: ${entry.description}`,
      reference:   entry.id,
      status:      "posted",
      isReversing: true,
      reversesId:  entry.id,
      periodId:    entry.periodId,
      createdBy:   userId,
      postedBy:    userId,
      postedAt:    now,
      entryHash:   finalHash,
      prevHash:    tip.hash,
      createdAt:   now,
      updatedAt:   now,
    });

    // 3. Insert reversed lines
    for (const line of reversedLines) {
      await tx.insert(journalLines).values({
        id:             uuidv4(),
        journalEntryId: reversalId,
        companyId:      entry.companyId,
        accountId:      line.accountId,
        debitAmount:    line.debitAmount.toString(),
        creditAmount:   line.creditAmount.toString(),
        description:    line.description,
        lineNumber:     line.lineNumber,
        createdAt:      now,
      });
    }

    // 6. Audit
    await createAuditEntry({
      companyId:   entry.companyId,
      userId,
      sessionId,
      action:      "journal:void",
      module:      "journal",
      entityType:  "journal_entry",
      entityId:    entryId,
      beforeState: { status: "posted" },
      afterState:  { status: "voided", reversalId },
      ipAddress,
    });
  });
}

// ── List entries with optional filters ───────────────────────
export async function listEntries(
  companyId: string,
  opts?: { status?: string; periodId?: string; limit?: number; offset?: number }
) {
  const safeLimit  = Number.isFinite(opts?.limit)  && (opts?.limit  ?? 0) > 0  ? opts!.limit!  : 100;
  const safeOffset = Number.isFinite(opts?.offset) && (opts?.offset ?? 0) >= 0 ? opts!.offset! : 0;

  const rows = await db.execute(sql`
    SELECT e.*, COALESCE(SUM(l.debit_amount), 0) as total_amount
    FROM journal_entries e
    LEFT JOIN journal_lines l ON e.id = l.journal_entry_id
    WHERE e.company_id = ${companyId}
      ${opts?.status   ? sql`AND e.status = ${opts.status}`     : sql``}
      ${opts?.periodId ? sql`AND e.period_id = ${opts.periodId}` : sql``}
    GROUP BY e.id
    ORDER BY e.entry_date DESC, e.entry_number DESC
    LIMIT ${safeLimit} OFFSET ${safeOffset}
  `);

  return rows as any[];
}

export { validateDoubleEntry };
