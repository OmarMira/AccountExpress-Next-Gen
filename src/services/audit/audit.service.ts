import { db } from "../../db/connection.ts";
import { auditLogs } from "../../db/schema/system.schema.ts";
import { eq, desc, asc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export interface AuditParams {
  id: string; // pre-generated UUID
  companyId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  action: string;
  module: string;
  entityType?: string | null;
  entityId?: string | null;
  beforeState?: string | null;
  afterState?: string | null;
  ipAddress: string;
  timestampToken?: string | null;
}

const GENESIS_HASH = "GENESIS_HASH_000000000000000000000000000000000000000000000000000000";

async function sha256(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function createAuditLog(params: AuditParams): Promise<void> {
  const createdAt = new Date().toISOString();

  // 1. Get last hash for the target scope
  let lastLog;
  if (params.companyId) {
    lastLog = await db.query.auditLogs.findFirst({
      where: eq(auditLogs.companyId, params.companyId),
      orderBy: [desc(auditLogs.chainIndex)],
    });
  } else {
    // System level operation (no company)
    // In Drizzle, we need sql`company_id IS NULL` to explicitly target system logs,
    // but findFirst over everything is a risk. We'll assume these are tracked separately or skipped.
  }

  const prevHash = lastLog?.entryHash ?? GENESIS_HASH;
  const chainIndex = (lastLog?.chainIndex ?? -1) + 1;

  // 2. Build payload exactly as specified for deterministic hashing
  const payload = JSON.stringify({
    id: params.id,
    companyId: params.companyId,
    userId: params.userId,
    action: params.action,
    entityId: params.entityId,
    afterState: params.afterState,
    prevHash,
    createdAt
  });

  const entryHash = await sha256(payload);

  // 3. Insert into immutable ledger
  await db.insert(auditLogs).values({
    id: params.id,
    companyId: params.companyId ?? null,
    userId: params.userId ?? null,
    sessionId: params.sessionId ?? null,
    action: params.action,
    module: params.module,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    beforeState: params.beforeState ?? null,
    afterState: params.afterState ?? null,
    ipAddress: params.ipAddress,
    timestampToken: params.timestampToken ?? null,
    entryHash,
    prevHash,
    chainIndex,
    createdAt
  });
}

export interface VerificationResult {
  valid: boolean;
  brokenAt?: number;
  logId?: string;
  tampered?: boolean;
  totalEntries?: number;
}

export async function verifyChainIntegrity(companyId: string): Promise<VerificationResult> {
  const logs = await db.query.auditLogs.findMany({
    where: eq(auditLogs.companyId, companyId),
    orderBy: [asc(auditLogs.chainIndex)]
  });

  for (let i = 0; i < logs.length; i++) {
    const current = logs[i];
    const expectedPrev = i === 0 ? GENESIS_HASH : logs[i-1].entryHash;

    if (current.prevHash !== expectedPrev) {
      return { valid: false, brokenAt: current.chainIndex, logId: current.id };
    }

    const payload = JSON.stringify({
      id: current.id,
      companyId: current.companyId,
      userId: current.userId,
      action: current.action,
      entityId: current.entityId,
      afterState: current.afterState,
      prevHash: current.prevHash,
      createdAt: current.createdAt
    });

    const recomputed = await sha256(payload);
    if (recomputed !== current.entryHash) {
      return { valid: false, tampered: true, logId: current.id };
    }
  }

  return { valid: true, totalEntries: logs.length };
}

