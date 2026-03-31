// ============================================================
// AI SERVICE
// Proxy a Ollama (local) con contexto financiero de la DB.
// SECURITY: Solo lectura. Nunca ejecuta SQL de escritura.
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { db, sql } from "../../db/connection.ts";

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

export async function buildFinancialContext(companyId: string): Promise<object> {
  try {
    // Balance bancario
    const bankQuery = sql`SELECT SUM(balance) as "total" FROM bank_accounts WHERE company_id = ${companyId}`;
    const bankRows = await db.execute(bankQuery);
    const bank = bankRows[0] as any;

    // Transacciones pendientes
    const pendingQuery = sql`SELECT COUNT(*) as "count" FROM bank_transactions WHERE company_id = ${companyId} AND status = 'pending'`;
    const pendingRows = await db.execute(pendingQuery);
    const pending = pendingRows[0] as any;

    // Período fiscal activo
    const periodQuery = sql`
       SELECT name, start_date as "start_date", end_date as "end_date" FROM fiscal_periods
       WHERE company_id = ${companyId} AND status = 'open'
       ORDER BY start_date ASC LIMIT 1
    `;
    const periodRows = await db.execute(periodQuery);
    const period = periodRows[0] as any;

    // Últimos 10 asientos del diario
    const journalQuery = sql`
       SELECT je.entry_date as "date", je.description as "description", je.reference as "reference",
              SUM(jl.debit_amount)  as "total_debits",
              SUM(jl.credit_amount) as "total_credits"
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
       WHERE je.company_id = ${companyId}
       GROUP BY je.id
       ORDER BY je.entry_date DESC LIMIT 10
    `;
    const journal = await db.execute(journalQuery) as any[];

    // Verificar balance de partida doble (últimos 30 días)
    const balanceQuery = sql`
       SELECT SUM(jl.debit_amount) as "debits", SUM(jl.credit_amount) as "credits"
       FROM journal_lines jl
       INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.company_id = ${companyId}
         AND je.entry_date >= current_date - interval '30 days'
    `;
    const balanceRows = await db.execute(balanceQuery);
    const balance = balanceRows[0] as any;

    // Top 5 cuentas por actividad
    const topAccountsQuery = sql`
       SELECT ca.code as "account_code", ca.name as "account_name", ca.account_type as "account_type",
              SUM(jl.debit_amount + jl.credit_amount) as "activity"
       FROM journal_lines jl
       INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       INNER JOIN chart_of_accounts ca ON ca.id = jl.account_id
       WHERE je.company_id = ${companyId}
       GROUP BY ca.id
       ORDER BY activity DESC LIMIT 5
    `;
    const topAccounts = await db.execute(topAccountsQuery) as any[];

    const debitTotal  = Number(balance?.debits || 0);
    const creditTotal = Number(balance?.credits || 0);

    return {
      companyId,
      activePeriod: period || null,
      bankBalance: Number(bank?.total || 0),
      pendingTransactions: Number(pending?.count || 0),
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

const MAX_MESSAGES = 50;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function* chatWithOllama(
  messages: { role: string; content: string }[],
  companyId: string
): AsyncGenerator<string> {
  if (!UUID_REGEX.test(companyId)) {
    yield "Error: invalid companyId format.";
    return;
  }
  if (messages.length > MAX_MESSAGES) {
    yield `Error: message history exceeds the limit of ${MAX_MESSAGES} messages.`;
    return;
  }
  const context = await buildFinancialContext(companyId);

  // Inyectar contexto financiero como primer mensaje del sistema
  const contextMessage = {
    role: "user",
    content: `[FINANCIAL CONTEXT - Current company data]\n${JSON.stringify(context, null, 2)}\n\n[Use this data to answer the following questions accurately]`
  };

  const fullMessages = [contextMessage, ...messages];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const response = await fetch(OLLAMA_URL, {
    signal: controller.signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:    MODEL,
      messages: fullMessages,
      stream:   true,
      system:   SYSTEM_PROMPT,
    }),
  });

  clearTimeout(timeout);
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
