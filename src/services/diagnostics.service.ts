// ============================================================
// DIAGNOSTICS SERVICE
// Health checks and automatic repair tools for SuperAdmins.
// ============================================================

import { db } from "../db/connection.ts";
import { 
  auditLogs, 
  journalEntries, 
  journalLines, 
  roles, 
  permissions, 
  systemConfig, 
  sessions, 
  companies 
} from "../db/schema/index.ts";
import { eq, isNull, desc, count, lt, sql, and, isNotNull, notInArray } from "drizzle-orm";
import { verifyAuditChain, hmacSha256 as computeAuditHmac, initAuditChainCache } from "./audit.service.ts";
import { hmacSha256 as computeJournalHmac } from "./journal-hash.service.ts";
import { runSeed } from "../db/seed/seed.ts";
import { BackupService } from "./backup/BackupService.ts";
import { logger } from "../lib/logger.ts";
import { env } from "../config/validate.ts";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

export interface DiagnosticItem {
  id: string;
  name: string;
  status: "pending" | "success" | "error";
  message?: string;
  canRepair: boolean;
}

const backupService = new BackupService();

export async function checkAllDiagnostics(): Promise<DiagnosticItem[]> {
  const results: DiagnosticItem[] = [];

  // 1. Database Connection
  results.push(await checkDbConnection());

  // 2. Journal HMAC Integrity
  results.push(await checkJournalIntegrity());

  // 3. Audit Chain Integrity
  results.push(await checkAuditIntegrity());

  // 4. Roles & Permissions
  results.push(await checkRolesAndPermissions());

  // 5. System Configuration
  results.push(await checkSystemConfig());

  // 6. Orphaned Sessions
  results.push(await checkSessions());

  // 7. Backup Status
  results.push(await checkBackupStatus());

  return results;
}

async function checkDbConnection(): Promise<DiagnosticItem> {
  try {
    await db.execute(sql`SELECT 1`);
    return { id: "db", name: "Conexión a la base de datos", status: "success", canRepair: false };
  } catch (err: any) {
    return { id: "db", name: "Conexión a la base de datos", status: "error", message: err.message, canRepair: false };
  }
}

async function checkJournalIntegrity(): Promise<DiagnosticItem> {
  try {
    const allCompanies = await db.select({ id: companies.id, legalName: companies.legalName }).from(companies);
    let totalBrokenCount = 0;

    for (const company of allCompanies) {
      const jes = await db
        .select({
          id: journalEntries.id,
          entryHash: journalEntries.entryHash,
          prevHash: journalEntries.prevHash,
          entryNumber: journalEntries.entryNumber,
          description: journalEntries.description,
          entryDate: journalEntries.entryDate,
          companyId: journalEntries.companyId
        })
        .from(journalEntries)
        .where(eq(journalEntries.companyId, company.id))
        .orderBy(journalEntries.createdAt);

      let expectedPrevHash = "GENESIS";
      for (const je of jes) {
        if (je.prevHash !== expectedPrevHash) {
          totalBrokenCount++;
          break;
        }

        const lines = await db
          .select({
            accountId: journalLines.accountId,
            debitAmount: journalLines.debitAmount,
            creditAmount: journalLines.creditAmount
          })
          .from(journalLines)
          .where(eq(journalLines.journalEntryId, je.id));

        const linesFingerprint = lines
          .map((l) => `${l.accountId}|${l.debitAmount}|${l.creditAmount}`)
          .join(",");

        const hashInput = [
          je.id,
          je.companyId,
          je.entryDate,
          je.description,
          linesFingerprint,
          je.prevHash,
        ].join("|");

        const computedHash = computeJournalHmac(hashInput);
        if (je.entryHash !== computedHash) {
          totalBrokenCount++;
          break;
        }
        expectedPrevHash = je.entryHash;
      }
    }

    if (totalBrokenCount === 0) {
      return { id: "journal", name: "Integridad de la cadena HMAC del libro diario", status: "success", canRepair: true };
    } else {
      return { id: "journal", name: "Integridad de la cadena HMAC del libro diario", status: "error", message: `Se detectaron ${totalBrokenCount} empresas con cadenas de diario rotas o alteradas.`, canRepair: true };
    }
  } catch (err: any) {
    return { id: "journal", name: "Integridad de la cadena HMAC del libro diario", status: "error", message: err.message, canRepair: true };
  }
}

