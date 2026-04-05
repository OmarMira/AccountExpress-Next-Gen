// ============================================================
// JOURNAL HASH SERVICE — PostgreSQL 16 / Drizzle ORM
// Cryptographic integrity for the journal entry chain.
// IMPORTANT: nextEntryNumber and getJournalChainTip are async.
// ============================================================

import { createHash }      from "crypto";
import { db, sql }         from "../db/connection.ts";
import { journalEntries }  from "../db/schema/index.ts";
import { eq, desc }        from "drizzle-orm";
import type { JournalEntryInput, JournalLineInput } from "./journal.service.ts";

export function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

// ── Generate next sequential entry number ───────────────────
export async function nextEntryNumber(companyId: string): Promise<string> {
  // SUBSTR equivalent in PostgreSQL: SPLIT_PART or SUBSTRING
  const [row] = await db.execute(sql`
    SELECT MAX(CAST(SPLIT_PART(entry_number, '-', 3) AS INTEGER)) as max_seq
    FROM journal_entries
    WHERE company_id = ${companyId}
  `) as Array<{ max_seq: number | null }>;

  const year = new Date().getFullYear();
  const seq  = String((row?.max_seq ?? 0) + 1).padStart(4, "0");
  return `JE-${year}-${seq}`;
}

// ── Get the hash of the last entry (chain tip) ───────────────
export async function getJournalChainTip(companyId: string): Promise<{ hash: string }> {
  const [row] = await db
    .select({ entryHash: journalEntries.entryHash })
    .from(journalEntries)
    .where(eq(journalEntries.companyId, companyId))
    .orderBy(desc(journalEntries.createdAt))
    .limit(1);

  return { hash: row?.entryHash ?? "GENESIS" };
}

// ── Compute SHA-256 hash for a journal entry ─────────────────
export function computeEntryHash(
  entryId:  string,
  entry:    JournalEntryInput,
  lines:    JournalLineInput[],
  prevHash: string
): string {
  const linesFingerprint = [...lines]
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
