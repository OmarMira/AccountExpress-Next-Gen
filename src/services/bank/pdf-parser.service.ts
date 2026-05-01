// src/services/bank/pdf-parser.service.ts
// Parser PDF ejecutado exclusivamente en el backend.
// Usa pdf-parse — librería diseñada para Node.js, sin dependencias de browser/Worker API.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }> = require('pdf-parse');

export interface ParsedTransaction {
    date: string;        // formato YYYY-MM-DD
    description: string; // mínimo 1 caracter, máximo 500
    amount: number;      // distinto de 0
    balance?: number;
}

export interface PdfParseResult {
    transactions: ParsedTransaction[];
    totalRows: number;
    rejectedRows: number;
    rejectedReasons: string[];
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    accountType: string;
    periodStart: string;
    periodEnd: string;
    beginningBalance: number;
    endingBalance: number;
}

// ── Date helpers ──────────────────────────────────────────────

const ES_TO_EN: Record<string, string> = {
    ene: 'jan', feb: 'feb', mar: 'mar', abr: 'apr', may: 'may', jun: 'jun',
    jul: 'jul', ago: 'aug', sep: 'sep', set: 'sep', oct: 'oct', nov: 'nov', dic: 'dec',
};

function parseDateToISO(raw: string): string | null {
    if (!raw) return null;
    const cleaned = raw.replace(/de\s*/gi, '').replace(/,/g, '').trim();
    let normalized = cleaned.toLowerCase();
    for (const [es, en] of Object.entries(ES_TO_EN)) {
        normalized = normalized.replace(new RegExp(`\\b${es}\\b`, 'g'), en);
    }
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

    // MM/DD/YYYY or MM-DD-YYYY
    const parts = raw.split(/[-/]/);
    if (parts.length === 3) {
        let [a, b, c] = parts;
        if (c.length === 2) c = `20${c}`;
        if (c.length === 4) {
            return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
        }
    }
    return null;
}

function parseAmount(raw: string): number {
    const isNeg = raw.includes('(') && raw.includes(')');
    const s = raw.replace(/[()$€£\s]/g, '');
    let num: number;
    if (s.includes(',') && s.includes('.') && s.indexOf(',') < s.indexOf('.')) {
        num = parseFloat(s.replace(/,/g, ''));
    } else if (s.includes('.') && s.includes(',') && s.indexOf('.') < s.indexOf(',')) {
        num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    } else {
        num = parseFloat(s.replace(/,/g, ''));
    }
    return isNeg ? -Math.abs(num) : num;
}

// ── Bank name detection ───────────────────────────────────────

function detectBankName(text: string, filename?: string): string {
    if (/Bank\s+of\s+America/i.test(text)) return 'Bank of America';
    if (/Chase/i.test(text)) return 'Chase Bank';
    if (/Wells\s+Fargo/i.test(text)) return 'Wells Fargo';
    if (/Citibank|Citi\s+Bank/i.test(text)) return 'Citibank';
    if (/TD\s+Bank/i.test(text)) return 'TD Bank';
    if (/US\s+Bank|USBank/i.test(text)) return 'US Bank';
    if (/PNC\s+Bank/i.test(text)) return 'PNC Bank';
    if (/Capital\s+One/i.test(text)) return 'Capital One';
    if (/Truist/i.test(text)) return 'Truist';
    if (/Regions\s+Bank/i.test(text)) return 'Regions Bank';
    if (/SunTrust/i.test(text)) return 'SunTrust';
    if (/KeyBank/i.test(text)) return 'KeyBank';
    if (/Fifth\s+Third/i.test(text)) return 'Fifth Third Bank';
    if (/Huntington/i.test(text)) return 'Huntington Bank';
    if (/Santander/i.test(text)) return 'Santander';
    if (/HSBC/i.test(text)) return 'HSBC';

    if (filename) {
        const fn = filename.toLowerCase();
        if (fn.includes('chase')) return 'Chase Bank';
        if (fn.includes('bofa') || fn.includes('bankofamerica') || fn.includes('estmt') || fn.includes('stmt')) return 'Bank of America';
        if (fn.includes('wellsfargo') || fn.includes('wf')) return 'Wells Fargo';
        if (fn.includes('citi')) return 'Citibank';
    }

    const snippet = text.substring(0, 800);
    const genericMatch = snippet.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+Bank|Bank\s+of\s+[A-Z][a-zA-Z]+)/);
    if (genericMatch) return genericMatch[0].trim();

    return 'Banco Desconocido';
}

