import { Elysia, t } from "elysia";
import { BackupService } from "../../services/backup/BackupService";
import { BackupScheduler } from "../../services/backup/BackupScheduler";

const backupService = new BackupService();
export const backupScheduler = new BackupScheduler();

export const backupRoutes = new Elysia({ prefix: "/backup" })
  .get("/list", async () => {
    try {
      const backups = await backupService.listBackups();
      return { success: true, backups };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  })
  .post("/create", async ({ body }) => {
    try {
      const result = await backupService.createBackup(body.password);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({ password: t.String() })
  })
  .post("/restore", async ({ body }) => {
    try {
      const result = await backupService.restoreBackup(body.filename, body.password);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({ filename: t.String(), password: t.String() })
  })
  .get("/download/:filename", async ({ params, set }) => {
    try {
      const path = await backupService.exportBackup(params.filename);
      // Elysia serves files directly by returning Bun.file
      return Bun.file(path);
    } catch (err: any) {
      set.status = 404;
      return { success: false, message: "Backup no encontrado." };
    }
  })
  .post("/validate", async ({ body }) => {
    try {
      const result = await backupService.validateBackup(body.filename, body.password);
      return { success: true, result };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({ filename: t.String(), password: t.String() })
  })
  .get("/status", async () => {
    try {
      const info = await backupScheduler.getLastBackupInfo();
      const next = await backupScheduler.getNextBackupTime();
      return { success: true, info, next };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  })
  .put("/schedule", async ({ body }) => {
    try {
      await backupScheduler.setSchedule(body.hourUTC);
      return { success: true, message: "Schedule updated." };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }, {
    body: t.Object({ hourUTC: t.Number() })
  });
