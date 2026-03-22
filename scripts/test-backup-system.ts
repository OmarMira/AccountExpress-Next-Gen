import { BackupService } from '../src/services/backup/BackupService';
import { BackupScheduler } from '../src/services/backup/BackupScheduler';
import { stat, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const BACKUPS_DIR = 'data/backups';

async function runTests() {
  const backupService = new BackupService();
  const scheduler = new BackupScheduler();

  console.log("=== INICIANDO TESTS DEL SISTEMA DE BACKUP ===");

  const password = "TestPass123!";
  let backupFilename = "";

  // Test 1
  try {
    const res = await backupService.createBackup(password);
    backupFilename = res.filename;
    console.log(`✅ Test 1: Backup creado correctamente: ${res.filename} (${res.size} bytes)`);
  } catch (e: any) {
    console.error(`❌ Test 1 Falló: ${e.message}`);
    process.exit(1);
  }

  // Test 2
  try {
    const list = await backupService.listBackups();
    const found = list.find(b => b.filename === backupFilename);
    if (!found) throw new Error("No se encontró el backup en la lista");
    console.log(`✅ Test 2: Backup listado correctamente. Size: ${found.size}, Hash: ${found.auditHash}`);
  } catch (e: any) {
    console.error(`❌ Test 2 Falló: ${e.message}`);
    process.exit(1);
  }

  // Test 3
  try {
    const valid = await backupService.validateBackup(backupFilename, password);
    if (!valid.valid) throw new Error("La validación retornó false");
    console.log(`✅ Test 3: Backup validado correctamente. Metadata:`, valid.metadata);
  } catch (e: any) {
    console.error(`❌ Test 3 Falló: ${e.message}`);
    process.exit(1);
  }

  // Test 4
  try {
    const path = join(BACKUPS_DIR, backupFilename);
    const data = await readFile(path);
    // Modificar un byte (en la carga cifrada para que falle la autenticación GCM)
    data[data.length - 1] ^= 1;
    await writeFile(path, data);
    
    // Debería fallar
    const valid = await backupService.validateBackup(backupFilename, password);
    if (valid.valid) throw new Error("El archivo modificado validó como correcto!");
    
    // Restaurar el byte original
    data[data.length - 1] ^= 1;
    await writeFile(path, data);
    console.log(`✅ Test 4: Validación falló correctamente al modificar el archivo.`);
  } catch (e: any) {
    console.error(`❌ Test 4 Falló: ${e.message}`);
    process.exit(1);
  }

  // Esperar un poco para evitar colisión de timestamp (los tests son muy rápidos)
  await new Promise(r => setTimeout(r, 1200));

  // Test 5
  try {
    const beforeCount = (await backupService.listBackups()).length;
    await backupService.restoreBackup(backupFilename, password);
    const afterCount = (await backupService.listBackups()).length;
    if (afterCount <= beforeCount) {
      throw new Error("No se creó el backup de seguridad de rollback.");
    }
    console.log(`✅ Test 5: Backup restaurado exitosamente y backup de seguridad creado.`);
  } catch (e: any) {
    console.error(`❌ Test 5 Falló: ${e.message}`);
    process.exit(1);
  }

  // Test 6
  try {
    let errorThrown = false;
    try {
      await backupService.restoreBackup(backupFilename, "WrongPass!");
    } catch (err) {
      errorThrown = true;
    }
    if (!errorThrown) throw new Error("Se restauró el backup con una contraseña incorrecta.");
    console.log(`✅ Test 6: Restauración rechazada correctamente con contraseña errónea.`);
  } catch (e: any) {
    console.error(`❌ Test 6 Falló: ${e.message}`);
    process.exit(1);
  }

  // Test 7
  try {
    await scheduler.setSchedule(3); // 03:00 UTC
    const nextTime = await scheduler.getNextBackupTime();
    if (!nextTime.includes("03:00")) throw new Error("Scheduler reporta hora incorrecta: " + nextTime);
    console.log(`✅ Test 7: Scheduler activo. Próximo backup: ${nextTime}`);
  } catch (e: any) {
    console.error(`❌ Test 7 Falló: ${e.message}`);
    process.exit(1);
  }

  console.log("=== TODOS LOS TESTS PASADOS CON ÉXITO ===");
  process.exit(0);
}

runTests();
