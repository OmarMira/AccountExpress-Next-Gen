import { X, AlertCircle } from 'lucide-react';
import { ParentSelector } from './ParentSelector';
import type { Account } from './types';
import { LABEL_CLS, FIELD_CLS, TYPE_LABELS, BALANCE_LABELS } from './constants';

export interface EditAccountModalProps {
  editingAccount: Account | null;
  onClose: () => void;
  editParentCode: string;
  setEditParentCode: (code: string) => void;
  setEditingAccount: (acc: Account) => void;
  accounts: Account[];
  error: string;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function EditAccountModal({
  editingAccount, onClose, editParentCode, setEditParentCode, setEditingAccount, 
  accounts, error, isPending, onSubmit
}: EditAccountModalProps) {
  if (!editingAccount) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-white">Editar Cuenta</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {TYPE_LABELS[editingAccount.accountType] ?? editingAccount.accountType}
              {editingAccount.isSystem ? ' · Sistema (protegida)' : ''}
            </p>
          </div>
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

          <form id="editAccountForm" onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Código</label>
              <input
                type="text" required maxLength={6}
                value={editingAccount.code}
                onChange={e => setEditingAccount({ ...editingAccount, code: e.target.value })}
                className={FIELD_CLS}
              />
            </div>

            <div>
              <label className={LABEL_CLS}>Nombre de Cuenta</label>
              <input
                type="text" required
                value={editingAccount.name}
                onChange={e => setEditingAccount({ ...editingAccount, name: e.target.value })}
                className={FIELD_CLS}
              />
            </div>

            <div>
              <label className={LABEL_CLS}>Cuenta Padre</label>
              <ParentSelector
                accounts={accounts}
                value={editParentCode}
                onChange={setEditParentCode}
                currentId={editingAccount.id}
              />
              {editParentCode ? (
                <p className="text-xs text-indigo-400 mt-1">
                  Subcuenta de <strong>{editParentCode}</strong> · Nivel {(accounts.find(a => a.code === editParentCode)?.level ?? 0) + 1}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">Cuenta raíz (nivel 1)</p>
              )}
            </div>

            <div>
              <label className={LABEL_CLS}>Descripción</label>
              <textarea
                value={editingAccount.description ?? ''}
                onChange={e => setEditingAccount({ ...editingAccount, description: e.target.value })}
                className={`${FIELD_CLS} resize-none h-16`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/60 rounded-lg px-3 py-2.5">
                <p className="text-xs text-gray-500 mb-0.5">Tipo</p>
                <p className="text-sm text-white font-medium">{TYPE_LABELS[editingAccount.accountType] ?? editingAccount.accountType}</p>
              </div>
              <div className="bg-gray-800/60 rounded-lg px-3 py-2.5">
                <p className="text-xs text-gray-500 mb-0.5">Balance Normal</p>
                <p className={`text-sm font-medium ${editingAccount.normalBalance === 'debit' ? 'text-blue-400' : 'text-emerald-400'}`}>
                  {BALANCE_LABELS[editingAccount.normalBalance] ?? editingAccount.normalBalance}
                </p>
              </div>
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
            type="submit" form="editAccountForm"
            disabled={isPending}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {isPending ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
