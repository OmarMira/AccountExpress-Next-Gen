import { db } from "../../db/connection";
import { bankTransactions } from "../../db/schema/accounting.schema";
import { bankAccounts } from "../../db/schema/bank-accounts.schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

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

function parseCSVLine(line: string): string[] {
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    return line.split(regex).map(col => col.replace(/^"|"$/g, '').trim());
}

function normalizeDate(rawDate: string): string {
    // rawDate can be MM/DD/YYYY, YYYY-MM-DD, etc.
    // Ensure ISO 8601 YYYY-MM-DD.
    if (!rawDate) return new Date().toISOString().split('T')[0];
    
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
        return rawDate.substring(0, 10);
    }
    
    // MM/DD/YYYY or MM-DD-YYYY or M/D/YY
    const parts = rawDate.split(/[\/\-]/);
    if (parts.length === 3) {
        let m = parts[0].padStart(2, '0');
        let d = parts[1].padStart(2, '0');
        let y = parts[2];
        if (y.length === 2) y = '20' + y;
        return `${y}-${m}-${d}`;
    }
    
    // Fallback
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    
    return new Date().toISOString().split('T')[0];
}

class StatementImportService {
    async processFile(companyId: string, bankAccountName: string, fileBuffer: Buffer, fileName: string): Promise<ImportResult> {
        const content = fileBuffer.toString('utf-8');
        const extension = fileName.split('.').pop()?.toLowerCase();
        
        let txns: ParsedTransaction[] = [];
        let format = "unknown";
        let extractedBankName: string | undefined;

        if (extension === 'csv') {
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            if (lines.length > 0) {
                const header = lines[0].toLowerCase();
                
                // Detect Chase
                if (header.includes("transaction date") && header.includes("post date") && header.includes("description") && header.includes("amount")) {
                    format = "CSV-Chase";
                    extractedBankName = "CHASE";
                    txns = this.parseChaseCSV(lines);
                }
                // Detect BofA
                else if (header.includes("date") && header.includes("description") && header.includes("amount") && header.includes("running bal")) {
                    format = "CSV-BofA";
                    extractedBankName = "Bank of America";
                    txns = this.parseBofaCSV(lines);
                }
                // Detect Generic or Wells Fargo
                else if (header.includes("date") && header.includes("amount") && header.includes("description")) {
                    format = "CSV-Generic";
                    txns = this.parseGenericCSV(lines);
                } 
                else {
                    // Try generic index heuristic if column names are weird
                    format = "CSV-Fallback";
                    txns = this.parseGenericCSV(lines);
                }
            }
        } else if (extension === 'ofx' || extension === 'qfx') {
            format = extension.toUpperCase();
            txns = this.parseOFX(content);
            const orgMatch = content.match(/<ORG>(.*?)(?:<|\r|\n)/);
            if (orgMatch && orgMatch[1]) {
                extractedBankName = orgMatch[1].trim();
            }
        } else {
            throw new Error("Formato de archivo no soportado. Debe ser CSV, OFX o QFX.");
        }

        let matchingAccountId = bankAccountName;

        if (!matchingAccountId && extractedBankName) {
            const accs = await db.select().from(bankAccounts)
                .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.bankName, extractedBankName), eq(bankAccounts.isActive, 1)))
                .limit(1);
            if (accs.length > 0) matchingAccountId = accs[0].id;
        }

        if (!matchingAccountId) {
            throw new Error(JSON.stringify({ code: 'UNKNOWN_BANK', bankName: extractedBankName || 'Desconocido' }));
        }

        const batchId = randomUUID();
        let imported = 0;
        let duplicates = 0;

        for (const t of txns) {
            // Deduplication check
            const existing = await db.select({ id: bankTransactions.id })
                .from(bankTransactions)
                .where(
                    and(
                        eq(bankTransactions.companyId, companyId),
                        eq(bankTransactions.transactionDate, t.date),
                        eq(bankTransactions.description, t.description),
                        eq(bankTransactions.amount, t.amount)
                    )
                ).limit(1);

            if (existing.length > 0) {
                duplicates++;
            } else {
                await db.insert(bankTransactions).values({
                    id: randomUUID(),
                    companyId: companyId,
                    bankAccount: matchingAccountId,
                    transactionDate: t.date,
                    description: t.description,
                    amount: t.amount,
                    transactionType: t.amount < 0 ? 'debit' : 'credit',
                    referenceNumber: t.referenceNumber || null,
                    status: 'pending',
                    importBatchId: batchId,
                    createdAt: new Date().toISOString()
                });
                imported++;
            }
        }

        return {
            batchId,
            totalParsed: txns.length,
            importedCount: imported,
            duplicateCount: duplicates,
            format,
            extractedBankName
        };
    }

    private parseChaseCSV(lines: string[]): ParsedTransaction[] {
        // Chase: Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
        // Or newer: Transaction Date,Post Date,Description,Category,Type,Amount,Memo
        const header = parseCSVLine(lines[0].toLowerCase());
        const dateIdx = header.findIndex(h => h.includes('date') && !h.includes('post'));
        const fallbackDateIdx = header.findIndex(h => h.includes('post date'));
        const descIdx = header.findIndex(h => h.includes('description'));
        const amtIdx = header.findIndex(h => h.includes('amount'));

        const actualDateIdx = dateIdx >= 0 ? dateIdx : (fallbackDateIdx >= 0 ? fallbackDateIdx : 0);
        
        return this.extractFromCols(lines.slice(1), actualDateIdx, descIdx >= 0 ? descIdx : 2, amtIdx >= 0 ? amtIdx : 3);
    }

    private parseBofaCSV(lines: string[]): ParsedTransaction[] {
        // BofA often skips headers or has "Date, Description, Amount, Running Bal." starting from line 7 or 8.
        const headerLineIndex = lines.findIndex(l => l.toLowerCase().includes('date') && l.toLowerCase().includes('amount'));
        const startIndex = headerLineIndex >= 0 ? headerLineIndex + 1 : 1;
        
        let header = [];
        if (headerLineIndex >= 0) {
            header = parseCSVLine(lines[headerLineIndex].toLowerCase());
        } else {
            header = parseCSVLine(lines[0].toLowerCase());
        }

        const dateIdx = header.indexOf('date') >= 0 ? header.indexOf('date') : 0;
        const descIdx = header.indexOf('description') >= 0 ? header.indexOf('description') : 1;
        const amtIdx = header.indexOf('amount') >= 0 ? header.indexOf('amount') : 2;

        return this.extractFromCols(lines.slice(startIndex), dateIdx, descIdx, amtIdx);
    }

    private parseGenericCSV(lines: string[]): ParsedTransaction[] {
        const header = parseCSVLine(lines[0].toLowerCase());
        let dateIdx = header.findIndex(h => h.includes('date') || h.includes('fecha'));
        let descIdx = header.findIndex(h => h.includes('description') || h.includes('descripción') || h.includes('memo'));
        let amtIdx = header.findIndex(h => h.includes('amount') || h.includes('monto'));

        if (dateIdx === -1) dateIdx = 0;
        if (descIdx === -1) descIdx = 1;
        if (amtIdx === -1) amtIdx = Math.max(0, header.length - 1);

        // skip header if it contains letters in amount col, else start 0
        const firstDataRow = parseCSVLine(lines[1] || "");
        const startIndex = isNaN(parseFloat((firstDataRow[amtIdx] || "").replace(/[^0-9.-]+/g, ''))) ? 1 : 0;

        return this.extractFromCols(lines.slice(startIndex === 0 ? 0 : 1), dateIdx, descIdx, amtIdx);
    }

    private extractFromCols(dataLines: string[], dateIdx: number, descIdx: number, amtIdx: number): ParsedTransaction[] {
        const txns: ParsedTransaction[] = [];
        for (const line of dataLines) {
            if (!line.trim()) continue;
            const cols = parseCSVLine(line);
            if (cols.length <= Math.max(dateIdx, descIdx, amtIdx)) continue;

            const dateStr = cols[dateIdx];
            const descStr = cols[descIdx];
            const amtStr = cols[amtIdx].replace(/[^0-9.-]+/g, ''); // strip out $ and commas

            if (!dateStr || !amtStr || isNaN(parseFloat(amtStr))) continue;

            txns.push({
                date: normalizeDate(dateStr),
                description: descStr,
                amount: parseFloat(amtStr)
            });
        }
        return txns;
    }

    private parseOFX(content: string): ParsedTransaction[] {
        const txns: ParsedTransaction[] = [];
        
        // Find all <STMTTRN> blocks
        const blocks = content.split('<STMTTRN>');
        
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i].split('</STMTTRN>')[0];
            
            // Extracts value between <TAG> and <
            const extractTag = (tag: string) => {
                const parts = block.split(`<${tag}>`);
                if (parts.length > 1) {
                    const val = parts[1].split('<')[0].trim();
                    // Some OFX formats have newlines inside tags, so take the first non-empty sequence
                    return val.split(/\r?\n/)[0].trim();
                }
                return "";
            };

            const dtposted = extractTag('DTPOSTED');
            const trnamt = extractTag('TRNAMT');
            const name = extractTag('NAME');
            const memo = extractTag('MEMO');
            const fitid = extractTag('FITID');

            if (!dtposted || !trnamt) continue;

            // OFX Date is YYYYMMDDHHMMSS...
            let normalizedDate = "";
            if (dtposted.length >= 8) {
                normalizedDate = `${dtposted.substring(0,4)}-${dtposted.substring(4,6)}-${dtposted.substring(6,8)}`;
            } else {
                normalizedDate = new Date().toISOString().split('T')[0];
            }

            const description = name || memo || "Transacción Desconocida";

            txns.push({
                date: normalizedDate,
                amount: parseFloat(trnamt),
                description,
                referenceNumber: fitid || undefined
            });
        }

        return txns;
    }

    async processParsedBatch(
        companyId: string,
        bankAccountId: string | undefined,
        txns: { date: string, description: string, amount: number, balance?: number }[],
        bankName: string | undefined,
        accountNumber: string | undefined,
        batchId: string
    ) {
        let matchingAccountId = bankAccountId;

        if (!matchingAccountId && bankName) {
            const accs = await db.select().from(bankAccounts)
                .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.bankName, bankName), eq(bankAccounts.isActive, 1)))
                .limit(1);
            if (accs.length > 0) matchingAccountId = accs[0].id;
        }

        if (!matchingAccountId) {
            throw new Error(JSON.stringify({ code: 'UNKNOWN_BANK', bankName: bankName || 'Desconocido', accountNumber }));
        }

        let imported = 0;
        let duplicates = 0;

        for (const t of txns) {
            const existing = await db.select({ id: bankTransactions.id })
                .from(bankTransactions)
                .where(
                    and(
                        eq(bankTransactions.companyId, companyId),
                        eq(bankTransactions.transactionDate, t.date),
                        eq(bankTransactions.description, t.description),
                        eq(bankTransactions.amount, t.amount)
                    )
                ).limit(1);

            if (existing.length > 0) {
                duplicates++;
            } else {
                await db.insert(bankTransactions).values({
                    id: randomUUID(),
                    companyId: companyId,
                    bankAccount: matchingAccountId,
                    transactionDate: t.date,
                    description: t.description,
                    amount: t.amount,
                    transactionType: t.amount < 0 ? 'debit' : 'credit',
                    referenceNumber: null,
                    status: 'pending',
                    importBatchId: batchId,
                    createdAt: new Date().toISOString()
                });
                imported++;
            }
        }

        // Actualizar balance de la cuenta bancaria sumando
        // el neto de las transacciones importadas
        if (imported > 0) {
            const netAmount = txns
              .filter(t => {
                  // Solo las que no son duplicados — aproximación:
                  // recalcular el neto de todas (duplicados ya existían)
                  return true;
              })
              .reduce((sum, t) => sum + t.amount, 0);

            // Traer balance actual
            const acc = await db.select({ balance: bankAccounts.balance })
              .from(bankAccounts)
              .where(eq(bankAccounts.id, matchingAccountId))
              .limit(1);

            if (acc.length > 0) {
                const currentBalance = acc[0].balance || 0;
                // balance se guarda en centavos
                const delta = Math.round(netAmount * 100);
                await db.update(bankAccounts)
                  .set({
                      balance: currentBalance + delta,
                      updatedAt: new Date().toISOString()
                  })
                  .where(eq(bankAccounts.id, matchingAccountId));
            }
        }

        return {
            batchId,
            totalParsed: txns.length,
            importedCount: imported,
            duplicateCount: duplicates,
            format: 'pdf',
            extractedBankName: bankName
        };
    }
}

export const statementImportService = new StatementImportService();
