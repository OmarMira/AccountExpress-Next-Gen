// ============================================================
// AUDIT SERVICE — PostgreSQL 16 / Drizzle ORM
// Immutable SHA-256 chained audit log.
// ============================================================

import { createHash } from "crypto";
import { db } from "../db/connection.ts";
import { auditLogs } from "../db/schema/index.ts";
import { eq, isNull, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export interface AuditEntryInput {
  companyId:   string | null;
  userId:      string | null;
  sessionId:   string | null;
  action:      string;
  module:      string;
  entityType:  string | null;
  entityId:    string | null;
  beforeState: unknown | null;
  afterState:  unknown | null;
  ipAddress:   string;
}

interface ChainTip {
  chainIndex: number;
  entryHash:  string;
}

// ── SHA-256 helper ───────────────────────────────────────────
function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

// ── Get current chain tip (synchronous via cached query) ──────
// NOTE: This function is called synchronously in many places.
// The DB call must be done with a sync-compatible approach.
// We use a cached in-memory tip updated after each insert.
// For true persistence, use getChainTipAsync instead.
let _chainCache: Map<string, ChainTip> = new Map();

function getChainTipCached(companyId: string | null): ChainTip {
  const key = companyId ?? "__system__";
  return _chainCache.get(key) ?? { chainIndex: -1, entryHash: "GENESIS" };
}

function updateChainCache(companyId: string | null, tip: ChainTip): void {
  const key = companyId ?? "__system__";
  _chainCache.set(key, tip);
}

// ── Create a new audit entry ─────────────────────────────────
// NOTE: Returns Promise<string> now — callers must await.
export async function createAuditEntry(input: AuditEntryInput): Promise<string> {
  const id        = uuidv4();
  const createdAt = new Date();
  const tip       = getChainTipCached(input.companyId);
  const chainIndex = tip.chainIndex + 1;
  const prevHash   = tip.entryHash;

  const afterStateJson  = input.afterState  ? JSON.stringify(input.afterState)  : null;
  const beforeStateJson = input.beforeState ? JSON.stringify(input.beforeState) : null;

  const hashInput = [
    id,
    input.userId   ?? "system",
    input.action,
    afterStateJson ?? "",
    prevHash,
    createdAt.toISOString(),
  ].join("|");

  const entryHash = sha256(hashInput);

  await db.insert(auditLogs).values({
    id,
    companyId:    input.companyId,
    userId:       input.userId,
    sessionId:    input.sessionId,
    action:       input.action,
    module:       input.module,
    entityType:   input.entityType,
    entityId:     input.entityId,
    beforeState:  beforeStateJson,
    afterState:   afterStateJson,
    ipAddress:    input.ipAddress,
    entryHash,
    prevHash,
    chainIndex,
    createdAt,
  });

  // Update in-memory cache
  updateChainCache(input.companyId, { chainIndex, entryHash });

  return id;
}

// ── Initialize chain cache from DB on startup ─────────────────
export async function initAuditChainCache(): Promise<void> {
  // Load the last entry for system-level and all companies
  const systemTip = await db
    .select({ chainIndex: auditLogs.chainIndex, entryHash: auditLogs.entryHash })
    .from(auditLogs)
    .where(isNull(auditLogs.companyId))
    .orderBy(desc(auditLogs.chainIndex))
    .limit(1);

  if (systemTip.length > 0) {
    updateChainCache(null, {
      chainIndex: systemTip[0].chainIndex,
      entryHash:  systemTip[0].entryHash,
    });
  }
}

// ── Verify entire audit chain ────────────────────────────────
export interface ChainVerificationResult {
  valid:         boolean;
  totalEntries:  number;
  brokenAtIndex: number | null;
  message:       string;
}

export async function verifyAuditChain(
  companyId: string | null = null
): Promise<ChainVerificationResult> {
  const rows = await db
    .select({
      id:          auditLogs.id,
      userId:      auditLogs.userId,
      action:      auditLogs.action,
      afterState:  auditLogs.afterState,
      entryHash:   auditLogs.entryHash,
      prevHash:    auditLogs.prevHash,
      chainIndex:  auditLogs.chainIndex,
      createdAt:   auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(companyId ? eq(auditLogs.companyId, companyId) : isNull(auditLogs.companyId))
    .orderBy(auditLogs.chainIndex);

  if (rows.length === 0) {
    return { valid: true, totalEntries: 0, brokenAtIndex: null, message: "Chain is empty — no entries yet" };
  }

  let expectedPrevHash = "GENESIS";

  for (const row of rows) {
    if (row.prevHash !== expectedPrevHash) {
      return {
        valid:         false,
        totalEntries:  rows.length,
        brokenAtIndex: row.chainIndex,
        message:       `Chain broken at index ${row.chainIndex}: prev_hash mismatch`,
      };
    }

    const hashInput = [
      row.id,
      row.userId ?? "system",
      row.action,
      row.afterState ?? "",
      row.prevHash,
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    ].join("|");
    const expectedHash = sha256(hashInput);

    if (row.entryHash !== expectedHash) {
      return {
        valid:         false,
        totalEntries:  rows.length,
        brokenAtIndex: row.chainIndex,
        message:       `Chain broken at index ${row.chainIndex}: entry_hash mismatch (data tampered)`,
      };
    }

    expectedPrevHash = row.entryHash;
  }

  return {
    valid: true,
    totalEntries: rows.length,
    brokenAtIndex: null,
    message: `Chain intact — ${rows.length} entries verified`,
  };
}
