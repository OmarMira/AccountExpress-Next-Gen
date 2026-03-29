// ============================================================
// BANK CSV IMPORT SERVICE — PostgreSQL 16 / Drizzle ORM
// Ingests CSV extracts from Chase, BofA, WellsFargo and Generic.
// Provides mechanical deterministic duplicate prevention.
// ============================================================

import { db, sql } from "../../db/connection.ts";
import { bankTransactions } from "../../db/schema/index.ts";
import { v4 as uuidv4 } from "uuid";
import { and, eq } from "drizzle-orm";

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
    // Simple CSV split handling quotes
    const row = rawLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/^"|"$/g, "").trim());
    
    try {
      if (format === "chase" && row.length >= 6) {
        results.push({
          date: normalizeDate(row[1]),
          description: row[2] || "Unknown",
          amount: parseFloat(row[3] || "0"),
          reference: row[6] || null
        });
      }
      else if (format === "bofa" && row.length >= 3) {
        results.push({
          date: normalizeDate(row[0]),
          description: row[1] || "Unknown",
          amount: parseFloat(row[2] || "0"),
          reference: null
        });
      }
      else if (format === "wellsfargo" && row.length >= 5) {
        results.push({
          date: normalizeDate(row[0]),
          amount: parseFloat(row[1] || "0"),
          description: row[4] || "Unknown",
          reference: null
        });
      }
      else if (row.length >= 3) {
        results.push({
          date: normalizeDate(row[0]),
          description: row[1] || "Unknown",
          amount: parseFloat(row[2] || "0"),
          reference: null
        });
      }
    } catch(e) { /* Skip malformed row */ }
  }

  return results;
}

// ── Native SQL Duplicate Resolver ───────────────────────────
export async function importTransactions(
  companyId: string,
  bankAccount: string,
  csvText: string
): Promise<{ imported: number, duplicates: number, batchId: string }> {
  const parsed = parseBankCsv(csvText);
  if (parsed.length === 0) return { imported: 0, duplicates: 0, batchId: "" };

  const batchId = uuidv4();
  const now = new Date();

  let imported = 0;
  let duplicates = 0;

  await db.transaction(async (tx) => {
    for (const p of parsed) {
      if (p.amount === 0) continue;
      
      const type = p.amount < 0 ? "debit" : "credit";
      
      const [exists] = await tx
        .select({ id: bankTransactions.id })
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.companyId, companyId),
            eq(bankTransactions.bankAccount, bankAccount),
            eq(bankTransactions.transactionDate, p.date),
            eq(bankTransactions.amount, String(p.amount)),
            eq(bankTransactions.description, p.description)
          )
        )
        .limit(1);
      
      if (exists) {
        duplicates++;
      } else {
        await tx.insert(bankTransactions).values({
          id:              uuidv4(),
          companyId,
          bankAccount,
          transactionDate: p.date,
          description:     p.description,
          amount:          String(p.amount),
          transactionType: type,
          referenceNumber: p.reference,
          status:          "pending",
          importBatchId:   batchId,
          createdAt:       now,
        });
        imported++;
      }
    }
  });

  return { imported, duplicates, batchId };
}

// ── Helper ──────────────────────────────────────────────────
function normalizeDate(mmddyyyy: string): string {
  const parts = mmddyyyy.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
    }
  }
  return mmddyyyy;
}
