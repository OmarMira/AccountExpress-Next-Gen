// ============================================================
// AI ROUTES
// Endpoint de chat con streaming hacia Ollama local.
// POST /api/ai/chat
// GET  /api/ai/status
// ============================================================

import { Elysia, t } from "elysia";

import { chatWithOllama, buildFinancialContext } from "../services/ai/ai.service.ts";
import { requireAuth, authMiddleware } from "../middleware/auth.middleware.ts";

export const aiRoutes = new Elysia({ prefix: "/ai" })
  .use(authMiddleware)

  // ── GET /ai/status — verificar que Ollama está corriendo ──
  .get("/status", async ({ set }) => {
    try {
      const res = await fetch("http://localhost:11434/api/tags");
      if (!res.ok) throw new Error("Ollama not responding");
      const { models } = await res.json() as { models: Array<{ name: string }> };
      const modelNames = models?.map(m => m.name) ?? [];
      const asistenteListo = modelNames.some(m => m.includes("phi3"));
      
      return {
        success: true,
        data: {
          ollamaRunning: true,
          asistenteListo,
          availableModels: modelNames
        }
      };
    } catch {
      return {
        success: false,
        data: {
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
  })

  // ── GET /ai/pull-model — streaming de descarga ────────────
  .get("/pull-model", async ({ set }) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const res = await fetch("http://localhost:11434/api/pull", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "phi3:mini", stream: true }),
          });

          if (!res.body) {
            controller.close();
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split("\n").filter(Boolean);

            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                if (json.completed && json.total) {
                  const data = { bytesDescargados: json.completed, total: json.total, status: json.status };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                }
                if (json.status === "success") {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ completo: true })}\n\n`));
                }
              } catch { /* ignorar ruido */ }
            }
          }
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: true })}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  })

  // ── GET /ai/download-ollama — proxy de descarga ───────────
  .get("/download-ollama", async ({ query, set }) => {
    const os = query.os as string;
    const urls: Record<string, string> = {
      windows: "https://ollama.com/download/OllamaSetup.exe",
      mac:     "https://ollama.com/download/Ollama-darwin.zip",
    };

    const url = urls[os];
    if (!url) {
      set.status = 400;
      return { error: "Invalid OS" };
    }

    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok || !response.body) {
      set.status = 502;
      return { error: "Failed to fetch from ollama.com" };
    }

    return new Response(response.body, {
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": `attachment; filename="${os === "windows" ? "OllamaSetup.exe" : "Ollama-darwin.zip"}"`,
        "Cache-Control":       "no-cache",
      },
    });
  }, {
    query: t.Object({ os: t.String() })
  });

