// ============================================================
// AI ROUTES
// Endpoint de chat con streaming hacia Ollama.
// POST /api/ai/chat
// GET  /api/ai/status
// ============================================================

import { Elysia, t } from "elysia";
import { chatWithOllama, buildFinancialContext } from "../services/ai/ai.service.ts";
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";

export const aiRoutes = new Elysia({ prefix: "/ai" })
  .use(authMiddleware)

  // ── GET /ai/status — verificar estado del servicio de IA ──
  .get("/status", async ({ set }) => {
    const OLLAMA_BASE = process.env.OLLAMA_URL;
    
    if (!OLLAMA_BASE) {
      return {
        success: false,
        data: {
          configured: false,
          status: "not_configured",
          ollamaRunning: false,
          asistenteListo: false
        }
      };
    }

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`);
      if (!res.ok) throw new Error("Ollama not responding");
      
      const { models } = await res.json() as { models: Array<{ name: string }> };
      const modelNames = models?.map(m => m.name) ?? [];
      const targetModel = process.env.OLLAMA_MODEL ?? "phi3";
      const asistenteListo = modelNames.some(m => m.includes(targetModel));
      
      return {
        success: true,
        data: {
          configured: true,
          status: "connected",
          ollamaRunning: true,
          asistenteListo,
          availableModels: modelNames
        }
      };
    } catch {
      return {
        success: false,
        data: {
          configured: true,
          status: "unavailable",
          ollamaRunning: false,
          asistenteListo: false,
          availableModels: []
        }
      };
    }
  })

  // ── POST /ai/chat — chat con streaming ────────────────────
  .post("/chat", async ({ body, set }) => {
    const { messages, companyId } = body;

    if (!companyId) {
      set.status = 400;
      return new Response(JSON.stringify({ error: "companyId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const context = await buildFinancialContext(companyId);
    const encoder = new TextEncoder();
    const generator = chatWithOllama(messages, companyId);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let accumulated = "";
          for await (const chunk of generator) {
            accumulated += chunk;
            controller.enqueue(encoder.encode(chunk));
          }

          const numbersInResponse = accumulated.match(/\$[\d,]+\.?\d*/g) ?? [];
          const contextString = JSON.stringify(context);
          const hallucinated = numbersInResponse.filter(n => {
            const raw = n.replace(/[$,]/g, "");
            return !contextString.includes(raw);
          });
          if (hallucinated.length > 0) {
            const warning = `\n\n⚠️ *Nota: Los siguientes valores no fueron encontrados en el contexto financiero verificado: ${hallucinated.join(", ")}. Verificá manualmente.*`;
            controller.enqueue(encoder.encode(warning));
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.name : "UnknownError";
          const msg = errorMsg === "AbortError"
            ? "\n[Error: AI response timed out after 60 seconds]"
            : "\n[Error: AI service unavailable]";
          controller.enqueue(encoder.encode(msg));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no"
      }
    });
  }, {
    beforeHandle: requireAuth,
    body: t.Object({
      messages: t.Array(
        t.Object({
          role:    t.String(),
          content: t.String()
        })
      ),
      companyId: t.String()
    })
  });
