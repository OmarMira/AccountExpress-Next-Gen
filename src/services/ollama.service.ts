// src/services/ollama.service.ts
import OpenAI from 'openai';

// Cliente de OpenRouter (compatible con OpenAI SDK)
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://accountexpress.local', // Opcional, puede cambiarse
    'X-Title': 'AccountExpress',
  }
});

// ── Funciones principales para el chat y sugerencia de reglas ──

export async function callAIChat(messages: Array<{role: string, content: string}>): Promise<string> {
  try {
    const completion = await openrouter.chat.completions.create({
      model: "openrouter/free",
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 1500,
    });
    return completion.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("Error en callAIChat (OpenRouter):", error);
    throw new Error("No se pudo obtener respuesta de la IA.");
  }
}

export async function suggestRuleWithAI(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    const completion = await openrouter.chat.completions.create({
      model: "openrouter/free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ] as any,
      temperature: 0.3,
      max_tokens: 800,
    });
    return completion.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("Error en suggestRuleWithAI (OpenRouter):", error);
    throw new Error("No se pudo generar la sugerencia de regla.");
  }
}

// ── Funciones requeridas por otras partes del sistema (compatibilidad) ──
// Estas funciones ya no ejecutan Ollama local, pero devuelven valores que indican que el servicio está "siempre listo".

export async function checkOllamaStatus(): Promise<{ ollamaRunning: boolean; modelInstalled: boolean; modelName: string }> {
  return {
    ollamaRunning: true,
    modelInstalled: true,
    modelName: "openrouter/free"
  };
}

export async function detectRAM(): Promise<number> {
  return 16; // Valor ficticio, no se usa realmente
}

export function selectModel(ramGB: number): string {
  return "openrouter/free";
}

export const installState = {
  phase: 'ready' as const,
  message: ''
};

export async function isOllamaInstalled(): Promise<boolean> {
  return true;
}

export async function installOllama(): Promise<void> {
  // No operación
}

export async function startOllama(): Promise<void> {
  // No operación
}

export async function pullModel(): Promise<void> {
  // No operación
}

export async function ensureModelInstalled(): Promise<void> {
  // No operación
}
