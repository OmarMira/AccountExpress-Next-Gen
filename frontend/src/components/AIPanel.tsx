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
  applyToPending?: boolean;
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
      
      if (data.source === "rule_suggestion" && data.suggestedRule) {
        setRuleSuggestion({ ...data.suggestedRule, applyToPending: true });
        setRuleMode(true); // Switch to rule mode to show the card
      }
      
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      const isBlocked = err?.message === 'Consulta no permitida.' || err?.message === 'Mensaje inválido.' || err?.message?.startsWith('El mensaje es demasiado largo');
      setMessages((prev) => [
        ...prev,
        {
          role: 'error',
          content: isBlocked
            ? err.message
            : 'No se pudo conectar con el asistente. Intenta de nuevo.',
        },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
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
        setRuleSuggestion({ ...data.suggested, applyToPending: true });
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
      setTimeout(() => inputRef.current?.focus(), 100);
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
      
      if (ruleSuggestion.applyToPending && res.id) {
        await fetchApi(`/bank-rules/${res.id}/apply-to-pending`, { method: 'POST' });
      }

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
        className={`fixed top-0 right-0 h-full z-40 w-96 bg-[#0a1628] border-l border-white/7 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/7 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0071c5]/10 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-[#0071c5]" />
            </div>
            <div>
              <span className="text-sm font-semibold text-white">Asistente IA</span>
              <p className="text-xs text-gray-500">Auditor Forense · Florida</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <BrainCircuit className="w-10 h-10 text-[#0071c5]/40" />
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
                    ? 'bg-[#0071c5] text-white rounded-br-sm'
                    : msg.role === 'error'
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400 rounded-bl-sm'
                    : 'bg-[#0f2240] text-gray-100 border border-white/10 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-[#0f2240] border border-white/10 rounded-xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-[#0071c5] animate-spin" />
                <span className="text-xs text-gray-400">Escribiendo...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-white/7 px-4 py-3 shrink-0">
          {/* Mode toggle */}
          <div className="flex gap-1 mb-2">
            <button
              onClick={async () => { setRuleMode(false); setRuleSuggestion(null); setRuleCreated(false); setMessages([]); setInput(''); await fetchApi('/ai/clear-history', { method: 'POST', body: JSON.stringify({ companyId }) }); }}
              className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${!ruleMode ? 'bg-[#0071c5] text-white' : 'bg-white/10 text-slate-400 hover:text-white'}`}
            >
              Chat
            </button>
            <button
              onClick={async () => { setRuleMode(true); setRuleSuggestion(null); setRuleCreated(false); setMessages([]); setInput(''); await fetchApi('/ai/clear-history', { method: 'POST', body: JSON.stringify({ companyId }) }); }}
              className={`flex-1 text-xs py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 ${ruleMode ? 'bg-[#0071c5] text-white' : 'bg-white/10 text-slate-400 hover:text-white'}`}
            >
              <Sparkles className="w-3 h-3" />
              Crear Regla
            </button>
          </div>

          {/* Rule suggestion card */}
          {ruleSuggestion && (
            <div className="mb-2 p-3 bg-[#0f2240] border border-[#0071c5]/30 rounded-xl text-xs space-y-1.5">
              <p className="font-semibold text-[#4db3ff] text-[11px] uppercase tracking-wide">Regla sugerida</p>
              <p className="text-white font-medium">{ruleSuggestion.name}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-400">
                <span>Condición:</span><span className="text-slate-200">{ruleSuggestion.conditionType} "{ruleSuggestion.conditionValue}"</span>
                <span>Dirección:</span><span className="text-slate-200">{ruleSuggestion.transactionDirection}</span>
                <span>Cuenta GL:</span><span className="text-slate-200">{ruleSuggestion.glAccountCode} — {ruleSuggestion.glAccountName}</span>
                <span>Prioridad:</span><span className="text-slate-200">{ruleSuggestion.priority}</span>
              </div>
              <p className="text-slate-400 italic border-t border-white/10 pt-1.5 pb-1.5">{ruleSuggestion.explanation}</p>
              
              <label className="flex items-center gap-2 cursor-pointer group py-1">
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="peer h-3.5 w-3.5 cursor-pointer appearance-none rounded border border-white/20 bg-[#0a1628] transition-all checked:border-[#0071c5] checked:bg-[#0071c5]/20"
                    checked={ruleSuggestion.applyToPending}
                    onChange={e => setRuleSuggestion({ ...ruleSuggestion, applyToPending: e.target.checked })}
                  />
                  <div className="pointer-events-none absolute text-[#0071c5] opacity-0 peer-checked:opacity-100">
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-gray-500 group-hover:text-gray-300 transition-colors uppercase">Aplicar a pendientes</span>
              </label>

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

          {/* Rule creation instructions */}
          {ruleMode && !ruleSuggestion && !ruleCreated && (
            <div className="mb-2 p-2.5 bg-[#0f2240]/50 border border-white/10 rounded-lg text-xs text-slate-300 shadow-inner">
              <p className="font-semibold text-indigo-400 mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                📝 Para crear una regla bancaria:
              </p>
              <p>Indica la <strong>descripción o patrón</strong> de la transacción, el <strong>tipo de condición</strong> (contiene, empieza con, igual a), la <strong>cuenta contable</strong> de destino y la <strong>prioridad</strong> (opcional).</p>
              <p className="mt-1 italic text-slate-400">Ejemplo de formato: <span className="text-white">"Para transacciones que contengan 'UBER', usar cuenta 'Transportation Expenses' con prioridad 10"</span></p>
              <p className="text-[10px] text-slate-500 mt-1.5 border-t border-white/5 pt-1.5">La IA analizará tu texto y te sugerirá la regla automáticamente.</p>
            </div>
          )}

          {/* Input area */}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={ruleMode ? 'Ej: "Contiene \'AMAZON\', cuenta \'Office Supplies\', prioridad 5"' : 'Escribe tu pregunta... (Enter para enviar)'}
              rows={2}
              disabled={sending}
              className="flex-1 resize-none bg-[#0f2240] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-[#0071c5]/50 focus:border-[#0071c5]/50 disabled:opacity-50 transition-colors"
            />
            <button
              onClick={ruleMode ? suggestRule : sendMessage}
              disabled={sending || !input.trim()}
              className="w-9 h-9 rounded-lg bg-[#0071c5] hover:bg-[#005fa3] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
            >
              {ruleMode ? <Sparkles className="w-4 h-4 text-white" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5 text-center">
            {ruleMode ? 'La IA analizará tu texto para sugerir una regla' : 'Shift+Enter para nueva línea'}
          </p>
        </div>
      </div>
    </>
  );
}
