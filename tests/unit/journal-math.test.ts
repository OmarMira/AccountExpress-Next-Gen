import { describe, it, expect } from 'vitest';
import { validateDoubleEntry } from '../../src/services/journal-math.service';
import type { JournalLineInput } from '../../src/lib/journal-types';
import fc from 'fast-check';

describe('journal-math.service', () => {
  it('should accept balanced entries', () => {
    const lines: JournalLineInput[] = [
      { accountId: 'a', debitAmount: 100, creditAmount: 0, lineNumber: 1, description: null },
      { accountId: 'b', debitAmount: 0, creditAmount: 100, lineNumber: 2, description: null }
    ];
    expect(() => validateDoubleEntry(lines)).not.toThrow();
  });

  it('should reject unbalanced entries', () => {
    const lines: JournalLineInput[] = [
      { accountId: 'a', debitAmount: 100, creditAmount: 0, lineNumber: 1, description: null },
      { accountId: 'b', debitAmount: 50, creditAmount: 0, lineNumber: 2, description: null }
    ];
    expect(() => validateDoubleEntry(lines)).toThrow('Descuadre');
  });

  it('should reject entries with less than 2 lines', () => {
    const lines: JournalLineInput[] = [
      { accountId: 'a', debitAmount: 100, creditAmount: 0, lineNumber: 1, description: null }
    ];
    expect(() => validateDoubleEntry(lines)).toThrow('al menos 2 líneas');
  });

  it('should reject entries with debit and credit in same line', () => {
    const lines: JournalLineInput[] = [
      { accountId: 'a', debitAmount: 100, creditAmount: 100, lineNumber: 1, description: null },
      { accountId: 'b', debitAmount: 0, creditAmount: 0, lineNumber: 2, description: null }
    ];
    expect(() => validateDoubleEntry(lines)).toThrow('no puede ser débito y crédito');
  });

  it('property: total debits === total credits for any random balanced amounts', () => {
    fc.assert(
      fc.property(fc.nat(1000000), (amt) => {
        const amount = amt / 100;
        if (amount <= 0) return true; // skip zero
        const lines: JournalLineInput[] = [
          { accountId: 'acc1', debitAmount: amount, creditAmount: 0, lineNumber: 1, description: null },
          { accountId: 'acc2', debitAmount: 0, creditAmount: amount, lineNumber: 2, description: null }
        ];
        expect(() => validateDoubleEntry(lines)).not.toThrow();
      })
    );
  });
});
