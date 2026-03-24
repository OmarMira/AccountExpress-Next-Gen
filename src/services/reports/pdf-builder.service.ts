// ============================================================
// PDF BUILDER SERVICE
// Genera el Tax Summary PDF para entrega al CPA.
// SRP: solo construcción del documento PDF.
// Input: CpaSummary de cpa-summary.service.ts
// Output: Buffer PDF listo para descarga
// ============================================================

import { CpaSummary } from "./cpa-summary.service.ts";

// ── Helpers de formato ───────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
}

function formatCategory(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Builder principal ────────────────────────────────────────

export function buildCpaPdf(summary: CpaSummary): Uint8Array {
  const lines: string[] = [];

  // ── Encabezado ───────────────────────────────────────────
  lines.push("ACCOUNT EXPRESS BOOKKEEPING CORE");
  lines.push("TAX SUMMARY REPORT");
  lines.push("─".repeat(60));
  lines.push(`Company ID   : ${summary.companyId}`);
  lines.push(`Period ID    : ${summary.periodId}`);
  lines.push(`Generated at : ${new Date(summary.hashTimestamp).toLocaleString("en-US")}`);
  lines.push("─".repeat(60));

  // ── Tabla de categorías fiscales ─────────────────────────
  lines.push("");
  lines.push("TAX CATEGORIES SUMMARY");
  lines.push("");
  lines.push(
    "Category".padEnd(35) +
    "Net Balance".padStart(20)
  );
  lines.push("─".repeat(55));

  let totalRevenue = 0;
  let totalExpense = 0;

  for (const tax of summary.taxes) {
    const label = formatCategory(tax.taxCategory).padEnd(35);
    const amount = formatCurrency(tax.totalBalance).padStart(20);
    const sign = tax.totalBalance < 0 ? " (Revenue)" : " (Expense)";
    lines.push(label + amount + sign);

    if (tax.totalBalance < 0) totalRevenue += Math.abs(tax.totalBalance);
    else totalExpense += tax.totalBalance;
  }

  lines.push("─".repeat(55));
  lines.push(
    "Total Revenue".padEnd(35) +
    formatCurrency(totalRevenue).padStart(20)
  );
  lines.push(
    "Total Expenses".padEnd(35) +
    formatCurrency(totalExpense).padStart(20)
  );
  lines.push(
    "Net Income / (Loss)".padEnd(35) +
    formatCurrency(totalRevenue - totalExpense).padStart(20)
  );

  // ── Sello criptográfico ──────────────────────────────────
  lines.push("");
  lines.push("─".repeat(60));
  lines.push("CRYPTOGRAPHIC INTEGRITY SEAL");
  lines.push("");
  lines.push("SHA-256 Chain:");
  lines.push(summary.sha256ChainResult);
  lines.push("");

  if (summary.rfc3161_token_hex) {
    lines.push("RFC 3161 Timestamp Token:");
    lines.push(summary.rfc3161_token_hex);
    lines.push("");
  } else {
    lines.push("RFC 3161 Token: Not applied");
    lines.push("");
  }

  // ── Disclaimer legal ─────────────────────────────────────
  lines.push("─".repeat(60));
  lines.push("LEGAL DISCLAIMER");
  lines.push("");

  // Wrap del disclaimer a 60 caracteres por línea
  const words = summary.disclaimer.split(" ");
  let currentLine = "";
  for (const word of words) {
    if ((currentLine + " " + word).trim().length > 60) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = (currentLine + " " + word).trim();
    }
  }
  if (currentLine) lines.push(currentLine.trim());

  lines.push("");
  lines.push("─".repeat(60));
  lines.push("END OF REPORT");

  // ── Convertir a bytes ────────────────────────────────────
  // Genera un PDF texto plano embebido en estructura PDF mínima
  const content = lines.join("\n");
  return buildMinimalPdf(content);
}

// ── Estructura PDF mínima (sin dependencias externas) ────────

function buildMinimalPdf(text: string): Uint8Array {
  const escapedLines = text
    .split("\n")
    .map((line) =>
      line
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
    );

  // Cada línea como operación Tj en PDF
  const pdfLines = escapedLines.map(
    (line, i) => `BT /F1 9 Tf 40 ${780 - i * 13} Td (${line}) Tj ET`
  );

  const streamContent = pdfLines.join("\n");
  const streamLength = new TextEncoder().encode(streamContent).length;

  const pdf = [
    "%PDF-1.4",
    "1 0 obj",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "endobj",
    "2 0 obj",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "endobj",
    "3 0 obj",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]",
    "   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "endobj",
    "4 0 obj",
    `<< /Length ${streamLength} >>`,
    "stream",
    streamContent,
    "endstream",
    "endobj",
    "5 0 obj",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    "endobj",
    "xref",
    "0 6",
    "0000000000 65535 f",
    "trailer",
    "<< /Size 6 /Root 1 0 R >>",
    "startxref",
    "0",
    "%%EOF",
  ].join("\n");

  return new TextEncoder().encode(pdf);
}
