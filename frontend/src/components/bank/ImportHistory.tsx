import React, { useState } from 'react';
import { fetchApi } from '../../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { Database, Clock, ChevronDown, Printer, FileSpreadsheet, FileText } from 'lucide-react';
import { AutoMatchButton } from './AutoMatchButton';
import { PrintPreviewModal } from '../PrintPreviewModal';
import ExcelJS from 'exceljs';

export const ImportHistory: React.FC = () => {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState<'csv' | 'xlsx' | null>(null);

  const companyId = activeCompany?.id;

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
  const activePeriodId: string | null = Array.isArray(openPeriodsData)
    ? (openPeriodsData[0]?.id ?? null)
    : null;

  const { data: glAccountsData } = useQuery({
    queryKey: ['gl-accounts', activeCompany?.id],
    queryFn: () => fetchApi(`/gl-accounts`),
    enabled: !!activeCompany?.id
  });

  const glAccounts = (glAccountsData || []).filter((a: any) => a.description !== 'Header');

  const assignMutation = useMutation({
    mutationFn: async ({ txId, accountId }: { txId: string; accountId: string }) =>
      fetchApi(`/bank/transactions/${txId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ glAccountId: accountId, companyId: activeCompany?.id }),
        headers: { 'Content-Type': 'application/json' }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-history', activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions', activeCompany?.id] });
    },
    onError: (err: any) => alert(`Error al asignar cuenta: ${err.message}`)
  });

  const formatDate = (raw: string) => {
    if (!raw) return '—';
    const s = raw.substring(0, 10);
    const [y, m, d] = s.split('-');
    if (!y || !m || !d) return s;
    return `${d}/${m}/${y}`;
  };

  const getExportRows = (filter: 'all' | 'pending' | 'reconciled') => {
    if (filter === 'pending') return txs.filter((t: any) => t.status === 'pending');
    if (filter === 'reconciled') return txs.filter((t: any) => t.status !== 'pending');
    return txs;
  };

  const getAccountLabel = (glAccountId: string) => {
    const acc = glAccounts.find((a: any) => a.id === glAccountId);
    return acc ? `${acc.code} · ${acc.name}` : '—';
  };

  const getStatusLabel = (t: any) => {
    if (t.status === 'reconciled') return 'Conciliado';
    if (t.appliedRuleId) return 'Regla Aplicada';
    if (t.status === 'assigned') return 'Asignado';
    if (t.status === 'ignored') return 'Ignorado';
    return 'Pendiente';
  };

  const handleExportCSV = (filter: 'all' | 'pending' | 'reconciled') => {
    const rows = getExportRows(filter);
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
    const rows = getExportRows(filter);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AccountExpress';
    wb.created = new Date();

    const ws = wb.addWorksheet('Transacciones', {
      pageSetup: { fitToPage: true, orientation: 'landscape' },
    });

    ws.columns = [
      { header: 'Fecha',           key: 'fecha',    width: 14 },
      { header: 'Descripción',     key: 'desc',     width: 58 },
      { header: 'Monto',           key: 'monto',    width: 16 },
      { header: 'Estado',          key: 'estado',   width: 20 },
      { header: 'Cuenta Contable', key: 'cuenta',   width: 38 },
    ];

    // Estilo de encabezados
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF6366F1' } },
      };
    });
    ws.getRow(1).height = 28;

    // Filas de datos
    rows.forEach((t: any, i: number) => {
      const row = ws.addRow({
        fecha:   formatDate(t.transactionDate),
        desc:    t.description ?? '',
        monto:   Number(t.amount),
        estado:  getStatusLabel(t),
        cuenta:  getAccountLabel(t.glAccountId),
      });

      // Fondo alternado
      const bgColor = i % 2 === 0 ? 'FF0F172A' : 'FF1E293B';
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.font = { color: { argb: 'FFE2E8F0' }, size: 10 };
        cell.alignment = { vertical: 'middle' };
      });

      // Monto: alineación derecha + formato moneda
      const montoCell = row.getCell('monto');
      montoCell.numFmt = '"$"#,##0.00';
      montoCell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (Number(t.amount) < 0) {
        montoCell.font = { color: { argb: 'FFF87171' }, size: 10 }; // rojo
      } else {
        montoCell.font = { color: { argb: 'FF34D399' }, size: 10 }; // verde
      }

      row.height = 20;
    });

    // Fila de totales al final
    const totalRow = ws.addRow({
      fecha:  'TOTAL',
      desc:   `${rows.length} transacciones`,
      monto:  rows.reduce((sum: number, t: any) => sum + Number(t.amount), 0),
      estado: '',
      cuenta: '',
    });
    totalRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
    });
    totalRow.getCell('monto').numFmt = '"$"#,##0.00';
    totalRow.getCell('monto').alignment = { horizontal: 'right' };
    totalRow.height = 22;

    // Descargar
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transacciones_${filter}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(null);
  };

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

  const txs = transactions?.data || [];
  const pending = txs.filter((t: any) => t.status === 'pending');
  const rest = txs.filter((t: any) => t.status !== 'pending');

  const firstPendingBankAccountId: string | null =
    pending[0]?.bankAccount ?? pending[0]?.bank_account ?? null;

  const renderTable = (rows: any[], showAssign: boolean) => (
    <div className="bg-slate-950 border-2 border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl mb-6">
      <div className="max-h-[500px] overflow-y-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-900/80 sticky top-0 z-20">
            <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-800">
              <th className="px-6 py-4">Fecha</th>
              <th className="px-6 py-4">Descripción</th>
              <th className="px-6 py-4 text-right">Monto</th>
              <th className="px-6 py-4 text-center">Estado</th>
              <th className="px-6 py-4">Cuenta Contable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {rows.map((t: any) => (
              <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
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
                    t.status === 'reconciled' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : t.appliedRuleId ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                    : t.status === 'assigned' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : t.status === 'ignored' ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  }`}>
                    {t.status === 'reconciled' ? 'Conciliado' 
                      : t.appliedRuleId ? 'Regla Aplicada'
                      : t.status === 'assigned' ? 'Asignado' 
                      : t.status === 'ignored' ? 'Ignorado' 
                      : 'Pendiente'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {showAssign ? (
                    <div className="relative">
                      <select
                        defaultValue={t.glAccountId || ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            assignMutation.mutate({ txId: t.id, accountId: e.target.value });
                          }
                        }}
                        disabled={assignMutation.isPending}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none focus:border-indigo-500 cursor-pointer"
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
                      {glAccounts.find((a: any) => a.id === t.glAccountId) 
                        ? `${glAccounts.find((a: any) => a.id === t.glAccountId).code} · ${glAccounts.find((a: any) => a.id === t.glAccountId).name}`
                        : t.status === 'ignored' ? '— Omitida —' : '— Sin asignar —'}
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
    <div className="bg-slate-900 border-2 border-slate-800 rounded-[3.5rem] shadow-3xl overflow-hidden relative">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] pointer-events-none"></div>

      <div className="p-10 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-6">
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
        <div className="flex items-center gap-2">
          {txs.length > 0 && (
            <AutoMatchButton
              companyId={activeCompany?.id || null}
              bankAccountId={txs[0]?.bankAccount || txs[0]?.bank_account || null}
              periodId={activePeriodId}
            />
          )}
          <button
            onClick={() => setShowExportModal('csv')}
            title="Exportar CSV"
            className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-2xl text-sm font-bold transition-all border border-slate-700 shadow-xl"
          >
            <FileText className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={() => setShowExportModal('xlsx')}
            title="Exportar Excel"
            className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-2xl text-sm font-bold transition-all border border-slate-700 shadow-xl"
          >
            <FileSpreadsheet className="w-4 h-4" />
            XLS
          </button>
          <button
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-2xl text-sm font-bold transition-all border border-gray-700 shadow-xl"
          >
            <Printer className="w-5 h-5 text-gray-400" />
            Imprimir Registro
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
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                    Pendientes de asignación ({pending.length})
                  </h4>
                </div>
                {renderTable(pending, true)}
              </div>
            )}
            {rest.length > 0 && (
              <div>
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
                  Historial conciliado ({rest.length})
                </h4>
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
          { key: 'status', label: 'Estado', align: 'center', format: (val) => val === 'reconciled' ? 'Conciliado' : val === 'assigned' ? 'Asignado' : 'Pendiente' },
          { key: 'glAccountId', label: 'Cuenta Contable', align: 'left', format: (val) => glAccounts.find((a: any) => a.id === val)?.name || '—' }
        ]}
        data={txs}
      />

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                {showExportModal === 'csv'
                  ? <FileText className="w-5 h-5 text-emerald-400" />
                  : <FileSpreadsheet className="w-5 h-5 text-emerald-400" />}
                <h2 className="text-lg font-bold text-white">
                  Exportar {showExportModal === 'csv' ? 'CSV' : 'Excel'}
                </h2>
              </div>
              <button
                onClick={() => setShowExportModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="px-8 py-6 flex flex-col gap-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                ¿Qué transacciones querés exportar?
              </p>
              {([
                { filter: 'all'        as const, label: 'Todas las transacciones',       count: txs.length,     color: 'indigo' },
                { filter: 'pending'    as const, label: 'Solo pendientes',               count: pending.length, color: 'amber'  },
                { filter: 'reconciled' as const, label: 'Solo conciliadas / asignadas',  count: rest.length,    color: 'emerald'},
              ]).map(({ filter, label, count, color }) => (
                <button
                  key={filter}
                  onClick={() =>
                    showExportModal === 'csv'
                      ? handleExportCSV(filter)
                      : handleExportXLSX(filter)
                  }
                  className={`flex items-center justify-between w-full px-5 py-4 rounded-2xl border bg-slate-950/60 transition-all
                    ${color === 'indigo'  ? 'border-indigo-500/30  hover:bg-indigo-500/10  hover:border-indigo-500/60'
                    : color === 'amber'   ? 'border-amber-500/30   hover:bg-amber-500/10   hover:border-amber-500/60'
                    :                       'border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/60'}`}
                >
                  <span className="text-sm font-semibold text-white">{label}</span>
                  <span className={`text-xs font-black px-3 py-1 rounded-lg
                    ${color === 'indigo'  ? 'bg-indigo-500/15  text-indigo-400'
                    : color === 'amber'   ? 'bg-amber-500/15   text-amber-400'
                    :                       'bg-emerald-500/15 text-emerald-400'}`}>
                    {count} registros
                  </span>
                </button>
              ))}
            </div>

            <div className="px-8 pb-6">
              <button
                onClick={() => setShowExportModal(null)}
                className="w-full py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