// ── Period extraction ─────────────────────────────────────────

function extractPeriod(text: string): { periodStart: string; periodEnd: string } {
    const today = new Date().toISOString().split('T')[0];

    const enMatch = text.match(/for\s+(\w+\s+\d{1,2},?\s+\d{4})\s+(?:to|through)\s+(\w+\s+\d{1,2},?\s+\d{4})/i);
    if (enMatch) {
        const s = new Date(enMatch[1]);
        const e = new Date(enMatch[2]);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
            return {
                periodStart: s.toISOString().split('T')[0],
                periodEnd: e.toISOString().split('T')[0],
            };
        }
    }

    const enDateRange = text.match(/(?:statement\s+period|period)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*[-–to]+\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
    if (enDateRange) {
        const s = parseDateToISO(enDateRange[1]);
        const e = parseDateToISO(enDateRange[2]);
        if (s && e) return { periodStart: s, periodEnd: e };
    }

    const esMatch = text.match(/del?\s+(\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{4})\s+al?\s+(\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{4})/i);
    if (esMatch) {
        const s = parseDateToISO(esMatch[1]);
        const e = parseDateToISO(esMatch[2]);
        if (s && e) return { periodStart: s, periodEnd: e };
    }

    return { periodStart: today, periodEnd: today };
}

function extractAccountHolder(text: string): string {
    const patterns = [
        /primary\s+account\s+holder[:\s]+([A-Z][A-Za-z\s,.-]{2,50})/i,
        /account\s+(?:owner|holder)[:\s]+([A-Z][A-Za-z\s,.-]{2,50})/i,
        /prepared\s+for[:\s]+([A-Z][A-Za-z\s,.-]{2,50})/i,
        /titular[:\s]+([A-Z][A-Za-z\s,.-]{2,50})/i,
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m) {
            const candidate = m[1].replace(/\n.*/s, '').trim();
            if (/^[A-Za-z]/.test(candidate) && candidate.length <= 50 && !/\d/.test(candidate)) {
                return candidate.replace(/\s+/g, ' ').trim();
            }
        }
    }
    return 'Titular';
}

// ── Main parser ───────────────────────────────────────────────

