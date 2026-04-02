// ============================================================
// AI PANEL
// Panel lateral de chat con Ollama/Mistral.
// Se abre desde cualquier pantalla via AppShell.
// ============================================================

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { X, Send, Bot, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

// ── Tipos ────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface OllamaStatus {
  ollamaRunning: boolean;
  mistralReady: boolean;
}

// ── Comandos rápidos ──────────────────────────────────────────

const QUICK_COMMANDS = [
  { label: 'Analizar riesgos',     text: 'Analyze the current financial data and identify any risks or anomalies.' },
  { label: 'Verificar balance',    text: 'Check if debits and credits are balanced in the recent journal entries.' },
  { label: 'Resumen financiero',   text: 'Give me a brief summary of the current financial position of the company.' },
  { label: 'Transacciones pendientes', text: 'What can you tell me about the pending bank transactions?' },
];

// ── Componente ────────────────────────────────────────────────

interface AIPanelProps {
  onClose: () => void;
}

export function AIPanel({ onClose }: AIPanelProps) {
  const activeCompany = useAuthStore((s) => s.activeCompany);
  const companyId     = activeCompany?.id ?? '';

  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus]         = useState<OllamaStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [downloadStarted, setDownloadStarted] = useState(false);
  const [pulling, setPulling]               = useState(false);
  const [pullError, setPullError]           = useState<string | null>(null);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  // ── Verificar estado de Ollama al montar ─────────────────

  useEffect(() => {
    fetch('/api/ai/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setStatus(d.data))
      .catch(() => setStatus({ ollamaRunning: false, mistralReady: false }))
      .finally(() => setStatusLoading(false));
  }, []);

  // Auto-pull Mistral si Ollama corre pero modelo no está
  useEffect(() => {
    if (!statusLoading && status?.ollamaRunning && !status?.mistralReady && !pulling) {
      setPulling(true);
      setPullError(null);
      fetch('/api/ai/pull-model', { method: 'POST', credentials: 'include' })
        .then((r) => r.json())
        .then((d) => {
          if (!d.success) {
            setPullError(d.error ?? 'Error iniciando descarga');
            setPulling(false);
          }
        })
        .catch((err) => {
          setPullError(err.message);
          setPulling(false);
        });
    }
  }, [statusLoading, status]);

  // Polling cada 10 segundos hasta que Mistral esté listo
  useEffect(() => {
    if (!pulling) return;
    const interval = setInterval(() => {
      fetch('/api/ai/status', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => {
          setStatus(d.data);
          if (d.data?.mistralReady) {
            setPulling(false);
            clearInterval(interval);
          }
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [pulling]);

  // ── Auto-scroll ───────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const detectOS = (): 'windows' | 'mac' | 'linux' => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win'))    return 'windows';
    if (ua.includes('mac'))    return 'mac';
    return 'linux';
  };

  const handleDownloadOllama = async () => {
    const os = detectOS();
    if (os === 'linux') return;
    setDownloadStarted(true);

    // Descarga nativa del browser — sin cargar en RAM
    const a = document.createElement('a');
    a.href = `/api/ai/download-ollama?os=${os}`;
    a.download = os === 'windows' ? 'OllamaSetup.exe' : 'Ollama-darwin.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Enviar mensaje ────────────────────────────────────────

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming || !status?.mistralReady) return;

    const userMessage: Message = { role: 'user', content: text.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);

    // Placeholder para la respuesta del asistente
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: updatedMessages,
          companyId,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Stream failed');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Error connecting to AI. Make sure Ollama is running.'
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-gray-900 border-l border-gray-700 flex flex-col z-50 shadow-2xl">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-blue-400" />
          <span className="text-white font-semibold text-sm">Asistente Contable</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Estado Ollama */}
          {statusLoading ? (
            <Loader2 size={14} className="text-gray-400 animate-spin" />
          ) : status?.mistralReady ? (
            <span className="flex items-center gap-1 text-green-400 text-xs">
              <CheckCircle2 size={13} /> IA Local activa
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-400 text-xs">
              <AlertCircle size={13} /> Ollama offline
            </span>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Ollama offline — botón de instalación */}
      {!statusLoading && !status?.ollamaRunning && (
        <div className="mx-4 mt-4 p-4 bg-gray-800 border border-gray-700 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-yellow-400">
            <AlertCircle size={16} />
            <span className="text-sm font-semibold">Ollama no está instalado</span>
          </div>
          <p className="text-gray-400 text-xs">
            Para usar el asistente IA necesitás instalar Ollama en tu computadora.
          </p>
          {detectOS() === 'linux' ? (
            <div className="space-y-2">
              <p className="text-gray-400 text-xs">Ejecutá en tu terminal:</p>
              <code className="block bg-gray-900 text-green-400 text-xs px-3 py-2 rounded-lg">
                curl -fsSL https://ollama.com/install.sh | sh
              </code>
            </div>
          ) : downloadStarted ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-blue-400 text-sm font-medium">
                <Loader2 size={16} className="animate-spin" />
                Descarga iniciada
              </div>
              <p className="text-gray-400 text-xs">
                Revisá tu carpeta de Downloads.<br />
                Una vez instalado ejecutá: <code className="text-gray-300">ollama pull mistral</code>
              </p>
              <button
                onClick={() => setDownloadStarted(false)}
                className="text-xs text-gray-500 hover:text-gray-300 underline"
              >
                Descargar de nuevo
              </button>
            </div>
          ) : downloadStarted ? (
            <div className="space-y-2">
              <div className="text-xs text-gray-400 mb-1">
                Descargando Ollama...
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div className="bg-blue-500 h-2 rounded-full animate-slide" />
              </div>
              <p className="text-gray-500 text-xs text-center animate-pulse">
                Instalador descargándose, por favor esperá...
              </p>
            </div>
          ) : (
            <button
              onClick={handleDownloadOllama}
              className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Descargar Ollama ({detectOS() === 'windows' ? 'Windows' : 'macOS'})
            </button>
          )}
        </div>
      )}

      {/* Auto-pull Mistral en progreso */}
      {!statusLoading && status?.ollamaRunning && !status?.mistralReady && (
        <div className="mx-4 mt-4 p-4 bg-gray-800 border border-gray-700 rounded-xl space-y-3">
          {pullError ? (
            <>
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle size={16} />
                <span className="text-sm font-semibold">Error descargando modelo</span>
              </div>
              <p className="text-red-300 text-xs">{pullError}</p>
              <button
                onClick={() => { setPullError(null); setPulling(false); }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded-lg transition-colors"
              >
                Reintentar
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-blue-400">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm font-semibold">Descargando Mistral...</span>
              </div>
              <p className="text-gray-400 text-xs">
                Descargando el modelo de IA (~4 GB). Esto puede tardar varios minutos según tu conexión.
              </p>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div className="bg-blue-500 h-2 rounded-full animate-slide" />
              </div>
              <p className="text-gray-500 text-xs text-center animate-pulse">
                No cierres esta ventana...
              </p>
            </>
          )}
        </div>
      )}

      {/* Comandos rápidos — solo si no hay mensajes */}
      {messages.length === 0 && status?.mistralReady && (
        <div className="p-4 space-y-2">
          <p className="text-gray-400 text-xs mb-3">Comandos rápidos:</p>
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd.label}
              onClick={() => sendMessage(cmd.text)}
              className="w-full text-left text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white px-3 py-2 rounded-lg transition-colors"
            >
              {cmd.label}
            </button>
          ))}
        </div>
      )}

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 border border-gray-700 text-gray-200'
            }`}>
              {msg.content === '' && msg.role === 'assistant' ? (
                <Loader2 size={14} className="animate-spin text-gray-400" />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-700 bg-gray-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || !status?.mistralReady}
            placeholder={status?.mistralReady ? 'Preguntá algo... (Enter para enviar)' : 'Ollama offline'}
            rows={2}
            className="flex-1 bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 resize-none placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={isStreaming || !input.trim() || !status?.mistralReady}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white p-2 rounded-lg transition-colors flex-shrink-0"
          >
            {isStreaming
              ? <Loader2 size={18} className="animate-spin" />
              : <Send size={18} />
            }
          </button>
        </div>
        <p className="text-gray-500 text-xs mt-1">Shift+Enter para nueva línea</p>
      </div>

    </div>
  );
}
