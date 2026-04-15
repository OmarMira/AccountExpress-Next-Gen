// ============================================================
// AUDIT SERVICE — PostgreSQL 16 / Drizzle ORM
// Immutable SHA-256 chained audit log.
// ============================================================

import { createHmac } from "crypto";
import { db, type DbTransaction } from "../db/connection.ts";
import { auditLogs, companies } from "../db/schema/index.ts";
import { env } from "../config/validate.ts";
import { eq, isNull, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const SENSITIVE_FIELDS = new Set(["passwordHash", "passwordSalt", "password", "token", "secret"]);

function sanitizeState(state: unknown): unknown {
  if (!state || typeof state !== "object") return state;
  if (Array.isArray(state)) return state.map(sanitizeState);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state as Record<string, unknown>)) {
    result[key] = SENSITIVE_FIELDS.has(key) ? "[REDACTED]" : sanitizeState(value);
  }
  return result;
}

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

interface AuditLogRow {
  id:          string;
  userId:      string | null;
  action:      string;
  afterState:  string | null;
  entryHash:   string;
  prevHash:    string;
  chainIndex:  number;
  createdAt:   Date;
}

// ── HMAC-SHA256 helper ───────────────────────────────────────
function hmacSha256(data: string): string {
  return createHmac("sha256", env.AUDIT_HMAC_SECRET).update(data, "utf8").digest("hex");
}

// ── Get current chain tip (synchronous via cached query) ──────
// NOTE: This function is called synchronously in many places.
// The DB call must be done with a sync-compatible approach.
// We use a cached in-memory tip updated after each insert.
// For true persistence, use getChainTipAsync instead.
const _chainCache: Map<string, ChainTip> = new Map();

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
export async function createAuditEntry(input: AuditEntryInput, tx?: DbTransaction): Promise<string> {
  const id        = uuidv4();
  const createdAt = new Date();
  const tip       = getChainTipCached(input.companyId);
  const chainIndex = tip.chainIndex + 1;
  const prevHash   = tip.entryHash;

  const afterStateJson  = input.afterState  ? JSON.stringify(sanitizeState(input.afterState))  : null;
  const beforeStateJson = input.beforeState ? JSON.stringify(sanitizeState(input.beforeState)) : null;

  const timeToken = createdAt.getTime().toString();

  const hashInput = [
    id,
    input.userId   ?? "system",
    input.action,
    afterStateJson ?? "",
    prevHash,
    timeToken,
  ].join("|");

  const entryHash = hmacSha256(hashInput);

  await (tx ?? db).insert(auditLogs).values({
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
    timestampToken: timeToken,
    createdAt,
  });

  // Update in-memory cache
  updateChainCache(input.companyId, { chainIndex, entryHash });

  return id;
}

// ── Initialize chain cache from DB on startup ─────────────────
export async function initAuditChainCache(): Promise<void> {
  // 1. Load the system-level tip (companyId = null)
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

  // 2. Query all active companies from the companies table
  const activeCompanies = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.isActive, true));

  // 3. For each company, search for the last record in audit_logs ordered by chain_index DESC
  for (const company of activeCompanies) {
    const lastEntry = await db
      .select({ chainIndex: auditLogs.chainIndex, entryHash: auditLogs.entryHash })
      .from(auditLogs)
      .where(eq(auditLogs.companyId, company.id))
      .orderBy(desc(auditLogs.chainIndex))
      .limit(1);

    // 4. Si existe, guardamos en memoria
    if (lastEntry.length > 0) {
      updateChainCache(company.id, {
        chainIndex: lastEntry[0].chainIndex,
        entryHash:  lastEntry[0].entryHash,
      });
    } else {
      // 5. Si NO existe (Paso 4 del reporte): inicializar con "GENESIS"
      updateChainCache(company.id, {
        chainIndex: -1,
        entryHash:  "GENESIS"
      });
    }
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
  const qRows = await db
    .select({
      id:          auditLogs.id,
      userId:      auditLogs.userId,
      action:      auditLogs.action,
      afterState:  auditLogs.afterState,
      entryHash:   auditLogs.entryHash,
      prevHash:    auditLogs.prevHash,
      chainIndex:  auditLogs.chainIndex,
      timestampToken: auditLogs.timestampToken,
      createdAt:   auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(companyId ? eq(auditLogs.companyId, companyId) : isNull(auditLogs.companyId))
    .orderBy(auditLogs.chainIndex);

  const rows = qRows as unknown as AuditLogRow[];

  if (rows.length === 0) {
    return { valid: true, totalEntries: 0, brokenAtIndex: null, message: "Chain is empty — no entries yet" };
  }

  let expectedPrevHash = "GENESIS";

  for (const row of rows) {
    // 1. Verify link with previous entry
    if (row.prevHash !== expectedPrevHash) {
      return {
        valid:         false,
        totalEntries:  rows.length,
        brokenAtIndex: row.chainIndex,
        message:       `Chain broken at index ${row.chainIndex}: prev_hash mismatch (expected ${expectedPrevHash}, found ${row.prevHash})`,
      };
    }

    // Fallback if token is missing (legacy records)
    const rowDateStr = row.timestampToken || new Date(row.createdAt).getTime().toString();

    const hashInput = [
      row.id,
      row.userId ?? "system",
      row.action,
      row.afterState ?? "",
      row.prevHash,
      rowDateStr,
    ].join("|");
    const expectedHash = hmacSha256(hashInput);

    if (row.entryHash !== expectedHash) {
      return {
        valid:         false,
        totalEntries:  rows.length,
        brokenAtIndex: row.chainIndex,
        message:       `Chain broken at index ${row.chainIndex}: entry_hash mismatch (data tampered). Calculated: ${expectedHash}, Stored: ${row.entryHash}`,
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