export async function parseBankPdf(buffer: ArrayBuffer, filename?: string): Promise<PdfParseResult> {
    // pdf-parse acepta un Buffer de Node.js directamente — sin workers, sin browser API
    const data = await pdfParse(Buffer.from(buffer));

    if (!data.text || data.text.trim().length < 50) {
        throw new Error(
            'Este PDF parece ser una imagen escaneada (no se encontró texto seleccionable). ' +
            'Por favor use un PDF con texto seleccionable.'
        );
    }

    // Dividir el texto en líneas para procesar transacciones
    const lines = data.text
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    const fullText = data.text;

    const yearMatches = fullText.match(/\b20[2-9]\d\b/g) ?? [];
    const years = [...new Set(yearMatches)].sort().map(Number);
    const primaryYear = years.at(-1) ?? new Date().getFullYear();

    const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ene|Abr|Ago|Dic|Set|' +
        'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';
    const dateRe = new RegExp(
        `(\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4})|` +
        `(\\d{4}[/\\-]\\d{1,2}[/\\-]\\d{1,2})|` +
        `((?:${months})[a-z]*\\.?\\s\\d{1,2},?\\s\\d{2,4})|` +
        `(\\d{1,2}\\s+(?:de\\s+)?(?:${months})[a-z]*\\.?,?\\s+\\d{2,4})|` +
        `(^\\d{1,2}[/\\-]\\d{1,2})(?=\\s)`, 'i'
    );
    const amountRe = /(\(?[-]?\s?[$€£]?\s?[\d,.]+[.,]\d{2}\)?)/g;

    const transactions: ParsedTransaction[] = [];
    const rejectedReasons: string[] = [];
    let totalRowsProcessed = 0;
    let currentSign = 0;
    let ignoreSection = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (/^(Deposits|Credits|Additions|Depositos|Abonos)/i.test(line) && line.length < 60) {
            currentSign = 1; ignoreSection = false; continue;
        }
        if (/^(Withdrawals|Debits|Checks|Payments|Retiros|Cargos|Service\s+fee)/i.test(line) && line.length < 60) {
            currentSign = -1; ignoreSection = false; continue;
        }
        if (/^(Summary|Daily\s+ledger|Account\s+summary|Daily\s+balance)/i.test(line)) {
            ignoreSection = true; continue;
        }
        if (ignoreSection) continue;
        if (/Page\s+\d|^Balance|^Saldo|Continued|^Statement|^Period|^Beginning|^Ending|^Total/i.test(line)) continue;

        const dateMatch = line.match(dateRe);
        const amounts = line.match(amountRe);

        if (dateMatch && amounts) {
            totalRowsProcessed++;
            let rawDate = dateMatch[0].trim();
            if (/^\d{1,2}[/\-]\d{1,2}$/.test(rawDate)) {
                const [m] = rawDate.split(/[/\-]/);
                const mo = parseInt(m, 10);
                let yr = primaryYear;
                if (years.length >= 2 && mo > 10) yr = years[0];
                rawDate = `${rawDate}/${yr}`;
            }

            const rawAmt = amounts[0];
            const balance = amounts.length > 1 ? parseAmount(amounts[amounts.length - 1]) : undefined;
            let amount = parseAmount(rawAmt);
            if (currentSign !== 0) amount = Math.abs(amount) * currentSign;

            const description = line
                .replace(dateMatch[0], '')
                .replace(rawAmt, '')
                .replace(balance !== undefined ? amounts[amounts.length - 1] : '', '')
                .replace(/\s+/g, ' ').trim();

            const isoDate = parseDateToISO(rawDate);

            if (!isoDate) {
                rejectedReasons.push(`Fila ${i + 1}: fecha inválida "${rawDate}"`);
                continue;
            }
            if (isNaN(amount) || amount === 0) {
                rejectedReasons.push(`Fila ${i + 1}: monto inválido "${rawAmt}"`);
                continue;
            }
            if (!description || description.trim().length === 0) {
                rejectedReasons.push(`Fila ${i + 1}: descripción vacía`);
                continue;
            }

            transactions.push({ date: isoDate, description, amount, balance });
        } else if (transactions.length > 0 && !ignoreSection && line.length < 150) {
            if (!/Page\s+\d|Balance|Saldo|Statement|Period|Account/i.test(line)) {
                transactions[transactions.length - 1].description += ' ' + line;
            }
        }
    }

    const { periodStart, periodEnd } = extractPeriod(fullText);
    const bankName = detectBankName(fullText, filename);
    const accMatch = fullText.match(/[Aa]ccount\s*(?:number|#|no\.?)[:\s]*([0-9Xx*\s]{4,25})/i);
    const accountNumber = accMatch
        ? accMatch[1].replace(/\s+/g, '').replace(/.(?=.{4})/g, '*').trim()
        : '0000';

    const begMatch = fullText.match(/[Bb]eginning\s+balance[^\n]*?\$\s*([\d,]+\.\d{2})|[Ss]aldo\s+(?:inicial|anterior)[^\n]*?[$€]\s*([\d,]+\.\d{2})/i);
    const endMatch = fullText.match(/[Ee]nding\s+balance[^\n]*?\$\s*([\d,]+\.\d{2})|[Ss]aldo\s+final[^\n]*?[$€]\s*([\d,]+\.\d{2})/i);

    const beginningBalance = begMatch ? parseFloat((begMatch[1] ?? begMatch[2] ?? '0').replace(/,/g, '')) : 0;
    const endingBalance = endMatch ? parseFloat((endMatch[1] ?? endMatch[2] ?? '0').replace(/,/g, '')) : 0;

    return {
        transactions,
        totalRows: totalRowsProcessed,
        rejectedRows: rejectedReasons.length,
        rejectedReasons,
        bankName,
        accountNumber,
        accountHolder: extractAccountHolder(fullText),
        accountType: 'checking',
        periodStart,
        periodEnd,
        beginningBalance,
        endingBalance,
    };
}
