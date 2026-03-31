import { encryptFile, decryptFile, hashFile } from './crypto.service';
import { readdir, stat, unlink, mkdir, rename } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { createGzip, gunzipSync } from 'zlib';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { createReadStream, createWriteStream } from 'fs';

const pipelineAsync = promisify(pipeline);

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
const PG_DUMP_PATH = process.env.PG_DUMP_PATH ?? 'pg_dump';
const PSQL_PATH    = process.env.PSQL_PATH    ?? 'psql';

export class BackupService {
  constructor() {
    this.ensureDir();
  }

  private async ensureDir() {
    try {
      await mkdir(BACKUPS_DIR, { recursive: true });
    } catch {}
  }

  /**
   * Helper síncrono para calcular el hash de un Buffer.
   * Utiliza el módulo nativo 'crypto' de Node.js.
   */
  private computeHash(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Ejecuta pg_dump para crear un archivo SQL y luego lo encripta.
   */
  async createBackup(password: string): Promise<BackupResult> {
    if (!password || password.trim().length < 8) {
      throw new Error("La contraseña del backup debe tener al menos 8 caracteres.");
    }
    
    await this.ensureDir();
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-${dateStr}.sql.gz.enc`;
    const outputPath = join(BACKUPS_DIR, filename);
    const tempSqlPath = join(BACKUPS_DIR, `temp-${dateStr}.sql`);
    const tempGzPath  = join(BACKUPS_DIR, `temp-${dateStr}.sql.gz`);

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL no está configurada.");

    // 1. Ejecutar pg_dump y guardar en archivo temporal
    await new Promise<void>((resolve, reject) => {
      const dumpProcess = spawn(PG_DUMP_PATH, [dbUrl, '--format=plain', '--file=' + tempSqlPath]);
      
      dumpProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pg_dump falló con código ${code}`));
      });

      dumpProcess.on('error', (err) => reject(err));
    });

    // 2. Comprimir el SQL con gzip
    await pipelineAsync(
      createReadStream(tempSqlPath),
      createGzip({ level: 6 }),
      createWriteStream(tempGzPath)
    );
    await unlink(tempSqlPath);

    // 3. Calcular hash de integridad ANTES de encriptar
    const auditHash = await hashFile(tempGzPath);

    // 4. Encriptar el archivo comprimido con el hash en los metadatos
    const encryptedPath = await encryptFile(tempGzPath, password, {
      createdAt: now.toISOString(),
      auditHash,
      format: 'postgresql-gzip'
    });

    // 5. Mover al destino final y limpiar archivos temporales
    await rename(encryptedPath, outputPath);
    await unlink(tempGzPath);

    const fileStat = await stat(outputPath);
    return {
      filename,
      size: fileStat.size
    };
  }

  /**
   * Lista los backups filtrando por .sql.enc
   */
  async listBackups(limit: number = 30): Promise<BackupMetadata[]> {
    await this.ensureDir();
    const files = await readdir(BACKUPS_DIR);
    const backups: BackupMetadata[] = [];

    for (const file of files) {
      if (!file.endsWith('.sql.gz.enc') && !file.endsWith('.sql.enc')) continue;
      const fullPath = join(BACKUPS_DIR, file);
      const fileStat = await stat(fullPath);
      
      const parts = file.replace('backup-', '').replace('.sql.enc', '').split('-');
      let createdAt = fileStat.mtime.toISOString();
      if (parts.length >= 6) {
        createdAt = `${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}:${parts[5]}.000Z`;
      }

      // Intentamos validar/extraer metadatos para obtener el hash real si es necesario,
      // pero por performance en el listado solemos dejarlo como "encrypted" o leerlo de un cache.
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

  /**
   * Desencripta el backup, verifica integridad y lo inyecta vía stdin a psql.exe
   */
  async restoreBackup(filename: string, password: string): Promise<RestoreResult> {
    const fullPath = join(BACKUPS_DIR, filename);
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL no está configurada.");
    
    // 1. Decriptar y obtener datos + metadatos
    const { data, metadata } = await decryptFile(fullPath, password);
    
    // 2. Verificar integridad del hash
    const currentHash = this.computeHash(data);
    if (currentHash !== metadata.auditHash) {
      throw new Error(`Error de integridad: El hash del backup (${currentHash}) no coincide con el original (${metadata.auditHash}).`);
    }
    
    // 3. Descomprimir si el backup es formato gzip
    let sqlData = data;
    if (metadata.format === 'postgresql-gzip') {
      sqlData = Buffer.from(gunzipSync(data));
    }

    // 4. Inyectar en psql vía stdin
    await new Promise<void>((resolve, reject) => {
      const psqlProcess = spawn(PSQL_PATH, [dbUrl, '--single-transaction']);
      
      psqlProcess.stdin.write(sqlData);
      psqlProcess.stdin.end();

      psqlProcess.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`psql falló con código ${code}`));
      });

      psqlProcess.on('error', (err) => reject(err));
    });
    
    return { success: true, message: "Base de datos PostgreSQL restaurada e íntegra." };
  }

  async pruneOldBackups(keepCount: number = 30): Promise<void> {
    const backups = await this.listBackups(1000);
    if (backups.length <= keepCount) return;
    
    const toDelete = backups.slice(keepCount);
    for (const b of toDelete) {
      await unlink(join(BACKUPS_DIR, b.filename)).catch(() => {});
    }
  }

  async exportBackup(filename: string): Promise<string> {
    const fullPath = join(BACKUPS_DIR, filename);
    await stat(fullPath);
    return fullPath;
  }

  async validateBackup(filename: string, password: string): Promise<ValidationResult> {
    const fullPath = join(BACKUPS_DIR, filename);
    try {
      const { metadata } = await decryptFile(fullPath, password);
      return { valid: true, metadata };
    } catch (e) {
      return { valid: false };
    }
  }
}
