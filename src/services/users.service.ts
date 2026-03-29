// ============================================================
// USERS SERVICE — PostgreSQL 16 / Drizzle ORM
// CRUD de usuarios + asignación de roles por tenant.
// All functions async.
// ============================================================

import { db }                 from "../db/connection.ts";
import { users, userCompanyRoles, roles } from "../db/schema/index.ts";
import { eq, and, isNull }    from "drizzle-orm";
import { hashPassword }        from "./auth.service.ts";
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
  isActive?:          boolean;
  mustChangePassword?: boolean;
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
  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

  if (input.firstName          !== undefined) updates.firstName          = input.firstName;
  if (input.lastName           !== undefined) updates.lastName           = input.lastName;
  if (input.isActive           !== undefined) updates.isActive           = input.isActive;
  if (input.mustChangePassword !== undefined) updates.mustChangePassword = input.mustChangePassword;

  if (Object.keys(updates).length <= 1) return { updated: false }; // only updatedAt, nothing real

  await db.update(users).set(updates).where(eq(users.id, input.userId));
  return { updated: true };
}

// ── Reasignar rol en tenant ───────────────────────────────────
export async function assignRole(input: AssignRoleInput): Promise<{ assigned: boolean }> {
  const now = new Date();

  // Revoke previous active role in this company
  await db.update(userCompanyRoles)
    .set({ isActive: false, revokedAt: now })
    .where(
      and(
        eq(userCompanyRoles.userId, input.userId),
        eq(userCompanyRoles.companyId, input.companyId),
        eq(userCompanyRoles.isActive, true)
      )
    );

  // Assign new role
  await db.insert(userCompanyRoles).values({
    id:        randomUUID(),
    userId:    input.userId,
    companyId: input.companyId,
    roleId:    input.roleId,
    isActive:  true,
    grantedBy: input.grantedBy,
    grantedAt: now,
  });

  return { assigned: true };
}
