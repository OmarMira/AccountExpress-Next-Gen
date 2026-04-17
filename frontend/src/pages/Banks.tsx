import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { Landmark, Plus, Trash2, X, Pencil } from 'lucide-react';

const emptyForm = {
  accountName: '', bankName: '', accountNumber: '',
  accountType: 'checking', routingNumber: '', balance: 0,
  currency: 'USD', notes: ''
};

export function Banks() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingBank, setEditingBank] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: banks = [], isLoading } = useQuery({
    queryKey: ['bank-accounts', activeCompany?.id],
    queryFn: () => fetchApi(`/bank-accounts?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => fetchApi('/bank-accounts', {
      method: 'POST',
      body: JSON.stringify({ ...data, companyId: activeCompany?.id })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      setShowModal(false);
      setForm({ ...emptyForm });
    }
  });

  const editMutation = useMutation({
    mutationFn: (data: typeof form & { id: string }) =>
      fetchApi(`/bank-accounts/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...data, companyId: activeCompany?.id })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      setEditingBank(null);
      setForm({ ...emptyForm });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/bank-accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bank-accounts'] })
  });

  const openEdit = (b: any) => {
    setEditingBank(b);
    setForm({
      accountName: b.accountName ?? '',
      bankName: b.bankName ?? '',
      accountNumber: b.accountNumber ?? '',
      accountType: b.accountType ?? 'checking',
      routingNumber: b.routingNumber ?? '',
      balance: b.balance ?? 0,
      currency: b.currency ?? 'USD',
      notes: b.notes ?? ''
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBank(null);
    setForm({ ...emptyForm });
  };

  const handleSubmit = () => {
    if (editingBank) {
      editMutation.mutate({ ...form, id: editingBank.id });
    } else {
      createMutation.mutate(form);
    }
  };

  const isPending = createMutation.isPending || editMutation.isPending;
  const isModalOpen = showModal || !!editingBank;

  const FormFields = () => (
    <div className="p-6 overflow-y-auto flex-1 space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {[
          { label: 'Alias de la cuenta', key: 'accountName', placeholder: 'Ej: Cuenta Corriente Principal' },
          { label: 'Banco emisor', key: 'bankName', placeholder: 'Ej: Bank of America' },
          { label: 'Número de cuenta', key: 'accountNumber', placeholder: 'Últimos 4 dígitos o completo' },
          { label: 'Número de ruta (ABA)', key: 'routingNumber', placeholder: 'Opcional' },
        ].map(({ label, key, placeholder }) => (
          <div key={key} className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
            <input
              type="text"
              placeholder={placeholder}
              value={(form as any)[key]}
              onChange={e => setForm({ ...form, [key]: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        ))}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tipo de cuenta</label>
          <select
            value={form.accountType}
            onChange={e => setForm({ ...form, accountType: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="checking">Corriente (Checking)</option>
            <option value="savings">Ahorros (Savings)</option>
            <option value="credit">Crédito</option>
            <option value="other">Otra</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Moneda</label>
          <select
            value={form.currency}
            onChange={e => setForm({ ...form, currency: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="USD">USD — Dólar</option>
            <option value="EUR">EUR — Euro</option>
            <option value="MXN">MXN — Peso mexicano</option>
          </select>
        </div>
        <div className="space-y-2 col-span-2">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Saldo inicial</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
              {form.currency === 'EUR' ? '€' : '$'}
            </span>
            <input
              type="number"
              step="0.01"
              value={form.balance}
              onChange={e => setForm({ ...form, balance: parseFloat(e.target.value) || 0 })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Cuentas Bancarias</h1>
          <p className="text-sm text-gray-400 mt-1">Gestión de cuentas bancarias registradas</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="w-full sm:w-auto flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Nueva Cuenta Bancaria
        </button>
      </div>

      {isLoading ? (
        <div className="animate-pulse bg-gray-800/50 h-32 rounded-lg border border-gray-700/50" />
      ) : banks.length === 0 ? (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-16 text-center shadow-xl">
          <Landmark className="w-12 h-12 text-gray-500 opacity-20 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">No hay cuentas bancarias registradas.</p>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-xl overflow-hidden border border-gray-700/50 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-800/80 text-gray-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Alias</th>
                  <th className="px-6 py-4 font-medium">Banco</th>
                  <th className="px-6 py-4 font-medium">Número</th>
                  <th className="px-6 py-4 font-medium">Tipo</th>
                  <th className="px-6 py-4 font-medium text-right">Saldo inicial</th>
                  <th className="px-6 py-4 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {banks.map((b: any) => (
                  <tr 
                    key={b.id} 
                    onDoubleClick={() => openEdit(b)}
                    className="hover:bg-gray-700/30 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-medium text-gray-200">{b.accountName}</td>
                    <td className="px-6 py-4 text-gray-300">{b.bankName}</td>
                    <td className="px-6 py-4 text-gray-400 font-mono">{b.accountNumber}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 text-xs rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {b.accountType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-gray-300">
                      ${Number(b.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(b)}
                          className="p-1.5 text-gray-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-md transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { if (confirm('¿Desactivar esta cuenta?')) deleteMutation.mutate(b.id); }}
                          className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-md transition-colors"
                          title="Eliminar"
                        >
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
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Landmark className="w-5 h-5 text-indigo-400" />
                {editingBank ? 'Editar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <FormFields />
            <div className="p-6 border-t border-gray-800 bg-gray-900/80 flex justify-end gap-3 shrink-0 rounded-b-2xl">
              <button
                onClick={closeModal}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? 'Guardando...' : editingBank ? 'Guardar Cambios' : 'Guardar Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
