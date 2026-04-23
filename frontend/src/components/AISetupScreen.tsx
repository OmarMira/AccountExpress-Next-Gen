import { useEffect, useRef, useState } from 'react';
import { fetchApi } from '../lib/api';
import { BrainCircuit, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

interface AISetupScreenProps {
  onComplete: () => void;
}

type InstallPhase =
  | 'idle'
  | 'downloading_ollama'
  | 'installing_ollama'
  | 'starting_ollama'
  | 'pulling_model'
  | 'ready'
  | 'error';

interface AIStatusResponse {
  ollamaRunning: boolean;
  modelInstalled: boolean;
  installState: { phase: InstallPhase; message: string };
}

// Ordered steps shown in the UI
const STEPS: { phase: InstallPhase; label: string }[] = [
  { phase: 'downloading_ollama', label: 'Descargando instalador...'  },
  { phase: 'installing_ollama',  label: 'Instalando Ollama...'       },
  { phase: 'starting_ollama',    label: 'Iniciando servicio...'      },
  { phase: 'pulling_model',      label: 'Descargando modelo de IA...' },
];

const PHASE_ORDER: InstallPhase[] = [
  'idle',
  'downloading_ollama',
  'installing_ollama',
  'starting_ollama',
  'pulling_model',
  'ready',
];

function phaseIndex(p: InstallPhase): number {
  return PHASE_ORDER.indexOf(p);
}

export function AISetupScreen({ onComplete }: AISetupScreenProps) {
  const [phase, setPhase]     = useState<InstallPhase>('idle');
  const [message, setMessage] = useState('');
  const intervalRef           = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startInstall = () => {
    fetchApi('/ai/install', { method: 'POST' }).catch(() => {
      // If the fire-and-forget POST itself fails (network issue), mark error
      setPhase('error');
      setMessage('No se pudo conectar con el servidor para iniciar la instalación.');
    });
  };

  const startPolling = () => {
    stopPolling();
    intervalRef.current = setInterval(async () => {
      try {
        const data: AIStatusResponse = await fetchApi('/ai/status');
        const p = data.installState.phase;
        setPhase(p);
        setMessage(data.installState.message);

        if (p === 'ready' && data.ollamaRunning && data.modelInstalled) {
          stopPolling();
          onComplete();
          return;
        }
        if (p === 'ready' && (!data.ollamaRunning || !data.modelInstalled)) {
          // ready phase but status check disagrees — keep polling briefly
          return;
        }
        if (p === 'error') {
          stopPolling();
        }
      } catch {
        // transient fetch error — keep polling
      }
    }, 4000);
  };

  useEffect(() => {
    // Initial status check
    fetchApi('/ai/status')
      .then((data: AIStatusResponse) => {
        const p = data.installState.phase;
        setPhase(p);
        setMessage(data.installState.message);

        // Already good to go
        if (p === 'ready' && data.ollamaRunning && data.modelInstalled) {
          onComplete();
          return;
        }
        if (data.ollamaRunning && data.modelInstalled) {
          onComplete();
          return;
        }

        // Kick off install + start polling
        startInstall();
        startPolling();
      })
      .catch(() => {
        // Server unreachable — still try to install
        startInstall();
        startPolling();
      });

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = () => {
    setPhase('idle');
    setMessage('');
    startInstall();
    startPolling();
  };

  // ── Error state ───────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>

        <div>
          <h2 className="text-base font-semibold text-white">
            Error al configurar el Asistente de IA
          </h2>
          {message && (
            <p className="mt-2 text-sm text-red-400 leading-relaxed max-w-xs mx-auto">
              {message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={handleRetry}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            Reintentar
          </button>
          <button
            onClick={onComplete}
            className="w-full py-2 px-4 rounded-lg text-sm font-medium text-gray-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 transition-colors"
          >
            Continuar sin IA
          </button>
        </div>
      </div>
    );
  }

  // ── Progress state ────────────────────────────────────────────
  const currentIdx = phaseIndex(phase);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8 text-center">
      {/* Animated brain icon */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <BrainCircuit className="w-8 h-8 text-indigo-400 animate-spin [animation-duration:3s]" />
        </div>
      </div>

      {/* Title */}
      <div>
        <h2 className="text-base font-semibold text-white">
          Configurando el Asistente de IA
        </h2>
        <p className="text-xs text-gray-500 mt-1">Esto solo ocurre una vez.</p>
      </div>

      {/* Steps */}
      <div className="w-full space-y-2.5 text-left">
        {STEPS.map((step) => {
          const stepIdx     = phaseIndex(step.phase);
          const isCompleted = currentIdx > stepIdx;
          // Active = current phase matches this step, or idle maps to first step
          const isActive    =
            step.phase === phase ||
            (phase === 'idle' && step.phase === 'downloading_ollama');
          const isPending   = !isCompleted && !isActive;

          return (
            <div key={step.phase} className="flex items-center gap-3">
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-600" />
                )}
              </div>
              <span
                className={`text-sm ${
                  isCompleted
                    ? 'text-emerald-400'
                    : isActive
                    ? 'text-white font-medium'
                    : isPending
                    ? 'text-gray-600'
                    : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current message */}
      {message && (
        <p className="text-xs text-gray-400 leading-relaxed max-w-xs">{message}</p>
      )}

      {/* Indeterminate progress bar */}
      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full w-1/3 bg-indigo-500 rounded-full animate-[progress_1.8s_ease-in-out_infinite]" />
      </div>

      <p className="text-[11px] text-gray-600">No cierres esta ventana.</p>

      <style>{`
        @keyframes progress {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
