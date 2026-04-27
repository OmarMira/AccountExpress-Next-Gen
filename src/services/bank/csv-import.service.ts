// ============================================================
// BANK CSV IMPORT SERVICE — PostgreSQL 16 / Drizzle ORM
// Ingests CSV extracts from Chase, BofA, WellsFargo and Generic.
// Provides mechanical deterministic duplicate prevention.
// ============================================================

import { db } from "../../db/connection.ts";
import { bankTransactions } from "../../db/schema/index.ts";
import { v4 as uuidv4 } from "uuid";
import { and, eq } from "drizzle-orm";

export interface ParsedTransaction {
  date: string;       // YYYY-MM-DD
  description: string;
  amount: number;     // Negative = expense, Positive = deposit
  reference: string | null;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  format: string;
  failedRows: number;
}

// ── Date normalizer — handles all US bank date formats ───────
export function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // Already ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

  // MM/DD/YYYY or MM-DD-YYYY
  const parts = s.split(/[/-]/);
  if (parts.length === 3) {
    const [a, b] = parts;
    let c = parts[2];
    if (c.length === 2) c = "20" + c; // 2-digit year
    if (c.length === 4) {
      // MM/DD/YYYY
      return `${c}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    }
  }

  // Fallback: try native Date parser
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];

  return null;
}

// ── CSV line splitter — respects quoted commas ───────────────
function splitCsvLine(line: string): string[] {
  return line
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map(s => s.replace(/^"|"$/g, "").trim());
}

// ── Detect Wells Fargo: no header, cols are Date,Amt,*,*,Desc ─
function isWellsFargoFormat(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const first = splitCsvLine(lines[0]);
  if (first.length < 5) return false;
  const dateOk = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(first[0].trim());
  const amtOk  = !isNaN(parseFloat(first[1].replace(/[^0-9.-]/g, "")));
  return dateOk && amtOk;
}

// ── Deterministic CSV Parser ─────────────────────────────────
export function parseBankCsv(csvText: string): ParseResult {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return { transactions: [], format: "empty", failedRows: 0 };

  const headerRaw = lines[0].toLowerCase();
  let format = "generic";
  let startIndex = 1;
  let failedRows = 0;

  // Format detection
  if (headerRaw.includes("check or slip #") || headerRaw.includes("details,posting date")
    || (headerRaw.includes("transaction date") && headerRaw.includes("post date"))) {
    format = "chase";
  } else if (headerRaw.includes("running bal") || 
    (headerRaw.startsWith("date") && headerRaw.includes("description") && headerRaw.includes("amount"))) {
    format = "bofa";
  } else if (isWellsFargoFormat(lines)) {
    format = "wellsfargo";
    startIndex = 0;
  }

  const results: ParsedTransaction[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);
    try {
      let tx: ParsedTransaction | null = null;

      if (format === "chase" && row.length >= 4) {
        const amt = parseFloat(row[3].replace(/[^0-9.-]/g, "") || "0");
        if (isNaN(amt)) { failedRows++; continue; }
        const date = normalizeDate(row[1]);
        if (!date) throw new Error(`Fila ${i + 1}: fecha inválida "${row[1]}". Formato esperado: YYYY-MM-DD, MM/DD/YYYY o DD/MM/YYYY.`);
        tx = { date, description: row[2] || "Unknown", amount: amt, reference: row[6] ?? null };
      } else if (format === "bofa" && row.length >= 3) {
        const amt = parseFloat(row[2].replace(/[^0-9.-]/g, "") || "0");
        if (isNaN(amt)) { failedRows++; continue; }
        const date = normalizeDate(row[0]);
        if (!date) throw new Error(`Fila ${i + 1}: fecha inválida "${row[0]}". Formato esperado: YYYY-MM-DD, MM/DD/YYYY o DD/MM/YYYY.`);
        tx = { date, description: row[1] || "Unknown", amount: amt, reference: null };
      } else if (format === "wellsfargo" && row.length >= 5) {
        const amt = parseFloat(row[1].replace(/[^0-9.-]/g, "") || "0");
        if (isNaN(amt)) { failedRows++; continue; }
        const date = normalizeDate(row[0]);
        if (!date) throw new Error(`Fila ${i + 1}: fecha inválida "${row[0]}". Formato esperado: YYYY-MM-DD, MM/DD/YYYY o DD/MM/YYYY.`);
        tx = { date, description: row[4] || "Unknown", amount: amt, reference: null };
      } else if (row.length >= 3) {
        const amt = parseFloat(row[2].replace(/[^0-9.-]/g, "") || "0");
        if (isNaN(amt)) { failedRows++; continue; }
        const date = normalizeDate(row[0]);
        if (!date) throw new Error(`Fila ${i + 1}: fecha inválida "${row[0]}". Formato esperado: YYYY-MM-DD, MM/DD/YYYY o DD/MM/YYYY.`);
        tx = { date, description: row[1] || "Unknown", amount: amt, reference: null };
      } else {
        failedRows++;
        continue;
      }

      if (tx && tx.amount !== 0) results.push(tx);
    } catch {
      failedRows++;
    }
  }

  return { transactions: results, format, failedRows };
}

// ── Native SQL Duplicate Resolver ────────────────────────────
export async function importTransactions(
  companyId: string,
  bankAccount: string,
  csvText: string
): Promise<{ imported: number; duplicates: number; failedRows: number; batchId: string; format: string }> {
  const { transactions: parsed, format, failedRows } = parseBankCsv(csvText);
  if (parsed.length === 0) return { imported: 0, duplicates: 0, failedRows, batchId: "", format };

  const batchId = uuidv4();
  const now = new Date();
  let imported = 0;
  let duplicates = 0;

  await db.transaction(async (tx) => {
    for (const p of parsed) {
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
          transactionType: p.amount < 0 ? "debit" : "credit",
          referenceNumber: p.reference,
          status:          "pending",
          importBatchId:   batchId,
          createdAt:       now,
        });
        imported++;
      }
    }
  });

  return { imported, duplicates, failedRows, batchId, format };
}
