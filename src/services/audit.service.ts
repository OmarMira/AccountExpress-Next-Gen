// ============================================================
// AUDIT SERVICE
// Immutable SHA-256 chained audit log.
// Every operation in the system MUST call createAuditEntry().
// The chain is mathematically verifiable — tampering invalidates
// all entries after the modified record.
// ============================================================

import { createHash } from "crypto";
import { rawDb } from "../db/connection.ts";
import { v4 as uuidv4 } from "uuid";

export interface AuditEntryInput {
  companyId:   string | null;
  userId:      string | null;
  sessionId:   string | null;
  action:      string;    // e.g. "journal:create"
  module:      string;    // e.g. "journal"
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

// ── Get current chain tip ────────────────────────────────────
// Returns the last chained entry's index and hash per company.
// If no entries exist, returns genesis values (index -1, hash "GENESIS").
function getChainTip(companyId: string | null): ChainTip {
  let query = `SELECT chain_index, entry_hash FROM audit_logs `;
  let row;

  if (companyId) {
    row = rawDb.query(query + `WHERE company_id = ? ORDER BY chain_index DESC LIMIT 1`).get(companyId) as { chain_index: number; entry_hash: string } | null;
  } else {
    row = rawDb.query(query + `WHERE company_id IS NULL ORDER BY chain_index DESC LIMIT 1`).get() as { chain_index: number; entry_hash: string } | null;
  }

  if (!row) return { chainIndex: -1, entryHash: "GENESIS" };
  return { chainIndex: row.chain_index, entryHash: row.entry_hash };
}

// ── Create a new audit entry ─────────────────────────────────
export function createAuditEntry(input: AuditEntryInput): string {
  const id        = uuidv4();
  const createdAt = new Date().toISOString();
  const tip       = getChainTip(input.companyId);
  const chainIndex = tip.chainIndex + 1;
  const prevHash   = tip.entryHash;

  const afterStateJson  = input.afterState  ? JSON.stringify(input.afterState)  : null;
  const beforeStateJson = input.beforeState ? JSON.stringify(input.beforeState) : null;

  // entry_hash = SHA-256(id + userId + action + afterState + prevHash + createdAt)
  const hashInput = [
    id,
    input.userId   ?? "system",
    input.action,
    afterStateJson ?? "",
    prevHash,
    createdAt,
  ].join("|");

  const entryHash = sha256(hashInput);

  rawDb
    .prepare(
      `INSERT INTO audit_logs
         (id, company_id, user_id, session_id, action, module,
          entity_type, entity_id, before_state, after_state,
          ip_address, entry_hash, prev_hash, chain_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.companyId,
      input.userId,
      input.sessionId,
      input.action,
      input.module,
      input.entityType,
      input.entityId,
      beforeStateJson,
      afterStateJson,
      input.ipAddress,
      entryHash,
      prevHash,
      chainIndex,
      createdAt
    );

  return id;
}

// ── Verify entire audit chain ────────────────────────────────
// Re-computes every hash and verifies the prev_hash linkage.
// Returns true if chain is intact, false + broken index if tampered.
export interface ChainVerificationResult {
  valid:         boolean;
  totalEntries:  number;
  brokenAtIndex: number | null;
  message:       string;
}

export function verifyAuditChain(companyId: string | null = null): ChainVerificationResult {
  let rows;
  if (companyId) {
    rows = rawDb
      .query(
        `SELECT id, user_id, action, after_state, entry_hash, prev_hash, chain_index, created_at
         FROM audit_logs
         WHERE company_id = ?
         ORDER BY chain_index ASC`
      )
      .all(companyId) as {
        id: string;
        user_id: string | null;
        action: string;
        after_state: string | null;
        entry_hash: string;
        prev_hash: string;
        chain_index: number;
        created_at: string;
      }[];
  } else {
    rows = rawDb
      .query(
        `SELECT id, user_id, action, after_state, entry_hash, prev_hash, chain_index, created_at
         FROM audit_logs
         WHERE company_id IS NULL
         ORDER BY chain_index ASC`
      )
      .all() as {
        id: string;
        user_id: string | null;
        action: string;
        after_state: string | null;
        entry_hash: string;
        prev_hash: string;
        chain_index: number;
        created_at: string;
      }[];
  }

  if (rows.length === 0) {
    return { valid: true, totalEntries: 0, brokenAtIndex: null, message: "Chain is empty — no entries yet" };
  }

  let expectedPrevHash = "GENESIS";

  for (const row of rows) {
    // Verify this entry's prev_hash matches the prior hash
    if (row.prev_hash !== expectedPrevHash) {
      return {
        valid:         false,
        totalEntries:  rows.length,
        brokenAtIndex: row.chain_index,
        message:       `Chain broken at index ${row.chain_index}: prev_hash mismatch`,
      };
    }

    // Re-compute expected entry_hash
    const hashInput = [
      row.id,
      row.user_id ?? "system",
      row.action,
      row.after_state ?? "",
      row.prev_hash,
      row.created_at,
    ].join("|");
    const expectedHash = sha256(hashInput);

    if (row.entry_hash !== expectedHash) {
      return {
        valid:         false,
        totalEntries:  rows.length,
        brokenAtIndex: row.chain_index,
        message:       `Chain broken at index ${row.chain_index}: entry_hash mismatch (data tampered)`,
      };
    }

    expectedPrevHash = row.entry_hash;
  }

  return {
    valid: true,
    totalEntries: rows.length,
    brokenAtIndex: null,
    message: `Chain intact — ${rows.length} entries verified`,
  };
}
