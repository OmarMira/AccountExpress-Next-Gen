import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { PermissionGate } from '../components/PermissionGate';
import { 
  Plus, 
  Search, 
  Trash2, 
  Settings2, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRightLeft,
  SearchCode,
  Zap,
  Clock,
  X,
  Pencil
} from 'lucide-react';

export function BankRules() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    conditionType: 'contains',
    conditionValue: '',
    transactionDirection: 'any',
    glAccountId: '',
    autoAdd: false,
    priority: 0,
    isActive: true
  });

  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ['bank-rules', activeCompany?.id],
    queryFn: () => fetchApi(`/bank-rules?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany,
  });

  const { data: glAccounts = [] } = useQuery({
    queryKey: ['gl-accounts', activeCompany?.id],
    queryFn: () => fetchApi(`/gl-accounts`),
    enabled: !!activeCompany,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      fetchApi('/bank-rules', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
      setShowForm(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData & { id: string }) =>
      fetchApi(`/bank-rules/${data.id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
      setShowForm(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/bank-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bank-rules'] }),
  });

  const resetForm = () => {
    setFormData({
      name: '',
      conditionType: 'contains',
      conditionValue: '',
      transactionDirection: 'any',
      glAccountId: '',
      autoAdd: false,
      priority: 0,
      isActive: true
    });
    setEditingId(null);
  };

  const filteredRules = rules.filter((r: any) => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.conditionValue.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (error) return (
    <div className="p-8 bg-rose-500/10 border border-rose-500/20 rounded-3xl text-rose-400 flex items-center gap-4">
      <AlertCircle className="w-6 h-6" />
      <div>
        <h3 className="font-black uppercase text-xs tracking-widest">Error de Conexión</h3>
        <p className="text-sm opacity-80">{(error as any).message}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-indigo-500/10 rounded-xl">
              <Settings2 className="w-6 h-6 text-indigo-400" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tighter">Reglas Bancarias</h1>
          </div>
          <p className="text-slate-400 text-sm font-medium ml-12">
            Automatiza la categorización de transacciones mediante reglas determinísticas.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar reglas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
            />
          </div>
          <PermissionGate module="banking" action="create">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black rounded-xl transition-all shadow-lg shadow-indigo-500/20 uppercase tracking-tighter whitespace-nowrap"
            >
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? 'Cancelar' : 'Nueva Reglas'}
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Creation/Edit Form */}
      {showForm && (
        <div className="bg-slate-900 border-2 border-slate-800 rounded-[2.5rem] p-8 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <h2 className="text-xl font-black text-white mb-6 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-indigo-400" />
            {editingId ? 'Editar Regla Cargada' : 'Configurar Nueva Regla'}
          </h2>
          
          <form 
            onSubmit={(e) => { 
                e.preventDefault(); 
                if (editingId) {
                  updateMutation.mutate({ ...formData, id: editingId });
                } else {
                  createMutation.mutate(formData);
                }
            }} 
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                {editingId ? 'Nombre (Modificar)' : 'Nombre de la Regla'}
              </label>
              <input
                required
                type="text"
                placeholder="Ej: Pago de Nómina Zelle"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-sm text-white focus:border-indigo-500/50 outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Condición</label>
              <div className="flex gap-2">
                <select
                  value={formData.conditionType}
                  onChange={(e) => setFormData({ ...formData, conditionType: e.target.value as any })}
                  className="bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-3 py-3 outline-none focus:border-indigo-500/50"
                >
                  <option value="contains">Contiene</option>
                  <option value="starts_with">Empieza con</option>
                  <option value="equals">Es igual a</option>
                </select>
                <input
                  required
                  type="text"
                  placeholder="Valor a buscar..."
                  value={formData.conditionValue}
                  onChange={(e) => setFormData({ ...formData, conditionValue: e.target.value })}
                  className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-sm text-white focus:border-indigo-500/50 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Transacción</label>
              <select
                value={formData.transactionDirection}
                onChange={(e) => setFormData({ ...formData, transactionDirection: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-2xl px-4 py-3 outline-none focus:border-indigo-500/50"
              >
                <option value="any">Cualquier dirección</option>
                <option value="debit">Solo Salidas (Débito)</option>
                <option value="credit">Solo Entradas (Crédito)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Asignar a Cuenta GL</label>
              <select
                required
                value={formData.glAccountId}
                onChange={(e) => setFormData({ ...formData, glAccountId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-2xl px-4 py-3 outline-none focus:border-indigo-500/50"
              >
                <option value="">Seleccionar cuenta...</option>
                {glAccounts.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>{acc.code} · {acc.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-6 pt-6">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={formData.autoAdd}
                    onChange={(e) => setFormData({ ...formData, autoAdd: e.target.checked })}
                  />
                  <div className={`w-10 h-5 rounded-full transition-all ${formData.autoAdd ? 'bg-indigo-600' : 'bg-slate-800'}`}></div>
                  <div className={`absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-all ${formData.autoAdd ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </div>
                <span className="text-xs font-black text-slate-300 uppercase tracking-tighter group-hover:text-white transition-colors">Auto-Conciliar</span>
              </label>

              <div className="flex-1 flex justify-end">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black rounded-2xl transition-all shadow-lg shadow-emerald-500/20 uppercase tracking-widest"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Guardando...' : (editingId ? 'Actualizar Regla' : 'Guardar Regla')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Rules Table */}
      <div className="bg-slate-900 border-2 border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
        {isLoading ? (
          <div className="p-20 flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cargando reglas maestras...</p>
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="p-20 text-center">
            <SearchCode className="w-16 h-16 text-slate-800 mx-auto mb-4" />
            <p className="text-slate-500 font-bold">No se encontraron reglas definidas.</p>
            <p className="text-slate-600 text-xs mt-1">Crea una regla para empezar a automatizar tus conciliaciones.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Prioridad</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre & Condición</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Cuenta Asignada</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Automatización</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredRules.map((rule: any) => (
                  <tr key={rule.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded-lg text-xs font-black text-slate-400">
                          {rule.priority}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-1">
                        <div className="text-sm font-black text-white tracking-tight">{rule.name}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-indigo-400 uppercase bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                            {rule.conditionType === 'contains' ? 'Contiene' : rule.conditionType === 'starts_with' ? 'Empieza' : 'Igual'}
                          </span>
                          <span className="text-[11px] font-bold text-slate-400 font-mono italic">
                            "{rule.conditionValue}"
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
                        {glAccounts.find((a: any) => a.id === rule.glAccountId)?.code} · {glAccounts.find((a: any) => a.id === rule.glAccountId)?.name}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <div className="flex justify-center">
                        {rule.autoAdd ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-[9px] font-black tracking-widest uppercase animate-pulse">
                            <Zap className="w-3 h-3 fill-emerald-400" />
                            Auto-Conciliar
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-500 border border-slate-700 rounded-xl text-[9px] font-black tracking-widest uppercase">
                            <Clock className="w-3 h-3" />
                            Sugerencia
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setFormData({
                              name: rule.name,
                              conditionType: rule.conditionType,
                              conditionValue: rule.conditionValue,
                              transactionDirection: rule.transactionDirection,
                              glAccountId: rule.glAccountId,
                              autoAdd: rule.autoAdd,
                              priority: rule.priority,
                              isActive: rule.isActive
                            });
                            setEditingId(rule.id);
                            setShowForm(true);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="p-1.5 text-gray-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-md transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if(confirm('\xbfEst\xe1s seguro de eliminar esta regla?')) {
                              deleteMutation.mutate(rule.id);
                            }
                          }}
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
        )}
      </div>
    </div>
  );
}
