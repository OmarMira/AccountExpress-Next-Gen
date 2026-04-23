// ============================================================
// AI ROUTES — Ollama local AI assistant
// GET  /ai/status  → check Ollama availability
// POST /ai/chat    → send message, get reply, persist history
// ============================================================

import { Elysia, t }      from "elysia";
import { eq, asc }        from "drizzle-orm";
import { db, sql }        from "../db/connection.ts";
import { aiConversations } from "../db/schema/index.ts";
import { requireAuth }    from "../middleware/auth.middleware.ts";
import {
  checkOllamaStatus,
  detectRAM,
  selectModel,
  installState,
  isOllamaInstalled,
  installOllama,
  startOllama,
  pullModel,
} from "../services/ollama.service.ts";

// ─────────────────────────────────────────────────────────────
// detectDataQuery — classifies user message as a data query
// Returns a query type string, or null if it's an analysis question.
// ─────────────────────────────────────────────────────────────
function detectDataQuery(message: string): string | null {
  const msg = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const meses: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
  };
  for (const [nombre, numero] of Object.entries(meses)) {
    if (msg.includes(nombre)) return `transactions_month:${numero}`;
  }
  if (/(desglose|por mes|mensual|detalle).*(transacciones|movimientos)/.test(msg)) return 'transactions_detail';
  if (/(cuantas|numero de|total de|cantidad)?.*(transacciones|movimientos)/.test(msg)) return 'transactions_count';
  if (/(balance|saldo|balances|cuentas bancarias)/.test(msg)) return 'balances';
  if (/(asientos|journal entries|diario contable)/.test(msg)) return 'journal';
  if (/(plan de cuentas|cuentas contables|chart of accounts)/.test(msg)) return 'chart';
  return null;
}

// ─────────────────────────────────────────────────────────────
// fetchDataResponse — queries real DB data and returns formatted text
// Called only when detectDataQuery returns a non-null type.
// ─────────────────────────────────────────────────────────────
async function fetchDataResponse(queryType: string, companyId: string): Promise<string> {
  if (queryType.startsWith('transactions_month:')) {
    const monthNum = queryType.split(':')[1];
    const rows = await db.execute(sql`
      SELECT
        TO_CHAR(transaction_date::date, 'YYYY-MM') AS month,
        COUNT(*) AS total,
        SUM(amount) AS net_amount
      FROM bank_transactions
      WHERE company_id = ${companyId}
        AND TO_CHAR(transaction_date::date, 'MM') = ${monthNum}
      GROUP BY TO_CHAR(transaction_date::date, 'YYYY-MM')
      ORDER BY month ASC
    `) as any[];

    if (!rows.length) return `No hay transacciones registradas para ese mes.`;

    const nombreMes = Object.entries({
      '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril',
      '05':'Mayo','06':'Junio','07':'Julio','08':'Agosto',
      '09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'
    }).find(([k]) => k === monthNum)?.[1] ?? monthNum;

    let resp = `**Transacciones de ${nombreMes}**\n`;
    for (const row of rows) {
      resp += `\u2022 ${row.month}: ${row.total} transacciones | neto: $${Number(row.net_amount).toFixed(2)}\n`;
    }
    return resp;
  }

  if (queryType === 'transactions_count') {
    const [stats] = await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending')    AS pending,
        COUNT(*) FILTER (WHERE status = 'assigned')   AS assigned,
        COUNT(*) FILTER (WHERE status = 'reconciled') AS reconciled,
        COUNT(*) FILTER (WHERE status = 'ignored')    AS ignored,
        MIN(transaction_date) AS oldest_date,
        MAX(transaction_date) AS newest_date
      FROM bank_transactions
      WHERE company_id = ${companyId}
    `) as any;

    return `**Transacciones bancarias**\nTotal: ${stats.total}\n• Pendientes: ${stats.pending}\n• Asignadas: ${stats.assigned}\n• Conciliadas: ${stats.reconciled}\n• Ignoradas: ${stats.ignored}\n• Período: ${stats.oldest_date ?? 'N/A'} → ${stats.newest_date ?? 'N/A'}`;
  }

  if (queryType === 'transactions_detail') {
    const [stats] = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM bank_transactions
      WHERE company_id = ${companyId}
    `) as any;

    const byMonth = await db.execute(sql`
      SELECT
        TO_CHAR(transaction_date::date, 'YYYY-MM') AS month,
        COUNT(*) AS total,
        SUM(amount) AS net_amount
      FROM bank_transactions
      WHERE company_id = ${companyId}
      GROUP BY TO_CHAR(transaction_date::date, 'YYYY-MM')
      ORDER BY month ASC
    `) as any[];

    let resp = `**Transacciones bancarias — desglose mensual**\nTotal: ${stats.total}\n\n`;
    for (const row of byMonth) {
      resp += `• ${row.month}: ${row.total} transacciones | neto: $${Number(row.net_amount).toFixed(2)}\n`;
    }
    return resp;
  }

  if (queryType === 'balances') {
    const accounts = await db.execute(sql`
      SELECT account_name, bank_name, balance
      FROM bank_accounts
      WHERE company_id = ${companyId} AND is_active = true
      ORDER BY account_name ASC
    `) as any[];

    let resp = `**Cuentas bancarias activas**\n`;
    for (const acc of accounts) {
      resp += `• ${acc.account_name} (${acc.bank_name}): $${(Number(acc.balance) / 100).toFixed(2)}\n`;
    }
    return resp;
  }

  if (queryType === 'journal') {
    const [stats] = await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'posted') AS posted,
        COUNT(*) FILTER (WHERE status = 'draft')  AS draft
      FROM journal_entries
      WHERE company_id = ${companyId}
    `) as any;

    return `**Asientos contables**\nTotal: ${stats.total}\n• Publicados: ${stats.posted}\n• Borradores: ${stats.draft}`;
  }

  if (queryType === 'chart') {
    const accounts = await db.execute(sql`
      SELECT code, name, account_type
      FROM chart_of_accounts
      WHERE company_id = ${companyId} AND is_active = true
      ORDER BY code ASC
      LIMIT 50
    `) as any[];

    let resp = `**Plan de cuentas activo (${accounts.length} cuentas)**\n`;
    for (const acc of accounts) {
      resp += `• ${acc.code} - ${acc.name} (${acc.account_type})\n`;
    }
    return resp;
  }

  return 'No tengo esa información disponible.';
}

export const aiRoutes = new Elysia({ prefix: "/ai" })
  .guard({ beforeHandle: requireAuth })

  // ── GET /ai/status ─────────────────────────────────────────
  .get("/status", async () => {
    const status           = await checkOllamaStatus();
    const ramGB            = await detectRAM();
    const recommendedModel = selectModel(ramGB);
    return { ...status, recommendedModel, ramGB, installState: { ...installState } };
  })

  // ── POST /ai/chat ───────────────────────────────────────────
  .post(
    "/chat",
    async ({ body, user, set }) => {
      try {
      const { companyId, message } = body;

      // Short-circuit: data queries go directly to DB, skip Ollama
      const dataQueryType = detectDataQuery(message);
      if (dataQueryType) {
        const dataResp = await fetchDataResponse(dataQueryType, companyId);
        return { reply: dataResp, source: 'db' };
      }

      // 1. Verify Ollama is running
      const status = await checkOllamaStatus();
      if (!status.ollamaRunning) {
        set.status = 503;
        return { error: "Ollama no está disponible" };
      }

      // 2. Fetch last 10 conversation entries for this company
      const history = await db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.companyId, companyId))
        .orderBy(asc(aiConversations.createdAt))
        .limit(10);

      // 3. Build message array for Ollama
      const systemPrompt = {
        role: "system",
        content: `Eres el asistente contable de AccountExpress.
