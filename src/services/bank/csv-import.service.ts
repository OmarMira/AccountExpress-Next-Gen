// ============================================================
// BANK CSV IMPORT SERVICE
// Ingests CSV extracts from Chase, BofA, WellsFargo and Generic.
// Provides mechanical deterministic duplicate prevention.
// ============================================================

import { rawDb } from "../../db/connection.ts";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

export interface ParsedTransaction {
  date: string;       // YYYY-MM-DD
  description: string;
  amount: number;     // Negative = expense, Positive = deposit
  reference: string | null;
}

// ── Deterministic CSV Parser ────────────────────────────────
export function parseBankCsv(csvText: string): ParsedTransaction[] {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  const headerRaw = lines[0].toLowerCase();
  
  // Format Inferring Engine
  let format = "generic";
  let startIndex = 1;
  
  if (headerRaw.includes("check or slip #") || headerRaw.includes("details,posting date")) {
    format = "chase";
  } else if (headerRaw.includes("running bal") && headerRaw.startsWith("date,description")) {
    format = "bofa";
  } else if (!headerRaw.match(/[a-z]/i)) {
    // Wells Fargo often has no header, just raw data Date,Amount,*,*,Desc
    format = "wellsfargo";
    startIndex = 0; // Read from row 0
  } else if (headerRaw.includes("date") && headerRaw.includes("amount") && headerRaw.includes("description")) {
    format = "generic";
  } else {
    // Fallback best-effort generic skip
    startIndex = 1;
  }

  const results: ParsedTransaction[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    // Simple CSV split handling quotes (not perfect, but sufficient for bank standard exports)
    const row = rawLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/^"|"$/g, "").trim());
    
    try {
      if (format === "chase" && row.length >= 6) {
        // Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
        results.push({
          date: normalizeDate(row[1]),
          description: row[2] || "Unknown",
          amount: parseFloat(row[3] || "0"),
          reference: row[6] || null
        });
      }
      else if (format === "bofa" && row.length >= 3) {
        // Date,Description,Amount,Running Bal.
        results.push({
          date: normalizeDate(row[0]),
          description: row[1] || "Unknown",
          amount: parseFloat(row[2] || "0"),
          reference: null
        });
      }
      else if (format === "wellsfargo" && row.length >= 5) {
        // Date,Amount,*,*,Description
        results.push({
          date: normalizeDate(row[0]),
          amount: parseFloat(row[1] || "0"),
          description: row[4] || "Unknown",
          reference: null
        });
      }
      else if (row.length >= 3) {
        // Generic: Assume Date, Description, Amount
        results.push({
          date: normalizeDate(row[0]),
          description: row[1] || "Unknown",
          amount: parseFloat(row[2] || "0"),
          reference: null
        });
      }
    } catch(e) { /* Skip malformed row natively inside batch */ }
  }

  return results;
}

// ── Native SQL Duplicate Resolver ───────────────────────────
export function importTransactions(
  companyId: string,
  bankAccount: string,
  csvText: string
): { imported: number, duplicates: number, batchId: string } {
  const parsed = parseBankCsv(csvText);
  if (parsed.length === 0) return { imported: 0, duplicates: 0, batchId: "" };

  const batchId = uuidv4();
  const now = new Date().toISOString();

  let imported = 0;
  let duplicates = 0;

  // Insert stmt ignores duplicate hashes leveraging SQL logic later or explicit filtering
  const insertStmt = rawDb.prepare(
    `INSERT INTO bank_transactions
       (id, company_id, bank_account, transaction_date, description, amount,
        transaction_type, reference_number, status, import_batch_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  );

  const checkDuplicate = rawDb.prepare(
    `SELECT id FROM bank_transactions
     WHERE company_id = ? AND bank_account = ? AND transaction_date = ?
       AND amount = ? AND description = ? LIMIT 1`
  );

  const transaction = rawDb.transaction(() => {
    for (const p of parsed) {
      if (p.amount === 0) continue;
      
      const type = p.amount < 0 ? "debit" : "credit"; // Relative to normal bank view
      
      const exists = checkDuplicate.get(companyId, bankAccount, p.date, p.amount, p.description);
      
      if (exists) {
        duplicates++;
      } else {
        insertStmt.run(
          uuidv4(), companyId, bankAccount, p.date, p.description, p.amount,
          type, p.reference, batchId, now
        );
        imported++;
      }
    }
  });

  transaction();

  return { imported, duplicates, batchId };
}

// ── Helper ──────────────────────────────────────────────────
function normalizeDate(mmddyyyy: string): string {
  // Try mapping MM/DD/YYYY to YYYY-MM-DD
  const parts = mmddyyyy.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`; // MM/DD/YYYY -> YYYY-MM-DD
    }
  }
  return mmddyyyy; // Fallback
}

