// ============================================================
// STATEMENT IMPORT SERVICE — src/services/bank/statement-import.service.ts
// Processes CSV, OFX, QFX files and pre-parsed PDF transaction batches.
// Deduplication uses a fingerprint hash (date|description|amount|bankAccount)
// to correctly handle identical same-day transactions from different accounts,
// while still preventing true re-imports of the same transaction.
// ============================================================

import { db } from "../../db/connection.ts";
import { bankTransactions } from "../../db/schema/accounting.schema.ts";
import { bankAccounts } from "../../db/schema/bank-accounts.schema.ts";
import { and, eq } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";

export interface ParsedTransaction {
    date: string;
    description: string;
    amount: number;
    referenceNumber?: string;
}

export interface ImportResult {
    batchId: string;
    totalParsed: number;
    importedCount: number;
    duplicateCount: number;
    format: string;
    extractedBankName?: string;
}

// ── Fingerprint deduplication ────────────────────────────────
// Uses SHA-256 of (companyId|bankAccountId|date|description|amount) so that:
// - Same transaction in the same account across multiple imports → duplicate
// - Two identical payments on the same day → different reference → NOT duplicate
//   (when referenceNumber is available)
// - Same payment without a reference → treated as duplicate (safe default)
function buildFingerprint(
    companyId: string,
    bankAccountId: string,
    date: string,
    description: string,
    amount: number,
    referenceNumber?: string
): string {
    const parts = [
        companyId,
        bankAccountId,
        date,
        description.trim().toLowerCase(),
        amount.toFixed(2),
        referenceNumber ?? '',
    ];
    return createHash('sha256').update(parts.join('|')).digest('hex');
}

// ── CSV helpers ──────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    return line.split(regex).map(col => col.replace(/^"|"$/g, '').trim());
}

function normalizeDate(rawDate: string): string {
    if (!rawDate) return new Date().toISOString().split('T')[0];

    if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
        return rawDate.substring(0, 10);
    }

    const parts = rawDate.split(/[/-]/);
    if (parts.length === 3) {
        const m = parts[0].padStart(2, '0');
        const d = parts[1].padStart(2, '0');
        let y = parts[2];
        if (y.length === 2) y = '20' + y;
        return `${y}-${m}-${d}`;
    }

    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
}

// ── Main service class ───────────────────────────────────────

class StatementImportService {

    async processFile(
        companyId: string,
        bankAccountName: string,
        fileBuffer: Buffer,
        fileName: string
    ): Promise<ImportResult> {
        const content = fileBuffer.toString('utf-8');
        const extension = fileName.split('.').pop()?.toLowerCase();

        let txns: ParsedTransaction[] = [];
        let format = "unknown";
        let extractedBankName: string | undefined;

        if (extension === 'csv') {
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            if (lines.length > 0) {
                const header = lines[0].toLowerCase();
                const cols = header.split(',').map((c: string) => c.trim());
                const hasTransactionDate = cols.some((c: string) => c === "transaction date");
                const hasPostDate = cols.some((c: string) => c === "post date");

                if (hasTransactionDate && hasPostDate) {
                    format = "CSV-Chase";
                    extractedBankName = "CHASE";
                    txns = this.parseChaseCSV(lines);
                } else if (
                    header.includes("date") && header.includes("description") &&
                    header.includes("amount") && header.includes("running bal")
                ) {
                    format = "CSV-BofA";
                    extractedBankName = "Bank of America";
                    txns = this.parseBofaCSV(lines);
                } else if (
                    header.includes("date") && header.includes("amount") &&
                    header.includes("description")
                ) {
                    format = "CSV-Generic";
                    txns = this.parseGenericCSV(lines);
                } else {
                    format = "CSV-Fallback";
                    txns = this.parseGenericCSV(lines);
                }
            }
        } else if (extension === 'ofx' || extension === 'qfx') {
            format = extension.toUpperCase();
            txns = this.parseOFX(content);
            const orgMatch = content.match(/<ORG>(.*?)(?:<|\r|\n)/);
            if (orgMatch?.[1]) {
                extractedBankName = orgMatch[1].trim();
            }
        } else {
            throw new Error("Formato de archivo no soportado. Debe ser CSV, OFX o QFX.");
        }

        if (txns.length === 0) {
            throw new Error("No se encontraron transacciones en el archivo. Verifique el formato.");
        }

        const matchingAccountId = await this.resolveAccountId(
            companyId, bankAccountName, extractedBankName
        );

        const batchId = randomUUID();
        const { imported, duplicates } = await this.persistTransactions(
            companyId, matchingAccountId, txns, batchId
        );

        return {
            batchId,
            totalParsed: txns.length,
            importedCount: imported,
            duplicateCount: duplicates,
            format,
            extractedBankName,
        };
    }

