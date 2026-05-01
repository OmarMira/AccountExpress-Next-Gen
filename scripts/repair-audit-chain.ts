// ============================================================
// REPAIR AUDIT CHAIN
// Rebuilds the entire audit chain from scratch by reprocessing
// all records in chronological order (createdAt ASC).
// Requires temporarily disabling the fn_audit_immutable trigger.
// ============================================================

import postgres from "postgres";
import { createHmac } from "crypto";

// Load .env manually since we're outside the app
import { config } from "dotenv";
config();

// ⚠️ Maintenance script. Blocked in production.
if (process.env.NODE_ENV === "production") {
  console.error("❌ BLOCKED: repair-audit-chain cannot run in a production environment.");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const AUDIT_HMAC_SECRET = process.env.AUDIT_HMAC_SECRET ?? "";

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set in .env");
  process.exit(1);
}
if (!AUDIT_HMAC_SECRET) {
  console.error("❌ AUDIT_HMAC_SECRET is not set in .env");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

function hmacSha256(data: string): string {
  return createHmac("sha256", AUDIT_HMAC_SECRET).update(data, "utf8").digest("hex");
}

async function repairChain(companyId: string | null): Promise<void> {
  const label = companyId ?? "__system__";
  console.log(`\n🔗 Repairing chain for: ${label}`);

  const rows = await sql<Array<{
    id: string;
    user_id: string | null;
    action: string;
    after_state: string | null;
    created_at: Date;
    timestamp_token: string | null;
  }>>`
    SELECT id, user_id, action, after_state, created_at, timestamp_token
    FROM audit_logs
    WHERE ${companyId ? sql`company_id = ${companyId}` : sql`company_id IS NULL`}
    ORDER BY created_at ASC
  `;

  if (rows.length === 0) {
    console.log(`   ↳ No entries — nothing to do.`);
    return;
  }

  console.log(`   ↳ Found ${rows.length} entries. Rebuilding...`);

  let expectedPrevHash = "GENESIS";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const chainIndex = i;
    const timeToken = row.timestamp_token || new Date(row.created_at).getTime().toString();

    const hashInput = [
      row.id,
      row.user_id ?? "system",
      row.action,
      row.after_state ?? "",
      expectedPrevHash,
      timeToken,
    ].join("|");

    const entryHash = hmacSha256(hashInput);

    // Direct UPDATE bypassing Drizzle ORM (trigger already disabled in session)
    await sql`
      UPDATE audit_logs
      SET
        chain_index     = ${chainIndex},
        prev_hash       = ${expectedPrevHash},
        entry_hash      = ${entryHash},
        timestamp_token = ${timeToken}
      WHERE id = ${row.id}
    `;

    expectedPrevHash = entryHash;
  }

  console.log(`   ✅ Chain rebuilt. Last index: ${rows.length - 1}`);
}

// ── Main ─────────────────────────────────────────────────────
console.log("🔧 AccountExpress — Audit Chain Full Repair");
console.log("=".repeat(50));

// Run everything inside a single transaction with triggers disabled
await sql.begin(async (tx) => {
  // Disable the immutability triggers for this session
  await tx`ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_immutable`;
  await tx`ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_nodelete`;

  // 1. Repair system-level chain (companyId = null)
  await repairChainInTx(tx, null);

  // 2. Repair per-company chains
  const allCompanies = await tx<Array<{ id: string }>>`SELECT id FROM companies`;
  for (const company of allCompanies) {
    await repairChainInTx(tx, company.id);
  }

  // Re-enable triggers before committing
  await tx`ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_immutable`;
  await tx`ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_nodelete`;
});

async function repairChainInTx(tx: postgres.TransactionSql, companyId: string | null): Promise<void> {
  const label = companyId ?? "__system__";
  console.log(`\n🔗 Repairing chain for: ${label}`);

  const rows = await tx<Array<{
    id: string;
    user_id: string | null;
    action: string;
    after_state: string | null;
    created_at: Date;
    timestamp_token: string | null;
  }>>`
    SELECT id, user_id, action, after_state, created_at, timestamp_token
    FROM audit_logs
    WHERE ${companyId ? tx`company_id = ${companyId}` : tx`company_id IS NULL`}
    ORDER BY created_at ASC
  `;

  if (rows.length === 0) {
    console.log(`   ↳ No entries — nothing to do.`);
    return;
  }

  console.log(`   ↳ Found ${rows.length} entries. Rebuilding...`);

  let expectedPrevHash = "GENESIS";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const chainIndex = i;
    const timeToken = row.timestamp_token || new Date(row.created_at).getTime().toString();

    const hashInput = [
      row.id,
      row.user_id ?? "system",
      row.action,
      row.after_state ?? "",
      expectedPrevHash,
      timeToken,
    ].join("|");

    const entryHash = hmacSha256(hashInput);

    await tx`
      UPDATE audit_logs
      SET
        chain_index     = ${chainIndex},
        prev_hash       = ${expectedPrevHash},
        entry_hash      = ${entryHash},
        timestamp_token = ${timeToken}
      WHERE id = ${row.id}
    `;

    expectedPrevHash = entryHash;
  }

  console.log(`   ✅ Chain rebuilt. Last index: ${rows.length - 1}`);
}

await sql.end();
console.log("\n✅ All audit chains repaired and trigger restored.");
process.exit(0);

