// ============================================================
// OLLAMA SERVICE — Local AI via Ollama (http://localhost:11434)
// Detects RAM, selects model, checks Ollama availability.
// No external dependencies. Never throws — always returns safe defaults.
// ============================================================

// ─────────────────────────────────────────────────────────────
// Install state — shared in-memory object polled by the frontend
// ─────────────────────────────────────────────────────────────
export type InstallPhase =
  | 'idle'
  | 'downloading_ollama'
  | 'installing_ollama'
  | 'starting_ollama'
  | 'pulling_model'
  | 'ready'
  | 'error';

export const installState: { phase: InstallPhase; message: string } = {
  phase: 'idle',
  message: ''
};

// ─────────────────────────────────────────────────────────────
// 1. detectRAM(): Promise<number>
// Returns total system RAM in GB. Returns 0 on any failure.
// ─────────────────────────────────────────────────────────────
export async function detectRAM(): Promise<number> {
  try {
    const platform = process.platform;

    if (platform === "linux") {
      const content = await Bun.file("/proc/meminfo").text();
      const match = content.match(/MemTotal:\s+(\d+)\s+kB/);
      if (!match) return 0;
      return Math.floor(parseInt(match[1]!, 10) / 1024 / 1024);
    }

    if (platform === "darwin") {
      const proc = Bun.spawn(["sysctl", "-n", "hw.memsize"], { stdout: "pipe" });
      const output = await new Response(proc.stdout).text();
      const bytes = parseInt(output.trim(), 10);
      if (isNaN(bytes)) return 0;
      return Math.floor(bytes / 1024 / 1024 / 1024);
    }

    if (platform === "win32") {
      const proc = Bun.spawn(
        ["wmic", "ComputerSystem", "get", "TotalPhysicalMemory"],
        { stdout: "pipe" }
      );
      const output = await new Response(proc.stdout).text();
      // Output: "TotalPhysicalMemory  \r\n17179869184  \r\n\r\n"
      const lines = output
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const bytes = parseInt(lines[lines.length - 1]!, 10);
      if (isNaN(bytes)) return 0;
      return Math.floor(bytes / 1024 / 1024 / 1024);
    }

    return 0;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// 2. selectModel(ramGB: number): string
// Returns the recommended Ollama model based on available RAM.
// ─────────────────────────────────────────────────────────────
export function selectModel(ramGB: number): string {
  if (ramGB === 0 || ramGB < 16) return "llama3.2:1b";
  if (ramGB < 32)                return "llama3.2:3b";
  return "llama3.1:8b";
}

// ─────────────────────────────────────────────────────────────
// 3. checkOllamaStatus()
// Checks reachability and model installation.
// Timeout: 3 seconds. Never throws.
// ─────────────────────────────────────────────────────────────
export async function checkOllamaStatus(): Promise<{
  ollamaRunning: boolean;
  modelInstalled: boolean;
  modelName: string;
}> {
  const ramGB    = await detectRAM();
  const modelName = selectModel(ramGB);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    let res: Response;
    try {
      res = await fetch("http://localhost:11434/api/tags", {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return { ollamaRunning: false, modelInstalled: false, modelName };
    }

    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const installed = (data.models ?? []).some((m) => m.name === modelName);

    return { ollamaRunning: true, modelInstalled: installed, modelName };
  } catch {
    return { ollamaRunning: false, modelInstalled: false, modelName };
  }
}

// ─────────────────────────────────────────────────────────────
// 4. isOllamaInstalled(): Promise<boolean>
// Checks if the ollama binary exists on this machine.
// Supports Windows and macOS only. Never throws.
// ─────────────────────────────────────────────────────────────
export async function isOllamaInstalled(): Promise<boolean> {
  try {
    const platform = process.platform;

    if (platform === "win32") {
      // Try LOCALAPPDATA first, fallback to USERPROFILE
      const localAppData = process.env["LOCALAPPDATA"];
      const userProfile  = process.env["USERPROFILE"];
      const base = localAppData ?? (userProfile ? `${userProfile}\\AppData\\Local` : null);
      if (!base) return false;
      const exePath = `${base}\\Programs\\Ollama\\ollama.exe`;
      return await Bun.file(exePath).exists();
    }

    if (platform === "darwin") {
      const proc = Bun.spawn(["which", "ollama"], { stdout: "pipe", stderr: "pipe" });
      const code = await proc.exited;
      return code === 0;
    }

    return false;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// 5. installOllama(): Promise<void>
// Downloads and silently installs Ollama. Updates installState.
// Supports Windows and macOS only.
// ─────────────────────────────────────────────────────────────
export async function installOllama(): Promise<void> {
  const platform = process.platform;

  if (platform !== "win32" && platform !== "darwin") {
    installState.phase   = "error";
    installState.message = "Sistema operativo no soportado";
    throw new Error(installState.message);
  }

  if (platform === "win32") {
    // Step 1 — Download installer
    installState.phase   = "downloading_ollama";
    installState.message = "Descargando instalador de Ollama...";

    let installerBytes: ArrayBuffer;
    try {
      const res = await fetch("https://ollama.com/download/OllamaSetup.exe");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      installerBytes = await res.arrayBuffer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      installState.phase   = "error";
      installState.message = `Error descargando Ollama: ${msg}`;
      throw new Error(installState.message);
    }

    await Bun.write("C:\\Windows\\Temp\\OllamaSetup.exe", installerBytes);

    // Step 2 — Run silent installer
    installState.phase   = "installing_ollama";
    installState.message = "Instalando Ollama...";

    const proc = Bun.spawn(
      ["C:\\Windows\\Temp\\OllamaSetup.exe", "/S"],
      { stdout: "pipe", stderr: "pipe" }
    );
    const code = await proc.exited;

    if (code !== 0) {
      installState.phase   = "error";
      installState.message = `Error instalando Ollama. Código: ${code}`;
      throw new Error(installState.message);
    }
    return;
  }

  // macOS
  installState.phase   = "downloading_ollama";
  installState.message = "Descargando Ollama...";

  const proc = Bun.spawn(
    ["sh", "-c", "curl -fsSL https://ollama.com/install.sh | sh"],
    { stdout: "pipe", stderr: "pipe" }
  );
  const code = await proc.exited;

  if (code !== 0) {
    installState.phase   = "error";
    installState.message = `Error instalando Ollama en macOS. Código: ${code}`;
    throw new Error(installState.message);
  }
}

// ─────────────────────────────────────────────────────────────
// 6. startOllama(): Promise<void>
// Starts ollama serve in background if not already running.
// ─────────────────────────────────────────────────────────────
export async function startOllama(): Promise<void> {
  const status = await checkOllamaStatus();
  if (status.ollamaRunning) return;

  installState.phase   = "starting_ollama";
  installState.message = "Iniciando Ollama...";

  // Fire-and-forget background process
  Bun.spawn(["ollama", "serve"], { stdout: "ignore", stderr: "ignore" });

  await Bun.sleep(3000);

  const statusAfter = await checkOllamaStatus();
  if (!statusAfter.ollamaRunning) {
    installState.phase   = "error";
    installState.message = "No se pudo iniciar Ollama";
    throw new Error(installState.message);
  }
}

// ─────────────────────────────────────────────────────────────
// 7. pullModel(): Promise<void>
// Downloads the model selected by RAM. Updates installState.
// ─────────────────────────────────────────────────────────────
export async function pullModel(): Promise<void> {
  const ramGB    = await detectRAM();
  const modelName = selectModel(ramGB);

  installState.phase   = "pulling_model";
  installState.message = `Descargando modelo de IA: ${modelName}. Esto puede tomar varios minutos según tu conexión...`;

  const proc = Bun.spawn(
    ["ollama", "pull", modelName],
    { stdout: "pipe", stderr: "pipe" }
  );
  const code = await proc.exited;

  if (code !== 0) {
    installState.phase   = "error";
    installState.message = `Error descargando modelo ${modelName}. Código: ${code}`;
    throw new Error(installState.message);
  }

  installState.phase   = "ready";
  installState.message = "¡Asistente de IA listo!";
}
