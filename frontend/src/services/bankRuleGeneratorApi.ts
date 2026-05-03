import { fetchApi } from "../lib/api";

export interface PendingGroup {
  groupId: string;
  sampleDescription: string;
  count: number;
  totalAmount: number;
  direction: "debit" | "credit" | "mixed";
  transactionIds: string[];
  representativeDescription: string;
  counterparty?: string | null;
  concept?: string | null;
  avgAmount?: number;
}

export async function fetchGroups(companyId: string, minGroupSize = 2, limit = 500): Promise<PendingGroup[]> {
  const res = await fetchApi("/bank-rules/analyze-pending", {
    method: "POST",
    body: JSON.stringify({ minGroupSize, limit })
  });
  if (!res.success) throw new Error(res.error);
  return res.groups;
}

export async function suggestRule(companyId: string, message: string): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos
  try {
    const res = await fetchApi("/ai/suggest-rule", {
      method: "POST",
      body: JSON.stringify({ companyId, message }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('La solicitud a la IA excedió el tiempo de espera.');
    throw err;
  }
}

export async function createRule(companyId: string, ruleData: any): Promise<any> {
  const res = await fetchApi("/bank-rules", {
    method: "POST",
    body: JSON.stringify({ ...ruleData, companyId })
  });
  return res;
}
