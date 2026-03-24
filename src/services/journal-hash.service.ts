// ============================================================
// JOURNAL HASH SERVICE
// Generación de hashes SHA-256 y cadena criptográfica.
// SRP: solo integridad criptográfica del diario.
// ============================================================

import { createHash } from "crypto";
import { rawDb } from "../db/connection.ts";
import { JournalEntryInput, JournalLineInput } from "./journal.service.ts";

export function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function nextEntryNumber(companyId: string): string {
  const row = rawDb
    .query(`SELECT COUNT(*) as c FROM journal_entries WHERE company_id = ?`)
    .get(companyId) as { c: number };
  const year = new Date().getFullYear();
  const seq  = String(row.c + 1).padStart(4, "0");
  return `JE-${year}-${seq}`;
}

export function getJournalChainTip(companyId: string): { hash: string } {
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

export function computeEntryHash(
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
