// Usar base de datos de test, NUNCA la de produccion
process.env.DATABASE_PATH = "./data/test.db";
// ============================================================
// TEST: AUDIT CHAIN INTEGRITY
// Verifies SHA-256 chain creation and immutability trigger.
// ============================================================

// Set test DB path
process.env["DATABASE_PATH"] = "./data/test-audit.db";
process.env["APP_NAME"] = "Test Suite";

import { rawDb } from "../src/db/connection.ts";
import { runMigrations } from "../src/db/migrate.ts";
import { createAuditEntry, verifyAuditChain } from "../src/services/audit.service.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => {
        console.log(`  ✅ PASS: ${name}`);
        passed++;
      }).catch((e) => {
        console.log(`  ❌ FAIL: ${name} — ${e instanceof Error ? e.message : e}`);
        failed++;
      });
    } else {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    }
  } catch (e) {
    console.log(`  ❌ FAIL: ${name} — ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

console.log("\n═══════════════════════════════════════════════");
console.log("  Test: Audit Chain Integrity");
console.log("═══════════════════════════════════════════════\n");

// Setup
runMigrations();

// Clean slate
rawDb.exec("DELETE FROM audit_logs");

// Test 1: Empty chain is valid
test("Empty chain is valid", () => {
  const result = verifyAuditChain();
  if (!result.valid) throw new Error(`Expected valid, got: ${result.message}`);
  if (result.totalEntries !== 0) throw new Error("Expected 0 entries");
});

// Test 2: Create 3 entries and verify chain
test("Three chained entries are verifiable", () => {
  createAuditEntry({ companyId: null, userId: null, sessionId: null, action: "test:create", module: "test", entityType: "test", entityId: "1", beforeState: null, afterState: { n: 1 }, ipAddress: "127.0.0.1" });
  createAuditEntry({ companyId: null, userId: null, sessionId: null, action: "test:update", module: "test", entityType: "test", entityId: "1", beforeState: { n: 1 }, afterState: { n: 2 }, ipAddress: "127.0.0.1" });
  createAuditEntry({ companyId: null, userId: null, sessionId: null, action: "test:delete", module: "test", entityType: "test", entityId: "1", beforeState: { n: 2 }, afterState: null, ipAddress: "127.0.0.1" });

  const result = verifyAuditChain();
  if (!result.valid) throw new Error(`Chain invalid after 3 entries: ${result.message}`);
  if (result.totalEntries !== 3) throw new Error(`Expected 3 entries, got ${result.totalEntries}`);
});

// Test 3: Immutability trigger — UPDATE must be rejected
test("UPDATE on audit_logs is rejected by trigger", () => {
  let threw = false;
  try {
    rawDb.exec("UPDATE audit_logs SET action = 'tampered' WHERE chain_index = 0");
  } catch (e) {
    if (e instanceof Error && e.message.includes("immutable")) {
      threw = true;
    }
  }
  if (!threw) throw new Error("Expected immutability trigger to abort UPDATE");
});

// Test 4: DELETE is rejected
test("DELETE on audit_logs is rejected by trigger", () => {
  let threw = false;
  try {
    rawDb.exec("DELETE FROM audit_logs WHERE chain_index = 0");
  } catch (e) {
    if (e instanceof Error && e.message.includes("immutable")) {
      threw = true;
    }
  }
  if (!threw) throw new Error("Expected immutability trigger to abort DELETE");
});

await Bun.sleep(100);
console.log(`\n  Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("  ❌ Some tests failed!");
  process.exit(1);
} else {
  console.log("  ✅ All audit chain tests passed!\n");
}
