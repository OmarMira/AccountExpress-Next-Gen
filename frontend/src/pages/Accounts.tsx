import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { PermissionGate } from '../components/PermissionGate';
import { Plus, Search, Trash2, FolderTree, AlertCircle, X, Pencil, ChevronDown } from 'lucide-react';

interface Account {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  parentId: string | null;
  level: number;
  isSystem: number;
  isActive: number;
  taxCategory?: string;
  description?: string;
}

const TYPE_LABELS: Record<string, string> = {
  asset: 'Activo', liability: 'Pasivo', equity: 'Capital',
  revenue: 'Ingreso', expense: 'Gasto',
};
const BALANCE_LABELS: Record<string, string> = { debit: 'Débito', credit: 'Crédito' };

const FIELD_CLS = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors';
const LABEL_CLS = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

// ── Parent Account Selector ──────────────────────────────────────────────────
function ParentSelector({
  accounts, value, onChange, currentId,
}: {
  accounts: Account[];
  value: string;
  onChange: (v: string) => void;
  currentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const options = useMemo(() => {
    const q = search.toLowerCase();
    return accounts
      .filter(a => a.id !== currentId)
      .filter(a => !q || a.code.includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 60);
  }, [accounts, search, currentId]);

  const selected = accounts.find(a => a.code === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`${FIELD_CLS} flex items-center justify-between text-left`}
      >
        <span className={selected ? 'text-white' : 'text-gray-500'}>
          {selected ? `${selected.code} — ${selected.name}` : 'Sin cuenta padre (cuenta raíz)'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-gray-700">
            <input
              autoFocus
              type="text"
              placeholder="Buscar por código o nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {/* None option */}
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors ${!value ? 'text-indigo-400 font-medium' : 'text-gray-400'}`}
            >
              — Sin cuenta padre (cuenta raíz)
            </button>
            {options.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(a.code); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${value === a.code ? 'bg-indigo-600/20 text-indigo-300' : 'text-white'}`}
                style={{ paddingLeft: `${8 + (a.level - 1) * 16}px` }}
              >
                <span className="font-mono text-xs text-gray-400 w-12 flex-shrink-0">{a.code}</span>
                <span className="truncate">{a.name}</span>
              </button>
            ))}
            {options.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-500 text-center">Sin resultados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export function Accounts() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editParentCode, setEditParentCode] = useState('');
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    code: '', name: '', accountType: 'asset', normalBalance: 'debit',
    parentCode: '', description: '',
  });

  const { data: accounts = [], isLoading, error } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      return fetchApi(`/gl-accounts`);
    },
    enabled: !!activeCompany,
  });

  // Resolve parent code from parentId
  const getParentCode = (parentId: string | null): string => {
    if (!parentId) return '';
    return accounts.find(a => a.id === parentId)?.code ?? '';
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      fetchApi('/gl-accounts', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      setShowModal(false);
      setFormData({ code: '', name: '', accountType: 'asset', normalBalance: 'debit', parentCode: '', description: '' });
      setFormError('');
    },
    onError: (err: any) => setFormError(err.message || 'Error al crear la cuenta'),
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: string; name: string; code: string; description: string; parentCode: string | null }) =>
      fetchApi(`/gl-accounts/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: data.name,
          code: data.code,
          description: data.description,
          parentCode: data.parentCode ?? null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      setEditingAccount(null);
      setFormError('');
    },
    onError: (err: any) => setFormError(err.message || 'Error al editar la cuenta'),
  });

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) =>
      fetchApi(`/gl-accounts/${accountId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] }),
    onError: (err: any) => alert(`Error al desactivar: ${err.message}`),
  });

  const handleDelete = (id: string, name: string) => {
    if (confirm(`¿Desactivar la cuenta "${name}"?`)) deleteMutation.mutate(id);
  };

  const handleEditOpen = (acc: Account) => {
    setEditingAccount(acc);
    setEditParentCode(getParentCode(acc.parentId));
    setFormError('');
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value;
    setFormData({ ...formData, accountType: type, normalBalance: ['asset', 'expense'].includes(type) ? 'debit' : 'credit' });
  };

  // ── Group & filter accounts ──────────────────────────────────────────────
  const groupedAccounts = useMemo(() => {
    const groups: Record<string, Account[]> = { asset: [], liability: [], equity: [], revenue: [], expense: [] };
    for (const acc of accounts) {
      const key = acc.accountType?.toLowerCase();
      if (groups[key]) groups[key].push(acc);
    }
    return groups;
  }, [accounts]);

  const renderAccountGroup = (title: string, type: string) => {
    const group = groupedAccounts[type];
    if (!group || group.length === 0) return null;
    const q = searchTerm.toLowerCase();
    const filtered = group.filter(a => !q || a.code.includes(q) || a.name.toLowerCase().includes(q));
    if (filtered.length === 0) return null;

    return (
      <div key={type} className="mb-8">
        <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
          <span>{title}</span>
          <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{filtered.length}</span>
        </h3>
        <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-800 text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium w-24">Código</th>
                <th className="px-4 py-3 font-medium">Nombre de Cuenta</th>
                <th className="px-4 py-3 font-medium text-center w-16 hidden md:table-cell">Balance</th>
                <th className="px-4 py-3 font-medium text-center w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {filtered.map(acc => (
                <tr key={acc.id} className="hover:bg-gray-700/30 transition-colors group">
                  <td className="px-4 py-2.5 text-gray-300 font-mono text-xs">{acc.code}</td>
                  <td className="px-4 py-2.5 text-white">
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${(acc.level - 1) * 20}px` }}>
                      {acc.level === 1
                        ? <FolderTree className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        : <div className="w-4 border-l-2 border-b-2 border-gray-600 rounded-bl-sm h-4 -mt-2 opacity-40 flex-shrink-0" />
                      }
                      <span className="truncate">{acc.name}</span>
                      {acc.isSystem === 1 && (
                        <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0">Sistema</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${acc.normalBalance === 'debit' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {BALANCE_LABELS[acc.normalBalance] ?? acc.normalBalance}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditOpen(acc)} className="text-gray-500 hover:text-indigo-400 transition-colors p-1.5 rounded hover:bg-indigo-500/10" title="Editar cuenta">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(acc.id, acc.name)} className="text-gray-500 hover:text-rose-400 transition-colors p-1.5 rounded hover:bg-rose-500/10" title="Desactivar cuenta">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Error & Loading ──────────────────────────────────────────────────────
  if (error) return (
    <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 flex items-center gap-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      Error al cargar cuentas: {(error as Error).message}
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Plan de Cuentas</h1>
          <p className="text-sm text-gray-400 mt-1">US GAAP — Gestión jerárquica de cuentas contables</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="Buscar cuenta..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-gray-500"
            />
          </div>
          <PermissionGate module="accounts" action="create">
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Nueva cuenta
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="animate-pulse bg-gray-800/50 h-32 rounded-lg border border-gray-700/50 w-full" />)}
        </div>
      ) : (
        <div className="pt-2">
          {renderAccountGroup('Activos', 'asset')}
          {renderAccountGroup('Pasivos', 'liability')}
          {renderAccountGroup('Capital', 'equity')}
          {renderAccountGroup('Ingresos', 'revenue')}
          {renderAccountGroup('Gastos', 'expense')}
          {accounts.length === 0 && (
            <div className="text-center py-12 bg-gray-800/30 rounded-2xl border border-gray-700/50 border-dashed">
              <FolderTree className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No se encontraron cuentas.</p>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL CREAR ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
              <h3 className="text-lg font-bold text-white">Crear Nueva Cuenta</h3>
              <button onClick={() => { setShowModal(false); setFormError(''); }} className="text-gray-400 hover:text-white transition-colors p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {formError && (
                <div className="bg-rose-500/10 border border-rose-500/40 rounded-lg p-3 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-400">{formError}</p>
                </div>
              )}

              <form
                id="createAccountForm"
                onSubmit={e => { e.preventDefault(); createMutation.mutate(formData); }}
                className="space-y-5"
              >
                {/* Código y Cuenta Padre */}
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

                {/* Nombre */}
                <div>
                  <label className={LABEL_CLS}>Nombre de Cuenta *</label>
                  <input
                    type="text" required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className={FIELD_CLS} placeholder="Ej: Security Deposits"
                  />
                </div>

                {/* Cuenta Padre — dropdown */}
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

                {/* Naturaleza */}
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

                {/* Descripción */}
                <div>
                  <label className={LABEL_CLS}>Descripción (Opcional)</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className={`${FIELD_CLS} resize-none h-20`}
                    placeholder="Notas adicionales..."
                  />
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => { setShowModal(false); setFormError(''); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                disabled={createMutation.isPending}
              >
                Cancelar
              </button>
              <button
                type="submit" form="createAccountForm"
                disabled={createMutation.isPending}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Guardando...' : 'Guardar Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDITAR ─────────────────────────────────────────── */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
              <div>
                <h3 className="text-lg font-bold text-white">Editar Cuenta</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {TYPE_LABELS[editingAccount.accountType] ?? editingAccount.accountType}
                  {editingAccount.isSystem ? ' · Sistema (protegida)' : ''}
                </p>
              </div>
              <button onClick={() => { setEditingAccount(null); setFormError(''); }} className="text-gray-400 hover:text-white transition-colors p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {formError && (
                <div className="bg-rose-500/10 border border-rose-500/40 rounded-lg p-3 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-400">{formError}</p>
                </div>
              )}

              <form
                id="editAccountForm"
                onSubmit={e => {
                  e.preventDefault();
                  editMutation.mutate({
                    id: editingAccount.id,
                    name: editingAccount.name,
                    code: editingAccount.code,
                    description: editingAccount.description ?? '',
                    parentCode: editParentCode || null,
                  });
                }}
                className="space-y-5"
              >
                {/* Código */}
                <div>
                  <label className={LABEL_CLS}>Código</label>
                  <input
                    type="text" required maxLength={6}
                    value={editingAccount.code}
                    onChange={e => setEditingAccount({ ...editingAccount, code: e.target.value })}
                    className={FIELD_CLS}
                  />
                </div>

                {/* Nombre */}
                <div>
                  <label className={LABEL_CLS}>Nombre de Cuenta</label>
                  <input
                    type="text" required
                    value={editingAccount.name}
                    onChange={e => setEditingAccount({ ...editingAccount, name: e.target.value })}
                    className={FIELD_CLS}
                  />
                </div>

                {/* Cuenta Padre — dropdown */}
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

                {/* Descripción */}
                <div>
                  <label className={LABEL_CLS}>Descripción</label>
                  <textarea
                    value={editingAccount.description ?? ''}
                    onChange={e => setEditingAccount({ ...editingAccount, description: e.target.value })}
                    className={`${FIELD_CLS} resize-none h-20`}
                  />
                </div>

                {/* Info: tipo e isSystem */}
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
                onClick={() => { setEditingAccount(null); setFormError(''); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                disabled={editMutation.isPending}
              >
                Cancelar
              </button>
              <button
                type="submit" form="editAccountForm"
                disabled={editMutation.isPending}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {editMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
