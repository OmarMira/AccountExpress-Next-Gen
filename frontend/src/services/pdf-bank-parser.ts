// ============================================================
// PDF BANK PARSER — frontend/src/services/pdf-bank-parser.ts
// Parses bank statement PDFs client-side using pdfjs-dist.
// Supports: BofA, Chase, Wells Fargo, and generic banks.
// Handles: English and Spanish date formats, scanned PDF detection.
// ============================================================
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export interface ParsedBankTransaction {
  date: string;
  description: string;
  amount: number;
  balance?: number;
}

export interface ParsedBankStatement {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  accountType: string;
  periodStart: string;
  periodEnd: string;
  beginningBalance: number;
  endingBalance: number;
  transactions: ParsedBankTransaction[];
}

// ── Date helpers ─────────────────────────────────────────────

const ES_TO_EN: Record<string, string> = {
  ene: 'jan', feb: 'feb', mar: 'mar', abr: 'apr', may: 'may', jun: 'jun',
  jul: 'jul', ago: 'aug', sep: 'sep', set: 'sep', oct: 'oct', nov: 'nov', dic: 'dec',
};

function parseDateToISO(raw: string): string {
  if (!raw) return new Date().toISOString().split('T')[0];
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
    if (c.length === 4) return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  return new Date().toISOString().split('T')[0];
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

// ── Bank name detection ──────────────────────────────────────

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

  // Fallback: try filename hints
  if (filename) {
    const fn = filename.toLowerCase();
    if (fn.includes('chase')) return 'Chase Bank';
    if (fn.includes('bofa') || fn.includes('bankofamerica') || fn.includes('estmt') || fn.includes('stmt')) return 'Bank of America';
    if (fn.includes('wellsfargo') || fn.includes('wf')) return 'Wells Fargo';
    if (fn.includes('citi')) return 'Citibank';
    if (fn.includes('usbank')) return 'US Bank';
    if (fn.includes('pnc')) return 'PNC Bank';
    if (fn.includes('capitalOne') || fn.includes('cap1')) return 'Capital One';
    if (fn.includes('td')) return 'TD Bank';
  }

  // Last resort: look for any "X Bank" or "Bank X" pattern in the first 800 chars
  const snippet = text.substring(0, 800);
  const genericMatch = snippet.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+Bank|Bank\s+of\s+[A-Z][a-zA-Z]+)/);
  if (genericMatch) return genericMatch[0].trim();

  return 'Banco Desconocido';
}

// ── Period extraction (English + Spanish) ───────────────────

function extractPeriod(text: string): { periodStart: string; periodEnd: string } {
  const today = new Date().toISOString().split('T')[0];

  // English: "for January 1, 2024 to January 31, 2024"
  const enMatch = text.match(
    /for\s+(\w+\s+\d{1,2},?\s+\d{4})\s+(?:to|through)\s+(\w+\s+\d{1,2},?\s+\d{4})/i
  );
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

  // English: "Statement Period: 01/01/2024 - 01/31/2024"
  const enDateRange = text.match(
    /(?:statement\s+period|period)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*[-–to]+\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i
  );
  if (enDateRange) {
    return {
      periodStart: parseDateToISO(enDateRange[1]),
      periodEnd: parseDateToISO(enDateRange[2]),
    };
  }

  // Spanish: "Del 01 de enero de 2024 al 31 de enero de 2024"
  const esMatch = text.match(
    /del?\s+(\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{4})\s+al?\s+(\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?\d{4})/i
  );
  if (esMatch) {
    return {
      periodStart: parseDateToISO(esMatch[1]),
      periodEnd: parseDateToISO(esMatch[2]),
    };
  }

  // Spanish short months: "01 ene 2024 - 31 ene 2024"
  const esShortMatch = text.match(
    /(\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?\s+\d{2,4})\s*[-–a]\s*(\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?\s+\d{2,4})/i
  );
  if (esShortMatch) {
    return {
      periodStart: parseDateToISO(esShortMatch[1]),
      periodEnd: parseDateToISO(esShortMatch[2]),
    };
  }

  // Generic: two dates separated by " - " or " to " or " al "
  const genericRange = text.match(
    /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*[-–]\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/
  );
  if (genericRange) {
    return {
      periodStart: parseDateToISO(genericRange[1]),
      periodEnd: parseDateToISO(genericRange[2]),
    };
  }

  return { periodStart: today, periodEnd: today };
}

// ── Account holder extraction ────────────────────────────────

