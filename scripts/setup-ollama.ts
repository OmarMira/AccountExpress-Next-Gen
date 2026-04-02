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

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
      }
      const file = require("fs").createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", reject);
  });
}

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

  const url = "https://ollama.com/download/OllamaSetup.exe";
  await downloadFile(url, installer);
  log("Instalador descargado. Ejecutando...");
  const ok = runCommand(installer, ["/S"]);
  if (!ok) err("El instalador de Ollama falló en Windows.");
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

async function installGitleaks(os: "windows" | "linux" | "macos" | "unsupported"): Promise<void> {
  const version = "8.18.4";
  const homeDir = require("os").homedir();
  const binDestDir = os === "windows" ? path.join(homeDir, ".local", "bin") : "/usr/local/bin";
  const binName = os === "windows" ? "gitleaks.exe" : "gitleaks";
  const binPath = path.join(binDestDir, binName);

  const urls: Record<string, string> = {
    windows: `https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_windows_x64.zip`,
    linux:   `https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz`,
    macos:   `https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_darwin_x64.tar.gz`,
  };

  const tmpDir  = os === "windows" ? path.join(homeDir, "AppData", "Local", "Temp", "gitleaks-setup") : "/tmp/gitleaks-setup";
  const archive = os === "windows" ? path.join(tmpDir, "gitleaks.zip") : path.join(tmpDir, "gitleaks.tar.gz");

  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  if (!existsSync(binDestDir)) mkdirSync(binDestDir, { recursive: true });

  log(`Descargando gitleaks v${version} para ${os}...`);
  await downloadFile(urls[os], archive);

  log("Extrayendo gitleaks...");
  if (os === "windows") {
    const ok = runCommand("powershell", ["-Command", `Expand-Archive -Path '${archive}' -DestinationPath '${tmpDir}' -Force; Copy-Item '${tmpDir}\\gitleaks.exe' '${binPath}' -Force`]);
    if (!ok) err("No se pudo extraer o copiar gitleaks.exe en Windows.");
  } else {
    const ok = runCommand("tar", ["-xzf", archive, "-C", tmpDir]) &&
               runCommand("sudo", ["cp", `${tmpDir}/gitleaks`, binPath]) &&
               runCommand("sudo", ["chmod", "+x", binPath]);
    if (!ok) err("No se pudo instalar gitleaks en Linux/macOS. Verificá permisos sudo.");
  }
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

  // Paso 3: Verificar/instalar gitleaks
  const gitleaksCheck = spawnSync("gitleaks", ["version"], { stdio: "pipe", shell: true });
  if (gitleaksCheck.status === 0) {
    log("gitleaks ya está instalado. ✓");
  } else {
    log("gitleaks no encontrado. Instalando...");
    await installGitleaks(os);
    const verify = spawnSync("gitleaks", ["version"], { stdio: "pipe", shell: true });
    if (verify.status !== 0) err("gitleaks se instaló pero no es detectable. Reiniciá la terminal.");
    log("gitleaks instalado correctamente. ✓");
  }

  // Paso 4: Verificar que Ollama responde
  log("Verificando que Ollama está activo en localhost:11434...");
  const check = spawnSync("ollama", ["list"], { stdio: "pipe", shell: true });
  if (check.status !== 0) {
    err(`Ollama no responde. Inicialo manualmente con: ollama serve`);
  }

  // Paso 5: Configurar arranque automático de Ollama
  log("Configurando arranque automático de Ollama...");
  if (os === "windows") {
    const startupCmd = `"${process.env.LOCALAPPDATA}\\Programs\\Ollama\\ollama.exe" serve`;
    spawnSync("reg", [
      "add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      "/v", "OllamaServe",
      "/t", "REG_SZ",
      "/d", startupCmd,
      "/f"
    ], { shell: true });
    log("Ollama configurado para iniciar con Windows. ✓");
  } else if (os === "linux") {
    const service = `[Unit]\nDescription=Ollama Service\nAfter=network.target\n\n[Service]\nExecStart=/usr/local/bin/ollama serve\nRestart=always\n\n[Install]\nWantedBy=default.target`;
    const fs = require("fs");
    const userDir = `${process.env.HOME}/.config/systemd/user`;
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(`${userDir}/ollama.service`, service);
    spawnSync("systemctl", ["--user", "enable", "ollama"], { shell: true });
    spawnSync("systemctl", ["--user", "start", "ollama"], { shell: true });
    log("Ollama configurado como servicio systemd. ✓");
  } else if (os === "macos") {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>ollama.serve</string><key>ProgramArguments</key><array><string>/usr/local/bin/ollama</string><string>serve</string></array><key>RunAtLoad</key><true/></dict></plist>`;
    const fs = require("fs");
    const plistPath = `${process.env.HOME}/Library/LaunchAgents/ollama.serve.plist`;
    fs.writeFileSync(plistPath, plist);
    spawnSync("launchctl", ["load", plistPath], { shell: true });
    log("Ollama configurado como LaunchAgent en macOS. ✓");
  }

  log("=== Setup completo. El sistema de IA está listo. ✓ ===");
}

main().catch((e: unknown) => err(String(e)));
