import { X, AlertCircle } from 'lucide-react';
import { ParentSelector } from './ParentSelector';
import type { Account } from './types';
import { LABEL_CLS, FIELD_CLS } from './constants';

export interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  formData: {
    code: string; name: string; accountType: string; normalBalance: string;
    parentCode: string; description: string;
  };
  setFormData: (data: any) => void;
  handleTypeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  accounts: Account[];
  error: string;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function CreateAccountModal({
  isOpen, onClose, formData, setFormData, handleTypeChange, accounts, error, isPending, onSubmit
}: CreateAccountModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-bold text-white">Crear Nueva Cuenta</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/40 rounded-lg p-3 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-rose-400">{error}</p>
            </div>
          )}

          <form id="createAccountForm" onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Código *</label>
                <input
                  type="text" required maxLength={6}
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value })}
                  className={FIELD_CLS} placeholder="Ej: 1910"
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Tipo *</label>
                <select value={formData.accountType} onChange={handleTypeChange} className={`${FIELD_CLS} appearance-none`}>
                  <option value="asset">Activo</option>
                  <option value="liability">Pasivo</option>
                  <option value="equity">Capital</option>
                  <option value="revenue">Ingreso</option>
                  <option value="expense">Gasto</option>
                </select>
              </div>
            </div>

            <div>
              <label className={LABEL_CLS}>Nombre de Cuenta *</label>
              <input
                type="text" required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className={FIELD_CLS} placeholder="Ej: Security Deposits"
              />
            </div>

            <div>
              <label className={LABEL_CLS}>Cuenta Padre (Opcional)</label>
              <ParentSelector
                accounts={accounts}
                value={formData.parentCode}
                onChange={v => setFormData({ ...formData, parentCode: v })}
              />
              {formData.parentCode && (
                <p className="text-xs text-indigo-400 mt-1">
                  Esta cuenta será subcuenta de <strong>{formData.parentCode}</strong>
                </p>
              )}
            </div>

            <div>
              <label className={LABEL_CLS}>Naturaleza (Balance Normal)</label>
              <select
                value={formData.normalBalance}
                onChange={e => setFormData({ ...formData, normalBalance: e.target.value })}
                className={`${FIELD_CLS} appearance-none`}
              >
                <option value="debit">Débito (Activos, Gastos)</option>
                <option value="credit">Crédito (Pasivos, Capital, Ingresos)</option>
              </select>
            </div>

            <div>
              <label className={LABEL_CLS}>Descripción (Opcional)</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className={`${FIELD_CLS} resize-none h-16`}
                placeholder="Notas adicionales..."
              />
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            type="submit" form="createAccountForm"
            disabled={isPending}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {isPending ? 'Guardando...' : 'Guardar Cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
}
