import { db } from "../src/db/connection";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/services/auth/password.service";

async function main() {
  const { hash, salt } = await hashPassword("Admin123!");

  await db.insert(users).values({
    id: crypto.randomUUID(),
    username: "admin",
    email: "admin@accountexpress.local",
    passwordHash: hash,
    passwordSalt: salt,
    firstName: "Super",
    lastName: "Admin",
    isSuperAdmin: 1,
    isActive: 1,
    isLocked: 0,
    failedAttempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log("✅ Usuario creado:");
  console.log("   Username: admin");
  console.log("   Password: Admin123!");
}

main().catch(console.error);
