// ============================================================
// USERS SERVICE
// CRUD de usuarios + asignación de roles por tenant.
// SRP: solo lógica de negocio, sin HTTP.
// ============================================================

import { rawDb as db } from "../db/connection.ts";
import { hashPassword } from "./auth.service.ts";
import { randomUUID } from "crypto";

// ── Tipos ────────────────────────────────────────────────────

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyId: string;
  roleId: string;
  grantedBy: string; // userId del admin que crea
}

export interface UpdateUserInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export interface AssignRoleInput {
  userId: string;
  companyId: string;
  roleId: string;
  grantedBy: string;
}

// ── Listar usuarios de un tenant ─────────────────────────────

export function listUsers(companyId: string) {
  return db.query(`
    SELECT
      u.id, u.username, u.email,
      u.first_name AS firstName, u.last_name AS lastName,
      u.is_active AS isActive, u.is_locked AS isLocked, u.must_change_password AS mustChangePassword,
      u.last_login_at AS lastLoginAt, u.created_at AS createdAt,
      r.id   AS roleId,
      r.name AS roleName,
      r.display_name AS roleDisplayName,
      ucr.is_active AS roleActive
    FROM users u
    INNER JOIN user_company_roles ucr ON ucr.user_id = u.id
    INNER JOIN roles r ON r.id = ucr.role_id
    WHERE ucr.company_id = ? AND ucr.is_active = 1
    ORDER BY u.created_at DESC
  `).all(companyId);
}

// ── Listar roles disponibles ──────────────────────────────────

export function listRoles() {
  return db.query(`
    SELECT id, name, display_name AS displayName, description
    FROM roles
    WHERE is_active = 1 AND is_system = 0
    ORDER BY display_name ASC
  `).all();
}

// ── Crear usuario + asignar rol en tenant ────────────────────

export async function createUser(input: CreateUserInput) {
  const { hash, salt } = await hashPassword(input.password);
  const userId = randomUUID();

  // Insertar usuario global
  db.query(`
    INSERT INTO users (
      id, username, email, password_hash, password_salt,
      first_name, last_name, is_super_admin, is_active, is_locked, failed_attempts, must_change_password, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 0, 0, 1, datetime('now'), datetime('now'))
  `).run(userId, input.username, input.email, hash, salt,
         input.firstName, input.lastName);

  // Asignar rol en la empresa
  db.query(`
    INSERT INTO user_company_roles (
      id, user_id, company_id, role_id, is_active, granted_by, granted_at
    ) VALUES (?, ?, ?, ?, 1, ?, datetime('now'))
  `).run(randomUUID(), userId, input.companyId, input.roleId, input.grantedBy);

  return { userId };
}

// ── Actualizar datos del usuario ──────────────────────────────

export function updateUser(input: UpdateUserInput) {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.firstName !== undefined) { fields.push("first_name = ?"); values.push(input.firstName); }
  if (input.lastName  !== undefined) { fields.push("last_name = ?");  values.push(input.lastName); }
  if (input.isActive  !== undefined) { fields.push("is_active = ?");  values.push(input.isActive ? 1 : 0); }
  if (input.mustChangePassword !== undefined) {
    fields.push("must_change_password = ?");
    values.push(input.mustChangePassword ? 1 : 0);
  }

  if (fields.length === 0) return { updated: false };

  fields.push("updated_at = datetime('now')");
  values.push(input.userId);

  db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return { updated: true };
}

// ── Reasignar rol en tenant ───────────────────────────────────

export function assignRole(input: AssignRoleInput) {
  // Revocar rol activo anterior
  db.query(`
    UPDATE user_company_roles
    SET is_active = 0, revoked_at = datetime('now')
    WHERE user_id = ? AND company_id = ? AND is_active = 1
  `).run(input.userId, input.companyId);

  // Asignar nuevo rol
  db.query(`
    INSERT INTO user_company_roles (
      id, user_id, company_id, role_id, is_active, granted_by, granted_at
    ) VALUES (?, ?, ?, ?, 1, ?, datetime('now'))
  `).run(randomUUID(), input.userId, input.companyId, input.roleId, input.grantedBy);

  return { assigned: true };
}
