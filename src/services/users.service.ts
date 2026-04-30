// ============================================================
// USERS SERVICE — PostgreSQL 16 / Drizzle ORM
// CRUD de usuarios + asignación de roles por tenant.
// All functions async.
// ============================================================

import { db }                 from "../db/connection.ts";
import { users, userCompanyRoles, roles, journalEntries, auditLogs, sessions, bankTransactions, fiscalPeriods } from "../db/schema/index.ts";
import { eq, and, or, count }    from "drizzle-orm";
import { hashPassword }        from "./auth.service.ts";
import { invalidateAllUserSessions } from "./session.service.ts";
import { randomUUID }         from "crypto";

// ── Tipos ────────────────────────────────────────────────────

export interface CreateUserInput {
  username:   string;
  email:      string;
  password:   string;
  firstName:  string;
  lastName:   string;
  companyId:  string;
  roleId:     string;
  grantedBy:  string;
}

export interface UpdateUserInput {
  userId:             string;
  firstName?:         string;
  lastName?:          string;
  username?:          string;
  email?:             string;
  password?:          string;
  isActive?:          boolean;
  mustChangePassword?: boolean;
  companyId?:         string;
  roleId?:            string;
  grantedBy?:         string;
}

export interface AssignRoleInput {
  userId:    string;
  companyId: string;
  roleId:    string;
  grantedBy: string;
}

// ── Listar usuarios de un tenant ─────────────────────────────
export async function listUsers(companyId: string) {
  return db
    .select({
      id:                  users.id,
      username:            users.username,
      email:               users.email,
      firstName:           users.firstName,
      lastName:            users.lastName,
      isActive:            users.isActive,
      isLocked:            users.isLocked,
      isSuperAdmin:        users.isSuperAdmin,
      mustChangePassword:  users.mustChangePassword,
      lastLoginAt:         users.lastLoginAt,
      createdAt:           users.createdAt,
      roleId:              roles.id,
      roleName:            roles.name,
      roleDisplayName:     roles.displayName,
      roleActive:          userCompanyRoles.isActive,
    })
    .from(users)
    .innerJoin(userCompanyRoles, eq(userCompanyRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userCompanyRoles.roleId))
    .where(
      and(
        eq(userCompanyRoles.companyId, companyId),
        eq(userCompanyRoles.isActive, true)
      )
    )
    .orderBy(users.createdAt);
}

// ── Listar roles disponibles ──────────────────────────────────
export async function listRoles() {
  return db
    .select({ id: roles.id, name: roles.name, displayName: roles.displayName, description: roles.description })
    .from(roles)
    .where(and(eq(roles.isActive, true), eq(roles.isSystem, false)))
    .orderBy(roles.displayName);
}

// ── Listar todos los usuarios del sistema (super admin only) ──
// ── Listar todos los usuarios del sistema (super admin only) ──
export async function listAllUsers(companyId?: string) {
  let query = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      isSuperAdmin: users.isSuperAdmin,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      roleId: userCompanyRoles.roleId,
      roleName: roles.name,
      roleDisplayName: roles.displayName,
    })
    .from(users)
    .leftJoin(
      userCompanyRoles,
      and(
        eq(userCompanyRoles.userId, users.id),
        eq(userCompanyRoles.isActive, true)
      )
    )
    .leftJoin(roles, eq(roles.id, userCompanyRoles.roleId));

  if (companyId) {
    query = query.where(eq(userCompanyRoles.companyId, companyId));
  }



  return query.orderBy(users.createdAt);
}

// ── Crear usuario + asignar rol en tenant ────────────────────
export async function createUser(input: CreateUserInput) {
  const { hash, salt } = await hashPassword(input.password);
  const userId = randomUUID();
  const now    = new Date();

  await db.insert(users).values({
    id:                 userId,
    username:           input.username,
    email:              input.email,
    passwordHash:       hash,
    passwordSalt:       salt,
    firstName:          input.firstName,
    lastName:           input.lastName,
    isSuperAdmin:       false,
    isActive:           true,
    isLocked:           false,
    failedAttempts:     0,
    mustChangePassword: true,
    createdAt:          now,
    updatedAt:          now,
  });

  await db.insert(userCompanyRoles).values({
    id:        randomUUID(),
    userId,
    companyId: input.companyId,
    roleId:    input.roleId,
    isActive:  true,
    grantedBy: input.grantedBy,
    grantedAt: now,
  });

  return { userId };
}