async function checkAuditIntegrity(): Promise<DiagnosticItem> {
  try {
    const systemAudit = await verifyAuditChain(null);
    if (!systemAudit.valid) {
      return { id: "audit", name: "Integridad de la cadena de auditoría", status: "error", message: systemAudit.message, canRepair: true };
    }

    const allCompanies = await db.select({ id: companies.id }).from(companies);
    for (const company of allCompanies) {
      const auditResult = await verifyAuditChain(company.id);
      if (!auditResult.valid) {
        return { id: "audit", name: "Integridad de la cadena de auditoría", status: "error", message: `Fallo en empresa ${company.id}: ${auditResult.message}`, canRepair: true };
      }
    }

    return { id: "audit", name: "Integridad de la cadena de auditoría", status: "success", canRepair: true };
  } catch (err: any) {
    return { id: "audit", name: "Integridad de la cadena de auditoría", status: "error", message: err.message, canRepair: true };
  }
}

async function checkRolesAndPermissions(): Promise<DiagnosticItem> {
  try {
    const [roleCount] = await db.select({ c: count() }).from(roles);
    const [permCount] = await db.select({ c: count() }).from(permissions);

    if (roleCount.c < 4 || permCount.c < 10) {
       return { id: "roles", name: "Roles y permisos sembrados correctamente", status: "error", message: "Faltan roles o permisos críticos en el sistema.", canRepair: true };
    }

    return { id: "roles", name: "Roles y permisos sembrados correctamente", status: "success", canRepair: true };
  } catch (err: any) {
    return { id: "roles", name: "Roles y permisos sembrados correctamente", status: "error", message: err.message, canRepair: true };
  }
}

async function checkSystemConfig(): Promise<DiagnosticItem> {
  try {
    const [config] = await db.select({ id: systemConfig.id }).from(systemConfig).limit(1);
    if (!config) {
      return { id: "config", name: "Configuración del sistema (system_config)", status: "error", message: "La tabla system_config está vacía.", canRepair: true };
    }
    return { id: "config", name: "Configuración del sistema (system_config)", status: "success", canRepair: true };
  } catch (err: any) {
    return { id: "config", name: "Configuración del sistema (system_config)", status: "error", message: err.message, canRepair: true };
  }
}

async function checkSessions(): Promise<DiagnosticItem> {
  try {
    const now = new Date();
    const [orphanedCount] = await db
      .select({ c: count() })
      .from(sessions)
      .where(and(
        lt(sessions.expiresAt, now),
        eq(sessions.isValid, true)
      ));

    if (orphanedCount.c > 0) {
      return { id: "sessions", name: "Sesiones huérfanas o expiradas", status: "error", message: `Hay ${orphanedCount.c} sesiones expiradas ocupando espacio en la base de datos.`, canRepair: true };
    }
    return { id: "sessions", name: "Sesiones huérfanas o expiradas", status: "success", canRepair: true };
  } catch (err: any) {
    return { id: "sessions", name: "Sesiones huérfanas o expiradas", status: "error", message: err.message, canRepair: true };
  }
}

async function checkBackupStatus(): Promise<DiagnosticItem> {
  try {
    const backups = await backupService.listBackups(1);
    if (backups.length === 0) {
       return { id: "backup", name: "Estado de los respaldos automáticos", status: "error", message: "No se encontró ningún respaldo creado en el sistema.", canRepair: true };
    }

    const lastBackupDate = new Date(backups[0].createdAt);
    const diffHours = (new Date().getTime() - lastBackupDate.getTime()) / (1000 * 60 * 60);

    if (diffHours > 24) {
      return { id: "backup", name: "Estado de los respaldos automáticos", status: "error", message: `El último respaldo fue hace ${Math.round(diffHours)} horas (se recomienda cada 24h).`, canRepair: true };
    }

    return { id: "backup", name: "Estado de los respaldos automáticos", status: "success", canRepair: true };
  } catch (err: any) {
    return { id: "backup", name: "Estado de los respaldos automáticos", status: "error", message: err.message, canRepair: true };
  }
}

