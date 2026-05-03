import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { PermissionGate } from '../components/PermissionGate';
import { AccountSelector, getNormalBalanceBadge } from '../components/AccountSelector';
import type { GlAccount } from '../components/AccountSelector';
import { 
  Plus, 
  Search, 
  Trash2, 
  Pencil,
  Printer,
  ChevronDown
} from 'lucide-react';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { RuleFormModal, type RuleFormData } from '../components/RuleFormModal';

export function BankRules() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'priority', direction: 'asc' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<RuleFormData>>({});

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
    mutationFn: (data: RuleFormData) =>
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
    setEditFormData({});
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
    
    // 1. Filter
    let result = safeRules.filter((r: any) => {
      const name = r?.name || '';
      const conditionValue = r?.conditionValue || '';
      const account = Array.isArray(glAccounts) ? glAccounts.find((a: any) => a.id === r.glAccountId) : null;
      const accountInfo = account ? `${account.code} ${account.name}` : '';
      
      const search = searchTerm.toLowerCase();
      return name.toLowerCase().includes(search) ||
             conditionValue.toLowerCase().includes(search) ||
             accountInfo.toLowerCase().includes(search);
    });

    // 2. Sort
    if (sortConfig) {
      result.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        // Special handling for Account column sorting
        if (sortConfig.key === 'glAccountId' && Array.isArray(glAccounts)) {
          const accA = glAccounts.find((acc: any) => acc.id === a.glAccountId);
          const accB = glAccounts.find((acc: any) => acc.id === b.glAccountId);
          aVal = accA ? `${accA.code} ${accA.name}` : '';
          bVal = accB ? `${accB.code} ${accB.name}` : '';
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [safeRules, searchTerm, sortConfig, glAccounts]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (!sortConfig || sortConfig.key !== column) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sortConfig.direction === 'asc' 
      ? <ChevronDown className="w-3 h-3 text-[#0071c5] rotate-180 transition-transform" /> 
      : <ChevronDown className="w-3 h-3 text-[#0071c5] transition-transform" />;
  };

  const handleEditRule = (rule: any) => {
    setShowForm(true);
    setEditingId(rule.id);
    setEditFormData({
      name: rule.name,
      conditionType: rule.conditionType,
      conditionValue: rule.conditionValue,
      transactionDirection: rule.transactionDirection,
      glAccountId: rule.glAccountId,
      autoAdd: rule.autoAdd ?? false,
      priority: rule.priority ?? 10,
      isActive: rule.isActive ?? true,
    });
  };

  if (error) return <div className="p-8 text-rose-500">Error cargando reglas.</div>;
  if (!activeCompany) return <div className="p-8 text-white">Seleccione una empresa primero.</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center bg-[#0f2240] p-8 rounded-3xl border border-white/7">
        <div>
          <h1 className="text-3xl font-black text-white">Reglas Bancarias</h1>
          <p className="text-slate-400">Automatiza la categorización de transacciones.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-[#0071c5] transition-colors" />
            <input
              type="text"
              placeholder="Buscar regla, condición o cuenta..."
              className="bg-[#0a1628] border border-white/10 pl-11 pr-4 py-3 rounded-xl text-sm text-white w-72 outline-none focus:border-[#0071c5] transition-all shadow-inner"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPrintModal(true)}
            disabled={isLoading || rules.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-[#0a1628] hover:bg-white/5 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all border border-white/10 tracking-widest"
          >
            <Printer className="w-4 h-4 text-slate-400" />
            Imprimir Reglas
          </button>
          <PermissionGate module="bank-rules" action="create">
            <button 
              onClick={() => setShowForm(!showForm)}
              className="bg-[#0071c5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#005fa3] transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {showForm ? 'Cancelar' : 'Nueva Regla'}
            </button>
          </PermissionGate>
        </div>
      </div>
    </div>

      <RuleFormModal
        isOpen={showForm}
        onClose={resetForm}
        onSave={(data) => {
          if (editingId) updateMutation.mutate({ ...data, id: editingId });
          else createMutation.mutate(data);
        }}
        initialData={editFormData}
        glAccounts={Array.isArray(glAccounts) ? glAccounts : []}
        title={editingId ? 'Editar Regla Bancaria' : 'Nueva Regla Bancaria'}
        submitLabel={editingId ? 'Actualizar regla' : 'Guardar regla'}
      />

      <div className="bg-[#0f2240] border border-white/7 rounded-3xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-slate-500">Cargando...</div>
        ) : (
          <table className="w-full text-left text-white">
            <thead className="bg-[#0a1628]">
              <tr>
                <th 
                  className="p-4 cursor-pointer hover:bg-white/5 transition-colors group"
                  onClick={() => handleSort('priority')}
                >
                  <div className="flex items-center gap-2">
                    Prioridad <SortIcon column="priority" />
                  </div>
                </th>
                <th 
                  className="p-4 cursor-pointer hover:bg-white/5 transition-colors group"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    Nombre <SortIcon column="name" />
                  </div>
                </th>
                <th 
                  className="p-4 cursor-pointer hover:bg-white/5 transition-colors group"
                  onClick={() => handleSort('conditionValue')}
                >
                  <div className="flex items-center gap-2">
                    Condición <SortIcon column="conditionValue" />
                  </div>
                </th>
                <th 
                  className="p-4 cursor-pointer hover:bg-white/5 transition-colors group"
                  onClick={() => handleSort('glAccountId')}
                >
                  <div className="flex items-center gap-2">
                    Cuenta <SortIcon column="glAccountId" />
                  </div>
                </th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRules.map((rule: any) => (
                <tr 
                  key={rule.id} 
                  className="border-t border-white/5 hover:bg-white/5 transition-colors cursor-pointer select-none group/row"
                  onDoubleClick={() => handleEditRule(rule)}
                >
                  <td className="p-4">
                    <span className="w-7 h-7 flex items-center justify-center bg-[#0a1628] border border-white/5 rounded-lg text-[10px] font-black">{rule.priority}</span>
                  </td>
                  <td className="p-4 font-bold">{rule.name}</td>
                  <td className="p-4 text-slate-400">
                    <span className="text-[9px] font-black uppercase bg-[#0071c5]/10 px-1.5 py-0.5 rounded border border-[#0071c5]/30 mr-2">
                       {rule.conditionType === 'contains' ? 'Contiene' : rule.conditionType === 'starts_with' ? 'Empieza' : 'Igual'}
                    </span>
                    "{rule.conditionValue}"
                  </td>
                  <td className="p-4">
                    {Array.isArray(glAccounts) ? (
                      <div className="flex items-center gap-2">
                         <span className="font-mono text-[#0071c5]">{(glAccounts.find((a: any) => a.id === rule.glAccountId) as GlAccount)?.code}</span>
                         <span className="text-slate-300">· {(glAccounts.find((a: any) => a.id === rule.glAccountId) as GlAccount)?.name || 'Cuenta no encontrada'}</span>
                         {(glAccounts.find((a: any) => a.id === rule.glAccountId) as GlAccount)?.normalBalance && (
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${getNormalBalanceBadge((glAccounts.find((a: any) => a.id === rule.glAccountId) as GlAccount).normalBalance).className}`}>
                              {getNormalBalanceBadge((glAccounts.find((a: any) => a.id === rule.glAccountId) as GlAccount).normalBalance).label}
                            </span>
                         )}
                      </div>
                    ) : '...'}
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => handleEditRule(rule)}
                      className="text-[#0071c5] hover:text-[#005fa3] mr-4"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la regla "${rule.name}"?`)) {
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
