// src/services/secret-manager.service.ts
import { env } from "../config/validate.ts";

let cachedJournalSecret: string | null = null;
let cachedAuditSecret: string | null = null;

/**
 * Retrieves the HMAC secret for Journal integrity.
 * Priority: 1. KMS (if configured) | 2. Environment Variable
 */
export async function getJournalHmacSecret(): Promise<string> {
  if (cachedJournalSecret) return cachedJournalSecret;

  const provider = env.KMS_PROVIDER || "none";
  
  if (provider === "none") {
    const secret = env.JOURNAL_HMAC_SECRET;
    if (!secret) {
      throw new Error("JOURNAL_HMAC_SECRET no está configurado en el entorno.");
    }
    cachedJournalSecret = secret;
    return secret;
  }

  // Si llegamos aquí, se configuró un proveedor pero no está implementado aún
  if (provider === "aws" || provider === "vault") {
    throw new Error(`KMS Provider '${provider}' configurado pero no implementado en esta versión.`);
  }

  throw new Error(`Proveedor de KMS desconocido: ${provider}`);
}

/**
 * Retrieves the HMAC secret for Audit chain integrity.
 * Priority: 1. KMS (if configured) | 2. Environment Variable
 */
export async function getAuditHmacSecret(): Promise<string> {
  if (cachedAuditSecret) return cachedAuditSecret;

  const provider = env.KMS_PROVIDER || "none";
  
  if (provider === "none") {
    const secret = env.AUDIT_HMAC_SECRET;
    if (!secret) {
      throw new Error("AUDIT_HMAC_SECRET no está configurado en el entorno.");
    }
    cachedAuditSecret = secret;
    return secret;
  }

  if (provider === "aws" || provider === "vault") {
    throw new Error(`KMS Provider '${provider}' configurado pero no implementado en esta versión.`);
  }

  throw new Error(`Proveedor de KMS desconocido: ${provider}`);
}

/**
 * Resets the in-memory secret cache. Useful for testing or rotation.
 */
export function flushSecretCache(): void {
  cachedJournalSecret = null;
  cachedAuditSecret = null;
}
