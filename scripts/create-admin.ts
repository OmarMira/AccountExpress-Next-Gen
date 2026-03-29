import { db } from "../src/db/connection";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/services/auth.service.ts";
import { eq } from "drizzle-orm";

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Error: ADMIN_USERNAME y ADMIN_PASSWORD deben estar definidas en el archivo .env"
    );
  }

  const { hash, salt } = await hashPassword(password);
  const now = new Date();

  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.username, username)
  });

  if (existing) {
    await db.update(users)
      .set({
        passwordHash: hash,
        passwordSalt: salt,
        isActive: true,
        isLocked: false,
        failedAttempts: 0,
        updatedAt: now
      })
      .where(eq(users.username, username));
    
    console.log("✅ Usuario actualizado:");
    console.log(`   Username: ${username}`);
    console.log("   Password: Sincronizada con .env");
  } else {
    await db.insert(users).values({
      id: crypto.randomUUID(),
      username,
      email: "admin@accountexpress.local",
      passwordHash: hash,
      passwordSalt: salt,
      firstName: "Super",
      lastName: "Admin",
      isSuperAdmin: true,
      isActive: true,
      isLocked: false,
      failedAttempts: 0,
      createdAt: now,
      updatedAt: now,
    });

    console.log("✅ Usuario creado:");
    console.log(`   Username: ${username}`);
    console.log("   Password: (valor de ADMIN_PASSWORD en .env)");
  }
}

main().catch(console.error);
