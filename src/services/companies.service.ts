// ============================================================
// COMPANIES SERVICE
// Multi-tenant configuration bounding endpoints globally.
// Companies are NEVER physically deleted, only archived (is_active = 0).
// ============================================================

import { rawDb } from "../db/connection.ts";
import { v4 as uuidv4 } from "uuid";
import { seedGaapForCompany } from "./accounts.service.ts";

// ── Types ────────────────────────────────────────────────────
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
// Super Admin sees all. Regular User sees only theirs.
export function listCompanies(userId: string, isSuperAdmin: boolean) {
  if (isSuperAdmin) {
    return rawDb.query(
      `SELECT * FROM companies WHERE is_active = 1 ORDER BY created_at DESC`
    ).all();
  }

  // Regular user sees only where they have an active unrevoked role
  return rawDb.query(
    `SELECT c.* 
     FROM companies c
     JOIN user_company_roles ucr ON c.id = ucr.company_id
     WHERE ucr.user_id = ? 
       AND ucr.is_active = 1 
       AND ucr.revoked_at IS NULL 
       AND c.is_active = 1
     ORDER BY c.legal_name ASC`
  ).all(userId);
}

// ── Create Company ───────────────────────────────────────────
// Typically reserved for Super Admins.
export function createCompany(input: CompanyInput): string {
  const id = uuidv4();
  const now = new Date().toISOString();

  rawDb.prepare(
    `INSERT INTO companies 
       (id, legal_name, trade_name, ein, address, city, state, zip_code, phone, email, fiscal_year_start, currency, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    id, input.legalName, input.tradeName ?? null, input.ein ?? null,
    input.address ?? null, input.city ?? null, input.state ?? null, input.zipCode ?? null,
    input.phone ?? null, input.email ?? null, input.fiscalYearStart, input.currency,
    now, now
  );

  // Seed default GAAP chart of accounts
  seedGaapForCompany(id);

  return id;
}

// ── Update Company ───────────────────────────────────────────
export function updateCompany(id: string, input: Partial<CompanyInput>): void {
  const existing = rawDb.query("SELECT id FROM companies WHERE id = ?").get(id);
  if (!existing) throw new Error("Company not found");

  const fields: string[] = [];
  const props: any[] = [];
  
  if (input.legalName !== undefined) { fields.push("legal_name = ?"); props.push(input.legalName); }
  if (input.tradeName !== undefined) { fields.push("trade_name = ?"); props.push(input.tradeName); }
  if (input.ein !== undefined) { fields.push("ein = ?"); props.push(input.ein); }
  if (input.address !== undefined) { fields.push("address = ?"); props.push(input.address); }
  if (input.city !== undefined) { fields.push("city = ?"); props.push(input.city); }
  if (input.state !== undefined) { fields.push("state = ?"); props.push(input.state); }
  if (input.zipCode !== undefined) { fields.push("zip_code = ?"); props.push(input.zipCode); }
  if (input.phone !== undefined) { fields.push("phone = ?"); props.push(input.phone); }
  if (input.email !== undefined) { fields.push("email = ?"); props.push(input.email); }
  if (input.fiscalYearStart !== undefined) { fields.push("fiscal_year_start = ?"); props.push(input.fiscalYearStart); }
  if (input.currency !== undefined) { fields.push("currency = ?"); props.push(input.currency); }

  if (fields.length === 0) return;

  fields.push("updated_at = ?");
  props.push(new Date().toISOString());
  props.push(id);

  rawDb.prepare(
    `UPDATE companies SET ${fields.join(", ")} WHERE id = ?`
  ).run(...props);
}

// ── Archive Company (Soft Delete) ────────────────────────────
export function archiveCompany(id: string): void {
  const existing = rawDb.query("SELECT id FROM companies WHERE id = ?").get(id);
  if (!existing) throw new Error("Company not found");

  rawDb.prepare(
    "UPDATE companies SET is_active = 0, updated_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), id);
}

// ── List Company Users ───────────────────────────────────────
export function listCompanyUsers(companyId: string) {
  return rawDb.query(
    `SELECT u.id, u.username, u.email, u.first_name, u.last_name, r.name as role_name, ucr.is_active, ucr.granted_at, ucr.revoked_at
     FROM user_company_roles ucr
     JOIN users u ON ucr.user_id = u.id
     JOIN roles r ON ucr.role_id = r.id
     WHERE ucr.company_id = ?
     ORDER BY u.username ASC`
  ).all(companyId);
}

// ── Add User To Company ──────────────────────────────────────
export function addUserToCompany(companyId: string, targetUserId: string, roleId: string, grantedByUserId: string): string {
  // Check if they already have an active role here
  const existing = rawDb.query(
    "SELECT id FROM user_company_roles WHERE user_id = ? AND company_id = ? AND is_active = 1 AND revoked_at IS NULL"
  ).get(targetUserId, companyId);
  
  if (existing) throw new Error("User already has an active role in this company");

  const id = uuidv4();
  const now = new Date().toISOString();

  rawDb.prepare(
    `INSERT INTO user_company_roles 
       (id, user_id, company_id, role_id, is_active, granted_by, granted_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).run(id, targetUserId, companyId, roleId, grantedByUserId, now);

  return id;
}

// ── Revoke User From Company ─────────────────────────────────
export function revokeUserFromCompany(companyId: string, targetUserId: string): void {
  const existing = rawDb.query(
    "SELECT id FROM user_company_roles WHERE user_id = ? AND company_id = ? AND is_active = 1 AND revoked_at IS NULL"
  ).get(targetUserId, companyId) as { id: string } | undefined;
  
  if (!existing) throw new Error("No active role found for this user in this company");

  rawDb.prepare(
    "UPDATE user_company_roles SET is_active = 0, revoked_at = ? WHERE id = ?"
  ).run(new Date().toISOString(), existing.id);
}

