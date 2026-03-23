import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ParsedBankTransaction {
  date: string;        // ISO 8601 YYYY-MM-DD
  description: string;
  amount: number;      // negativo = gasto, positivo = ingreso
  balance?: number;
}

export interface ParsedBankStatement {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  accountType: string;
  periodStart: string;    // ISO 8601
  periodEnd: string;      // ISO 8601
  beginningBalance: number;
  endingBalance: number;
  transactions: ParsedBankTransaction[];
}

function parseDateToISO(rawDate: string): string {
    // Basic cleanup
    let cleaned = rawDate.replace(/de/gi, '').replace(/,/g, '').trim();
    
    // Translate Spanish months
    const esMonths: Record<string, string> = {
        ene: 'jan', abr: 'apr', ago: 'aug', dic: 'dec', set: 'sep', sep: 'sep'
    };
    for (const [es, en] of Object.entries(esMonths)) {
        cleaned = cleaned.replace(new RegExp(es, 'gi'), en);
    }

    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
    }
    
    // If invalid, try to parse MM/DD/YYYY directly if it matches
    const parts = rawDate.split(/[-/]/);
    if (parts.length === 3) {
        let y = parts[2];
        let m = parts[0];
        let d = parts[1];
        if (y.length === 2) y = `20${y}`;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    
    // Fallback today
    return new Date().toISOString().split('T')[0];
}

