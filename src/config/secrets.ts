import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

export function ensureSecrets(): void {
  let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
  let changed = false;

  const secrets = [
    { key: "SESSION_SECRET", default: "", minLen: 32 },
    { key: "AUDIT_HMAC_SECRET", default: "change-me-for-production-purposes-only", minLen: 32 },
    { key: "JOURNAL_HMAC_SECRET", default: "change-me-for-journal-hash-purposes-only", minLen: 32 },
    { key: "AUTO_BACKUP_SECRET", default: "", minLen: 32 },
  ];

  for (const secret of secrets) {
    const regex = new RegExp(`^${secret.key}=.*$`, "m");
    const existing = envContent.match(regex);
    
    if (!existing || (secret.minLen && existing[0].split('=')[1].length < secret.minLen)) {
      const newValue = randomBytes(secret.minLen ? secret.minLen / 2 : 32).toString("hex");
      if (existing) {
        envContent = envContent.replace(regex, `${secret.key}=${newValue}`);
      } else {
        envContent += `\n${secret.key}=${newValue}`;
      }
      // Actualizar también el entorno actual para que validateEnv no falle
      process.env[secret.key] = newValue;
      changed = true;
      console.log(`🔐 ${secret.key} generado automáticamente`);
    }
  }

  if (changed) {
    fs.writeFileSync(ENV_PATH, envContent.trim() + "\n");
  }
}
