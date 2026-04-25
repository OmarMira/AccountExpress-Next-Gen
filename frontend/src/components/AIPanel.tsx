import { useState, useRef, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import { X, Send, BrainCircuit, Loader2, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

interface RuleSuggestion {
  name: string;
  conditionType: 'contains' | 'starts_with' | 'equals';
  conditionValue: string;
  transactionDirection: 'debit' | 'credit' | 'any';
  glAccountId: string;
  glAccountCode: string;
  glAccountName: string;
  autoAdd: boolean;
  priority: number;
  explanation: string;
}

export function AIPanel({ isOpen, onClose, companyId }: AIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [ruleMode, setRuleMode] = useState(false);
  const [ruleSuggestion, setRuleSuggestion] = useState<RuleSuggestion | null>(null);
  const [ruleCreating, setRuleCreating] = useState(false);
  const [ruleCreated, setRuleCreated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setSending(true);

    try {
      const data = await fetchApi('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ companyId, message: text }),
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: 'No se pudo conectar con el asistente. Intenta de nuevo.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  const suggestRule = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setRuleSuggestion(null);
    setRuleCreated(false);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setSending(true);
    try {
      const data = await fetchApi('/ai/suggest-rule', {
        method: 'POST',
        body: JSON.stringify({ companyId, message: text }),
      });
      if (data.duplicate) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: data.message,
        }]);
      } else if (data.suggested) {
        setRuleSuggestion(data.suggested);
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `Sugerencia de regla lista. Revísala abajo antes de confirmar.`,
        }]);
      } else {
        setMessages((prev) => [...prev, { role: 'error', content: data.error ?? 'No se pudo generar la sugerencia.' }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'error', content: 'Error al conectar con el asistente.' }]);
    } finally {
      setSending(false);
    }
  };

  const createRule = async () => {
    if (!ruleSuggestion) return;
    setRuleCreating(true);
    try {
      await fetchApi('/bank-rules', {
        method: 'POST',
        body: JSON.stringify({
          name: ruleSuggestion.name,
          conditionType: ruleSuggestion.conditionType,
          conditionValue: ruleSuggestion.conditionValue,
          transactionDirection: ruleSuggestion.transactionDirection,
          glAccountId: ruleSuggestion.glAccountId,
          autoAdd: ruleSuggestion.autoAdd,
          priority: ruleSuggestion.priority,
          isActive: true,
        }),
      });
      setRuleCreated(true);
      setRuleSuggestion(null);
      setMessages((prev) => [...prev, { role: 'assistant', content: `✓ Regla "${ruleSuggestion.name}" creada exitosamente.` }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'error', content: 'Error al crear la regla. Intenta de nuevo.' }]);
    } finally {
      setRuleCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (ruleMode) {
        suggestRule();
      } else {
        sendMessage();
      }
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full z-40 w-96 bg-slate-900 border-l border-slate-700/60 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white">Asistente IA</span>
              <p className="text-xs text-gray-500">Auditor Forense · Florida</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-slate-700/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <BrainCircuit className="w-10 h-10 text-indigo-400/40" />
              <p className="text-sm text-gray-500 leading-relaxed">
                Hola, soy tu asistente contable.<br />
                Pregúntame sobre tus finanzas.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : msg.role === 'error'
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400 rounded-bl-sm'
                    : 'bg-slate-700/60 text-gray-100 border border-slate-600/40 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-slate-700/60 border border-slate-600/40 rounded-xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                <span className="text-xs text-gray-400">Escribiendo...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-slate-700/60 px-4 py-3 shrink-0">
          {/* Mode toggle */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => { setRuleMode(false); setRuleSuggestion(null); setRuleCreated(false); setMessages([]); setInput(''); }}
              className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${!ruleMode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              Chat
            </button>
            <button
              onClick={() => { setRuleMode(true); setRuleSuggestion(null); setRuleCreated(false); setMessages([]); setInput(''); }}
              className={`flex-1 text-xs py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${ruleMode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              <Sparkles className="w-3 h-3" />
              Crear Regla
            </button>
          </div>

          {/* Rule suggestion card */}
          {ruleSuggestion && (
            <div className="mb-2 p-3 bg-slate-800/80 border border-indigo-500/30 rounded-xl text-xs space-y-1.5">
              <p className="font-semibold text-indigo-300 text-[11px] uppercase tracking-wide">Regla sugerida</p>
              <p className="text-white font-medium">{ruleSuggestion.name}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-400">
                <span>Condición:</span><span className="text-slate-200">{ruleSuggestion.conditionType} "{ruleSuggestion.conditionValue}"</span>
                <span>Dirección:</span><span className="text-slate-200">{ruleSuggestion.transactionDirection}</span>
                <span>Cuenta GL:</span><span className="text-slate-200">{ruleSuggestion.glAccountCode} — {ruleSuggestion.glAccountName}</span>
                <span>Prioridad:</span><span className="text-slate-200">{ruleSuggestion.priority}</span>
              </div>
              <p className="text-slate-400 italic border-t border-slate-700 pt-1.5">{ruleSuggestion.explanation}</p>
              <button
                onClick={createRule}
                disabled={ruleCreating}
                className="w-full mt-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                {ruleCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                {ruleCreating ? 'Creando...' : 'Confirmar y crear regla'}
              </button>
            </div>
          )}

          {/* Input area */}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={ruleMode ? 'Describe la transacción. Ej: "Los pagos de Lyft son gastos de transporte"' : 'Escribe tu pregunta... (Enter para enviar)'}
              rows={2}
              disabled={sending}
              className="flex-1 resize-none bg-slate-800/80 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 disabled:opacity-50 transition-colors"
            />
            <button
              onClick={ruleMode ? suggestRule : sendMessage}
              disabled={sending || !input.trim()}
              className="w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
            >
              {ruleMode ? <Sparkles className="w-4 h-4 text-white" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5 text-center">
            {ruleMode ? 'Describe la transacción en lenguaje natural' : 'Shift+Enter para nueva línea'}
          </p>
        </div>
      </div>
    </>
  );
}