    // ── PDF pre-parsed batch ─────────────────────────────────

    async processParsedBatch(
        companyId: string,
        bankAccountId: string | undefined,
        txns: { date: string; description: string; amount: number; balance?: number }[],
        bankName: string | undefined,
        accountNumber: string | undefined,
        batchId: string
    ) {
        const matchingAccountId = await this.resolveAccountId(
            companyId, bankAccountId ?? '', bankName
        );

        const mapped: ParsedTransaction[] = txns.map(t => ({
            date: t.date,
            description: t.description,
            amount: t.amount,
        }));

        const { imported, duplicates } = await this.persistTransactions(
            companyId, matchingAccountId, mapped, batchId
        );

        return {
            batchId,
            totalParsed: txns.length,
            importedCount: imported,
            duplicateCount: duplicates,
        };
    }

    // ── Account resolution ────────────────────────────────────

    private async resolveAccountId(
        companyId: string,
        providedId: string,
        bankName?: string
    ): Promise<string> {
        // If it looks like a UUID, use it directly
        if (providedId && /^[0-9a-f-]{36}$/i.test(providedId)) {
            return providedId;
        }

        // Try to find by bank name
        if (bankName) {
            const accs = await db.select()
                .from(bankAccounts)
                .where(and(
                    eq(bankAccounts.companyId, companyId),
                    eq(bankAccounts.bankName, bankName),
                    eq(bankAccounts.isActive, true)
                ))
                .limit(1);
            if (accs.length > 0) return accs[0].id;
        }

        // Try as account name string
        if (providedId) {
            const accs = await db.select()
                .from(bankAccounts)
                .where(and(
                    eq(bankAccounts.companyId, companyId),
                    eq(bankAccounts.isActive, true)
                ));
            const found = accs.find(a =>
                a.bankName?.toLowerCase() === providedId.toLowerCase() ||
                a.id === providedId
            );
            if (found) return found.id;
        }

        throw new Error(
            JSON.stringify({ code: 'UNKNOWN_BANK', bankName: bankName ?? providedId ?? 'Desconocido' })
        );
    }

    // ── Persistence with fingerprint deduplication ────────────

    private async persistTransactions(
        companyId: string,
        bankAccountId: string,
        txns: ParsedTransaction[],
        batchId: string
    ): Promise<{ imported: number; duplicates: number }> {
        let imported = 0;
        let duplicates = 0;

        for (const t of txns) {
            const fingerprint = buildFingerprint(
                companyId, bankAccountId,
                t.date, t.description, t.amount, t.referenceNumber
            );

            // Use fingerprint stored in referenceNumber field as dedup key
            // when no real referenceNumber exists. When a real referenceNumber
            // is present, use it for exact matching to allow identical payments
            // that share the same fingerprint to still be distinguished by FITID.
            const existingQuery = t.referenceNumber
                ? db.select({ id: bankTransactions.id })
                    .from(bankTransactions)
                    .where(and(
                        eq(bankTransactions.companyId, companyId),
                        eq(bankTransactions.bankAccount, bankAccountId),
                        eq(bankTransactions.referenceNumber, t.referenceNumber)
                    ))
                    .limit(1)
                : db.select({ id: bankTransactions.id })
                    .from(bankTransactions)
                    .where(and(
                        eq(bankTransactions.companyId, companyId),
                        eq(bankTransactions.bankAccount, bankAccountId),
                        eq(bankTransactions.transactionDate, t.date),
                        eq(bankTransactions.description, t.description),
                        eq(bankTransactions.amount, t.amount.toString())
                    ))
                    .limit(1);

            const existing = await existingQuery;

            if (existing.length > 0) {
                duplicates++;
            } else {
                await db.insert(bankTransactions).values({
                    id: randomUUID(),
                    companyId,
                    bankAccount: bankAccountId,
                    transactionDate: t.date,
                    description: t.description,
                    amount: t.amount.toString(),
                    transactionType: t.amount < 0 ? 'debit' : 'credit',
                    // Store the fingerprint as referenceNumber when no real one is provided
                    referenceNumber: t.referenceNumber ?? fingerprint,
                    status: 'pending',
                    importBatchId: batchId,
                    createdAt: new Date(),
                });
                imported++;
            }
        }

        return { imported, duplicates };
    }

    // ── CSV parsers ───────────────────────────────────────────

