import { describe, it, expect } from "vitest";
import { validateDoubleEntry } from "../../src/services/journal-math.service.ts";
import { ValidationError } from "../../src/services/journal.service.ts";

describe("validateDoubleEntry", () => {
  // ── SHOULD PASS ──────────────────────────────────────────────

  it("Balanced entry: 1000 debit = 1000 credit", () => {
    expect(() => 
      validateDoubleEntry([
        { accountId: "1010", debitAmount: 1000, creditAmount: 0, description: null, lineNumber: 1 },
        { accountId: "4010", debitAmount: 0, creditAmount: 1000, description: null, lineNumber: 2 },
      ])
    ).not.toThrow();
  });

  it("Balanced multi-line: 500+500 debit = 1000 credit", () => {
    expect(() => 
      validateDoubleEntry([
        { accountId: "5110", debitAmount: 500,  creditAmount: 0, description: null, lineNumber: 1 },
        { accountId: "5120", debitAmount: 500,  creditAmount: 0, description: null, lineNumber: 2 },
        { accountId: "1010", debitAmount: 0,    creditAmount: 1000, description: null, lineNumber: 3 },
      ])
    ).not.toThrow();
  });

  it("Balanced with cents: 100.50 debit = 100.50 credit", () => {
    expect(() => 
      validateDoubleEntry([
        { accountId: "5190", debitAmount: 100.50, creditAmount: 0,      description: null, lineNumber: 1 },
        { accountId: "1010", debitAmount: 0,      creditAmount: 100.50, description: null, lineNumber: 2 },
      ])
    ).not.toThrow();
  });

  // ── SHOULD FAIL ──────────────────────────────────────────────

  it("Rejects imbalanced: 1000 debit ≠ 900 credit", () => {
    expect(() => 
      validateDoubleEntry([
        { accountId: "1010", debitAmount: 1000, creditAmount: 0, description: null, lineNumber: 1 },
        { accountId: "4010", debitAmount: 0,    creditAmount: 900, description: null, lineNumber: 2 },
      ])
    ).toThrow(ValidationError);
  });

  it("Rejects zero-amount lines", () => {
    expect(() => 
      validateDoubleEntry([
        { accountId: "1010", debitAmount: 0, creditAmount: 0, description: null, lineNumber: 1 },
        { accountId: "4010", debitAmount: 0, creditAmount: 0, description: null, lineNumber: 2 },
      ])
    ).toThrow(ValidationError);
  });

  it("Rejects line that is both debit and credit", () => {
    expect(() => 
      validateDoubleEntry([
        { accountId: "1010", debitAmount: 500, creditAmount: 500, description: null, lineNumber: 1 },
        { accountId: "4010", debitAmount: 0,   creditAmount: 0,   description: null, lineNumber: 2 },
      ])
    ).toThrow(ValidationError);
  });

  it("Rejects single-line entry", () => {
    expect(() => 
      validateDoubleEntry([
        { accountId: "1010", debitAmount: 500, creditAmount: 0, description: null, lineNumber: 1 },
      ])
    ).toThrow(ValidationError);
  });
});
