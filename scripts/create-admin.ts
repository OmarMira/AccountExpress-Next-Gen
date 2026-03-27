import { db } from "../src/db/connection";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/services/auth/password.service";

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Error: ADMIN_USERNAME y ADMIN_PASSWORD deben estar definidas en el archivo .env"
    );
  }

  const { hash, salt } = await hashPassword(password);

  await db.insert(users).values({
    id: crypto.randomUUID(),
    username,
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
  console.log(`   Username: ${username}`);
  console.log("   Password: (valor de ADMIN_PASSWORD en .env)");
}

main().catch(console.error);
