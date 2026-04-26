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
// ─────────────────────────────────────────────────────────────
// SCHEMA CONTEXT — passed to Gemma 4 for Text-to-SQL generation
// Only includes tables and columns relevant for business queries.
// ─────────────────────────────────────────────────────────────
const DB_SCHEMA_CONTEXT = `
Tablas disponibles (PostgreSQL). Solo puedes usar SELECT. company_id es siempre obligatorio en el WHERE.

bank_transactions(id, company_id, bank_account[FK bank_accounts.id], transaction_date[YYYY-MM-DD text], description, amount[numeric 15,2 — positivo=crédito negativo=débito], transaction_type[debit|credit], status[pending|assigned|reconciled|ignored], gl_account_id[FK chart_of_accounts.id])

bank_accounts(id, company_id, account_name, bank_name, account_number, balance[integer cents — dividir entre 100 para dólares], is_active[boolean])

chart_of_accounts(id, company_id, code, name, account_type[asset|liability|equity|revenue|expense], normal_balance[debit|credit], is_active[boolean])

journal_entries(id, company_id, entry_number, entry_date[YYYY-MM-DD text], description, status[draft|posted|voided], period_id[FK fiscal_periods.id])

journal_lines(id, journal_entry_id[FK journal_entries.id], company_id, account_id[FK chart_of_accounts.id], debit_amount[numeric 15,2], credit_amount[numeric 15,2], description)

fiscal_periods(id, company_id, name, period_type[monthly|quarterly|annual], start_date[YYYY-MM-DD text], end_date[YYYY-MM-DD text], status[open|closed|locked])
`.trim();

// ─────────────────────────────────────────────────────────────
// buildSqlPrompt — asks Gemma 4 to classify and optionally generate SQL
// ─────────────────────────────────────────────────────────────
function buildSqlPrompt(userMessage: string): string {
  return `Eres un asistente de base de datos para un sistema contable.

${DB_SCHEMA_CONTEXT}

TAREA: Analiza el mensaje del usuario y responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones.

Si el mensaje requiere datos del sistema (transacciones, saldos, cuentas, asientos, periodos):
{"type": "sql", "query": "SELECT ... FROM ... WHERE company_id = $1 ..."}

Si el mensaje es una pregunta general de contabilidad, impuestos o finanzas (NO relacionada con datos del sistema):
{"type": "general"}

Si el mensaje pregunta sobre períodos fiscales, su estado, fechas de apertura o cierre:
{"type": "sql", "query": "SELECT name, period_type, start_date, end_date, status FROM fiscal_periods WHERE company_id = $1 ORDER BY end_date DESC LIMIT 5"}

Si el mensaje es un saludo o conversación casual:
{"type": "chat"}

REGLAS CRÍTICAS:
- SIEMPRE usa $1 como placeholder para company_id en el WHERE
- NUNCA uses INSERT, UPDATE, DELETE, DROP, ALTER, CREATE
- NUNCA inventes nombres de columnas — usa solo los del schema
- Para montos en bank_accounts.balance: dividir entre 100 (están en centavos)
- Para fechas: la columna es text en formato YYYY-MM-DD, usa LIKE o substring para filtrar por mes/año
- El JSON debe ser una sola línea, sin saltos de línea dentro

Mensaje a clasificar:`;
}

// ─────────────────────────────────────────────────────────────
// callGemma — single Ollama call, returns parsed response text
// ─────────────────────────────────────────────────────────────
async function callGemma(
  modelName: string,
  systemPrompt: string,
  userContent: string,
  timeoutMs = 60_000
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userContent },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json() as { message?: { content: string } };
    return data.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────
