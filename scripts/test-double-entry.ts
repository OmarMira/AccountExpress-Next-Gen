// Usar base de datos de test, NUNCA la de produccion
process.env.DATABASE_PATH = "./data/test.db";
// ============================================================
// TEST: DOUBLE-ENTRY VALIDATION
// Verifies that the journal service correctly rejects imbalanced entries.
// ============================================================

import { validateDoubleEntry, ValidationError } from "../src/services/journal.service.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ FAIL: ${name}`);
    console.log(`     Error: ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

console.log("\n═══════════════════════════════════════════════");
console.log("  Test: Double-Entry Validation");
console.log("═══════════════════════════════════════════════\n");

// ── SHOULD PASS ──────────────────────────────────────────────

test("Balanced entry: 1000 debit = 1000 credit", () => {
  validateDoubleEntry([
    { accountId: "1010", debitAmount: 1000, creditAmount: 0, description: null, lineNumber: 1 },
    { accountId: "4010", debitAmount: 0, creditAmount: 1000, description: null, lineNumber: 2 },
  ]);
});

test("Balanced multi-line: 500+500 debit = 1000 credit", () => {
  validateDoubleEntry([
    { accountId: "5110", debitAmount: 500,  creditAmount: 0, description: null, lineNumber: 1 },
    { accountId: "5120", debitAmount: 500,  creditAmount: 0, description: null, lineNumber: 2 },
    { accountId: "1010", debitAmount: 0,    creditAmount: 1000, description: null, lineNumber: 3 },
  ]);
});

test("Balanced with cents: 100.50 debit = 100.50 credit", () => {
  validateDoubleEntry([
    { accountId: "5190", debitAmount: 100.50, creditAmount: 0,      description: null, lineNumber: 1 },
    { accountId: "1010", debitAmount: 0,      creditAmount: 100.50, description: null, lineNumber: 2 },
  ]);
});

// ── SHOULD FAIL ──────────────────────────────────────────────

test("Rejects imbalanced: 1000 debit ≠ 900 credit", () => {
  let threw = false;
  try {
    validateDoubleEntry([
      { accountId: "1010", debitAmount: 1000, creditAmount: 0, description: null, lineNumber: 1 },
      { accountId: "4010", debitAmount: 0,    creditAmount: 900, description: null, lineNumber: 2 },
    ]);
  } catch (e) {
    if (e instanceof ValidationError) threw = true;
  }
  expect(threw, "Should have thrown ValidationError for imbalanced entry");
});

test("Rejects zero-amount lines", () => {
  let threw = false;
  try {
    validateDoubleEntry([
      { accountId: "1010", debitAmount: 0, creditAmount: 0, description: null, lineNumber: 1 },
      { accountId: "4010", debitAmount: 0, creditAmount: 0, description: null, lineNumber: 2 },
    ]);
  } catch (e) {
    if (e instanceof ValidationError) threw = true;
  }
  expect(threw, "Should have thrown ValidationError for zero-amount line");
});

test("Rejects line that is both debit and credit", () => {
  let threw = false;
  try {
    validateDoubleEntry([
      { accountId: "1010", debitAmount: 500, creditAmount: 500, description: null, lineNumber: 1 },
      { accountId: "4010", debitAmount: 0,   creditAmount: 0,   description: null, lineNumber: 2 },
    ]);
  } catch (e) {
    if (e instanceof ValidationError) threw = true;
  }
  expect(threw, "Should have thrown ValidationError for dual debit+credit line");
});

test("Rejects single-line entry", () => {
  let threw = false;
  try {
    validateDoubleEntry([
      { accountId: "1010", debitAmount: 500, creditAmount: 0, description: null, lineNumber: 1 },
    ]);
  } catch (e) {
    if (e instanceof ValidationError) threw = true;
  }
  expect(threw, "Should have thrown ValidationError for single-line entry");
});

// ── RESULTS ──────────────────────────────────────────────────
console.log(`\n  Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("  ❌ Some tests failed!");
  process.exit(1);
} else {
  console.log("  ✅ All double-entry validation tests passed!\n");
}
