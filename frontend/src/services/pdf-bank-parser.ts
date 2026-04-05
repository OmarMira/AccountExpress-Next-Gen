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

function parseDateToISO(raw: string): string {
  const cleaned = raw.replace(/de\s*/gi, '').replace(/,/g, '').trim();
  const esToEn: Record<string, string> = {
    ene: 'jan', feb: 'feb', mar: 'mar', abr: 'apr', may: 'may', jun: 'jun',
    jul: 'jul', ago: 'aug', sep: 'sep', set: 'sep', oct: 'oct', nov: 'nov', dic: 'dec'
  };
  let normalized = cleaned.toLowerCase();
  for (const [es, en] of Object.entries(esToEn)) {
    normalized = normalized.replace(new RegExp(es, 'g'), en);
  }
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  const parts = raw.split(/[-/]/);
  if (parts.length === 3) {
    let [a, b, c] = parts;
    if (c.length === 2) c = `20${c}`;
    if (c.length === 4) return `${c}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
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

export async function parseBankPDF(file: File): Promise<ParsedBankStatement> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as any[];
    const rowMap = new Map<number, string>();
    for (const item of items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      rowMap.set(y, (rowMap.get(y) ?? '') + ' ' + item.str);
    }
    const sorted = [...rowMap.entries()].sort((a, b) => b[0] - a[0]);
    sorted.forEach(([, text]) => lines.push(text.trim()));
  }

  const fullText = lines.join('\n');
  const yearMatches = fullText.match(/\b20[2-9]\d\b/g) ?? [];
  const years = [...new Set(yearMatches)].sort().map(Number);
  const primaryYear = years.at(-1) ?? new Date().getFullYear();

  const months = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Ene|Abr|Ago|Dic|Set';
  const dateRe = new RegExp(
    `(\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4})|` +
    `(\\d{4}[/\\-]\\d{1,2}[/\\-]\\d{1,2})|` +
    `((?:${months})[a-z]*\\.?\\s\\d{1,2},?\\s\\d{2,4})|` +
    `(\\d{1,2}\\s+(?:de\\s+)?(?:${months})[a-z]*\\.?,?\\s+\\d{2,4})|` +
    `(^\\d{1,2}[/\\-]\\d{1,2})(?=\\s)`, 'i'
  );
  const amountRe = /(\(?[-]?\s?[$€£]?\s?[\d,.]+[.,]\d{2}\)?)/g;

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
      if (/^\d{1,2}[/\-]\d{1,2}$/.test(rawDate)) {
        const [m, d] = rawDate.split(/[/\-]/);
        const mo = parseInt(m, 10);
        let yr = primaryYear;
        if (years.length >= 2 && mo > 10) yr = years[0];
        rawDate = `${m}/${d}/${yr}`;
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

  const bankName = /Bank\s+of\s+America/i.test(fullText) ? 'Bank of America'
    : /Chase/i.test(fullText) ? 'Chase Bank'
    : /Wells\s+Fargo/i.test(fullText) ? 'Wells Fargo'
    : 'Banco Desconocido';

  const accMatch = fullText.match(/Account\s*(?:number|#)[:\s]*([0-9\s]{4,20})/i);
  const accountNumber = accMatch ? accMatch[1].replace(/\s+/g, '').replace(/.{4}(?=.)/g, '$& ').trim() : '0000';

  const periodMatch = fullText.match(/for\s+(\w+\s+\d+,\s+\d{4})\s+to\s+(\w+\s+\d+,\s+\d{4})/i);
  const periodStart = periodMatch ? new Date(periodMatch[1]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  const periodEnd = periodMatch ? new Date(periodMatch[2]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  const begMatch = fullText.match(/Beginning\s+balance[^$\n]*\$?\s*([\d,]+\.\d{2})/i);
  const endMatch = fullText.match(/Ending\s+balance[^$\n]*\$?\s*([\d,]+\.\d{2})/i);

  return {
    bankName,
    accountNumber,
    accountHolder: 'Titular',
    accountType: 'checking',
    periodStart,
    periodEnd,
    beginningBalance: begMatch ? parseFloat(begMatch[1].replace(/,/g, '')) : 0,
    endingBalance: endMatch ? parseFloat(endMatch[1].replace(/,/g, '')) : 0,
    transactions,
  };
}
