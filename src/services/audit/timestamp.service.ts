import { buildTSQ_ASN1 } from "./asn1.service.ts";

export async function stampChain(chainHash: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(chainHash));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const tsq = buildTSQ_ASN1(hashHex);

  const response = await fetch("https://freetsa.org/tsr", {
    method: "POST",
    headers: { "Content-Type": "application/timestamp-query" },
    body: tsq
  });

  if (!response.ok) {
    throw new Error(`FreeTSA failed: ${response.status}`);
  }

  const tsrBuffer = await response.arrayBuffer();
  return Buffer.from(tsrBuffer).toString("base64");
}

