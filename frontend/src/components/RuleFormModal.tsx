import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AccountSelector } from './AccountSelector';

export interface RuleFormData {
  id?: string;
  name: string;
  conditionType: 'contains' | 'starts_with' | 'equals';
  conditionValue: string;
  transactionDirection: 'any' | 'debit' | 'credit';
  glAccountId: string;
  autoAdd: boolean;
  priority: number;
  isActive: boolean;
}

interface RuleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RuleFormData) => void;
  initialData?: Partial<RuleFormData>;
  glAccounts: any[];
  title?: string;
  submitLabel?: string;
  isLoading?: boolean;
}

const defaultFormData: RuleFormData = {
  name: '',
  conditionType: 'contains',
  conditionValue: '',
  transactionDirection: 'any',
  glAccountId: '',
  autoAdd: false,
  priority: 10,
  isActive: true
};

export function RuleFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  glAccounts,
  title = 'Nueva Regla Bancaria',
  submitLabel = 'Guardar regla',
  isLoading = false
}: RuleFormModalProps) {
  const [formData, setFormData] = useState<RuleFormData>(defaultFormData);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        ...defaultFormData,
        ...initialData
      });
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f2240] border border-white/10 rounded-3xl shadow-2xl w-full max-w-2xl relative flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {isLoading ? (
          <div className="px-8 py-12 flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-full border-4 border-[#0071c5]/30 border-t-[#0071c5] animate-spin mb-4" />
            <p className="text-gray-400 font-medium">Obteniendo sugerencia de la IA...</p>
          </div>
        ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(formData);
          }}
          className="px-8 py-6 flex flex-col gap-5"
        >
          {/* Nombre */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Nombre de la regla</label>
            <input
              required
              className="bg-[#0a1628] border border-white/10 px-4 py-3 rounded-xl text-white outline-none focus:border-[#0071c5] transition-colors"
              placeholder="Ej: Pagos de Lyft - Ingresos de transporte"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {/* Condición */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Condición</label>
            <div className="flex gap-3">
              <select
                className="bg-[#0a1628] border border-white/10 px-4 py-3 rounded-xl text-white outline-none focus:border-[#0071c5] transition-colors w-40 shrink-0 [&>option]:bg-[#0f2240]"
                value={formData.conditionType}
                onChange={e => setFormData({ ...formData, conditionType: e.target.value as any })}
              >
                <option value="contains">Contiene</option>
                <option value="starts_with">Empieza con</option>
                <option value="equals">Igual a</option>
              </select>
              <input
                required
                className="flex-1 bg-[#0a1628] border border-white/10 px-4 py-3 rounded-xl text-white outline-none focus:border-[#0071c5] transition-colors"
                placeholder="Ej: LYFT, UBER, AMAZON..."
                value={formData.conditionValue}
                onChange={e => setFormData({ ...formData, conditionValue: e.target.value })}
              />
            </div>
          </div>

          {/* Dirección */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Dirección de la transacción</label>
            <select
              className="bg-[#0a1628] border border-white/10 px-4 py-3 rounded-xl text-white outline-none focus:border-[#0071c5] transition-colors [&>option]:bg-[#0f2240]"
              value={formData.transactionDirection}
              onChange={e => setFormData({ ...formData, transactionDirection: e.target.value as any })}
            >
              <option value="any">Cualquiera (débito o crédito)</option>
              <option value="debit">Solo débitos (salidas)</option>
              <option value="credit">Solo créditos (entradas)</option>
            </select>
          </div>

          {/* Cuenta GL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cuenta contable (GL)</label>
            <AccountSelector
              accounts={Array.isArray(glAccounts) ? glAccounts : []}
              value={formData.glAccountId}
              onChange={(id) => setFormData({ ...formData, glAccountId: id })}
              required
            />
          </div>

          {/* Prioridad */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Prioridad</label>
            <select
              className="bg-[#0a1628] border border-white/10 px-4 py-3 rounded-xl text-white outline-none focus:border-[#0071c5] transition-colors [&>option]:bg-[#0f2240]"
              value={formData.priority}
              onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) })}
            >
              <option value="0">0 — Prioridad Crítica (se evalúa primero)</option>
              <option value="5">5 — Prioridad Alta</option>
              <option value="10">10 — Prioridad Normal</option>
              <option value="15">15 — Prioridad Baja</option>
              <option value="20">20 — Prioridad Muy Baja</option>
            </select>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-colors"
            >
              {submitLabel}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
