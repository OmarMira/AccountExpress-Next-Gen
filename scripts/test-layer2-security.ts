// Usar base de datos de test, NUNCA la de produccion
process.env.DATABASE_PATH = "./data/test.db";
import { 
  login, 
  LoginResult 
} from "../src/services/auth/auth.service.ts";
import { db } from "../src/db/connection.ts";
import { users } from "../src/db/schema/system.schema.ts";
import { eq } from "drizzle-orm";

async function runTimingTest() {
  console.log("========================================");
  console.log("   LAYER 2: TIMING ATTACK RESISTANCE    ");
  console.log("========================================");

  // 1. Measure valid user, wrong password
  const start1 = performance.now();
  await login("superadmin", "wrongpassword", "127.0.0.1");
  const end1 = performance.now();
  const timeKnownUser = end1 - start1;

  // 2. Measure non-existent user
  const start2 = performance.now();
  await login("ghostuser777", "wrongpassword", "127.0.0.1");
  const end2 = performance.now();
  const timeUnknownUser = end2 - start2;

  console.log(`Time for Known User (Wrong pass): ${timeKnownUser.toFixed(2)}ms`);
  console.log(`Time for Unknown User (Wrong pass): ${timeUnknownUser.toFixed(2)}ms`);

  const diff = Math.abs(timeKnownUser - timeUnknownUser);
  console.log(`Difference: ${diff.toFixed(2)}ms`);

  if (diff < 50) { // 50ms tolerance
    console.log("✅ TIMING TEST PASSED: Indistinguishable response times.");
  } else {
    console.log("❌ TIMING TEST FAILED: Response times differ too much.");
  }

  // 3. Measure lockout mechanic
  console.log("\nTesting Account Lockout...");
  // Use a test user
  await db.insert(users).values({
    id: "test-lock-uuid",
    username: "locktest",
    email: "locktest@example.com",
    passwordHash: "$2a$12$DUMMYHASHDUMMYHASHDUMMYHASHDUMMYHASHDUMMYHASHDUMMYHASH",
    passwordSalt: "salt",
    firstName: "Test",
    lastName: "Lock",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  let lockResult: LoginResult;
  for (let i = 0; i < 5; i++) {
    lockResult = await login("locktest", "bad", "127.0.0.1");
  }
  
  // 6th attempt should be locked
  const lockCheck = await login("locktest", "bad", "127.0.0.1");
  if (lockCheck.error === "ACCOUNT_LOCKED") {
    console.log("✅ LOCKOUT TEST PASSED: Account locked after 5 failed attempts.");
  } else {
    console.log("❌ LOCKOUT TEST FAILED: Account not locked.");
  }

  // cleanup
  await db.delete(users).where(eq(users.id, "test-lock-uuid"));

  console.log("========================================\n");
}

runTimingTest().catch(console.error);
