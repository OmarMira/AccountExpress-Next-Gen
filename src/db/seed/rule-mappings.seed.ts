// ============================================================
// RULE MAPPINGS SEED — Deterministic Fallback Data
// ============================================================

import { db } from "../connection.ts";
import { ruleMappings } from "../schema/index.ts";

export const RULE_MAPPINGS_SEED = [
  { pattern: "LYFT", glAccountCode: "5210", isGlobal: true },
  { pattern: "UBER", glAccountCode: "5210", isGlobal: true },
  { pattern: "HOME DEPOT", glAccountCode: "5160", isGlobal: true },
  { pattern: "LAURA QUIJANO", glAccountCode: "3020", isGlobal: true },
  { pattern: "OMAR MIRA", glAccountCode: "3020", isGlobal: true },
  { pattern: "SHELL", glAccountCode: "5210", isGlobal: true },
  { pattern: "CHEVRON", glAccountCode: "5210", isGlobal: true },
];

export async function seedRuleMappings(): Promise<void> {
  console.log("[SEED] Seeding rule_mappings...");
  for (const m of RULE_MAPPINGS_SEED) {
    await db.insert(ruleMappings).values({
      pattern: m.pattern,
      glAccountCode: m.glAccountCode,
      isGlobal: m.isGlobal,
    }).onConflictDoNothing();
  }
  console.log(`[SEED] ✓ ${RULE_MAPPINGS_SEED.length} rule_mappings seeded`);
}
