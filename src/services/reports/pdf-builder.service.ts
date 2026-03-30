import PDFDocument from 'pdfkit';
import { CpaSummary } from './cpa-summary.service.ts';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
}

function formatCategory(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildCpaPdf(summary: CpaSummary): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);

    // ── Header ───────────────────────────────────────────────
    doc.fontSize(16).font('Helvetica-Bold').text('ACCOUNT EXPRESS BOOKKEEPING CORE', { align: 'center' });
    doc.fontSize(13).font('Helvetica').text('TAX SUMMARY REPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Metadata ─────────────────────────────────────────────
    doc.fontSize(9).font('Helvetica');
    doc.text(`Company ID   : ${summary.companyId}`);
    doc.text(`Period ID    : ${summary.periodId}`);
    doc.text(`Generated at : ${new Date(summary.hashTimestamp).toLocaleString('en-US')}`);
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(1);

    // ── Tax Categories Table ──────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').text('TAX CATEGORIES SUMMARY');
    doc.moveDown(0.5);

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Category', 50, doc.y, { width: 320, continued: true });
    doc.text('Net Balance', { width: 120, align: 'right', continued: true });
    doc.text('Type', { width: 72, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.3);

    let totalRevenue = 0;
    let totalExpense = 0;

    doc.font('Helvetica').fontSize(9);
    for (const tax of summary.taxes) {
      const label = formatCategory(tax.taxCategory);
      const amount = formatCurrency(tax.totalBalance);
      const type = tax.totalBalance < 0 ? 'Revenue' : 'Expense';

      if (tax.totalBalance < 0) totalRevenue += Math.abs(tax.totalBalance);
      else totalExpense += tax.totalBalance;

      const rowY = doc.y;
      doc.text(label, 50, rowY, { width: 320, continued: true });
      doc.text(amount, { width: 120, align: 'right', continued: true });
      doc.text(type, { width: 72, align: 'right' });
    }

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica-Bold').fontSize(9);
    const t1Y = doc.y;
    doc.text('Total Revenue', 50, t1Y, { width: 320, continued: true });
    doc.text(formatCurrency(totalRevenue), { width: 120, align: 'right', continued: true });
    doc.text('', { width: 72 });

    const t2Y = doc.y;
    doc.text('Total Expenses', 50, t2Y, { width: 320, continued: true });
    doc.text(formatCurrency(totalExpense), { width: 120, align: 'right', continued: true });
    doc.text('', { width: 72 });

    const t3Y = doc.y;
    doc.text('Net Income / (Loss)', 50, t3Y, { width: 320, continued: true });
    doc.text(formatCurrency(totalRevenue - totalExpense), { width: 120, align: 'right', continued: true });
    doc.text('', { width: 72 });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(1);

    // ── Cryptographic Seal ───────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').text('CRYPTOGRAPHIC INTEGRITY SEAL');
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica');
    doc.text('SHA-256 Chain:');
    doc.font('Courier').fontSize(7).text(summary.sha256ChainResult, { lineBreak: true });
    doc.moveDown(0.5);

    if (summary.rfc3161_token_hex) {
      doc.font('Helvetica').fontSize(8).text('RFC 3161 Timestamp Token:');
      doc.font('Courier').fontSize(7).text(summary.rfc3161_token_hex, { lineBreak: true });
    } else {
      doc.font('Helvetica').fontSize(8).text('RFC 3161 Token: Not applied');
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(1);

    // ── Legal Disclaimer ─────────────────────────────────────
    doc.fontSize(11).font('Helvetica-Bold').text('LEGAL DISCLAIMER');
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').text(summary.disclaimer, {
      align: 'justify',
      lineGap: 2,
    });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica-Bold').text('END OF REPORT', { align: 'center' });

    doc.end();
  });
}
