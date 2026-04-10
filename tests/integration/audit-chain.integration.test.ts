import { describe, it, expect, beforeAll } from "bun:test";
import { db } from "../../src/db/connection.ts";
import { sql } from "drizzle-orm";
import {
  createAuditEntry,
  initAuditChainCache,
  verifyAuditChain,
  type AuditEntryInput,
} from "../../src/services/audit.service.ts";

// companyId: null — system-level entries, no FK dependency on companies table
const baseEntry: AuditEntryInput = {
  companyId:   null,
  userId:      null,
  sessionId:   null,
  action:      "TEST_ACTION",
  module:      "test",
  entityType:  "test-entity",
  entityId:    "test-entity-1",
  beforeState: null,
  afterState:  { value: "test" },
  ipAddress:   "127.0.0.1",
};

beforeAll(async () => {
  await initAuditChainCache();
});

describe("audit chain — PostgreSQL triggers & integrity", () => {

  it("identifies an empty system chain as valid (GENESIS state)", async () => {
    const result = await verifyAuditChain(null);
    expect(result.valid).toBe(true);
    expect(result.message).toContain("empty");
  });

  it("builds a HMAC chain with multiple entries", async () => {
    await createAuditEntry(baseEntry);
    await createAuditEntry({ ...baseEntry, action: "TEST_ACTION_2" });
    await createAuditEntry({ ...baseEntry, action: "TEST_ACTION_3" });

    const result = await verifyAuditChain(null);
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(3);
  });

  it("enforces IMMUTABILITY via UPDATE trigger", async () => {
    let threw = false;
    let errorMessage = "";
    try {
      await db.execute(
        sql`UPDATE audit_logs SET action = 'TAMPERED'
            WHERE module = 'test' AND chain_index = 0`
      );
    } catch (err) {
      threw = true;
      // Drizzle wraps postgres.js errors — unwrap to get the RAISE EXCEPTION message
      const cause = (err as any)?.cause;
      errorMessage = cause?.message ?? (err instanceof Error ? err.message : String(err));
    }
    expect(threw).toBe(true);
    expect(errorMessage).toContain("audit_logs is immutable — UPDATE not allowed");
  });

  it("enforces IMMUTABILITY via DELETE trigger", async () => {
    let threw = false;
    let errorMessage = "";
    try {
      await db.execute(
        sql`DELETE FROM audit_logs WHERE module = 'test'`
      );
    } catch (err) {
      threw = true;
      const cause = (err as any)?.cause;
      errorMessage = cause?.message ?? (err instanceof Error ? err.message : String(err));
    }
    expect(threw).toBe(true);
    expect(errorMessage).toContain("audit_logs is immutable — DELETE not allowed");
  });

  it("verifyAuditChain remains intact after blocked tampering", async () => {
    const result = await verifyAuditChain(null);
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(3);
  });

});
