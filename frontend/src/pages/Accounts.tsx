import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { PermissionGate } from '../components/PermissionGate';
import { Plus, Search, Trash2, FolderTree, AlertCircle, X, Pencil } from 'lucide-react';

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

export function Accounts() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    code: '', name: '', accountType: 'asset', normalBalance: 'debit', parentCode: '', description: ''
  });

  const { data: accounts = [], isLoading, error } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      return fetchApi(`/gl-accounts`);
    },
    enabled: !!activeCompany
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) =>
      fetchApi('/gl-accounts', { method: 'POST', body: JSON.stringify({ ...data }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      setShowModal(false);
      setFormData({ code: '', name: '', accountType: 'asset', normalBalance: 'debit', parentCode: '', description: '' });
      setFormError('');
    },
    onError: (err: any) => setFormError(err.message || 'Error al crear la cuenta'),
  });

  const editMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; code: string; description: string }) =>
      fetchApi(`/gl-accounts/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: data.name, code: data.code, description: data.description })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      setEditingAccount(null);
      setFormError('');
    },
    onError: (err: any) => setFormError(err.message || 'Error al editar la cuenta'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) =>
      fetchApi(`/gl-accounts/${accountId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] }),
    onError: (err: any) => alert(`Error al desactivar: ${err.message}`),
  });

  const handleDelete = (id: string, name: string) => {
    if (confirm(`¿Desactivar la cuenta ${name}?`)) deleteMutation.mutate(id);
  };

  const handleEditOpen = (acc: Account) => {
    setEditingAccount(acc);
    setFormError('');
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value;
    setFormData({ ...formData, accountType: type, normalBalance: ['asset', 'expense'].includes(type) ? 'debit' : 'credit' });
  };

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
    const filtered = group.filter(a => a.code.includes(searchTerm) || a.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (filtered.length === 0) return null;
    return (
      <div key={type} className="mb-8">
        <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2">{title}</h3>
        <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-800 text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium w-28">Código</th>
                <th className="px-4 py-3 font-medium">Nombre de Cuenta</th>
                <th className="px-4 py-3 font-medium text-center w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {filtered.map(acc => (
                <tr key={acc.id} className="hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-gray-300 font-mono text-xs">{acc.code}</td>
                  <td className="px-4 py-3 text-white">
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${(acc.level - 1) * 20}px` }}>
                      {acc.level === 1 ? <FolderTree className="w-4 h-4 text-indigo-400" /> : <div className="w-4 border-l-2 border-b-2 border-gray-600 rounded-bl-sm h-4 -mt-2 opacity-50" />}
                      {acc.name}
                      {acc.isSystem === 1 && <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wider">Sistema</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleEditOpen(acc)} className="text-gray-500 hover:text-indigo-400 transition-colors p-1" title="Editar cuenta">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(acc.id, acc.name)} className="text-gray-500 hover:text-rose-400 transition-colors p-1" title="Desactivar cuenta">
                        <Trash2 className="w-4 h-4" />
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

  if (error) return <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500">Error al cargar cuentas: {(error as Error).message}</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Plan de Cuentas</h1>
          <p className="text-sm text-gray-400 mt-1">Gestión jerárquica de cuentas contables</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar cuenta..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-gray-500" />
          </div>
          <PermissionGate module="accounts" action="create">
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap">
              <Plus className="w-4 h-4" /> Nueva cuenta
            </button>
          </PermissionGate>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="animate-pulse bg-gray-800/50 h-32 rounded-lg border border-gray-700/50 w-full" />)}</div>
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

      {/* MODAL CREAR */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="text-lg font-bold text-white">Crear Nueva Cuenta</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              {formError && <div className="mb-6 bg-rose-500/10 border border-rose-500/50 rounded-lg p-3 flex items-start gap-3"><AlertCircle className="w-5 h-5 text-rose-500 shrink-0" /><p className="text-sm text-rose-400">{formError}</p></div>}
              <form id="createAccountForm" className="space-y-5" onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Código</label>
                    <input type="text" required maxLength={6} value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" placeholder="Ej: 1120" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cuenta Padre (Opcional)</label>
                    <input type="text" value={formData.parentCode} onChange={e => setFormData({...formData, parentCode: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" placeholder="Código padre Ej: 1100" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nombre de Cuenta</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" placeholder="Ej: Banco General" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tipo</label>
                    <select value={formData.accountType} onChange={handleTypeChange} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 appearance-none">
                      <option value="asset">Activo</option>
                      <option value="liability">Pasivo</option>
                      <option value="equity">Capital</option>
                      <option value="revenue">Ingreso</option>
                      <option value="expense">Gasto</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Naturaleza</label>
                    <select value={formData.normalBalance} onChange={e => setFormData({...formData, normalBalance: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 appearance-none">
                      <option value="debit">Débito</option>
                      <option value="credit">Crédito</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Descripción (Opcional)</label>
                  <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none h-20" placeholder="Notas adicionales..." />
                </div>
              </form>
            </div>
            <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors" disabled={createMutation.isPending}>Cancelar</button>
              <button type="submit" form="createAccountForm" disabled={createMutation.isPending} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50">
                {createMutation.isPending ? 'Guardando...' : 'Guardar Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="text-lg font-bold text-white">Editar Cuenta</h3>
              <button onClick={() => setEditingAccount(null)} className="text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              {formError && <div className="mb-6 bg-rose-500/10 border border-rose-500/50 rounded-lg p-3 flex items-start gap-3"><AlertCircle className="w-5 h-5 text-rose-500 shrink-0" /><p className="text-sm text-rose-400">{formError}</p></div>}
              <form id="editAccountForm" className="space-y-5" onSubmit={(e) => {
                e.preventDefault();
                editMutation.mutate({ id: editingAccount.id, name: editingAccount.name, code: editingAccount.code, description: editingAccount.description || '' });
              }}>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Código</label>
                  <input type="text" required maxLength={6} value={editingAccount.code} onChange={e => setEditingAccount({...editingAccount, code: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Nombre de Cuenta</label>
                  <input type="text" required value={editingAccount.name} onChange={e => setEditingAccount({...editingAccount, name: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Descripción</label>
                  <textarea value={editingAccount.description || ''} onChange={e => setEditingAccount({...editingAccount, description: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none h-20" />
                </div>
              </form>
            </div>
            <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setEditingAccount(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors" disabled={editMutation.isPending}>Cancelar</button>
              <button type="submit" form="editAccountForm" disabled={editMutation.isPending} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50">
                {editMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
