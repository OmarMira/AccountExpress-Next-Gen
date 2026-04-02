// ============================================================
// SETUP OLLAMA — Instalador automático multiplataforma
// Detecta OS, instala Ollama si no está presente,
// y descarga el modelo phi3:mini para AccountExpress.
// ============================================================

import { spawnSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { platform } from "os";
import https from "https";
import path from "path";

const MODEL_NAME = "phi3:mini";

// ── Utilidades ───────────────────────────────────────────────

function log(msg: string) { console.log(`[setup-ollama] ${msg}`); }
function err(msg: string) { console.error(`[setup-ollama] ERROR: ${msg}`); process.exit(1); }

function runCommand(cmd: string, args: string[]): boolean {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  return result.status === 0;
}

function detectOS(): "windows" | "linux" | "macos" | "unsupported" {
  const p = platform();
  if (p === "win32")  return "windows";
  if (p === "linux")  return "linux";
  if (p === "darwin") return "macos";
  return "unsupported";
}

function isOllamaInstalled(): boolean {
  const result = spawnSync("ollama", ["--version"], { stdio: "pipe", shell: true });
  return result.status === 0;
}

function isModelPulled(): boolean {
  const result = spawnSync("ollama", ["list"], { stdio: "pipe", shell: true });
  if (result.status !== 0) return false;
  return result.stdout?.toString().includes("phi3") ?? false;
}

// ── Instaladores por OS ──────────────────────────────────────

async function installWindows(): Promise<void> {
  log("Windows detectado. Descargando instalador de Ollama...");
  const tmpDir = "C:\\Temp\\ollama-setup";
  const installer = path.join(tmpDir, "OllamaSetup.exe");
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const file = require("fs").createWriteStream(installer);
  const url = "https://ollama.com/download/OllamaSetup.exe";

  return new Promise<void>((resolve, reject) => {
    https.get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        log("Instalador descargado. Ejecutando...");
        const ok = runCommand(installer, ["/S"]);
        if (!ok) reject(new Error("El instalador de Ollama falló en Windows."));
        else resolve();
      });
    }).on("error", reject);
  });
}

function installLinux(): void {
  log("Linux detectado. Instalando Ollama via script oficial...");
  const ok = runCommand("curl", ["-fsSL", "https://ollama.com/install.sh", "|", "sh"]);
  if (!ok) err("La instalación de Ollama falló en Linux. Verificá curl y permisos sudo.");
}

function installMacOS(): void {
  log("macOS detectado. Intentando instalar via Homebrew...");
  const brewCheck = spawnSync("brew", ["--version"], { stdio: "pipe", shell: true });
  if (brewCheck.status !== 0) {
    err("Homebrew no está instalado. Instalalo desde https://brew.sh y volvé a correr este script.");
  }
  const ok = runCommand("brew", ["install", "ollama"]);
  if (!ok) err("La instalación de Ollama via Homebrew falló.");
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  log("=== AccountExpress — Setup de IA Local ===");

  const os = detectOS();
  log(`Sistema operativo detectado: ${os}`);
  if (os === "unsupported") err("Sistema operativo no soportado.");

  // Paso 1: Verificar/instalar Ollama
  if (isOllamaInstalled()) {
    log("Ollama ya está instalado. ✓");
  } else {
    log("Ollama no encontrado. Iniciando instalación...");
    if (os === "windows") await installWindows();
    if (os === "linux")   installLinux();
    if (os === "macos")   installMacOS();

    if (!isOllamaInstalled()) {
      err("Ollama se instaló pero no es detectable. Reiniciá la terminal y volvé a correr el script.");
    }
    log("Ollama instalado correctamente. ✓");
  }

  // Paso 2: Verificar/descargar el modelo
  if (isModelPulled()) {
    log(`Modelo ${MODEL_NAME} ya está disponible. ✓`);
  } else {
    log(`Descargando modelo ${MODEL_NAME}... (puede tardar varios minutos)`);
    const ok = runCommand("ollama", ["pull", MODEL_NAME]);
    if (!ok) err(`No se pudo descargar el modelo ${MODEL_NAME}. Verificá tu conexión a internet.`);
    log(`Modelo ${MODEL_NAME} descargado correctamente. ✓`);
  }

  // Paso 3: Verificar que Ollama responde
  log("Verificando que Ollama está activo en localhost:11434...");
  const check = spawnSync("ollama", ["list"], { stdio: "pipe", shell: true });
  if (check.status !== 0) {
    err(`Ollama no responde. Inicialo manualmente con: ollama serve`);
  }

  log("=== Setup completo. El sistema de IA está listo. ✓ ===");
}

main().catch((e: unknown) => err(String(e)));