// ── Actualizar datos del usuario ──────────────────────────────
export async function updateUser(input: UpdateUserInput): Promise<{ updated: boolean }> {
  return await db.transaction(async (tx) => {
    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

    if (input.firstName          !== undefined) updates.firstName          = input.firstName;
    if (input.lastName           !== undefined) updates.lastName           = input.lastName;
    if (input.username           !== undefined) updates.username           = input.username;
    if (input.email              !== undefined) updates.email              = input.email;
    if (input.isActive           !== undefined) updates.isActive           = input.isActive;
    if (input.mustChangePassword !== undefined) updates.mustChangePassword = input.mustChangePassword;

    if (input.password) {
      const { hash, salt } = await hashPassword(input.password);
      updates.passwordHash       = hash;
      updates.passwordSalt       = salt;
      updates.mustChangePassword = true;
      await invalidateAllUserSessions(input.userId);
    }

    // 1. Update basic fields
    if (Object.keys(updates).length > 1) {
      await tx.update(users).set(updates).where(eq(users.id, input.userId));
    }

    // 2. Handle role update if provided — UPDATE in place (no INSERT to avoid uq_ucr_user_company violation)
    if (input.roleId && input.companyId && input.grantedBy) {
      const now = new Date();
      await tx.update(userCompanyRoles)
        .set({
          roleId:    input.roleId,
          isActive:  true,
          grantedBy: input.grantedBy,
          grantedAt: now,
          revokedAt: null,
        })
        .where(
          and(
            eq(userCompanyRoles.userId,    input.userId),
            eq(userCompanyRoles.companyId, input.companyId)
          )
        );
    }

    return { updated: true };
  });
}

// ── Reasignar rol en tenant ───────────────────────────────────
export async function assignRole(input: AssignRoleInput): Promise<{ assigned: boolean }> {
  return await db.transaction(async (tx) => {
    const now = new Date();

    // Revoke previous active role in this company
    await tx.update(userCompanyRoles)
      .set({ isActive: false, revokedAt: now })
      .where(
        and(
          eq(userCompanyRoles.userId, input.userId),
          eq(userCompanyRoles.companyId, input.companyId),
          eq(userCompanyRoles.isActive, true)
        )
      );

    // Assign new role — UPDATE in place to respect uq_ucr_user_company unique constraint
    await tx.update(userCompanyRoles)
      .set({
        roleId:    input.roleId,
        isActive:  true,
        grantedBy: input.grantedBy,
        grantedAt: now,
        revokedAt: null,
      })
      .where(
        and(
          eq(userCompanyRoles.userId,    input.userId),
          eq(userCompanyRoles.companyId, input.companyId)
        )
      );

    return { assigned: true };
  });
}
// ── Eliminar usuario (Hard Delete si no tiene actividad) ────
export async function deleteUser(userId: string): Promise<void> {
  const [existing] = await db.select({ id: users.id, isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, userId)).limit(1);
  if (!existing) throw new Error("Usuario no encontrado.");
  
  if (existing.isSuperAdmin) {
    const [superAdminCount] = await db.select({ c: count() }).from(users).where(eq(users.isSuperAdmin, true));
    if (superAdminCount && superAdminCount.c <= 1) {
      throw new Error("No se puede eliminar a este usuario porque es el único Súper Administrador restante. El sistema requiere al menos un súper usuario.");
    }
  }

  // Check activity
  const [journalCount] = await db.select({ c: count() }).from(journalEntries).where(eq(journalEntries.createdBy, userId));
  if (journalCount && journalCount.c > 0) {
    throw new Error("No se puede eliminar el usuario permanentemente porque tiene datos financieros asociados (asientos contables). Por seguridad, presione 'Desactivar' en su lugar.");
  }

  const [bankMatchCount] = await db.select({ c: count() }).from(bankTransactions).where(eq(bankTransactions.matchedBy, userId));
  if (bankMatchCount && bankMatchCount.c > 0) {
    throw new Error("No se puede eliminar el usuario permanentemente porque tiene conciliaciones bancarias asociadas. Por seguridad, presione 'Desactivar' en su lugar.");
  }

  const [fiscalCount] = await db.select({ c: count() }).from(fiscalPeriods).where(eq(fiscalPeriods.closedBy, userId));
  if (fiscalCount && fiscalCount.c > 0) {
    throw new Error("No se puede eliminar el usuario permanentemente porque ha realizado cierres de periodos fiscales. Por seguridad, presione 'Desactivar' en su lugar.");
  }

  // Careful deletion order to respect FK constraints:
  try {
    await db.transaction(async (tx) => {
      // 1. Invalidate sessions (don't delete — audit_logs.session_id references them and is immutable)
      await tx.update(sessions).set({ isValid: false }).where(eq(sessions.userId, userId));
      // 2. Remove role assignments
      await tx.delete(userCompanyRoles).where(eq(userCompanyRoles.userId, userId));
      // 3. Delete the user (nullable FKs in audit_logs will be handled by Postgres)
      await tx.delete(users).where(eq(users.id, userId));
    });
  } catch (err: any) {
    const errorString = String(err) + " " + String(err.cause) + " " + (err.cause?.message || "");
    if (errorString.includes("foreign key constraint") || errorString.includes("violates foreign key")) {
      if (errorString.includes("audit_logs")) {
        throw new Error("El usuario no puede ser eliminado permanentemente debido a que existen registros inmutables de seguridad en la bitácora de auditoría asociados a su historial. Por regulaciones financieras, su identidad no puede ser destruida. Por favor, utilice la opción 'Desactivar' en su lugar.");
      }
      throw new Error("No se puede eliminar permanentemente a este usuario debido a que otros registros de seguridad y roles en el sistema dependen estrictamente de su identificador. Por favor, presione 'Desactivar' en su lugar para revocar su acceso seguro.");
    }
    throw err;
  }
}

