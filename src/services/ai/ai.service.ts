// ============================================================
// AI SERVICE
// Proxy a Ollama (local) con contexto financiero de la DB.
// SECURITY: Solo lectura. Nunca ejecuta SQL de escritura.
// ============================================================

import { rawDb } from "../../db/connection.ts";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL      = "mistral";

const SYSTEM_PROMPT = `You are a bookkeeping assistant for a small business accounting system.

Your responsibilities:
- Analyze financial data provided to you in JSON format
- Identify imbalances, anomalies, or unusual patterns in journal entries
- Help interpret account balances, income, and expenses
- Suggest corrective actions when bookkeeping issues are detected
- Answer questions about the company's financial position

CRITICAL CONSTRAINTS:
- You have READ-ONLY access to financial data
- You CANNOT modify any records
- All data is provided as JSON summaries — do not invent numbers
- Be concise, specific, and actionable
- Always respond in the same language the user writes in`;

// ── Contexto financiero de la empresa ────────────────────────

export function buildFinancialContext(companyId: string): object {
  try {
    // Balance bancario
    const bank = rawDb.query(
      `SELECT SUM(balance) as total FROM bank_accounts WHERE company_id = ?`
    ).get(companyId) as any;

    // Transacciones pendientes
    const pending = rawDb.query(
      `SELECT COUNT(*) as count FROM bank_transactions WHERE company_id = ? AND status = 'pending'`
    ).get(companyId) as any;

    // Período fiscal activo
    const period = rawDb.query(
      `SELECT name, start_date, end_date FROM fiscal_periods
       WHERE company_id = ? AND status = 'open'
       ORDER BY start_date ASC LIMIT 1`
    ).get(companyId) as any;

    // Últimos 10 asientos del diario
    const journal = rawDb.query(
      `SELECT je.entry_date as date, je.description, je.reference,
              SUM(jl.debit_amount)  as total_debits,
              SUM(jl.credit_amount) as total_credits
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
       WHERE je.company_id = ?
       GROUP BY je.id
       ORDER BY je.entry_date DESC LIMIT 10`
    ).all(companyId) as any[];

    // Verificar balance de partida doble (últimos 30 días)
    const balance = rawDb.query(
      `SELECT SUM(jl.debit_amount) as debits, SUM(jl.credit_amount) as credits
       FROM journal_lines jl
       INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.company_id = ?
         AND je.entry_date >= date('now', '-30 days')`
    ).get(companyId) as any;

    // Top 5 cuentas por actividad
    const topAccounts = rawDb.query(
      `SELECT ca.code as account_code, ca.name as account_name, ca.account_type,
              SUM(jl.debit_amount + jl.credit_amount) as activity
       FROM journal_lines jl
       INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       INNER JOIN chart_of_accounts ca ON ca.id = jl.account_id
       WHERE je.company_id = ?
       GROUP BY ca.id
       ORDER BY activity DESC LIMIT 5`
    ).all(companyId) as any[];

    const debitTotal  = balance?.debits  || 0;
    const creditTotal = balance?.credits || 0;

    return {
      companyId,
      activePeriod: period || null,
      bankBalance: bank?.total || 0,
      pendingTransactions: pending?.count || 0,
      doubleEntryCheck: {
        totalDebits:  debitTotal,
        totalCredits: creditTotal,
        isBalanced:   debitTotal === creditTotal,
        difference:   Math.abs(debitTotal - creditTotal)
      },
      recentJournalEntries: journal,
      topAccountsByActivity: topAccounts
    };
  } catch (err) {
    return { error: "Failed to build financial context", detail: String(err) };
  }
}

// ── Llamada a Ollama con streaming ────────────────────────────

export async function* chatWithOllama(
  messages: { role: string; content: string }[],
  companyId: string
): AsyncGenerator<string> {
  const context = buildFinancialContext(companyId);

  // Inyectar contexto financiero como primer mensaje del sistema
  const contextMessage = {
    role: "user",
    content: `[FINANCIAL CONTEXT - Current company data]\n${JSON.stringify(context, null, 2)}\n\n[Use this data to answer the following questions accurately]`
  };

  const fullMessages = [contextMessage, ...messages];

  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:    MODEL,
      messages: fullMessages,
      stream:   true,
      system:   SYSTEM_PROMPT,
    }),
  });

  if (!response.ok || !response.body) {
    yield `Error connecting to Ollama. Make sure it is running on localhost:11434 and the model "${MODEL}" is installed.`;
    return;
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          yield json.message.content;
        }
      } catch {
        // línea incompleta, ignorar
      }
    }
  }
}