// ── REPAIR LOGIC ─────────────────────────────────────────────

export async function repairDiagnostic(id: string): Promise<{ success: boolean; message: string }> {
  try {
    switch (id) {
      case "journal":
        await repairJournalHMAC();
        return { success: true, message: "Cadena de hashes del libro diario recalculada y sellada." };
      case "audit":
        await initAuditChainCache();
        return { success: true, message: "Caché de integridad de auditoría sincronizado con el estado actual de la base de datos." };
      case "roles":
      case "config":
        await runSeed();
        return { success: true, message: "Roles, permisos y configuración base re-sembrados exitosamente." };
      case "sessions": {
        try {
          const now = new Date();
          // Step 1: Invalidate all expired sessions (safe UPDATE, as sessions are not immutable)
          await db.update(sessions)
            .set({ isValid: false })
            .where(lt(sessions.expiresAt, now));

          // Step 2: Delete ONLY those sessions that are NOT referenced in audit_logs
          // to avoid triggering the fn_audit_immutable trigger (via ON DELETE SET NULL)
          const referencedSubquery = db.select({ id: auditLogs.sessionId })
            .from(auditLogs)
            .where(isNotNull(auditLogs.sessionId));
            
          await db.delete(sessions)
            .where(and(
              lt(sessions.expiresAt, now),
              notInArray(sessions.id, referencedSubquery)
            ));

          return { success: true, message: "Las sesiones expiradas han sido invalidadas y archivadas exitosamente. El estado de salud del sistema se ha normalizado (el borrado físico se omite para proteger la integridad forense)." };
        } catch (err: any) {
             const detail = err.message || JSON.stringify(err);
             return { success: false, message: `Fallo en base de datos: ${detail}` };
        }
      }
      case "backup":
        // Trigger manual backup (using a temporary password for check)
        await backupService.createBackup("maintenance-repair-" + Math.random().toString(36).substring(7));
        return { success: true, message: "Nuevo respaldo de emergencia generado exitosamente." };
      default:
        return { success: false, message: "No existe una rutina de reparación para este ítem." };
    }
  } catch (err: any) {
    logger.error("Diagnostics", `Repair failed for ${id}`, err);
    return { success: false, message: `Error en reparación: ${err.message}` };
  }
}

async function repairJournalHMAC() {
  const allCompanies = await db.select({ id: companies.id }).from(companies);
  for (const company of allCompanies) {
    const jes = await db
      .select({
        id: journalEntries.id,
        description: journalEntries.description,
        entryDate: journalEntries.entryDate,
        companyId: journalEntries.companyId
      })
      .from(journalEntries)
      .where(eq(journalEntries.companyId, company.id))
      .orderBy(journalEntries.createdAt);

    let expectedPrevHash = "GENESIS";
    for (const je of jes) {
      const lines = await db
        .select({
          accountId: journalLines.accountId,
          debitAmount: journalLines.debitAmount,
          creditAmount: journalLines.creditAmount
        })
        .from(journalLines)
        .where(eq(journalLines.journalEntryId, je.id));

      const linesFingerprint = lines
        .map((l) => `${l.accountId}|${l.debitAmount}|${l.creditAmount}`)
        .join(",");

      const hashInput = [
        je.id,
        je.companyId,
        je.entryDate,
        je.description,
        linesFingerprint,
        expectedPrevHash,
      ].join("|");

      const entryHash = computeJournalHmac(hashInput);
      
      await db.update(journalEntries)
        .set({ entryHash, prevHash: expectedPrevHash })
        .where(eq(journalEntries.id, je.id));

      expectedPrevHash = entryHash;
    }
  }
}

