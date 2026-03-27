import { encryptFile, decryptFile, hashFile } from './crypto.service';
import { readdir, stat, unlink, readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { join } from 'path';

export interface BackupResult {
  filename: string;
  size: number;
}

export interface BackupMetadata {
  filename: string;
  size: number;
  createdAt: string;
  auditHash: string;
}

export interface RestoreResult {
  success: boolean;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  metadata?: any;
}

const BACKUPS_DIR = 'data/backups';
const DB_PATH = 'data/bookkeeping.db';

export class BackupService {
  constructor() {
    this.ensureDir();
  }

  private async ensureDir() {
    try {
      await mkdir(BACKUPS_DIR, { recursive: true });
    } catch {}
  }

  async createBackup(password: string): Promise<BackupResult> {
    if (!password || password.trim().length < 8) {
      throw new Error("Backup password must be at least 8 characters long.");
    }
    await this.ensureDir();
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-${dateStr}.db.enc`;
    const outputPath = join(BACKUPS_DIR, filename);

    const auditHash = await hashFile(DB_PATH);

    const tempEncPath = await encryptFile(DB_PATH, password, {
      createdAt: now.toISOString(),
      auditHash
    });

    await copyFile(tempEncPath, outputPath);
    await unlink(tempEncPath);

    const fileStat = await stat(outputPath);
    return {
      filename,
      size: fileStat.size
    };
  }

  async listBackups(limit: number = 30): Promise<BackupMetadata[]> {
    await this.ensureDir();
    const files = await readdir(BACKUPS_DIR);
    const backups: BackupMetadata[] = [];

    for (const file of files) {
      if (!file.endsWith('.db.enc')) continue;
      const fullPath = join(BACKUPS_DIR, file);
      const fileStat = await stat(fullPath);
      
      const parts = file.replace('backup-', '').replace('.db.enc', '').split('-');
      // Expected format: YYYY-MM-DD-HH-mm-ss
      let createdAt = fileStat.mtime.toISOString();
      if (parts.length >= 6) {
        createdAt = `${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}.000Z`;
      }

      backups.push({
        filename: file,
        size: fileStat.size,
        createdAt,
        auditHash: "encrypted"
      });
    }
    
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return backups.slice(0, limit);
  }

  async restoreBackup(filename: string, password: string): Promise<RestoreResult> {
    const fullPath = join(BACKUPS_DIR, filename);
    
    // First, validate the backup
    const validation = await this.validateBackup(filename, password);
    if (!validation.valid) {
      throw new Error("Backup validation failed.");
    }
    
    const { auditHash } = validation.metadata;

    // Create a safety backup
    const tempPassword = crypto.randomUUID();
    await this.createBackup(tempPassword);

    // Decrypt and write
    const { data } = await decryptFile(fullPath, password);
    
    // Quick integrity check logic could be placed here if requested.
    
    // Stop DB connection if possible? Since this is external we just write
    await writeFile(DB_PATH, data);
    
    // Validate that the newly written file matches the original hash
    const newHash = await hashFile(DB_PATH);
    if (newHash !== auditHash) {
      throw new Error(`Hash mismatch after restore. Expected ${auditHash}, got ${newHash}`);
    }
    
    return { success: true, message: "Backup restored successfully" };
  }

  async pruneOldBackups(keepCount: number = 30): Promise<void> {
    const backups = await this.listBackups(1000); // get more to delete
    if (backups.length <= keepCount) return;
    
    const toDelete = backups.slice(keepCount);
    for (const b of toDelete) {
      await unlink(join(BACKUPS_DIR, b.filename)).catch(() => {});
    }
  }

  async exportBackup(filename: string): Promise<string> {
    const fullPath = join(BACKUPS_DIR, filename);
    await stat(fullPath); // throws if not exists
    return fullPath;
  }

  async validateBackup(filename: string, password: string): Promise<ValidationResult> {
    const fullPath = join(BACKUPS_DIR, filename);
    try {
      const { metadata } = await decryptFile(fullPath, password);
      // Valid if decrypted
      return { valid: true, metadata };
    } catch (e) {
      return { valid: false };
    }
  }
}

