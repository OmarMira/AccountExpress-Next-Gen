import { db } from "../src/db/connection";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";

// ⚠️ This script bypasses lockout security. Blocked in production.
if (process.env.NODE_ENV === "production") {
  console.error("❌ BLOCKED: unlock-admin cannot run in a production environment.");
  process.exit(1);
}

await db.update(users)
  .set({ failedAttempts: 0, isLocked: false, lockedUntil: null })
  .where(eq(users.username, "admin"));

console.log("✅ Admin desbloqueado");
