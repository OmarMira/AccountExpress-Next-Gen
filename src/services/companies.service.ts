// ============================================================
// COMPANIES SERVICE — PostgreSQL 16 / Drizzle ORM
// Multi-tenant configuration. Companies are NEVER physically
// deleted, only archived (is_active = false).
// ============================================================

import { db } from "../db/connection.ts";
import { companies, users, userCompanyRoles, roles } from "../db/schema/index.ts";
import { eq, and, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { seedGaapForCompany } from "./accounts.service.ts";

export interface CompanyInput {
  legalName: string;
  tradeName?: string | null;
  ein?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  email?: string | null;
  fiscalYearStart: string; // MM-DD
  currency: string;
}

// ── List Companies ───────────────────────────────────────────
export async function listCompanies(userId: string, isSuperAdmin: boolean) {
  if (isSuperAdmin) {
    return db.select().from(companies).where(eq(companies.isActive, true));
  }

  return db
    .select({ id: companies.id, legalName: companies.legalName, tradeName: companies.tradeName,
              ein: companies.ein, address: companies.address, city: companies.city,
              state: companies.state, zipCode: companies.zipCode, phone: companies.phone,
              email: companies.email, fiscalYearStart: companies.fiscalYearStart,
              currency: companies.currency, isActive: companies.isActive,
              createdAt: companies.createdAt, updatedAt: companies.updatedAt })
    .from(companies)
    .innerJoin(userCompanyRoles, eq(companies.id, userCompanyRoles.companyId))
    .where(
      and(
        eq(userCompanyRoles.userId, userId),
        eq(userCompanyRoles.isActive, true),
        isNull(userCompanyRoles.revokedAt),
        eq(companies.isActive, true)
      )
    );
}

// ── Create Company ───────────────────────────────────────────
export async function createCompany(input: CompanyInput): Promise<string> {
  const id  = uuidv4();
  const now = new Date();

  await db.insert(companies).values({
    id,
    legalName:       input.legalName,
    tradeName:       input.tradeName ?? null,
    ein:             input.ein ?? null,
    address:         input.address ?? null,
    city:            input.city ?? null,
    state:           input.state ?? null,
    zipCode:         input.zipCode ?? null,
    phone:           input.phone ?? null,
    email:           input.email ?? null,
    fiscalYearStart: input.fiscalYearStart,
    currency:        input.currency,
    isActive:        true,
    createdAt:       now,
    updatedAt:       now,
  });

  await seedGaapForCompany(id);
  return id;
}

// ── Update Company ───────────────────────────────────────────
export async function updateCompany(id: string, input: Partial<CompanyInput>): Promise<void> {
  const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).limit(1);
  if (!existing) throw new Error("Company not found");

  const updates: Partial<typeof companies.$inferInsert> = { updatedAt: new Date() };
  if (input.legalName      !== undefined) updates.legalName      = input.legalName;
  if (input.tradeName      !== undefined) updates.tradeName      = input.tradeName ?? null;
  if (input.ein            !== undefined) updates.ein            = input.ein ?? null;
  if (input.address        !== undefined) updates.address        = input.address ?? null;
  if (input.city           !== undefined) updates.city           = input.city ?? null;
  if (input.state          !== undefined) updates.state          = input.state ?? null;
  if (input.zipCode        !== undefined) updates.zipCode        = input.zipCode ?? null;
  if (input.phone          !== undefined) updates.phone          = input.phone ?? null;
  if (input.email          !== undefined) updates.email          = input.email ?? null;
  if (input.fiscalYearStart !== undefined) updates.fiscalYearStart = input.fiscalYearStart;
  if (input.currency       !== undefined) updates.currency       = input.currency;

  await db.update(companies).set(updates).where(eq(companies.id, id));
}

// ── Archive Company (Soft Delete) ────────────────────────────
export async function archiveCompany(id: string): Promise<void> {
  const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).limit(1);
  if (!existing) throw new Error("Company not found");

  await db.update(companies)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(companies.id, id));
}

// ── List Company Users ───────────────────────────────────────
export async function listCompanyUsers(companyId: string) {
  return db
    .select({
      id:              users.id,
      username:        users.username,
      email:           users.email,
      firstName:       users.firstName,
      lastName:        users.lastName,
      roleName:        roles.name,
      roleActive:      userCompanyRoles.isActive,
      grantedAt:       userCompanyRoles.grantedAt,
      revokedAt:       userCompanyRoles.revokedAt,
    })
    .from(userCompanyRoles)
    .innerJoin(users, eq(userCompanyRoles.userId, users.id))
    .innerJoin(roles, eq(userCompanyRoles.roleId, roles.id))
    .where(eq(userCompanyRoles.companyId, companyId))
    .orderBy(users.username);
}

// ── Add User To Company ──────────────────────────────────────
export async function addUserToCompany(
  companyId: string,
  targetUserId: string,
  roleId: string,
  grantedByUserId: string
): Promise<string> {
  const [existing] = await db
    .select({ id: userCompanyRoles.id })
    .from(userCompanyRoles)
    .where(
      and(
        eq(userCompanyRoles.userId, targetUserId),
        eq(userCompanyRoles.companyId, companyId),
        eq(userCompanyRoles.isActive, true),
        isNull(userCompanyRoles.revokedAt)
      )
    )
    .limit(1);

  if (existing) throw new Error("User already has an active role in this company");

  const id  = uuidv4();
  const now = new Date();

  await db.insert(userCompanyRoles).values({
    id,
    userId:    targetUserId,
    companyId,
    roleId,
    isActive:  true,
    grantedBy: grantedByUserId,
    grantedAt: now,
  });

  return id;
}

// ── Revoke User From Company ─────────────────────────────────
export async function revokeUserFromCompany(
  companyId: string,
  targetUserId: string
): Promise<void> {
  const [existing] = await db
    .select({ id: userCompanyRoles.id })
    .from(userCompanyRoles)
    .where(
      and(
        eq(userCompanyRoles.userId, targetUserId),
        eq(userCompanyRoles.companyId, companyId),
        eq(userCompanyRoles.isActive, true),
        isNull(userCompanyRoles.revokedAt)
      )
    )
    .limit(1);

  if (!existing) throw new Error("No active role found for this user in this company");

  await db.update(userCompanyRoles)
    .set({ isActive: false, revokedAt: new Date() })
    .where(eq(userCompanyRoles.id, existing.id));
}
