import { db } from "../src/db/connection";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";

await db.update(users)
  .set({ failedAttempts: 0, isLocked: false, lockedUntil: null })
  .where(eq(users.username, "admin"));

console.log("✅ Admin desbloqueado");