export async function parseBankPDF(file: File): Promise<ParsedBankStatement> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const lines: string[] = [];

    // Extract text grouped by Y rows
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const items = textContent.items as any[];
        const rows: { y: number, text: string }[] = [];

        items.forEach(item => {
            const y = Math.round(item.transform[5]);
            const text = item.str;
            if (!text.trim()) return;

            const row = rows.find(r => Math.abs(r.y - y) < 4);
            if (row) {
                row.text += ' ' + text;
            } else {
                rows.push({ y, text });
            }
        });

        rows.sort((a, b) => b.y - a.y);
        rows.forEach(r => lines.push(r.text));
    }

    const results: ParsedBankTransaction[] = [];
    const fullText = lines.join('\n');
    
    // Detect Year Context
    const yearMatches = fullText.match(/\b20[2-3]\d\b/g);
    const detectedYears = yearMatches ? [...new Set(yearMatches)].sort().map(Number) : [new Date().getFullYear()];
    const primaryYear = detectedYears[detectedYears.length - 1];

    const months = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ene|Abr|Ago|Dic|Set";
    const dateRegex = new RegExp(
        `(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})|` +
        `(\\d{4}[/-]\\d{1,2}[/-]\\d{1,2})|` +
        `((?:${months})[a-z]*\\.?\\s\\d{1,2},?\\s\\d{2,4})|` +
        `(\\d{1,2}\\s+(?:de\\s+)?(?:${months})[a-z]*\\.?,?\\s+\\d{2,4})|` +
        `^(\\d{1,2}[/-]\\d{1,2})\\s|\\s(\\d{1,2}[/-]\\d{1,2})\\s`,
        'i'
    );
    const amountRegex = /([(]?\-?\s?[$€£]?\s?[\d,.]+[.,]\d{2}[)]?)/g;

    let currentSign = 0;
    let ignoreSection = false;

    lines.forEach((line) => {
        const cleanLine = line.trim();
        if (!cleanLine) return;

        // Context Switches
        if (cleanLine.match(/^(Deposits|Credits|Additions|Depositos|Abonos)/i) && cleanLine.length < 50) {
            currentSign = 1;
            ignoreSection = false;
            return;
        }
        if (cleanLine.match(/^(Withdrawals|Debits|Checks|Payments|Retiros|Cargos|Cheques|Service fees|Service charges)/i) && cleanLine.length < 50) {
            currentSign = -1;
            ignoreSection = false;
            return;
        }
        if (cleanLine.match(/^(Summary|Daily ledger balances|Account summary|Daily balance)/i)) {
            ignoreSection = true; return;
        }
        if (ignoreSection) return;
        if (cleanLine.match(/Page \d|Balance|Saldo|Continued|Statement|Period|Beginning|Ending|Summary|Total/i)) return;

        const dateMatch = cleanLine.match(dateRegex);
        const amounts = cleanLine.match(amountRegex);

        if (dateMatch && amounts) {
            let rawDate = dateMatch[0].trim();
            const rawAmountStr = amounts[0];
            let probableBalance: string | undefined = undefined;

            if (amounts.length > 1) {
                probableBalance = amounts[amounts.length - 1];
            }

            // Year attribution for MM/DD formats
            if (rawDate.match(/^\d{1,2}[/-]\d{1,2}$/)) {
                const parts = rawDate.split(/[/-]/);
                const month = parseInt(parts[0], 10);
                let assignedYear = primaryYear;
                if (detectedYears.length >= 2) {
                    if (month > 10) assignedYear = detectedYears[0];
                    else if (month < 3) assignedYear = detectedYears[detectedYears.length - 1];
                }
                rawDate = `${rawDate}/${assignedYear}`; // Assuming MM/DD -> MM/DD/YYYY
            }

            // Clean amount
            let numericAmount = parseFloat(rawAmountStr.replace(/[^\d.-]/g, ''));
            // Assuming format like 1,000.00 -> 1000.00
            if (rawAmountStr.includes(',') && rawAmountStr.includes('.') && rawAmountStr.indexOf(',') < rawAmountStr.indexOf('.')) {
                 numericAmount = parseFloat(rawAmountStr.replace(/,/g, ''));
            } else if (rawAmountStr.includes('.') && rawAmountStr.includes(',') && rawAmountStr.indexOf('.') < rawAmountStr.indexOf(',')) {
                 // Euro format 1.000,00 -> 1000.00
                 numericAmount = parseFloat(rawAmountStr.replace(/\./g, '').replace(',', '.'));
            }
            // Check Parentheses for negative
            if (rawAmountStr.includes('(') && rawAmountStr.includes(')')) {
                numericAmount = -Math.abs(numericAmount);
            }

            if (currentSign !== 0) {
                numericAmount = Math.abs(numericAmount) * currentSign;
            }

            const rawDesc = cleanLine.replace(dateMatch[0], '').replace(rawAmountStr, '').replace(probableBalance || '', '').replace(/\s+/g, ' ').trim();

            results.push({
                date: parseDateToISO(rawDate),
                description: rawDesc,
                amount: numericAmount,
                balance: probableBalance ? parseFloat(probableBalance.replace(/[^\d.-]/g, '')) : undefined
            });
        } else if (results.length > 0 && !ignoreSection && !cleanLine.match(/Page \d|Balance|Saldo|Continued|Statement|Period|Beginning|Ending|Summary|Total|Account/i)) {
            const lastRes = results[results.length - 1];
            if (cleanLine.length < 150) {
                lastRes.description += " " + cleanLine.replace(/\s+/g, ' ').trim();
            }
        }
    });

    let bankName = "Desconocido";
    if (/Bank of America/i.test(fullText)) {
        bankName = "Bank of America";
    }

    let accountNumber = "0000000000";
    const accMatch = fullText.match(/Account\s*(?:number|#)[:\s]*([0-9\s]{4,20})/i);
    if (accMatch) {
       const digits = accMatch[1].replace(/\s+/g, '');
       accountNumber = digits.match(/.{1,4}/g)?.join(' ') || digits;
    }

    let accountHolder = "Titular Desconocido";
    const accLineIndex = lines.findIndex(l => /Account\s*(?:number|#)/i.test(l));
    if (accLineIndex >= 0) {
        if (lines[accLineIndex].includes('!')) {
            accountHolder = lines[accLineIndex].split('!')[0].trim();
        } else if (accLineIndex + 1 < lines.length) {
            accountHolder = lines[accLineIndex + 1].trim();
        }
    }

    let accountType = "checking";
    if (/Business Advantage|checking/i.test(fullText)) {
        accountType = "checking";
    }

    let periodStart = new Date().toISOString().split('T')[0];
    let periodEnd = new Date().toISOString().split('T')[0];
    const periodMatch = fullText.match(/for\s+(\w+\s+\d+,\s+\d{4})\s+to\s+(\w+\s+\d+,\s+\d{4})/i);
    if (periodMatch) {
       const startD = new Date(periodMatch[1]);
       const endD = new Date(periodMatch[2]);
       if (!isNaN(startD.getTime())) periodStart = startD.toISOString().split('T')[0];
       if (!isNaN(endD.getTime())) periodEnd = endD.toISOString().split('T')[0];
    }

    let beginningBalance = 0;
    const begMatch = fullText.match(/Beginning balance[^$\n]*\$?\s*([\d,]+\.\d{2})/i);
    if (begMatch) {
       beginningBalance = parseFloat(begMatch[1].replace(/,/g, ''));
    }
    console.log('DEBUG beginningBalance:', beginningBalance);

    let endingBalance = 0;
    const endMatch = fullText.match(/Ending balance[^$\n]*\$?\s*([\d,]+\.\d{2})/i);
    if (endMatch) {
       endingBalance = parseFloat(endMatch[1].replace(/,/g, ''));
    }

    return {
        bankName,
        accountNumber,
        accountHolder,
        accountType,
        periodStart,
        periodEnd,
        beginningBalance,
        endingBalance,
        transactions: results
    };
}
