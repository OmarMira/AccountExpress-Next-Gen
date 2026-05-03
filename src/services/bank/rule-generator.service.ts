import { db, sql } from "../../db/connection.ts";

interface PendingGroup {
  groupId: string;
  sampleDescription: string;
  count: number;
  totalAmount: number;
  direction: "debit" | "credit" | "mixed";
  transactionIds: string[];
  representativeDescription: string;
  counterparty: string | null;
  concept: string | null;
  avgAmount?: number;
}

export async function analyzePendingTransactions(
  companyId: string,
  minGroupSize: number = 2,
  limit: number = 500
): Promise<PendingGroup[]> {
  // Obtener transacciones pendientes
  const pendingTxs = await db.execute(sql`
    SELECT id, description, amount::numeric, transaction_type
    FROM bank_transactions
    WHERE company_id = ${companyId} AND status = 'pending'
    ORDER BY transaction_date DESC
    LIMIT ${limit}
  `) as { id: string; description: string; amount: string; transaction_type: string }[];

  if (pendingTxs.length === 0) return [];

  // Normalización en memoria (eliminar números largos, códigos, Conf#, etc.)
  const normalized = pendingTxs.map(tx => {
    let clean = tx.description.toUpperCase();
    // Eliminar palabras largas (> 5 caracteres alfanuméricos) que parecen IDs
    clean = clean.replace(/\b[A-Z0-9]{6,}\b/g, '');
    // Eliminar patrones de confirmación (CONF#...)
    clean = clean.replace(/CONF#[A-Z0-9]+/gi, '');
    // Eliminar IDs (ID:...)
    clean = clean.replace(/ID:[A-Z0-9-]+/gi, '');
    // Eliminar números de referencia largos
    clean = clean.replace(/\b[0-9]{8,}\b/g, '');
    // Colapsar espacios
    clean = clean.replace(/\s+/g, ' ').trim();
    return {
      id: tx.id,
      originalDesc: tx.description,
      cleanDesc: clean,
      amount: parseFloat(tx.amount),
      transactionType: tx.transaction_type
    };
  }).filter(tx => tx.cleanDesc.length > 0);

  // Agrupación por similitud (Levenshtein ratio)
  const groups: Map<string, PendingGroup> = new Map();

  for (const tx of normalized) {
    let bestGroupId: string | null = null;
    let bestSimilarity = 0.65; // umbral mínimo
    
    const counterparty = extractCounterparty(tx.originalDesc);
    const concept = extractConcept(tx.originalDesc);

    if (counterparty) {
      for (const [groupId, group] of groups.entries()) {
        if (group.direction === tx.transactionType && group.counterparty === counterparty) {
          bestGroupId = groupId;
          bestSimilarity = 1;
          break;
        }
      }
    }

    if (!bestGroupId && !counterparty) {
      bestSimilarity = 0.80; // umbral más alto para cadenas sin contraparte
      for (const [groupId, group] of groups.entries()) {
        if (!group.counterparty) {
          const sim = stringSimilarity(tx.cleanDesc, group.representativeDescription);
          if (sim > bestSimilarity) {
            bestSimilarity = sim;
            bestGroupId = groupId;
          }
        }
      }
    }

    if (bestGroupId) {
      const group = groups.get(bestGroupId)!;
      group.count++;
      group.totalAmount += tx.amount;
      group.transactionIds.push(tx.id);
      
      if (counterparty && !group.counterparty) group.counterparty = counterparty;
      if (concept && !group.concept) group.concept = concept;

      // Actualizar dirección
      if (tx.transactionType === 'debit' && group.direction !== 'credit') group.direction = 'debit';
      else if (tx.transactionType === 'credit' && group.direction !== 'debit') group.direction = 'credit';
      else if (group.direction !== 'mixed' && group.direction !== tx.transactionType) group.direction = 'mixed';
      // Actualizar descripción representativa si la actual es más corta
      if (tx.cleanDesc.length < group.representativeDescription.length) {
        group.representativeDescription = tx.cleanDesc;
        group.sampleDescription = tx.originalDesc;
      }
    } else {
      const groupId = crypto.randomUUID();
      groups.set(groupId, {
        groupId,
        sampleDescription: tx.originalDesc,
        count: 1,
        totalAmount: tx.amount,
        direction: tx.transactionType === 'debit' ? 'debit' : 'credit',
        transactionIds: [tx.id],
        representativeDescription: tx.cleanDesc,
        counterparty,
        concept
      });
    }
  }

  // Filtrar por tamaño mínimo, evitar sobreagrupaciones sin contraparte y ordenar
  const result = Array.from(groups.values())
    .filter(g => g.count >= minGroupSize)
    .filter(g => !(g.counterparty === null && g.count > 40))
    .map(g => ({
      ...g,
      totalAmount: Math.round(g.totalAmount * 100) / 100,
      avgAmount: Math.round((g.totalAmount / g.count) * 100) / 100,
    }))
    .sort((a, b) => Math.abs(b.totalAmount) - Math.abs(a.totalAmount));

  return result;
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLength = longer.length;
  if (longerLength === 0) return 1;
  const editDistance = levenshteinDistance(a, b);
  return (longerLength - editDistance) / longerLength;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  return matrix[b.length][a.length];
}

function extractCounterparty(description: string): string | null {
  const upper = description.toUpperCase();
  // Patrón "to [Nombre]"
  const toMatch = upper.match(/\bTO\s+(.+?)(?:\s+CONF#|\s+FOR\s+|$)/);
  if (toMatch) {
    return toMatch[1].replace(/[^A-Z0-9\s&.-]/g, '').trim();
  }
  // Patrón "from [Nombre]"
  const fromMatch = upper.match(/\bFROM\s+(.+?)(?:\s+CONF#|\s+FOR\s+|$)/);
  if (fromMatch) {
    return fromMatch[1].replace(/[^A-Z0-9\s&.-]/g, '').trim();
  }
  // Patrón "for \"[concepto]\""
  const forMatch = upper.match(/FOR\s+"([^"]+)"/);
  if (forMatch) return forMatch[1].trim();
  return null;
}

function extractConcept(description: string): string | null {
  const upper = description.toUpperCase();
  const forMatch = upper.match(/FOR\s+"([^"]+)"/);
  if (forMatch) return forMatch[1].trim();
  const descParts = description.split(/DES:|CCD|WEB|ID:/);
  if (descParts.length > 1) return descParts[1].trim();
  return null;
}