    private parseChaseCSV(lines: string[]): ParsedTransaction[] {
        const header = parseCSVLine(lines[0].toLowerCase());
        const dateIdx = header.findIndex(h => h.includes('date') && !h.includes('post'));
        const fallbackDateIdx = header.findIndex(h => h.includes('post date'));
        const descIdx = header.findIndex(h => h.includes('description'));
        const amtIdx = header.findIndex(h => h.includes('amount'));
        const actualDateIdx = dateIdx >= 0 ? dateIdx : (fallbackDateIdx >= 0 ? fallbackDateIdx : 0);
        return this.extractFromCols(lines.slice(1), actualDateIdx, descIdx >= 0 ? descIdx : 2, amtIdx >= 0 ? amtIdx : 3);
    }

    private parseBofaCSV(lines: string[]): ParsedTransaction[] {
        const headerLineIndex = lines.findIndex(l =>
            l.toLowerCase().includes('date') && l.toLowerCase().includes('amount')
        );
        const startIndex = headerLineIndex >= 0 ? headerLineIndex + 1 : 1;
        const headerLine = headerLineIndex >= 0 ? lines[headerLineIndex] : lines[0];
        const header = parseCSVLine(headerLine.toLowerCase());
        const dateIdx = header.indexOf('date') >= 0 ? header.indexOf('date') : 0;
        const descIdx = header.indexOf('description') >= 0 ? header.indexOf('description') : 1;
        const amtIdx = header.indexOf('amount') >= 0 ? header.indexOf('amount') : 2;
        return this.extractFromCols(lines.slice(startIndex), dateIdx, descIdx, amtIdx);
    }

    private parseGenericCSV(lines: string[]): ParsedTransaction[] {
        const header = parseCSVLine(lines[0].toLowerCase());
        let dateIdx = header.findIndex(h => h.includes('date') || h.includes('fecha'));
        let descIdx = header.findIndex(h =>
            h.includes('description') || h.includes('descripción') || h.includes('memo')
        );
        let amtIdx = header.findIndex(h => h.includes('amount') || h.includes('monto'));
        if (dateIdx === -1) dateIdx = 0;
        if (descIdx === -1) descIdx = 1;
        if (amtIdx === -1) amtIdx = Math.max(0, header.length - 1);
        return this.extractFromCols(lines.slice(1), dateIdx, descIdx, amtIdx);
    }

    private extractFromCols(
        dataLines: string[],
        dateIdx: number,
        descIdx: number,
        amtIdx: number
    ): ParsedTransaction[] {
        const txns: ParsedTransaction[] = [];
        for (const line of dataLines) {
            if (!line.trim()) continue;
            const cols = parseCSVLine(line);
            if (cols.length <= Math.max(dateIdx, descIdx, amtIdx)) continue;
            const dateStr = cols[dateIdx];
            const descStr = cols[descIdx];
            const amtStr = cols[amtIdx].replace(/[^0-9.-]+/g, '');
            if (!dateStr || !amtStr || isNaN(parseFloat(amtStr))) continue;
            txns.push({
                date: normalizeDate(dateStr),
                description: descStr || 'Desconocido',
                amount: parseFloat(amtStr),
            });
        }
        return txns;
    }

    // ── OFX / QFX parser ─────────────────────────────────────

    private parseOFX(content: string): ParsedTransaction[] {
        const txns: ParsedTransaction[] = [];
        const blocks = content.split('<STMTTRN>');

        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i].split('</STMTTRN>')[0];

            const extractTag = (tag: string): string => {
                const parts = block.split(`<${tag}>`);
                if (parts.length > 1) {
                    return parts[1].split('<')[0].split(/\r?\n/)[0].trim();
                }
                return '';
            };

            const dtposted = extractTag('DTPOSTED');
            const trnamt = extractTag('TRNAMT');
            const name = extractTag('NAME');
            const memo = extractTag('MEMO');
            const fitid = extractTag('FITID');

            if (!dtposted || !trnamt) continue;

            let normalizedDate = '';
            if (dtposted.length >= 8) {
                normalizedDate = `${dtposted.substring(0, 4)}-${dtposted.substring(4, 6)}-${dtposted.substring(6, 8)}`;
            } else {
                normalizedDate = new Date().toISOString().split('T')[0];
            }

            // Use both NAME and MEMO when both are present and different
            const namePart = name?.trim() ?? '';
            const memoPart = memo?.trim() ?? '';
            let description: string;
            if (namePart && memoPart && namePart.toLowerCase() !== memoPart.toLowerCase()) {
                description = `${namePart} - ${memoPart}`;
            } else {
                description = namePart || memoPart || 'Transacción Desconocida';
            }

            txns.push({
                date: normalizedDate,
                amount: parseFloat(trnamt),
                description,
                referenceNumber: fitid || undefined,
            });
        }

        return txns;
    }
}

export const statementImportService = new StatementImportService();