function extractAccountHolder(text: string): string {
  // "Primary account holder: John Smith" / "Account owner: ..."
  const patterns = [
    /primary\s+account\s+holder[:\s]+([A-Z][A-Za-z\s,.-]{2,50})/i,
    /account\s+(?:owner|holder)[:\s]+([A-Z][A-Za-z\s,.-]{2,50})/i,
    /name[:\s]+([A-Z][A-Z\s]{4,40})\n/,      // ALL CAPS name block
    /prepared\s+for[:\s]+([A-Z][A-Za-z\s,.-]{2,50})/i,
    /customer\s+(?:name)?[:\s]+([A-Z][A-Za-z\s,.-]{2,50})/i,
    /titular[:\s]+([A-Z][A-Za-z\s,.-]{2,50})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const candidate = m[1].replace(/\n.*/s, '').trim();
      // Sanity: at least 2 words, no digits, max 50 chars
      if (/^[A-Za-z]/.test(candidate) && candidate.length <= 50 && !/\d/.test(candidate)) {
        return candidate.replace(/\s+/g, ' ').trim();
      }
    }
  }
  return 'Titular';
}

// ── Main parser ──────────────────────────────────────────────

export async function parseBankPDF(file: File): Promise<ParsedBankStatement> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lines: string[] = [];
  let totalTextItems = 0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as any[];
    totalTextItems += items.length;

    const rowMap = new Map<number, string>();
    for (const item of items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      rowMap.set(y, (rowMap.get(y) ?? '') + ' ' + item.str);
    }
    const sorted = [...rowMap.entries()].sort((a, b) => b[0] - a[0]);
    sorted.forEach(([, text]) => lines.push(text.trim()));
  }

  // Scanned PDF guard: if barely any text was extracted, warn clearly.
  if (totalTextItems < 20) {
    throw new Error(
      'Este PDF parece ser una imagen escaneada (se detectaron menos de 20 elementos de texto). ' +
      'Por favor use un PDF con texto seleccionable o exporte el estado de cuenta directamente desde su banco.'
    );
  }

  const fullText = lines.join('\n');

  // ── Year context ────────────────────────────────────────────
  const yearMatches = fullText.match(/\b20[2-9]\d\b/g) ?? [];
  const years = [...new Set(yearMatches)].sort().map(Number);
  const primaryYear = years.at(-1) ?? new Date().getFullYear();

  // ── Regex patterns ──────────────────────────────────────────
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

  // ── Transaction parsing ──────────────────────────────────────
  const transactions: ParsedBankTransaction[] = [];
  let currentSign = 0;
  let ignoreSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
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
      let rawDate = dateMatch[0].trim();
      // Short date without year: MM/DD or MM-DD
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

      transactions.push({ date: parseDateToISO(rawDate), description, amount, balance });
    } else if (transactions.length > 0 && !ignoreSection && line.length < 150) {
      if (!/Page\s+\d|Balance|Saldo|Statement|Period|Account/i.test(line)) {
        transactions[transactions.length - 1].description += ' ' + line;
      }
    }
  }

  // ── Metadata extraction ──────────────────────────────────────
  const bankName = detectBankName(fullText, file.name);

  const accMatch = fullText.match(/[Aa]ccount\s*(?:number|#|no\.?)[:\s]*([0-9Xx*\s]{4,25})/i);
  const accountNumber = accMatch
    ? accMatch[1].replace(/\s+/g, '').replace(/.(?=.{4})/g, '*').trim()
    : '0000';

  const { periodStart, periodEnd } = extractPeriod(fullText);

  const begMatch = fullText.match(
    /[Bb]eginning\s+balance[^$\n\d]*\$?\s*([\d,]+\.\d{2})|[Ss]aldo\s+(?:inicial|anterior)[^$\n\d]*\$?\s*([\d,]+\.\d{2})/i
  );
  const endMatch = fullText.match(
    /[Ee]nding\s+balance[^$\n\d]*\$?\s*([\d,]+\.\d{2})|[Ss]aldo\s+final[^$\n\d]*\$?\s*([\d,]+\.\d{2})/i
  );

  const beginningBalance = begMatch
    ? parseFloat((begMatch[1] ?? begMatch[2] ?? '0').replace(/,/g, ''))
    : 0;
  const endingBalance = endMatch
    ? parseFloat((endMatch[1] ?? endMatch[2] ?? '0').replace(/,/g, ''))
    : 0;

  const accountHolder = extractAccountHolder(fullText);

  return {
    bankName,
    accountNumber,
    accountHolder,
    accountType: 'checking',
    periodStart,
    periodEnd,
    beginningBalance,
    endingBalance,
    transactions,
  };
}
