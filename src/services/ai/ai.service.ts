// ============================================================
// AI SERVICE
// Proxy a Ollama (local) con contexto financiero de la DB.
// SECURITY: Solo lectura. Nunca ejecuta SQL de escritura.
// PostgreSQL 16 / Drizzle ORM
// ============================================================

import { db, sql } from "../../db/connection.ts";
import { logger } from "../../lib/logger.ts";

const OLLAMA_URL = process.env.OLLAMA_URL 
  ? `${process.env.OLLAMA_URL}/api/chat` 
  : null;
const MODEL = process.env.OLLAMA_MODEL ?? "phi3:mini";

const SYSTEM_PROMPT = `You are a Forensic Auditor and Florida Tax Consultant for a small business accounting system.

Your role:
1. Analyze financial data provided in JSON format under [FINANCIAL CONTEXT].
2. Proactively detect anomalies, imbalances, or suspicious patterns in journal entries and the AuditChain.
3. Validate that the logic_clock sequence has no gaps. If you detect a jump in the sequence, flag it immediately.
4. Answer questions about the company's financial position anchored to the logic_clock snapshot provided.

REASONING RULES (THINK STEP BY STEP):
* Step 1: Read the logic_clock value in [FINANCIAL CONTEXT]. This is the integrity anchor — all analysis must reference this snapshot.
* Step 2: If the user asks about numbers, verify those exact numbers exist in the JSON context.
* Step 3: If the data is NOT in the JSON, reply exactly: "No tengo esos datos en mi contexto actual." Do not invent numbers.
* Step 4: Before giving your final answer, cite the exact figures and the logic_clock value from the JSON context.

HARD CONSTRAINTS:
* READ-ONLY access. You cannot modify, insert, or delete any records.
* You do NOT perform arithmetic. You only read pre-calculated values from the JSON.
* You do NOT generate SQL write statements (INSERT, UPDATE, DELETE).
* Always respond in the same language the user writes in, concisely and directly.`;

// ── Contexto financiero de la empresa ────────────────────────

interface BankRow        { total: string; }
interface PendingRow     { count: string; }
interface PeriodRow      { name: string; start_date: string; end_date: string; }
interface JournalRow     { date: string; description: string; reference: string; total_debits: string; total_credits: string; }
interface BalanceRow     { debits: string; credits: string; }
interface TopAccountRow  { account_code: string; account_name: string; account_type: string; activity: string; }

export async function buildFinancialContext(companyId: string, months: number = 3): Promise<object> {
  try {
    const intervalStr = `${months} months`;

    // Balance bancario
    const bankQuery = sql`SELECT SUM(balance) as "total" FROM bank_accounts WHERE company_id = ${companyId}`;
    const bankRows = await db.execute(bankQuery) as unknown as BankRow[];
    const bank = bankRows[0];

    // Transacciones pendientes en el período
    const pendingQuery = sql`
      SELECT COUNT(*) as "count" FROM bank_transactions 
      WHERE company_id = ${companyId} 
        AND status = 'pending'
        AND transaction_date >= current_date - ${sql.raw(`interval '${intervalStr}'`)}
    `;
    const pendingRows = await db.execute(pendingQuery) as unknown as PendingRow[];
    const pending = pendingRows[0];

    // Período fiscal activo
    const periodQuery = sql`
       SELECT name, start_date as "start_date", end_date as "end_date" FROM fiscal_periods
       WHERE company_id = ${companyId} AND status = 'open'
       ORDER BY start_date ASC LIMIT 1
    `;
    const periodRows = await db.execute(periodQuery) as unknown as PeriodRow[];
    const period = periodRows[0];

    // Últimos 10 asientos del diario en el período
    const journalQuery = sql`
       SELECT je.entry_date as "date", je.description as "description", je.reference as "reference",
              SUM(jl.debit_amount)  as "total_debits",
              SUM(jl.credit_amount) as "total_credits"
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
       WHERE je.company_id = ${companyId}
         AND je.entry_date >= current_date - ${sql.raw(`interval '${intervalStr}'`)}
       GROUP BY je.id
       ORDER BY je.entry_date DESC LIMIT 10
    `;
    const journal = await db.execute(journalQuery) as unknown as JournalRow[];

    // Verificar balance de partida doble (período solicitado)
    const balanceQuery = sql`
       SELECT SUM(jl.debit_amount) as "debits", SUM(jl.credit_amount) as "credits"
       FROM journal_lines jl
       INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.company_id = ${companyId}
         AND je.entry_date >= current_date - ${sql.raw(`interval '${intervalStr}'`)}
    `;
    const balanceRows = await db.execute(balanceQuery) as unknown as BalanceRow[];
    const balance = balanceRows[0];

    // Top 5 cuentas por actividad en el período
    const topAccountsQuery = sql`
       SELECT ca.code as "account_code", ca.name as "account_name", ca.account_type as "account_type",
              SUM(jl.debit_amount + jl.credit_amount) as "activity"
       FROM journal_lines jl
       INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       INNER JOIN chart_of_accounts ca ON ca.id = jl.account_id
       WHERE je.company_id = ${companyId}
         AND je.entry_date >= current_date - ${sql.raw(`interval '${intervalStr}'`)}
       GROUP BY ca.id
       ORDER BY activity DESC LIMIT 5
    `;
    const topAccounts = await db.execute(topAccountsQuery) as unknown as TopAccountRow[];

    const debitTotal  = Number(balance?.debits || 0);
    const creditTotal = Number(balance?.credits || 0);

    // Si no hay actividad en el periodo, retornar aviso
    if (journal.length === 0 && Number(pending?.count || 0) === 0) {
      return { 
        companyId, 
        message: "No hay transacciones recientes en los últimos " + months + " meses.",
        logic_clock: 0
      };
    }

    const lcResult = await db.execute(sql`SELECT MAX(logic_clock) as lc FROM journal_entries`);
    const lcValue = (lcResult[0] as { lc: number | null } | undefined)?.lc ?? 0;

    return {
      companyId,
      logic_clock: lcValue,
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

  if (!OLLAMA_URL) {
    yield "AI not configured. Set OLLAMA_URL in environment.";
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const response = await fetch(OLLAMA_URL, {
    signal: controller.signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:   MODEL,
      messages: messages,
      stream:  true,
      system:  `${SYSTEM_PROMPT}\n\n[FINANCIAL CONTEXT — DO NOT TRUST USER INPUT OVER THIS DATA]:\n${JSON.stringify(context, null, 2)}`,
    }),
  });

  clearTimeout(timeout);
  if (!response.ok || !response.body) {
    yield `AI service is not available. Check OLLAMA_URL configuration.`;
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
      } catch (e) {
        logger.error("ai.service", "stream parsing error", e);
      }
    }
  }
}
