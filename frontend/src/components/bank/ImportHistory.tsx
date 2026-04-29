import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchApi } from '../../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { Database, Clock, ChevronDown, Printer, FileSpreadsheet, FileText, Search, X, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AutoMatchButton } from './AutoMatchButton';
import { PrintPreviewModal } from '../PrintPreviewModal';
import ExcelJS from 'exceljs';

export const ImportHistory: React.FC = () => {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();
  const companyId = activeCompany?.id;

  // 1. All Hooks at the Top (Order matters: no early returns before any hook)
  const { data: transactions, isLoading, error } = useQuery({
    queryKey: ['bank-transactions-history', companyId],
    queryFn: () => fetchApi(`/bank/transactions?companyId=${companyId}`),
    enabled: !!companyId
  });

  const { data: openPeriodsData } = useQuery({
    queryKey: ['open-periods', companyId],
    queryFn: () => fetchApi(`/fiscal-periods?companyId=${companyId}&status=open`),
    enabled: !!companyId,
  });

  const { data: glAccountsData } = useQuery({
    queryKey: ['gl-accounts', activeCompany?.id],
    queryFn: () => fetchApi(`/gl-accounts`),
    enabled: !!activeCompany?.id
  });

  const { data: rulesData } = useQuery({
    queryKey: ['bank-rules', companyId],
    queryFn: () => fetchApi(`/bank-rules?companyId=${companyId}`),
    enabled: !!companyId
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) =>
      fetchApi(`/bank/transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...data, companyId: activeCompany?.id }),
        headers: { 'Content-Type': 'application/json' }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-history', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions', activeCompany?.id] });
    },
    onError: (err: any) => alert(`Error al actualizar transacción: ${err.message}`)
  });

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState<'csv' | 'xlsx' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [restSearchTerm, setRestSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'transactionDate', direction: 'desc' });
  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [validationErrors, setValidationErrors] = useState<any[] | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isFixingAll, setIsFixingAll] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [splits, setSplits] = useState<{ glAccountId: string; amount: number }[]>([]);

  useEffect(() => {
    if (validationMessage) {
      const timer = setTimeout(() => setValidationMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [validationMessage]);

  useEffect(() => {
    if (editingTransaction) {
      updateMutation.reset();
      // Initialize splits: if transaction has splits (future) use them, otherwise create one split with full amount
      if (editingTransaction.splits && editingTransaction.splits.length > 0) {
        setSplits(editingTransaction.splits.map((s: any) => ({
          glAccountId: s.glAccountId,
          amount: Math.abs(Number(s.amount))
        })));
      } else {
        setSplits([{ 
          glAccountId: editingTransaction.glAccountId || '', 
          amount: Math.abs(Number(editingTransaction.amount)) 
        }]);
      }
    }
  }, [editingTransaction?.id]);

  const glAccounts = useMemo(() => {
    if (!Array.isArray(glAccountsData)) return [];
    return glAccountsData.filter((a: any) => a.description !== 'Header');
  }, [glAccountsData]);

  const rawTxs = useMemo(() => transactions?.data || [], [transactions]);

  const filterBySearch = (list: any[], search: string) => {
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter((t: any) => {
      const desc = (t.description || '').toLowerCase();
      const amount = String(t.amount);
      const acc = glAccounts.find((a: any) => a.id === t.glAccountId);
      const accInfo = acc ? `${acc.code} ${acc.name}`.toLowerCase() : '';
      return desc.includes(s) || amount.includes(s) || accInfo.includes(s);
    });
  };

  const txs = useMemo(() => {
    let result = [...rawTxs];

    if (sortConfig) {
      result.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === 'glAccountId') {
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
  }, [rawTxs, sortConfig, glAccounts]);

  const pending = useMemo(() => {
    const list = txs.filter((t: any) => t.status === 'pending' || !t.glAccountId);
    return filterBySearch(list, searchTerm);
  }, [txs, searchTerm, glAccounts]);

  const rest = useMemo(() => {
    const list = txs.filter((t: any) => t.status !== 'pending' && t.glAccountId);
    return filterBySearch(list, restSearchTerm);
  }, [txs, restSearchTerm, glAccounts]);

  const activePeriodId: string | null = useMemo(() => {
    return Array.isArray(openPeriodsData) ? (openPeriodsData[0]?.id ?? null) : null;
  }, [openPeriodsData]);

  // 3. Helper Functions
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
      ? <ChevronDown className="w-3 h-3 text-indigo-400 rotate-180 transition-transform" /> 
      : <ChevronDown className="w-3 h-3 text-indigo-400 transition-transform" />;
  };

  const formatDate = (raw: string) => {
    if (!raw) return '—';
    const s = raw.substring(0, 10);
    const [y, m, d] = s.split('-');
    if (!y || !m || !d) return s;
    return `${d}/${m}/${y}`;
  };

  const getStatusLabel = (t: any) => {
    // Si no tiene cuenta, siempre es pendiente de asignar
    if (!t.glAccountId) return 'Pendiente';
    
    if (t.status === 'reconciled') return 'Conciliado';
    if (t.appliedRuleId) return 'Regla Aplicada';
    if (t.status === 'assigned') return 'Asignado';
    if (t.status === 'ignored') return 'Ignorado';
    return 'Pendiente';
  };

  const getAccountLabel = (glAccountId: string) => {
    const acc = glAccounts.find((a: any) => a.id === glAccountId);
    return acc ? `${acc.code} · ${acc.name}` : '—';
  };

  // 4. Export Logic
  const handleValidate = async () => {
    setIsValidating(true);
    setValidationErrors(null);
    setValidationMessage(null);

    // Allow UI to render loading state
    await new Promise(resolve => setTimeout(resolve, 500));

    const rules = Array.isArray(rulesData) ? rulesData : [];
    const mismatches: any[] = [];

    rest.forEach((tx: any) => {
      const desc = (tx.description || '').toUpperCase();
      
      const matchingRule = [...rules]
        .sort((a: any, b: any) => (a.priority || 0) - (b.priority || 0))
        .find((rule: any) => {
          if (!rule.isActive) return false;
          const val = (rule.conditionValue || '').toUpperCase();
          const dirMatch = rule.transactionDirection === 'any' || 
                          (rule.transactionDirection === 'debit' && tx.transactionType === 'debit') ||
                          (rule.transactionDirection === 'credit' && tx.transactionType === 'credit');
          if (!dirMatch) return false;
          
          if (rule.conditionType === 'contains') return desc.includes(val);
          if (rule.conditionType === 'starts_with') return desc.startsWith(val);
          if (rule.conditionType === 'equals') return desc === val;
          return false;
        });

      if (matchingRule && tx.glAccountId !== matchingRule.glAccountId) {
        mismatches.push({
          tx,
          currentGl: glAccounts.find((a: any) => a.id === tx.glAccountId),
          suggestedGl: glAccounts.find((a: any) => a.id === matchingRule.glAccountId),
          rule: matchingRule
        });
      }
    });

    setIsValidating(false);
    if (mismatches.length === 0) {
      setValidationMessage('¡Todo en orden! Todas las asignaciones coinciden con las reglas actuales.');
    } else {
      setValidationErrors(mismatches);
    }
  };

  const handleApplySuggestion = async (tx: any, suggestedGlId: string) => {
    try {
      await updateMutation.mutateAsync({
        id: tx.id,
        data: { glAccountId: suggestedGlId }
      });
      setValidationErrors(prev => prev ? prev.filter(err => err.tx.id !== tx.id) : null);
    } catch (e) {}
  };

  const handleFixAll = async () => {
    if (!validationErrors || validationErrors.length === 0) return;
    
    setIsFixingAll(true);
    const items = [...validationErrors];
    for (const item of items) {
      try {
        await updateMutation.mutateAsync({
          id: item.tx.id,
          data: { glAccountId: item.rule.glAccountId }
        });
      } catch (e) {
        console.error(e);
      }
    }
    setValidationErrors(null);
    setIsFixingAll(false);
  };

  const handleExportCSV = (filter: 'all' | 'pending' | 'reconciled') => {
    const rows = filter === 'pending' ? pending : filter === 'reconciled' ? rest : txs;
    const headers = ['Fecha', 'Descripción', 'Monto', 'Estado', 'Cuenta Contable'];
    const lines = [
      headers.join(','),
      ...rows.map((t: any) =>
        [
          formatDate(t.transactionDate),
          `"${(t.description ?? '').replace(/"/g, '""')}"`,
          Number(t.amount).toFixed(2),
          getStatusLabel(t),
          `"${getAccountLabel(t.glAccountId)}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transacciones_${filter}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(null);
  };

  const handleExportXLSX = async (filter: 'all' | 'pending' | 'reconciled') => {
    const rows = filter === 'pending' ? pending : filter === 'reconciled' ? rest : txs;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AccountExpress';
    const ws = wb.addWorksheet('Transacciones');

    ws.columns = [
      { header: 'Fecha',           key: 'fecha',    width: 14 },
      { header: 'Descripción',     key: 'desc',     width: 58 },
      { header: 'Monto',           key: 'monto',    width: 16 },
      { header: 'Estado',          key: 'estado',   width: 20 },
      { header: 'Cuenta Contable', key: 'cuenta',   width: 38 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });

    rows.forEach((t: any) => {
      ws.addRow({
        fecha: formatDate(t.transactionDate),
        desc: t.description ?? '',
        monto: Number(t.amount),
        estado: getStatusLabel(t),
        cuenta: getAccountLabel(t.glAccountId),
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transacciones_${filter}.xlsx`;
    a.click();
    setShowExportModal(null);
  };

  // 5. Early Returns (ONLY after all hooks)
  if (isLoading) {
    return (
      <div className="p-12 bg-slate-900 border-2 border-slate-800 rounded-[3.5rem] flex items-center justify-center animate-pulse">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border-2 border-slate-800 rounded-[3.5rem] p-12 text-center">
        <p className="text-rose-400 font-black uppercase text-sm">Error al cargar el historial</p>
      </div>
    );
  }

  // 6. Sub-renders
  const renderTable = (rows: any[], showAssign: boolean) => (
    <div className="bg-slate-950 border-2 border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl mb-6">
      <div className="max-h-[500px] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-900/80 sticky top-0 z-20">
            <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-800">
              <th className="px-6 py-4 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleSort('transactionDate')}>
                <div className="flex items-center gap-2">Fecha <SortIcon column="transactionDate" /></div>
              </th>
              <th className="px-6 py-4 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleSort('description')}>
                <div className="flex items-center gap-2">Descripción <SortIcon column="description" /></div>
              </th>
              <th className="px-6 py-4 text-right cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleSort('amount')}>
                <div className="flex items-center justify-end gap-2">Monto <SortIcon column="amount" /></div>
              </th>
              <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleSort('status')}>
                <div className="flex items-center justify-center gap-2">Estado <SortIcon column="status" /></div>
              </th>
              <th className="px-6 py-4 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleSort('glAccountId')}>
                <div className="flex items-center gap-2">Cuenta Contable <SortIcon column="glAccountId" /></div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {rows.map((t: any) => (
              <tr 
                key={t.id} 
                className="hover:bg-white/[0.04] transition-colors cursor-pointer select-none group/row"
                onDoubleClick={() => setEditingTransaction(t)}
              >
                <td className="px-6 py-4 text-[10px] font-black text-slate-400 font-mono">
                  {formatDate(t.transactionDate)}
                </td>
                <td className="px-6 py-4 text-[11px] font-black text-white uppercase tracking-tighter">
                  {t.description?.length > 50 ? t.description.substring(0, 50) + '...' : t.description}
                </td>
                <td className={`px-6 py-4 text-right font-mono font-black text-sm ${Number(t.amount) < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {Number(t.amount) < 0 ? '-' : '+'}${Math.abs(Number(t.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`inline-flex px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                    !t.glAccountId || t.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : t.status === 'reconciled' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : t.appliedRuleId ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                    : t.status === 'assigned' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : t.status === 'ignored' ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  }`}>
                    {getStatusLabel(t)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {showAssign ? (
                    <div className="relative">
                      <select
                        defaultValue={t.glAccountId || ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateMutation.mutate({ id: t.id, data: { glAccountId: e.target.value } });
                          }
                        }}
                        disabled={updateMutation.isPending}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none focus:border-indigo-500 cursor-pointer [&>option]:bg-slate-950"
                      >
                        <option value="">— Sin asignar —</option>
                        {glAccounts.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                      {getAccountLabel(t.glAccountId)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-900 border-2 border-slate-800 rounded-[3.5rem] shadow-3xl overflow-hidden relative min-h-[600px]">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] pointer-events-none"></div>

      <div className="p-8 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between gap-8 relative z-10">
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="w-14 h-14 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 flex items-center justify-center">
            <Database className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Registro Histórico</h3>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">
              {txs.length} transacciones · {pending.length} pendientes
            </p>
          </div>
        </div>
        
        <div className="flex-1"></div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowExportModal('csv')}
            className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-2xl text-sm font-bold transition-all border border-slate-700"
          >
            <FileText className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={() => setShowExportModal('xlsx')}
            className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-2xl text-sm font-bold transition-all border border-slate-700"
          >
            <FileSpreadsheet className="w-4 h-4" /> XLS
          </button>
          <button
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-2xl text-sm font-bold transition-all border border-gray-700"
          >
            <Printer className="w-5 h-5 text-gray-400" /> Imprimir
          </button>
        </div>
      </div>

      <div className="p-10 relative z-10">
        {txs.length === 0 ? (
          <div className="text-center py-20">
            <Clock className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest">No hay historial de importación</p>
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2 flex-shrink-0">
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                    Pendientes de asignación ({pending.length})
                  </h4>

                  <div className="flex-1 flex justify-center px-4">
                    <AutoMatchButton
                      companyId={activeCompany?.id || null}
                      bankAccountId={txs[0]?.bankAccount || txs[0]?.bank_account || null}
                      periodId={activePeriodId}
                    />
                  </div>
                  <div className="relative group max-w-md w-full ml-8">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-amber-400 transition-colors" />
                    <input
                      type="text"
                      placeholder="Filtrar pendientes..."
                      className="w-full bg-slate-950 border border-slate-800 pl-10 pr-4 py-2 rounded-xl text-[11px] text-white outline-none focus:border-amber-500/50 transition-all shadow-inner font-bold uppercase tracking-tight"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                {renderTable(pending, true)}
              </div>
            )}
            {rest.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2 flex-shrink-0">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)]"></span>
                    Historial conciliado ({rest.length})
                  </h4>

                  <div className="flex-1 flex justify-center px-4">
                    <button
                      onClick={handleValidate}
                      disabled={isValidating}
                      className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 active:scale-95"
                    >
                      {isValidating ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      Validar Asignaciones
                    </button>
                  </div>
                  <div className="relative group max-w-md w-full ml-8">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                    <input
                      type="text"
                      placeholder="Filtrar historial..."
                      className="w-full bg-slate-950 border border-slate-800 pl-10 pr-4 py-2 rounded-xl text-[11px] text-white outline-none focus:border-indigo-500/50 transition-all shadow-inner font-bold uppercase tracking-tight"
                      value={restSearchTerm}
                      onChange={(e) => setRestSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                {renderTable(rest, false)}
              </div>
            )}
          </>
        )}
      </div>

      <PrintPreviewModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="Libro de Transacciones Bancarias"
        config={{
          moduleName: 'bank_transactions',
          dateRange: true,
          searchByDescription: true,
          columnSelector: true,
          mandatoryColumns: ['transactionDate', 'description', 'amount']
        }}
        columns={[
          { key: 'transactionDate', label: 'Fecha', align: 'left', format: (val) => formatDate(val) },
          { key: 'description', label: 'Descripción', align: 'left' },
          { key: 'amount', label: 'Monto', align: 'right', format: (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: activeCompany?.currency || 'USD' }).format(val) },
          { key: 'status', label: 'Estado', align: 'center', format: (val, row) => getStatusLabel(row) },
          { key: 'glAccountId', label: 'Cuenta Contable', align: 'left', format: (val) => getAccountLabel(val) }
        ]}
        data={txs}
      />

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                {showExportModal === 'csv' ? <FileText className="w-5 h-5 text-emerald-400" /> : <FileSpreadsheet className="w-5 h-5 text-emerald-400" />}
                <h2 className="text-lg font-bold text-white">Exportar {showExportModal === 'csv' ? 'CSV' : 'Excel'}</h2>
              </div>
              <button onClick={() => setShowExportModal(null)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">✕</button>
            </div>
            <div className="px-8 py-6 flex flex-col gap-3">
              {[
                { filter: 'all' as const, label: 'Todas las transacciones', count: txs.length, color: 'indigo' },
                { filter: 'pending' as const, label: 'Solo pendientes', count: pending.length, color: 'amber' },
                { filter: 'reconciled' as const, label: 'Solo conciliadas / asignadas', count: rest.length, color: 'emerald' },
              ].map(({ filter, label, count, color }) => (
                <button
                  key={filter}
                  onClick={() => showExportModal === 'csv' ? handleExportCSV(filter) : handleExportXLSX(filter)}
                  className={`flex items-center justify-between w-full px-5 py-4 rounded-2xl border bg-slate-950/60 transition-all ${color === 'indigo' ? 'border-indigo-500/30 hover:bg-indigo-500/10' : color === 'amber' ? 'border-amber-500/30 hover:bg-amber-500/10' : 'border-emerald-500/30 hover:bg-emerald-500/10'}`}
                >
                  <span className="text-sm font-semibold text-white">{label}</span>
                  <span className={`text-xs font-black px-3 py-1 rounded-lg ${color === 'indigo' ? 'bg-indigo-500/15 text-indigo-400' : color === 'amber' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{count} registros</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {editingTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700/60 rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Detalle de Transacción</h2>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">ID: {editingTransaction.id.substring(0, 8)}...</p>
              </div>
              <button onClick={() => setEditingTransaction(null)} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Fecha</p>
                  <input
                    type="date"
                    value={editingTransaction.transactionDate?.substring(0, 10)}
                    onChange={(e) => {
                      setEditingTransaction((prev: any) => ({ ...prev, transactionDate: e.target.value }));
                      updateMutation.reset();
                    }}
                    className="w-full bg-transparent text-sm font-bold text-white outline-none focus:text-indigo-400 transition-colors"
                  />
                </div>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-right">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Monto</p>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-sm font-black text-slate-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editingTransaction.amount ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                        setEditingTransaction((prev: any) => ({ ...prev, amount: val }));
                        updateMutation.reset();
                      }}
                      className={`w-full bg-transparent text-right text-sm font-black outline-none focus:text-indigo-400 transition-colors ${Number(editingTransaction.amount) < 0 ? 'text-rose-400' : 'text-emerald-400'}`}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Descripción</p>
                <textarea
                  value={editingTransaction.description}
                  onChange={(e) => {
                    setEditingTransaction((prev: any) => ({ ...prev, description: e.target.value }));
                    updateMutation.reset();
                  }}
                  rows={2}
                  className="w-full bg-transparent text-xs font-bold text-slate-200 leading-relaxed uppercase outline-none focus:text-indigo-400 transition-colors resize-none"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Distribución de Cuentas (Splits)</label>
                  <button
                    onClick={() => setSplits([...splits, { glAccountId: '', amount: 0 }])}
                    className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20 transition-all"
                  >
                    + Añadir Línea
                  </button>
                </div>
                
                <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {splits.map((split, idx) => (
                    <div key={idx} className="flex gap-3 items-start animate-in slide-in-from-right-4 duration-200">
                      <div className="flex-1 relative">
                        <select
                          value={split.glAccountId}
                          onChange={(e) => {
                            const newSplits = [...splits];
                            newSplits[idx].glAccountId = e.target.value;
                            setSplits(newSplits);
                            updateMutation.reset();
                          }}
                          className="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-3 py-2.5 appearance-none focus:border-indigo-500 transition-colors cursor-pointer"
                        >
                          <option value="">— Seleccionar cuenta —</option>
                          {glAccounts.map((a: any) => (
                            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-3 h-3 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                      <div className="w-32 relative">
                        <input
                          type="number"
                          step="0.01"
                          value={split.amount || ''}
                          onChange={(e) => {
                            const newSplits = [...splits];
                            newSplits[idx].amount = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            setSplits(newSplits);
                            updateMutation.reset();
                          }}
                          className="w-full bg-slate-950 border border-slate-800 text-white text-xs font-black rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 transition-colors"
                          placeholder="Monto"
                        />
                      </div>
                      {splits.length > 1 && (
                        <button
                          onClick={() => {
                            const newSplits = splits.filter((_, i) => i !== idx);
                            setSplits(newSplits);
                            updateMutation.reset();
                          }}
                          className="p-2.5 hover:bg-rose-500/10 text-rose-500 rounded-xl transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Validation Summary */}
                <div className="pt-2 border-t border-slate-800/50">
                  <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-tight">
                    <span className="text-slate-500">Total Distribuido:</span>
                    <span className={Math.abs(splits.reduce((acc, s) => acc + s.amount, 0) - Math.abs(Number(editingTransaction.amount))) < 0.001 ? 'text-emerald-400' : 'text-rose-400'}>
                      ${splits.reduce((acc, s) => acc + s.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} / ${Math.abs(Number(editingTransaction.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {Math.abs(splits.reduce((acc, s) => acc + s.amount, 0) - Math.abs(Number(editingTransaction.amount))) >= 0.01 && (
                    <p className="text-[9px] text-rose-500/80 mt-1 italic font-bold">
                      * El total distribuido debe coincidir con el monto de la transacción.
                    </p>
                  )}
                </div>

                {editingTransaction.status === 'reconciled' && (
                  <p className="text-[10px] font-bold text-amber-500/80 bg-amber-500/5 p-3 rounded-xl border border-amber-500/10 mt-3">
                    Nota: Esta transacción ya está conciliada. Al guardar se actualizará el registro histórico.
                  </p>
                )}
              </div>
            </div>

            <div className="p-8 pt-0 flex items-center justify-end gap-3">
              <button 
                onClick={() => setEditingTransaction(null)}
                className="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                {updateMutation.isSuccess ? 'Cerrar' : 'Cancelar'}
              </button>
              
              <button 
                onClick={() => {
                  const amount = typeof editingTransaction.amount === 'string' ? parseFloat(editingTransaction.amount) : editingTransaction.amount;
                  const totalSplits = splits.reduce((acc, s) => acc + s.amount, 0);
                  
                  if (isNaN(amount)) {
                    alert('Por favor ingrese un monto válido');
                    return;
                  }
                  
                  if (Math.abs(totalSplits - Math.abs(amount)) >= 0.01) {
                    alert('El total de los splits debe coincidir con el monto de la transacción.');
                    return;
                  }

                  if (splits.some(s => !s.glAccountId)) {
                    alert('Todas las líneas de distribución deben tener una cuenta contable.');
                    return;
                  }

                  updateMutation.mutate({
                    id: editingTransaction.id,
                    data: {
                      glAccountId: splits.length === 1 ? splits[0].glAccountId : undefined, // Keep backward compatibility
                      splits: splits, // New logic for backend
                      transactionDate: editingTransaction.transactionDate?.substring(0, 10),
                      description: editingTransaction.description,
                      amount: amount
                    }
                  });
                }}
                disabled={
                  updateMutation.isPending || 
                  Math.abs(splits.reduce((acc, s) => acc + s.amount, 0) - Math.abs(Number(editingTransaction.amount))) >= 0.01 ||
                  splits.some(s => !s.glAccountId)
                }
                className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg 
                  ${updateMutation.isSuccess 
                    ? 'bg-emerald-600 text-white shadow-emerald-600/20' 
                    : (updateMutation.isPending || Math.abs(splits.reduce((acc, s) => acc + s.amount, 0) - Math.abs(Number(editingTransaction.amount))) >= 0.01 || splits.some(s => !s.glAccountId))
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                  } ${updateMutation.isPending ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {updateMutation.isPending ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Guardando...
                  </>
                ) : updateMutation.isSuccess ? (
                  '¡Guardado!'
                ) : (
                  'Guardar Cambios'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {validationErrors && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-700/60 rounded-[3rem] shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-10 py-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                  <ShieldCheck className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Discrepancias en Asignaciones</h2>
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">
                    Se encontraron {validationErrors.length} transacciones con reglas que encajan mejor
                  </p>
                </div>
              </div>
              <button onClick={() => setValidationErrors(null)} className="p-3 hover:bg-slate-800 rounded-2xl transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-4">
              {validationErrors.map((item, idx) => (
                <div key={idx} className="group bg-slate-950 border border-slate-800 rounded-3xl p-6 hover:border-indigo-500/30 transition-all">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{formatDate(item.tx.transactionDate)}</span>
                        <span className="text-sm font-black text-white">${Number(item.tx.amount).toFixed(2)}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-300 uppercase leading-relaxed">{item.tx.description}</p>
                      
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <AlertCircle className="w-3 h-3 text-amber-500" /> Asignación Actual
                          </p>
                          <p className="text-[11px] font-bold text-slate-400">{item.currentGl ? `${item.currentGl.code} · ${item.currentGl.name}` : 'Sin cuenta'}</p>
                        </div>
                        <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/20">
                          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <CheckCircle2 className="w-3 h-3" /> Regla Sugerida: {item.rule.name}
                          </p>
                          <p className="text-[11px] font-black text-indigo-300">{item.suggestedGl ? `${item.suggestedGl.code} · ${item.suggestedGl.name}` : 'Sin cuenta'}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => handleApplySuggestion(item.tx, item.rule.glAccountId)}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                      >
                        Aplicar
                      </button>
                      <button 
                        onClick={() => {
                          setEditingTransaction(item.tx);
                        }}
                        className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => {
                          setValidationErrors(prev => prev ? prev.filter((_, i) => i !== idx) : null);
                        }}
                        className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-10 py-8 border-t border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex flex-col">
                <p className="text-[10px] font-bold text-slate-500 italic">
                  * Las sugerencias se basan en la prioridad de las reglas bancarias vigentes.
                </p>
                {validationErrors.length > 1 && (
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-1">
                    Consejo: Puedes aplicar todas las sugerencias masivamente
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setValidationErrors(null)}
                  className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all border border-slate-700"
                >
                  Cerrar
                </button>
                {validationErrors.length > 0 && (
                  <button 
                    onClick={handleFixAll}
                    disabled={isFixingAll}
                    className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-3 disabled:opacity-50"
                  >
                    {isFixingAll ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Corrigiendo...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Corregir Todo ({validationErrors.length})
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {validationMessage && createPortal(
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[1000000] animate-in fade-in slide-in-from-top-10 duration-500 w-full max-w-xl px-4">
          <div className="bg-[#10b981] text-white px-10 py-6 rounded-[2.5rem] shadow-[0_30px_90px_-20px_rgba(16,185,129,0.7)] flex items-center gap-6 border border-emerald-400/50 backdrop-blur-3xl">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner shrink-0">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Sistema AccountExpress</p>
              <p className="text-base font-black leading-tight tracking-tight">{validationMessage}</p>
            </div>
            <button 
              onClick={() => setValidationMessage(null)} 
              className="w-12 h-12 rounded-full hover:bg-white/10 flex items-center justify-center transition-all text-white/50 hover:text-white border border-white/10"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
