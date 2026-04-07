// ============================================================
// JOURNAL MATH SERVICE
// Validación de partida doble. SRP: solo matemática contable.
// INVARIANT: SUM(debits) MUST equal SUM(credits) to the cent.
// ============================================================

import type { JournalLineInput } from "../lib/journal-types.ts";
import { ValidationError } from "../lib/errors.ts";

export function validateDoubleEntry(lines: JournalLineInput[]): void {
  if (lines.length < 2) {
    throw new ValidationError("Un asiento de diario requiere al menos 2 líneas.");
  }

  let totalDebitsCents  = 0;
  let totalCreditsCents = 0;

  for (const line of lines) {
    if (line.debitAmount < 0 || line.creditAmount < 0) {
      throw new ValidationError("Los montos de línea no pueden ser negativos.");
    }
    if (line.debitAmount > 0 && line.creditAmount > 0) {
      throw new ValidationError(
        `Línea ${line.lineNumber}: una línea no puede ser débito y crédito simultáneamente.`
      );
    }
    if (line.debitAmount === 0 && line.creditAmount === 0) {
      throw new ValidationError(`Línea ${line.lineNumber}: debe tener un monto mayor a cero.`);
    }
    totalDebitsCents  += Math.round(line.debitAmount * 100);
    totalCreditsCents += Math.round(line.creditAmount * 100);
  }

  if (totalDebitsCents !== totalCreditsCents) {
    const roundedDebits  = totalDebitsCents / 100;
    const roundedCredits = totalCreditsCents / 100;
    const diff = Math.abs(roundedDebits - roundedCredits);
    throw new ValidationError(
      `Descuadre de partida doble: débitos=${roundedDebits.toFixed(2)}, créditos=${roundedCredits.toFixed(2)}. Diferencia: ${diff.toFixed(2)}`
    );
  }
}
