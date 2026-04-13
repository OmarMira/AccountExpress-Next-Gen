// ============================================================
// COMPANIES SERVICE — PostgreSQL 16 / Drizzle ORM
// Multi-tenant configuration. Companies are NEVER physically
// deleted, only archived (is_active = false).
// ============================================================

import { db } from "../db/connection.ts";
import { 
  companies, users, userCompanyRoles, roles, 
  journalEntries, chartOfAccounts, fiscalPeriods, 
  auditLogs, bankAccounts, sessions,
  bankTransactions, bankTransactionGroups, bankTransactionGroupItems
} from "../db/schema/index.ts";
import { eq, and, isNull, count, ne } from "drizzle-orm";
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

  await db.transaction(async (tx) => {
    await tx.insert(companies).values({
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
    await seedGaapForCompany(id, tx);
  });
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

// ── Delete Company (Hard Delete with Cascading User Cleanup) ───
export async function deleteCompany(id: string): Promise<void> {
  console.log(`[DELETE_COMPANY] Starting purge for company ID: ${id}`);
  
  const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, id)).limit(1);
  if (!existing) {
    console.error(`[DELETE_COMPANY] Company ${id} not found`);
    throw new Error("Company not found");
  }

  // 1. Strict check for accounting transactions
  const [txCount] = await db.select({ c: count() }).from(journalEntries).where(eq(journalEntries.companyId, id));
  if (txCount && txCount.c > 0) {
    console.warn(`[DELETE_COMPANY] Aborting: Company ${id} has ${txCount.c} transactions.`);
    throw new Error("Cannot delete company with existing transactions. Archive it instead.");
  }

  // 2. Identify users that should be cleaned up
  const companyUsers = await db.select({ 
    userId: userCompanyRoles.userId 
  }).from(userCompanyRoles).where(eq(userCompanyRoles.companyId, id));

  console.log(`[DELETE_COMPANY] Found ${companyUsers.length} users associated with company.`);

  const usersToDelete: string[] = [];

  for (const item of companyUsers) {
    const uid = item.userId;
    const [uData] = await db.select({ isSuperAdmin: users.isSuperAdmin, username: users.username }).from(users).where(eq(users.id, uid)).limit(1);
    
    if (uData?.isSuperAdmin) {
      console.log(`[DELETE_COMPANY] Skipping user ${uData.username} (Super Admin)`);
      continue;
    }

    const [otherCompanies] = await db.select({ c: count() })
      .from(userCompanyRoles)
      .where(and(eq(userCompanyRoles.userId, uid), ne(userCompanyRoles.companyId, id)));
    if (otherCompanies && otherCompanies.c > 0) {
      console.log(`[DELETE_COMPANY] Preserving user ${uData?.username} (Belongs to ${otherCompanies.c} other companies)`);
      continue;
    }

    const [globalLogs] = await db.select({ c: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, uid), ne(auditLogs.companyId, id)));
    if (globalLogs && globalLogs.c > 0) {
      console.log(`[DELETE_COMPANY] Preserving user ${uData?.username} (Has ${globalLogs.c} global audit logs)`);
      continue;
    }

    const [globalEntries] = await db.select({ c: count() })
      .from(journalEntries)
      .where(eq(journalEntries.createdBy, uid));
    if (globalEntries && globalEntries.c > 0) {
      console.log(`[DELETE_COMPANY] Preserving user ${uData?.username} (Created ${globalEntries.c} entries elsewhere)`);
      continue;
    }

    console.log(`[DELETE_COMPANY] User ${uData?.username} marked for automatic deletion.`);
    usersToDelete.push(uid);
  }

  // 3. Execute full cleanup in transaction
  console.log(`[DELETE_COMPANY] Executing transaction for company ${id} and ${usersToDelete.length} associated users.`);
  
  await db.transaction(async (tx) => {
    // A. Clean Banking
    const groupIds = (await tx.select({ id: bankTransactionGroups.id }).from(bankTransactionGroups).where(eq(bankTransactionGroups.companyId, id))).map(g => g.id);
    if (groupIds.length > 0) {
      console.log(`[DELETE_COMPANY] Deleting ${groupIds.length} bank transaction groups...`);
      for (const gid of groupIds) {
        await tx.delete(bankTransactionGroupItems).where(eq(bankTransactionGroupItems.groupId, gid));
      }
      await tx.delete(bankTransactionGroups).where(eq(bankTransactionGroups.companyId, id));
    }
    await tx.delete(bankTransactions).where(eq(bankTransactions.companyId, id));
    await tx.delete(bankAccounts).where(eq(bankAccounts.companyId, id));

    // B. Clean Audit & System
    await tx.delete(auditLogs).where(eq(auditLogs.companyId, id));
    await tx.delete(fiscalPeriods).where(eq(fiscalPeriods.companyId, id));
    await tx.delete(userCompanyRoles).where(eq(userCompanyRoles.companyId, id));
    
    // C. Clean Chart of Accounts
    await tx.delete(chartOfAccounts).where(eq(chartOfAccounts.companyId, id));

    // D. Cleanup "Disposable" Users
    if (usersToDelete.length > 0) {
      console.log(`[DELETE_COMPANY] Purging ${usersToDelete.length} exclusive users...`);
      for (const uid of usersToDelete) {
        await tx.delete(sessions).where(eq(sessions.userId, uid));
        await tx.delete(users).where(eq(users.id, uid));
      }
    }

    // E. Delete the company itself
    await tx.delete(companies).where(eq(companies.id, id));
    console.log(`[DELETE_COMPANY] Success. Company ${id} purged.`);
  });
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
