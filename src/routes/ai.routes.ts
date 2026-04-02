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
      const data = await res.json() as any;
      const models = data.models?.map((m: any) => m.name) ?? [];
      const mistralReady = models.some((m: string) => m.includes("mistral"));
      return {
        success: true,
        data: {
          ollamaRunning: true,
          mistralReady,
          availableModels: models
        }
      };
    } catch {
      return {
        success: false,
        data: {
          ollamaRunning: false,
          mistralReady: false,
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

    // Inyectar contexto para validación post-respuesta
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

          // Post-response validation: detect numbers in response not present in context
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
        } catch (err: any) {
          const msg = err?.name === "AbortError"
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

    const contentLength = response.headers.get("Content-Length");

    return new Response(response.body, {
      headers: {
        "Content-Type":        "application/octet-stream",
        "Content-Disposition": `attachment; filename="${os === "windows" ? "OllamaSetup.exe" : "Ollama-darwin.zip"}"`,
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        "Cache-Control": "no-cache",
      },
    });
  }, {
    query: t.Object({ os: t.String() })
  })

  // ── POST /ai/pull-model — inicia descarga de Mistral en Ollama ──
  .post("/pull-model", async ({ set }) => {
    try {
      // Verificar que Ollama está corriendo
      const ping = await fetch("http://localhost:11434/api/tags").catch(() => null);
      if (!ping?.ok) {
        set.status = 503;
        return { success: false, error: "Ollama no está corriendo" };
      }

      // Lanzar el pull en un task asíncrono independiente.
      // Ollama REQUIERE que el cliente drene el stream para que la descarga progrese.
      // No usamos await aquí — el endpoint retorna inmediatamente.
      (async () => {
        try {
          const res = await fetch("http://localhost:11434/api/pull", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "mistral", stream: true }),
          });
          if (!res.body) return;
          // Drenar el stream para que Ollama procese la descarga
          const reader = res.body.getReader();
          while (true) {
            const { done } = await reader.read();
            if (done) break;
            // Descartamos el valor — solo importa mantener la conexión
          }
          console.log("[AI] Mistral pull completed");
        } catch (err: any) {
          console.error("[AI] Mistral pull failed:", err.message);
        }
      })();

      return { success: true, message: "Pull initiated" };
    } catch (err: any) {
      set.status = 500;
      return { success: false, error: err.message };
    }
  });
