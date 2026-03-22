import { BackupService } from './BackupService';
import { rawDb as db } from '../../db/connection';
import { createAuditEntry } from '../audit.service';

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
    this.checkSchedule(); // check on start
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }

  private async checkSchedule() {
    try {
      const row = db.query('SELECT backup_schedule_hour FROM system_config LIMIT 1').get() as any;
      if (!row || row.backup_schedule_hour === null) return;
      
      const hourUTC = parseInt(row.backup_schedule_hour, 10);
      const currentHour = new Date().getUTCHours();
      
      if (currentHour === hourUTC) {
         const ranToday = db.query("SELECT 1 FROM audit_logs WHERE action IN ('backup:success', 'backup:failed') AND DATE(created_at) = DATE('now')").get();
         if (!ranToday) {
             console.log("[Backup] Starting scheduled backup.");
             await this.runScheduledBackup();
         }
      }
    } catch (e) {
      console.error("[Backup] Scheduled check error: ", e);
    }
  }

  private async runScheduledBackup() {
    const tempPassword = process.env.AUTO_BACKUP_SECRET || crypto.randomUUID();
    let filename = "";
    try {
      const result = await this.backupService.createBackup(tempPassword);
      filename = result.filename;
      await this.backupService.pruneOldBackups(30);
      
      createAuditEntry({
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
      
    } catch (e: any) {
      createAuditEntry({
        companyId: null,
        userId: null,
        sessionId: null,
        action: 'backup:failed',
        module: 'system',
        entityType: 'backup',
        entityId: null,
        beforeState: null,
        afterState: { error: e.message },
        ipAddress: '127.0.0.1'
      });
    }
  }

  async runNow(password: string): Promise<void> {
    await this.backupService.createBackup(password);
    await this.backupService.pruneOldBackups(30);
  }

  async setSchedule(hourUTC: number): Promise<void> {
    db.query("UPDATE system_config SET backup_schedule_hour = ?").run(hourUTC);
  }

  async getLastBackupInfo(): Promise<LastBackupInfo> {
    const backups = await this.backupService.listBackups(1);
    let filename = null;
    let date = null;
    let status: 'success' | 'failed' | 'none' = 'none';
    
    if (backups.length > 0) {
      filename = backups[0].filename;
      date = backups[0].createdAt;
      status = 'success';
    }

    let scheduledHourUTC = null;
    try {
      const row = db.query("SELECT backup_schedule_hour FROM system_config LIMIT 1").get() as any;
      if (row && row.backup_schedule_hour !== null) {
        scheduledHourUTC = parseInt(row.backup_schedule_hour, 10);
      }
    } catch (e) {}

    return { filename, date, status, scheduledHourUTC };
  }

  async getNextBackupTime(): Promise<string> {
     const info = await this.getLastBackupInfo();
     if (info.scheduledHourUTC === null) return "Nunca";
     return `Cada día a las ${info.scheduledHourUTC.toString().padStart(2, '0')}:00 UTC`;
  }
}
