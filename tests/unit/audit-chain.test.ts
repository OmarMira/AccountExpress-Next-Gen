import { describe, it, expect } from "vitest";
import { hmacSha256 as sha256, computeEntryHash } from "../../src/services/journal-hash.service.ts";

describe("audit chain — pure functions", () => {

  // ── sha256 ──────────────────────────────────────────────
  it("sha256 produces consistent 64-char hex output", () => {
    const result = sha256("test-input");
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sha256 is deterministic — same input produces same hash", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
  });

  it("sha256 is sensitive — different inputs produce different hashes", () => {
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });

  // ── computeEntryHash ────────────────────────────────────
  it("computeEntryHash is deterministic with same inputs", () => {
    const entry = {
      companyId:   "company-1",
      entryDate:   "2025-01-01",
      description: "Test entry",
      status:      "posted" as const,
      createdBy:   "user-1",
    };
    const lines = [
      { accountId: "1010", debitAmount:  1000, creditAmount: 0,    description: null, lineNumber: 1 },
      { accountId: "4010", debitAmount:  0,    creditAmount: 1000, description: null, lineNumber: 2 },
    ];
    const h1 = computeEntryHash("entry-id-1", entry, lines, "GENESIS");
    const h2 = computeEntryHash("entry-id-1", entry, lines, "GENESIS");
    expect(h1).toBe(h2);
  });

  it("computeEntryHash changes when prevHash changes — chain integrity", () => {
    const entry = {
      companyId:   "company-1",
      entryDate:   "2025-01-01",
      description: "Test entry",
      status:      "posted" as const,
      createdBy:   "user-1",
    };
    const lines = [
      { accountId: "1010", debitAmount: 500, creditAmount: 0,   description: null, lineNumber: 1 },
      { accountId: "4010", debitAmount: 0,   creditAmount: 500, description: null, lineNumber: 2 },
    ];
    const h1 = computeEntryHash("entry-id-1", entry, lines, "GENESIS");
    const h2 = computeEntryHash("entry-id-1", entry, lines, "prev-hash-abc");
    expect(h1).not.toBe(h2);
  });

  it("computeEntryHash is independent of line order — sorted by lineNumber", () => {
    const entry = {
      companyId:   "company-1",
      entryDate:   "2025-01-01",
      description: "Test entry",
      status:      "posted" as const,
      createdBy:   "user-1",
    };
    const linesAB = [
      { accountId: "1010", debitAmount: 500, creditAmount: 0,   description: null, lineNumber: 1 },
      { accountId: "4010", debitAmount: 0,   creditAmount: 500, description: null, lineNumber: 2 },
    ];
    const linesBA = [
      { accountId: "4010", debitAmount: 0,   creditAmount: 500, description: null, lineNumber: 2 },
      { accountId: "1010", debitAmount: 500, creditAmount: 0,   description: null, lineNumber: 1 },
    ];
    expect(
      computeEntryHash("entry-id-1", entry, linesAB, "GENESIS")
    ).toBe(
      computeEntryHash("entry-id-1", entry, linesBA, "GENESIS")
    );
  });

  // ── DB integration tests (require live PostgreSQL) ──────
  it.todo("verify empty chain tip returns GENESIS (requires DB)");
  it.todo("verify chain tip updates after posting entry (requires DB)");
  it.todo("reject tampered entry_hash in chain (requires DB)");
  it.todo("reject UPDATE on audit_logs via DB trigger (requires DB)");
  it.todo("reject DELETE on audit_logs via DB trigger (requires DB)");
});
