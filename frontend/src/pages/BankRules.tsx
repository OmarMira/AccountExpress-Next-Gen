import { useState, useMemo } from 'react';
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
  Pencil,
  Printer,
  X,
  Zap,
  Clock,
  Code
} from 'lucide-react';
import { PrintPreviewModal } from '../components/PrintPreviewModal';

export function BankRules() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    conditionType: 'contains' as 'contains' | 'starts_with' | 'equals',
    conditionValue: '',
    transactionDirection: 'any' as 'any' | 'debit' | 'credit',
    glAccountId: '',
    autoAdd: false,
    priority: 10,
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
      fetchApi('/bank-rules', {
        method: 'POST',
        body: JSON.stringify({ ...data, companyId: activeCompany?.id }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) =>
      fetchApi(`/bank-rules/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules', activeCompany?.id] });
      resetForm();
    },
    onError: (err: any) => alert(`Error al actualizar regla: ${err.message}`)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/bank-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-rules', activeCompany?.id] });
    },
    onError: (err: any) => alert(`Error al eliminar regla: ${err.message}`)
  });

  const resetForm = () => {
    setFormData({
      name: '',
      conditionType: 'contains',
      conditionValue: '',
      transactionDirection: 'any',
      glAccountId: '',
      autoAdd: false,
      priority: 10,
      isActive: true
    });
    setShowForm(false);
    setEditingId(null);
  };

  const safeRules = useMemo(() => {
    return (rules || []).map((r: any) => ({
      ...r,
      name: r?.name || 'Sin nombre',
      conditionValue: r?.conditionValue || '',
      glAccountId: r?.glAccountId || '',
    }));
  }, [rules]);

  const filteredRules = useMemo(() => {
    if (!Array.isArray(safeRules)) return [];
    return safeRules.filter((r: any) => {
      const name = r?.name || '';
      const conditionValue = r?.conditionValue || '';
      return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             conditionValue.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [safeRules, searchTerm]);

  if (error) return <div className="p-8 text-rose-500">Error cargando reglas.</div>;
  if (!activeCompany) return <div className="p-8 text-white">Seleccione una empresa primero.</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center bg-slate-900/50 p-8 rounded-3xl border border-slate-800">
        <div>
          <h1 className="text-3xl font-black text-white">Reglas Bancarias</h1>
          <p className="text-slate-400">Automatiza la categorización de transacciones.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPrintModal(true)}
            disabled={isLoading || rules.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all border border-slate-700 tracking-widest"
          >
            <Printer className="w-4 h-4 text-slate-400" />
            Imprimir Reglas
          </button>
          <PermissionGate module="bank-rules" action="create">
            <button 
              onClick={() => setShowForm(!showForm)}
              className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-500 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {showForm ? 'Cancelar' : 'Nueva Regla'}
            </button>
          </PermissionGate>
        </div>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl">
          <form onSubmit={(e) => {
            e.preventDefault();
            if (editingId) updateMutation.mutate({ ...formData, id: editingId });
            else createMutation.mutate(formData);
          }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <input 
              required
              className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-indigo-500"
              placeholder="Nombre"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
            <div className="flex gap-2">
               <select 
                 className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none"
                 value={formData.conditionType}
                 onChange={e => setFormData({...formData, conditionType: e.target.value as any})}
               >
                 <option value="contains">Contiene</option>
                 <option value="starts_with">Empieza</option>
                 <option value="equals">Igual</option>
               </select>
               <input 
                 required
                 className="flex-1 bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none"
                 placeholder="Valor"
                 value={formData.conditionValue}
                 onChange={e => setFormData({...formData, conditionValue: e.target.value})}
               />
            </div>
            <select 
              required
              className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none"
              value={formData.glAccountId}
              onChange={e => setFormData({...formData, glAccountId: e.target.value})}
            >
              <option value="">Seleccionar cuenta...</option>
              {Array.isArray(glAccounts) && glAccounts.map((acc: any) => (
                <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
              ))}
            </select>
            <select 
              required
              className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-indigo-500"
              value={formData.priority}
              onChange={e => setFormData({...formData, priority: parseInt(e.target.value)})}
            >
              <option value="0">0 — Prioridad Crítica (Se evalúa primero)</option>
              <option value="5">5 — Prioridad Alta</option>
              <option value="10">10 — Prioridad Normal</option>
              <option value="15">15 — Prioridad Baja</option>
              <option value="20">20 — Prioridad Muy Baja</option>
            </select>
            <div className="flex items-center gap-4">
               <button type="submit" className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold flex-1 md:flex-none">
                 {editingId ? 'Actualizar' : 'Guardar'}
               </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-slate-500">Cargando...</div>
        ) : (
          <table className="w-full text-left text-white">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="p-4">Prioridad</th>
                <th className="p-4">Nombre</th>
                <th className="p-4">Condición</th>
                <th className="p-4">Cuenta</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRules.map((rule: any) => (
                <tr key={rule.id} className="border-t border-slate-800">
                  <td className="p-4">
                    <span className="w-7 h-7 flex items-center justify-center bg-slate-800 rounded-lg text-[10px] font-black">{rule.priority}</span>
                  </td>
                  <td className="p-4 font-bold">{rule.name}</td>
                  <td className="p-4 text-slate-400">
                    <span className="text-[9px] font-black uppercase bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 mr-2">
                       {rule.conditionType === 'contains' ? 'Contiene' : rule.conditionType === 'starts_with' ? 'Empieza' : 'Igual'}
                    </span>
                    "{rule.conditionValue}"
                  </td>
                  <td className="p-4">
                    {Array.isArray(glAccounts) ? (
                      <div className="flex items-center gap-2">
                         <span className="font-mono text-indigo-400">{glAccounts.find((a: any) => a.id === rule.glAccountId)?.code}</span>
                         <span className="text-slate-300">· {glAccounts.find((a: any) => a.id === rule.glAccountId)?.name || 'Cuenta no encontrada'}</span>
                      </div>
                    ) : '...'}
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => {
                        setEditingId(rule.id);
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
                        setShowForm(true);
                      }}
                      className="text-indigo-400 hover:text-white mr-4"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation();
                        if (window.confirm('¿Eliminar esta regla?')) {
                          deleteMutation.mutate(rule.id);
                        }
                      }}
                      className="text-rose-400 hover:text-white p-2 rounded-lg hover:bg-rose-500/10 transition-colors"
                      title="Eliminar regla"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PrintPreviewModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="Reglas Bancarias de Conciliación"
        config={{
          moduleName: 'bank-rules',
          searchByDescription: true,
          columnSelector: true,
          mandatoryColumns: ['name', 'conditionValue', 'glAccountId']
        }}
        columns={[
          { key: 'priority', label: 'Prior.', align: 'center' },
          { key: 'name', label: 'Nombre de la Regla', align: 'left' },
          { key: 'conditionType', label: 'Tipo', align: 'center', format: (val: string) => val === 'contains' ? 'Contiene' : val === 'starts_with' ? 'Empieza' : 'Igual' },
          { key: 'conditionValue', label: 'Valor Condición', align: 'left' },
          { key: 'transactionDirection', label: 'Dir.', align: 'center', format: (val: string) => val === 'any' ? 'Cualquiera' : val === 'debit' ? 'Salida' : 'Entrada' },
          { key: 'glAccountId', label: 'Cuenta Asignada', align: 'left', format: (val: string) => {
              if (!Array.isArray(glAccounts)) return '—';
              return glAccounts.find((a: any) => a.id === val)?.name || '—';
          }},
          { key: 'autoAdd', label: 'Auto', align: 'center', format: (val: boolean) => val ? 'SÍ' : 'NO' }
        ]}
        data={safeRules}
      />
    </div>
  );
}
