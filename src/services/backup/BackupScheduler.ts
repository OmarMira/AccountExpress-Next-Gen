import { BackupService } from './BackupService.ts';
import { db } from '../../db/connection.ts';
import { systemConfig, auditLogs } from '../../db/schema/index.ts';
import { createAuditEntry } from '../audit.service.ts';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.ts';
import { env } from '../../config/validate.ts';

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface LastBackupInfo {
  filename: string | null;
  date: string | null;
  status: 'success' | 'failed' | 'none';
  scheduledHourUTC: number | null;
}

export class BackupScheduler {
  private timer: Timer | null = null;
  private backupService: BackupService;

  constructor() {
    this.backupService = new BackupService();
  }

  async start(): Promise<void> {
    this.timer = setInterval(() => this.checkSchedule(), 60 * 60 * 1000);
    try {
      await this.checkSchedule(); // check on start
    } catch (e) {
      logger.error("BackupScheduler", "Error during initial checkSchedule", e);
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }

  private async checkSchedule() {
    try {
      const [row] = await db.select({ backupScheduleHour: systemConfig.backupScheduleHour }).from(systemConfig).limit(1);
      if (!row || row.backupScheduleHour === null) return;
      
      const hourUTC = row.backupScheduleHour;
      const currentHour = new Date().getUTCHours();
      
      if (currentHour === hourUTC) {
         const [ranToday] = await db.execute(sql`
           SELECT 1 as ran FROM audit_logs
           WHERE action IN ('backup:success', 'backup:failed')
             AND DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE
           LIMIT 1
         `) as { ran: number }[];

         if (!ranToday) {
             logger.info("BackupScheduler", "Starting scheduled backup");
             await this.runScheduledBackup();
         }
      }
    } catch (e) {
      logger.error("BackupScheduler", "Scheduled check error", e);
    }
  }

  private async runScheduledBackup() {
    const tempPassword = env.AUTO_BACKUP_SECRET;
    let filename = "";
    try {
      const result = await this.backupService.createBackup(tempPassword);
      filename = result.filename;
      await this.backupService.pruneOldBackups(30);
      
      await createAuditEntry({
        companyId: null,
        userId: null,
        sessionId: null,
        action: 'backup:success',
        module: 'system',
        entityType: 'backup',
        entityId: null,
        beforeState: null,
        afterState: { filename },
        ipAddress: '127.0.0.1'
      });
      
    } catch (e: unknown) {
      await createAuditEntry({
        companyId: null,
        userId: null,
        sessionId: null,
        action: 'backup:failed',
        module: 'system',
        entityType: 'backup',
        entityId: null,
        beforeState: null,
        afterState: { error: errMsg(e) },
        ipAddress: '127.0.0.1'
      });
    }
  }

  async runNow(password: string): Promise<void> {
    await this.backupService.createBackup(password);
    await this.backupService.pruneOldBackups(30);
  }

  async setSchedule(hourUTC: number): Promise<void> {
    // Requires an initial row to update, assuming systemConfig has one.
    await db.update(systemConfig).set({ backupScheduleHour: hourUTC });
  }

  async getLastBackupInfo(): Promise<LastBackupInfo> {
    const backups = await this.backupService.listBackups(1);
    let filename: string | null = null;
    let date: string | null = null;
    let status: 'success' | 'failed' | 'none' = 'none';
    
    if (backups.length > 0) {
      filename = backups[0].filename;
      date = backups[0].createdAt;
      status = 'success';
    }

    let scheduledHourUTC: number | null = null;
    try {
      const [row] = await db.select({ backupScheduleHour: systemConfig.backupScheduleHour }).from(systemConfig).limit(1);
      if (row && row.backupScheduleHour !== null) {
        scheduledHourUTC = row.backupScheduleHour;
      }
    } catch (e) {
      logger.error("BackupScheduler", "Error fetching scheduled hour", e);
    }

    return { filename, date, status, scheduledHourUTC };
  }

  async getNextBackupTime(): Promise<string> {
     const info = await this.getLastBackupInfo();
     if (info.scheduledHourUTC === null) return "Nunca";
     return `Cada día a las ${info.scheduledHourUTC.toString().padStart(2, '0')}:00 UTC`;
  }
}
