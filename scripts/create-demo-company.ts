import { db } from "../src/db/connection";
import { companies, userCompanyRoles, roles, users } from "../src/db/schema";
import { eq, and } from "drizzle-orm";

async function main() {
  const adminUser = await db.query.users.findFirst({
    where: eq(users.username, "admin")
  });

  const companyAdminRole = await db.query.roles.findFirst({
    where: eq(roles.name, "company_admin")
  });

  if (!adminUser || !companyAdminRole) throw new Error("Admin user or role not found");

  let companyId;
  const existingCompany = await db.query.companies.findFirst({
    where: eq(companies.ein, "12-3456789")
  });

  if (existingCompany) {
    companyId = existingCompany.id;
  } else {
    companyId = crypto.randomUUID();
    await db.insert(companies).values({
      id: companyId,
      legalName: "Demo Company LLC",
      tradeName: "Demo Company",
      ein: "12-3456789",
      city: "Orlando",
      state: "FL",
      zipCode: "32801",
      fiscalYearStart: "01-01",
      currency: "USD",
      isActive: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const existingRole = await db.query.userCompanyRoles.findFirst({
    where: and(eq(userCompanyRoles.userId, adminUser.id), eq(userCompanyRoles.companyId, companyId))
  });

  if (!existingRole) {
    await db.insert(userCompanyRoles).values({
      id: crypto.randomUUID(),
      userId: adminUser.id,
      companyId: companyId,
      roleId: companyAdminRole.id,
      isActive: 1,
      grantedBy: adminUser.id,
      grantedAt: new Date().toISOString(),
    });
    console.log("✅ Rol asignado al usuario admin para Demo Company LLC.");
  } else {
    console.log("✅ El usuario admin ya tenía acceso a Demo Company LLC.");
  }

  console.log("✅ Empresa disponible: Demo Company LLC");
}

main().catch(console.error);
