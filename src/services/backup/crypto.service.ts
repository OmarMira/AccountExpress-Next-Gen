import { readFile, writeFile } from 'fs/promises';

const MAGIC = new TextEncoder().encode("AEX1");

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      // REASON: WebCrypto SubtleCrypto buffer type incompatibility in Bun runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      salt: salt as any,
      iterations: 210000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptFile(inputPath: string, password: string, metadata: object): Promise<string> {
  const fileData = await readFile(inputPath);
  
  const metaStr = JSON.stringify(metadata);
  const metaBytes = new TextEncoder().encode(metaStr);
  
  const metaLenBytes = new Uint8Array(4);
  new DataView(metaLenBytes.buffer).setUint32(0, metaBytes.length, true);
  
  const payload = new Uint8Array(metaLenBytes.length + metaBytes.length + fileData.length);
  payload.set(metaLenBytes, 0);
  payload.set(metaBytes, metaLenBytes.length);
  payload.set(new Uint8Array(fileData), metaLenBytes.length + metaBytes.length);

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const key = await deriveKey(password, salt);
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      // REASON: WebCrypto SubtleCrypto buffer type incompatibility in Bun runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      iv: iv as any
    },
    key,
    payload
  );
  
  const encryptedPayload = new Uint8Array(encryptedBuffer);
  
  const output = new Uint8Array(MAGIC.length + salt.length + iv.length + encryptedPayload.length);
  output.set(MAGIC, 0);
  output.set(salt, MAGIC.length);
  output.set(iv, MAGIC.length + salt.length);
  output.set(encryptedPayload, MAGIC.length + salt.length + iv.length);
  
  const outputPath = `${inputPath}.enc`;
  await writeFile(outputPath, output);
  return outputPath;
}

export async function decryptFile(inputPath: string, password: string): Promise<{data: Buffer, metadata: Record<string, unknown>}> {
  const file = await readFile(inputPath);
  const data = new Uint8Array(file);
  
  const magic = data.slice(0, 4);
  const magicStr = new TextDecoder().decode(magic);
  if (magicStr !== "AEX1") {
    throw new Error("Formato de backup inválido.");
  }
  
  const salt = data.slice(4, 36);
  const iv = data.slice(36, 48);
  const encryptedPayload = data.slice(48);
  
  const key = await deriveKey(password, salt);
  
  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        // REASON: WebCrypto SubtleCrypto buffer type incompatibility in Bun runtime
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        iv: iv as any
      },
      key,
      encryptedPayload
    );
  } catch (err) {
    throw new Error("Contraseña incorrecta o archivo corrupto.");
  }
  
  const decryptedData = new Uint8Array(decryptedBuffer);
  const metaLen = new DataView(decryptedData.slice(0, 4).buffer).getUint32(0, true);
  
  const metaBytes = decryptedData.slice(4, 4 + metaLen);
  const metaStr = new TextDecoder().decode(metaBytes);
  const metadata = JSON.parse(metaStr);
  
  const fileData = decryptedData.slice(4 + metaLen);
  return {
    data: Buffer.from(fileData),
    metadata
  };
}

export async function hashFile(filePath: string): Promise<string> {
  const fileBuffer = await readFile(filePath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