Eres un Auditor Forense y Consultor de Impuestos del estado de Florida, USA.
Tu rol es responder preguntas de contabilidad, ayudar a crear reglas bancarias, y elaborar proyecciones financieras.
NUNCA inventes números ni datos financieros.
Si el usuario pregunta por cifras o datos del sistema, responde exactamente: "Para consultar datos del sistema, usa las secciones del menú de AccountExpress."
NUNCA sugieras modificar registros directamente en la base de datos.
NUNCA ejecutes ni sugieras comandos SQL.
Si el usuario pide hacer algo que requiere modificar datos, explícale cómo hacerlo usando la interfaz de AccountExpress.
Responde siempre en el idioma en que el usuario te escriba.
Fecha actual: ${new Date().toISOString().split('T')[0]}`,
      };

      const messages = [
        systemPrompt,
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: message },
      ];

      // 4. Call Ollama /api/chat with 60-second timeout
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);

      let ollamaRes: Response;
      try {
        ollamaRes = await fetch("http://localhost:11434/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: status.modelName,
            messages,
            stream: false,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        set.status = 503;
        return { error: err instanceof Error ? err.message : "Error conectando con Ollama" };
      } finally {
        clearTimeout(timer);
      }

      if (!ollamaRes.ok) {
        const errText = await ollamaRes.text().catch(() => "Error desconocido de Ollama");
        set.status = 503;
        return { error: errText };
      }

      const ollamaData = (await ollamaRes.json()) as {
        message?: { role: string; content: string };
      };
      const reply = ollamaData.message?.content ?? "";

      // 5. Persist user message + assistant reply
      await db.insert(aiConversations).values([
        {
          companyId,
          userId: user as string,
          role: "user",
          content: message,
        },
        {
          companyId,
          userId: user as string,
          role: "assistant",
          content: reply,
        },
      ]);

      // 6. Return reply
      return { reply };
      } catch (err) {
        set.status = 500;
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      body: t.Object({
        companyId: t.String(),
        message:   t.String(),
      }),
    }
  )

  // ── POST /ai/install ────────────────────────────────────────
  // Fire-and-forget: starts the install pipeline in background,
  // returns { started: true } immediately.
  .post("/install", () => {
    (async () => {
      try {
        const installed = await isOllamaInstalled();
        if (!installed) {
          await installOllama();
        }
        await startOllama();
        await pullModel();
      } catch {
        // installState was already updated inside each function
      }
    })();

    return { started: true };
  });
