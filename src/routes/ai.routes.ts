// ============================================================
// AI ROUTES
// Endpoint de chat con streaming hacia Ollama local.
// POST /api/ai/chat
// GET  /api/ai/status
// ============================================================

import { Elysia, t } from "elysia";
import { validateSession } from "../services/session.service.ts";
import { chatWithOllama } from "../services/ai/ai.service.ts";

export const aiRoutes = new Elysia({ prefix: "/ai" })

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
  .post("/chat", async ({ body, cookie, set }) => {
    const token = cookie["session"]?.value as string;
    if (!validateSession(token)) {
      set.status = 401;
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { messages, companyId } = body;

    if (!companyId) {
      set.status = 400;
      return new Response(JSON.stringify({ error: "companyId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Stream de respuesta
    const generator = chatWithOllama(messages, companyId);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generator) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        } catch (err) {
          controller.enqueue(
            new TextEncoder().encode("\n[Error: AI service unavailable]")
          );
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

  // ── POST /ai/pull-model — descarga Mistral automáticamente ──
  .post("/pull-model", async ({ set }) => {
    try {
      const proc = Bun.spawn(["ollama", "pull", "mistral"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      // No esperamos — corre en background
      proc.exited.catch((err) => {
        console.error("[AI] ollama pull mistral failed:", err);
      });

      return { success: true, message: "Pull started" };
    } catch (err: any) {
      set.status = 500;
      return { success: false, error: err.message };
    }
  });