// executeSafeQuery — runs a read-only SELECT with companyId bound to $1
// Rejects any query that is not a pure SELECT.
// ─────────────────────────────────────────────────────────────
async function executeSafeQuery(
  rawQuery: string,
  companyId: string
): Promise<Record<string, unknown>[]> {
  const normalized = rawQuery.trim().toUpperCase();
  if (!normalized.startsWith("SELECT")) {
    throw new Error("Solo se permiten consultas SELECT.");
  }
  const forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE"];
  for (const keyword of forbidden) {
    if (normalized.includes(keyword)) {
      throw new Error(`Consulta bloqueada: contiene ${keyword}.`);
    }
  }
  const rows = await db.execute(sql.raw(rawQuery.replace("$1", `'${companyId.replace(/'/g, "''")}'`))) as Record<string, unknown>[];
  return rows;
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
    async ({ body, set, ...ctx }: any) => {
      try {
        const { companyId, message } = body;
        const user: string = (ctx as any).user ?? '';

        // 1. Check Ollama is running
        const status = await checkOllamaStatus();
        if (!status.ollamaRunning) {
          set.status = 503;
          return { error: "Ollama no está disponible" };
        }

        const modelName = status.modelName;

        // 2. Ask Gemma to classify the message and optionally generate SQL
        let classification: { type: string; query?: string };
        try {
          const raw = await callGemma(modelName, buildSqlPrompt(message), message);
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON in classification response");
          classification = JSON.parse(jsonMatch[0]);
        } catch {
          classification = { type: "general" };
        }

        // 3. If SQL query — execute and format result via second Gemma call
        if (classification.type === "sql" && classification.query) {
          let dataText: string;
          try {
            const rows = await executeSafeQuery(classification.query, companyId);
            if (rows.length === 0) {
              dataText = "No se encontraron registros para esa consulta.";
            } else {
              dataText = JSON.stringify(rows, null, 2);
            }
          } catch (err) {
            dataText = `Error ejecutando consulta: ${err instanceof Error ? err.message : String(err)}`;
          }

          const formatPrompt = `Eres un asistente contable para AccountExpress (Florida, USA).
El usuario hizo esta pregunta: "${message.replace(/"/g, '\\"')}"
Aquí están los datos reales de la base de datos en JSON:
${dataText}
Responde en lenguaje natural, de forma clara y concisa, en el mismo idioma del usuario.
NUNCA inventes datos adicionales. Si los datos están vacíos, dilo directamente.
No menciones SQL, JSON, ni detalles técnicos.`;

          const naturalResponse = await callGemma(modelName, formatPrompt, message);
          // Data responses are not persisted — factual data, not model dialogue
          return { reply: naturalResponse, source: "db" };
        }

        // 4. General or chat — use conversation history + Ollama
        const history = await db
          .select()
          .from(aiConversations)
          .where(eq(aiConversations.companyId, companyId))
          .orderBy(asc(aiConversations.createdAt))
          .limit(6);

        const systemPrompt = `Eres el asistente contable de AccountExpress.
Eres un Auditor Forense y Consultor de Impuestos del estado de Florida, USA.
Tu rol es responder preguntas de contabilidad, impuestos y finanzas bajo US GAAP y las leyes del estado de Florida.

REGLAS ABSOLUTAS — nunca las violes:
1. NUNCA inventes números, cifras, montos ni datos financieros.
2. NUNCA inventes pasos de navegación ni instrucciones de interfaz de AccountExpress. Si el usuario pregunta cómo hacer algo en el sistema, responde únicamente: "Para esa acción, navega al módulo correspondiente en el menú de AccountExpress."
3. NUNCA cites estatutos, códigos legales, regulaciones ni referencias legales específicas a menos que estés completamente seguro de su existencia y contenido exacto. Si no estás seguro, di: "Te recomiendo verificar con un CPA o el sitio oficial del estado de Florida (floridarevenue.com)."
4. NUNCA sugieras modificar registros directamente en la base de datos.
5. Si no sabes la respuesta con certeza, dilo directamente. Es mejor admitir incertidumbre que dar información incorrecta.

Lo que SÍ puedes hacer:
- Explicar conceptos contables, principios US GAAP, tipos de cuentas, asientos de ajuste, depreciación, etc.
- Orientar sobre obligaciones fiscales generales en Florida (sales tax DR-15, payroll, etc.) sin inventar cifras específicas.
- Ayudar a interpretar datos que el sistema ya consultó de la base de datos.

Responde siempre en el idioma en que el usuario te escriba.
Fecha actual: ${new Date().toISOString().split("T")[0]}`;

        const ollamaMessages = [
          { role: "system", content: systemPrompt },
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: message },
        ];

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60_000);
        let ollamaRes: Response;
        try {
          ollamaRes = await fetch("http://localhost:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelName, messages: ollamaMessages, stream: false }),
            signal: controller.signal,
          });
        } catch (err) {
          set.status = 503;
          return { error: err instanceof Error ? err.message : "Error conectando con Ollama" };
        } finally {
          clearTimeout(timer);
        }

        if (!ollamaRes.ok) {
          set.status = 503;
          return { error: await ollamaRes.text().catch(() => "Error desconocido de Ollama") };
        }

        const ollamaData = await ollamaRes.json() as { message?: { role: string; content: string } };
        const reply = ollamaData.message?.content ?? "";

        // Persist only Ollama dialogue — never DB data responses
        await db.insert(aiConversations).values([
          { companyId, userId: user, role: "user",      content: message },
          { companyId, userId: user, role: "assistant", content: reply   },
        ]);

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

  // ── POST /ai/suggest-rule ───────────────────────────────────
  .post('/suggest-rule', async ({ body, set }) => {
    const { companyId, message: userMessage } = body as any;
    if (!companyId) { set.status = 403; return { error: 'No active company.' }; }

    const status = await checkOllamaStatus();
    if (!status.ollamaRunning) {
      set.status = 503;
      return { error: "Ollama no está disponible" };
    }

    // Obtener plan de cuentas real de la empresa
    const accounts = await db.execute(sql`
      SELECT id, code, name, account_type
      FROM chart_of_accounts
      WHERE company_id = ${companyId} AND is_active = true
      ORDER BY code ASC
      LIMIT 80
    `) as any[];

    // Obtener prioridad máxima actual para sugerir la siguiente
    const [priorityRow] = await db.execute(sql`
      SELECT COALESCE(MAX(priority), 0) AS max_priority
      FROM bank_rules
      WHERE company_id = ${companyId}
    `) as any[];
    const nextPriority = Number(priorityRow.max_priority) + 1;

    const accountsText = accounts
      .map((a: any) => `${a.code} | ${a.name} | ${a.account_type} | id:${a.id}`)
      .join('\n');

    const systemPrompt = `Eres un asistente contable especializado en clasificación bancaria bajo US GAAP y las leyes del estado de Florida.
El usuario va a describir un tipo de transacción bancaria. Tu tarea es sugerir una regla bancaria para clasificarla automáticamente.
Debes responder ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones.
El JSON debe tener exactamente estos campos:
{
  "name": "string — nombre descriptivo de la regla",
  "conditionType": "contains" | "starts_with" | "equals",
  "conditionValue": "string — texto a buscar en la descripción de la transacción, en mayúsculas",
  "transactionDirection": "debit" | "credit" | "any",
  "glAccountId": "string — el id exacto de la cuenta del plan de cuentas provisto",
  "autoAdd": false,
  "priority": ${nextPriority},
  "explanation": "string — explicación breve en español de por qué elegiste esa cuenta"
}
REGLAS ESTRICTAS:
- glAccountId DEBE ser uno de los ids del plan de cuentas provisto. NUNCA inventes un id.
- autoAdd siempre es false.
- Si no puedes determinar la cuenta correcta con certeza, elige la más razonable y explícalo en explanation.
- Responde SOLO el JSON. Nada más.

PLAN DE CUENTAS DISPONIBLE:
${accountsText}`;

    const ollamaResponse = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: status.modelName,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!ollamaResponse.ok) {
      set.status = 503;
      return { error: 'Ollama no disponible.' };
    }

    const ollamaData = await ollamaResponse.json() as any;
    const rawText: string = ollamaData.message?.content ?? '';

    // Extraer JSON de la respuesta (puede venir con texto extra en modelos pequeños)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      set.status = 422;
      return { error: 'El modelo no retornó un JSON válido.', raw: rawText };
    }

    let suggested: any;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      // Normalizar: aceptar tanto camelCase como snake_case, y limpiar espacios
      suggested = {
        name: String(parsed.name ?? '').trim(),
        conditionType: String(parsed.conditionType ?? parsed.condition_type ?? '').trim(),
        conditionValue: String(parsed.conditionValue ?? parsed.condition_value ?? '').trim().toUpperCase(),
        transactionDirection: String(parsed.transactionDirection ?? parsed.transaction_direction ?? 'any').trim(),
        glAccountId: String(parsed.glAccountId ?? parsed.gl_account_id ?? '').trim(),
        autoAdd: false,
        priority: Number(parsed.priority ?? 0),
        explanation: String(parsed.explanation ?? '').trim(),
      };
    } catch {
      set.status = 422;
      return { error: 'JSON malformado en la respuesta del modelo.', raw: rawText };
    }

    // Validar que glAccountId exista en el plan de cuentas real
    let validAccount = accounts.find((a: any) => a.id === suggested.glAccountId);
    if (!validAccount) {
      validAccount = accounts.find((a: any) => a.code === suggested.glAccountId);
    }
    if (!validAccount) {
      set.status = 422;
      return { error: 'El modelo sugirió una cuenta que no existe en el plan de cuentas.', raw: rawText };
    }
    suggested.glAccountId = validAccount.id;

    // Verificar si ya existe una regla con el mismo conditionValue
    const existingRules = await db.execute(sql`
      SELECT id, name FROM bank_rules
      WHERE company_id = ${companyId}
        AND LOWER(condition_value) = LOWER(${suggested.conditionValue})
        AND is_active = true
    `) as any[];

    if (existingRules.length > 0) {
      return {
        duplicate: true,
        existingRuleName: existingRules[0].name,
        message: `Ya existe una regla activa con la condición "${suggested.conditionValue}": "${existingRules[0].name}". No se creó una nueva regla para evitar duplicados.`
      };
    }

    return {
      suggested: {
        name: suggested.name,
        conditionType: suggested.conditionType,
        conditionValue: suggested.conditionValue,
        transactionDirection: suggested.transactionDirection,
        glAccountId: suggested.glAccountId,
        glAccountCode: validAccount.code,
        glAccountName: validAccount.name,
        autoAdd: false,
        priority: nextPriority,
        explanation: suggested.explanation,
      }
    };
  }, {
    body: t.Object({ message: t.String(), companyId: t.String() })
  })


  // ── POST /ai/clear-history ──────────────────────────────────
  .post('/clear-history', async ({ body, set }) => {
    const { companyId } = body as any;
    if (!companyId) { set.status = 400; return { error: 'companyId requerido.' }; }
    await db.delete(aiConversations).where(eq(aiConversations.companyId, companyId));
    return { cleared: true };
  }, {
    body: t.Object({ companyId: t.String() })
  })

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
