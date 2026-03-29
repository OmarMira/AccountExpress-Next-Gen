import { db, sql } from "../src/db/connection.ts";
import { createAuditEntry, verifyAuditChain } from "../src/services/audit.service.ts";
import { auditLogs } from "../src/db/schema/index.ts";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ FAIL: ${name} — ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

async function main() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Test: Audit Chain Integrity");
  console.log("═══════════════════════════════════════════════\n");

  // Clean slate
  await db.execute(sql`DELETE FROM audit_logs`);

  // Test 1: Empty chain is valid
  await test("Empty chain is valid", async () => {
    const result = await verifyAuditChain();
    if (!result.valid) throw new Error(`Expected valid, got: ${result.message}`);
    if (result.totalEntries !== 0) throw new Error("Expected 0 entries");
  });

  // Test 2: Create 3 entries and verify chain
  await test("Three chained entries are verifiable", async () => {
    await createAuditEntry({ companyId: null, userId: null, sessionId: null, action: "test:create", module: "test", entityType: "test", entityId: "1", beforeState: null, afterState: { n: 1 }, ipAddress: "127.0.0.1" });
    await createAuditEntry({ companyId: null, userId: null, sessionId: null, action: "test:update", module: "test", entityType: "test", entityId: "1", beforeState: { n: 1 }, afterState: { n: 2 }, ipAddress: "127.0.0.1" });
    await createAuditEntry({ companyId: null, userId: null, sessionId: null, action: "test:delete", module: "test", entityType: "test", entityId: "1", beforeState: { n: 2 }, afterState: null, ipAddress: "127.0.0.1" });

    const result = await verifyAuditChain();
    if (!result.valid) throw new Error(`Chain invalid after 3 entries: ${result.message}`);
    if (result.totalEntries !== 3) throw new Error(`Expected 3 entries, got ${result.totalEntries}`);
  });

  // Test 3: Immutability trigger — UPDATE must be rejected
  await test("UPDATE on audit_logs is rejected by trigger", async () => {
    let threw = false;
    try {
      await db.execute(sql`UPDATE audit_logs SET action = 'tampered' WHERE chain_index = 0`);
    } catch (e) {
      if (e instanceof Error && (e.message.includes("immutable") || e.message.includes("not allowed"))) {
        threw = true;
      }
    }
    if (!threw) throw new Error("Expected immutability trigger to abort UPDATE");
  });

  // Test 4: DELETE is rejected
  await test("DELETE on audit_logs is rejected by trigger", async () => {
    let threw = false;
    try {
      await db.execute(sql`DELETE FROM audit_logs WHERE chain_index = 0`);
    } catch (e) {
      if (e instanceof Error && (e.message.includes("immutable") || e.message.includes("not allowed"))) {
        threw = true;
      }
    }
    if (!threw) throw new Error("Expected immutability trigger to abort DELETE");
  });

  console.log(`\n  Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("  ❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("  ✅ All audit chain tests passed!\n");
  }
}

main().catch(console.error);
