import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { FileBarChart, Download, Building, Calendar, Printer } from 'lucide-react';
import { PrintPreviewModal } from '../components/PrintPreviewModal';

export function Reports() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  
  const [activeTab, setActiveTab] = useState<'balance-sheet' | 'income-statement' | 'trial-balance' | 'cash-flow' | 'aging' | 'reconciliation' | 'open-items'>('balance-sheet');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().substring(0, 10));
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().substring(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().substring(0, 10));
  const [showPrintModal, setShowPrintModal] = useState(false);

  const { data: balanceSheet, isLoading: loadBS } = useQuery({
    queryKey: ['report-balance-sheet', activeCompany?.id, asOfDate],
    queryFn: () => fetchApi(`/reports/balance-sheet?companyId=${activeCompany?.id}&asOfDate=${asOfDate}`),
    enabled: !!activeCompany && activeTab === 'balance-sheet'
  });

  const { data: incomeStatement, isLoading: loadIS } = useQuery({
    queryKey: ['report-income-statement', activeCompany?.id, startDate, endDate],
    queryFn: () => fetchApi(`/reports/income-statement?companyId=${activeCompany?.id}&startDate=${startDate}&endDate=${endDate}`),
    enabled: !!activeCompany && activeTab === 'income-statement'
  });

  const { data: trialBalance, isLoading: loadTB } = useQuery({
    queryKey: ['report-trial-balance', activeCompany?.id, asOfDate],
    queryFn: () => fetchApi(`/reports/trial-balance?companyId=${activeCompany?.id}&asOfDate=${asOfDate}`),
    enabled: !!activeCompany && activeTab === 'trial-balance'
  });

  const { data: cashFlow, isLoading: loadCF } = useQuery({
    queryKey: ['report-cash-flow', activeCompany?.id, startDate, endDate],
    queryFn: () => fetchApi(`/reports/cash-flow?companyId=${activeCompany?.id}&startDate=${startDate}&endDate=${endDate}`),
    enabled: !!activeCompany && activeTab === 'cash-flow'
  });

  const { data: agingReport, isLoading: loadAging } = useQuery({
    queryKey: ['report-aging', activeCompany?.id, asOfDate],
    queryFn: () => fetchApi(`/reports/aging?companyId=${activeCompany?.id}&asOfDate=${asOfDate}`),
    enabled: !!activeCompany && activeTab === 'aging'
  });

  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts', activeCompany?.id],
    queryFn: () => fetchApi(`/bank-accounts?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany
  });

  const { data: fiscalPeriods } = useQuery({
    queryKey: ['fiscal-periods', activeCompany?.id],
    queryFn: () => fetchApi(`/fiscal-periods?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany
  });

  const { data: reconciliationReport, isLoading: loadRec } = useQuery({
    queryKey: ['report-reconciliation', activeCompany?.id, selectedBankAccountId, selectedPeriodId],
    queryFn: () => fetchApi(`/bank/accounts/${selectedBankAccountId}/reconciliation-report?periodId=${selectedPeriodId}`),
    enabled: !!activeCompany && activeTab === 'reconciliation' && !!selectedBankAccountId && !!selectedPeriodId
  });

  const { data: openItemsReport, isLoading: loadOpen } = useQuery({
    queryKey: ['report-open-items', activeCompany?.id],
    queryFn: () => fetchApi(`/bank/reports/open-items`),
    enabled: !!activeCompany && activeTab === 'open-items'
  });

  const exportToCSV = (filename: string, rows: string[][]) => {
    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = () => {
    if (activeTab === 'balance-sheet' && balanceSheet?.data) {
      const data = balanceSheet.data;
      const csv = [
        ['Balance General', activeCompany?.legalName || ''],
        ['A la fecha:', data.date],
        [],
        ['ACTIVOS'],
        ...data.assets.items.map((i: any) => [i.code, `"${i.name}"`, i.balance.toFixed(2)]),
        ['Total Activos', '', data.assets.total.toFixed(2)],
        [],
        ['PASIVOS'],
        ...data.liabilities.items.map((i: any) => [i.code, `"${i.name}"`, i.balance.toFixed(2)]),
        ['Total Pasivos', '', data.liabilities.total.toFixed(2)],
        [],
        ['CAPITAL'],
        ...data.equity.items.map((i: any) => [i.code, `"${i.name}"`, i.balance.toFixed(2)]),
        ['Total Capital', '', data.equity.total.toFixed(2)],
      ];
      exportToCSV('Balance_General', csv);
    } else if (activeTab === 'income-statement' && incomeStatement?.data) {
      const data = incomeStatement.data;
      const csv = [
        ['Estado de Resultados', activeCompany?.legalName || ''],
        ['Periodo:', `${data.startDate} a ${data.endDate}`],
        [],
        ['INGRESOS'],
        ...data.revenue.items.map((i: any) => [i.code, `"${i.name}"`, i.balance.toFixed(2)]),
        ['Total Ingresos', '', data.revenue.total.toFixed(2)],
        [],
        ['GASTOS'],
        ...data.expenses.items.map((i: any) => [i.code, `"${i.name}"`, i.balance.toFixed(2)]),
        ['Total Gastos', '', data.expenses.total.toFixed(2)],
        [],
        ['UTILIDAD NETA', '', data.netIncome.toFixed(2)]
      ];
      exportToCSV('Estado_Resultados', csv);
    } else if (activeTab === 'trial-balance' && trialBalance?.data) {
      const data = trialBalance.data;
      const csv = [
        ['Balance de Comprobación', activeCompany?.legalName || ''],
        ['A la fecha:', data.date],
        [],
        ['Código', 'Cuenta', 'Naturaleza', 'Débitos', 'Créditos', 'Saldo Neto'],
        ...data.items.map((i: any) => [i.code, `"${i.name}"`, i.normalBalance, i.totalDebits.toFixed(2), i.totalCredits.toFixed(2), i.netBalance.toFixed(2)]),
        [],
        ['TOTALES', '', '', data.totalDebits.toFixed(2), data.totalCredits.toFixed(2), '']
      ];
      exportToCSV('Balance_Comprobacion', csv);
    } else if (activeTab === 'cash-flow' && cashFlow?.data) {
      const data = cashFlow.data;
      const csv = [
        ['Flujo de Caja', activeCompany?.legalName || ''],
        ['Periodo:', `${data.startDate} a ${data.endDate}`],
        [],
        ['ACTIVIDADES DE OPERACION'],
        ['Utilidad Neta', '', data.operating.netIncome.toFixed(2)],
        ...data.operating.adjustments.map((i: any) => [`"${i.description}"`, '', i.amount.toFixed(2)]),
        ['Efectivo Neto de Actividades de Operacion', '', data.operating.netCash.toFixed(2)],
        [],
        ['ACTIVIDADES DE INVERSION'],
        ...data.investing.items.map((i: any) => [`"${i.description}"`, '', i.amount.toFixed(2)]),
        ['Efectivo Neto de Inv.', '', data.investing.netCash.toFixed(2)],
        [],
        ['ACTIVIDADES DE FINANCIACION'],
        ...data.financing.items.map((i: any) => [`"${i.description}"`, '', i.amount.toFixed(2)]),
        ['Efectivo Neto de Fin.', '', data.financing.netCash.toFixed(2)],
        [],
        ['CAMBIO NETO EN EFECTIVO', '', data.netCashChange.toFixed(2)]
      ];
      exportToCSV('Flujo_Caja', csv);
    } else if (activeTab === 'reconciliation' && reconciliationReport) {
      const data = reconciliationReport;
      const csv = [
        ['Conciliación Bancaria', activeCompany?.legalName || ''],
        ['Cuenta:', `${data.bankAccount.accountName} (${data.bankAccount.accountNumber})`],
        ['Periodo:', `${data.period.name} (${data.period.startDate} a ${data.period.endDate})`],
        [],
        ['Saldo según Libros', '', data.balancePerBooks.toFixed(2)],
        ['Saldo según Extracto', '', data.balancePerStatement.toFixed(2)],
        ['Diferencia', '', data.difference.toFixed(2)],
        [],
        ['PARTIDAS CONCILIADAS'],
        ['Fecha', 'Descripción', 'Monto'],
        ...data.reconciledItems.map((i: any) => [i.transactionDate, i.description, i.amount.toFixed(2)]),
        [],
        ['PARTIDAS PENDIENTES'],
        ['Fecha', 'Descripción', 'Monto'],
        ...data.unreconciledItems.map((i: any) => [i.transactionDate, i.description, i.amount.toFixed(2)]),
      ];
      exportToCSV('Conciliacion_Bancaria', csv);
    }
  };

  const renderSection = (title: string, items: any[], total: number) => (
    <div className="mb-8">
      <h3 className="text-lg font-bold text-white mb-3 bg-[#0a1628]/80 p-3 rounded-lg border border-white/7">{title}</h3>
      <table className="w-full text-left text-sm whitespace-nowrap">
        <tbody className="divide-y divide-white/5">
          {items.map((item, i) => (
            <tr key={i} className="hover:bg-white/5 transition-colors">
              <td className="py-2 pl-4 text-gray-400 w-24 font-mono">{item.code}</td>
              <td className="py-2 text-gray-200">{item.name || item.description}</td>
              <td className="py-2 pr-4 text-right font-mono text-gray-300">
                {(item.balance ?? item.amount)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-white/10 font-bold bg-[#0f2240]/40">
            <td colSpan={2} className="py-3 pl-4 text-gray-300">Total {title}</td>
            <td className="py-3 pr-4 text-right font-mono text-indigo-400">
              {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <FileBarChart className="w-7 h-7 text-indigo-500" />
            Reportes Financieros
          </h1>
          <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
            <Building className="w-4 h-4" /> {activeCompany?.legalName}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0f2240] hover:bg-[#0f2240]/70 text-white text-sm font-medium rounded-lg transition-colors border border-white/10 shadow-lg"
          >
            <Printer className="w-4 h-4 text-gray-400" />
            Imprimir Reporte
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-[#0071c5] hover:bg-[#005fa3] text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-[#0071c5]/20 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Exportar a Excel
          </button>
        </div>
      </div>

      {/* Tabs and Controls */}
      <div className="bg-[#0f2240] rounded-xl border border-white/7 shadow-lg overflow-hidden flex flex-col lg:flex-row">
        {/* Tab Sidebar */}
        <div className="w-full lg:w-64 bg-[#0a1628]/50 border-r border-white/7 p-4 space-y-2">
          {[
            { id: 'balance-sheet', name: 'Balance General' },
            { id: 'income-statement', name: 'Estado de Resultados' },
            { id: 'cash-flow', name: 'Flujo de Caja' },
            { id: 'trial-balance', name: 'Bal. Comprobación' },
            { id: 'aging', name: 'Antigüedad' },
            { id: 'reconciliation', name: 'Conciliación Bancaria' },
            { id: 'open-items', name: 'Partidas Abiertas' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-[#0071c5]/20 text-[#0071c5] border border-[#0071c5]/30 shadow-inner' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* Date Controls & Report Content */}
        <div className="flex-1 flex flex-col h-full bg-[#0d1b2e]">
          <div className="p-4 border-b border-white/7 bg-[#0a1628]/30 flex items-center gap-4">
            <Calendar className="w-5 h-5 text-gray-500" />
            {(activeTab === 'balance-sheet' || activeTab === 'trial-balance' || activeTab === 'aging') ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-400">A la fecha:</span>
                <input 
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="bg-[#0a1628] border border-white/10 rounded-md px-3 py-1.5 text-white text-sm focus:border-[#0071c5]"
                />
              </div>
            ) : activeTab === 'reconciliation' ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-400">Cuenta:</span>
                  <select 
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                    className="bg-[#0a1628] border border-white/10 rounded-md px-3 py-1.5 text-white text-sm focus:border-[#0071c5]"
                  >
                    <option value="">Seleccione cuenta</option>
                    {(bankAccounts as any[])?.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.accountName}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-400">Periodo:</span>
                  <select 
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                    className="bg-[#0a1628] border border-white/10 rounded-md px-3 py-1.5 text-white text-sm focus:border-[#0071c5]"
                  >
                    <option value="">Seleccione periodo</option>
                    {(fiscalPeriods as any[])?.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : activeTab === 'open-items' ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-400 italic">Reporte global de transacciones sin conciliar</span>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-400">Desde:</span>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-[#0a1628] border border-white/10 rounded-md px-3 py-1.5 text-white text-sm focus:border-[#0071c5]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-400">Hasta:</span>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-[#0a1628] border border-white/10 rounded-md px-3 py-1.5 text-white text-sm focus:border-[#0071c5]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-6 md:p-8 flex-1 overflow-auto bg-[#0d1b2e]">
            
            {/* Loading State */}
            {(loadBS || loadCF || loadIS || loadTB || loadAging || loadRec || loadOpen) && (
              <div className="flex flex-col items-center justify-center p-12 text-gray-500">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                Compilando reporte contable...
              </div>
            )}

            {/* BALANCE SHEET RENDER */}
            {!loadBS && activeTab === 'balance-sheet' && balanceSheet?.data && (
              <div className="max-w-4xl mx-auto bg-[#0f2240] border border-white/7 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-10 border-b border-white/10 pb-6">
                  <h2 className="text-2xl font-black text-white uppercase tracking-widest">{activeCompany?.legalName}</h2>
                  <h3 className="text-lg text-gray-400 mt-1">Balance General</h3>
                  <p className="text-sm text-gray-500">A la fecha: {balanceSheet.data.date}</p>
                </div>
                
                {renderSection('ACTIVOS', balanceSheet.data.assets.items, balanceSheet.data.assets.total)}
                {renderSection('PASIVOS', balanceSheet.data.liabilities.items, balanceSheet.data.liabilities.total)}
                {renderSection('CAPITAL', balanceSheet.data.equity.items, balanceSheet.data.equity.total)}

                <div className="mt-8 pt-4 border-t-4 border-indigo-900 flex justify-between items-center bg-indigo-900/20 p-4 rounded-lg">
                  <span className="text-lg font-bold text-indigo-300">Total Pasivo + Capital</span>
                  <span className="text-xl font-mono font-bold text-white">
                    {(balanceSheet.data.liabilities.total + balanceSheet.data.equity.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}

            {/* INCOME STATEMENT RENDER */}
            {!loadIS && activeTab === 'income-statement' && incomeStatement?.data && (
              <div className="max-w-4xl mx-auto bg-[#0f2240] border border-white/7 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-10 border-b border-white/10 pb-6">
                  <h2 className="text-2xl font-black text-white uppercase tracking-widest">{activeCompany?.legalName}</h2>
                  <h3 className="text-lg text-gray-400 mt-1">Estado de Resultados (P&L)</h3>
                  <p className="text-sm text-gray-500">Periodo: {incomeStatement.data.startDate} a {incomeStatement.data.endDate}</p>
                </div>
                
                {renderSection('INGRESOS', incomeStatement.data.revenue.items, incomeStatement.data.revenue.total)}
                {renderSection('GASTOS', incomeStatement.data.expenses.items, incomeStatement.data.expenses.total)}

                <div className="mt-8 pt-4 border-t-4 border-emerald-900 flex justify-between items-center bg-emerald-900/20 p-4 rounded-lg">
                  <span className="text-lg font-bold text-emerald-300">UTILIDAD NETA</span>
                  <span className="text-2xl font-mono font-bold text-white">
                    {incomeStatement.data.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}

            {/* TRIAL BALANCE RENDER */}
            {!loadTB && activeTab === 'trial-balance' && trialBalance?.data && (
              <div className="max-w-5xl mx-auto bg-[#0f2240] border border-white/7 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-10 border-b border-white/10 pb-6">
                  <h2 className="text-2xl font-black text-white uppercase tracking-widest">{activeCompany?.legalName}</h2>
                  <h3 className="text-lg text-gray-400 mt-1">Balance de Comprobación</h3>
                  <p className="text-sm text-gray-500">A la fecha: {trialBalance.data.date}</p>
                </div>
                
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="border-b border-white/10 bg-[#0a1628]">
                    <tr>
                      <th className="py-3 px-4 text-gray-400">Código</th>
                      <th className="py-3 px-4 text-gray-400">Cuenta</th>
                      <th className="py-3 px-4 text-right text-gray-400">Débitos</th>
                      <th className="py-3 px-4 text-right text-gray-400">Créditos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {trialBalance.data.items.map((i: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="py-2 px-4 text-gray-500 font-mono">{i.code}</td>
                        <td className="py-2 px-4 text-gray-300">{i.name}</td>
                        <td className="py-2 px-4 text-right font-mono text-gray-400">
                          {i.totalDebits > 0 ? i.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-gray-400">
                          {i.totalCredits > 0 ? i.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-4 border-white/10 bg-[#0f2240] font-bold">
                      <td colSpan={2} className="py-4 px-4 text-gray-300 text-right">TOTALES</td>
                      <td className="py-4 px-4 text-right font-mono text-indigo-400">
                        {trialBalance.data.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-indigo-400">
                        {trialBalance.data.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* CASH FLOW RENDER */}
            {!loadCF && activeTab === 'cash-flow' && cashFlow?.data && (
              <div className="max-w-4xl mx-auto bg-[#0f2240] border border-white/7 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-10 border-b border-white/10 pb-6">
                  <h2 className="text-2xl font-black text-white uppercase tracking-widest">{activeCompany?.legalName}</h2>
                  <h3 className="text-lg text-gray-400 mt-1">Estado de Flujo de Efectivo</h3>
                  <p className="text-sm text-gray-500">Periodo: {cashFlow.data.startDate} a {cashFlow.data.endDate}</p>
                </div>
                
                {/* Operating */}
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-[#0071c5] mb-3 border-b border-white/10 pb-2">Actividades de Operación</h3>
                  <div className="flex justify-between py-2 pl-4 text-gray-300 border-b border-white/5 hover:bg-white/5">
                    <span>Utilidad Neta</span>
                    <span className="font-mono">{cashFlow.data.operating.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  {cashFlow.data.operating.adjustments.map((adj: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-2 pl-8 text-gray-400 hover:bg-white/5">
                      <span>{adj.description}</span>
                      <span className="font-mono">{adj.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-3 pl-4 font-bold text-gray-200 border-t border-white/10 mt-2 bg-white/5">
                    <span>Efectivo Neto (Operación)</span>
                    <span className="font-mono text-indigo-400">{cashFlow.data.operating.netCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Investing */}
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-[#0071c5] mb-3 border-b border-white/10 pb-2">Actividades de Inversión</h3>
                  {cashFlow.data.investing.items.length === 0 && <p className="text-gray-600 pl-4 py-2 italic">Sin movimientos en este periodo</p>}
                  {cashFlow.data.investing.items.map((inv: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-2 pl-4 text-gray-400 hover:bg-white/5">
                      <span>{inv.description}</span>
                      <span className="font-mono">{inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-3 pl-4 font-bold text-gray-200 border-t border-white/10 mt-2 bg-white/5">
                    <span>Efectivo Neto (Inversión)</span>
                    <span className="font-mono text-indigo-400">{cashFlow.data.investing.netCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Financing */}
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-[#0071c5] mb-3 border-b border-white/10 pb-2">Actividades de Financiación</h3>
                  {cashFlow.data.financing.items.length === 0 && <p className="text-gray-600 pl-4 py-2 italic">Sin movimientos en este periodo</p>}
                  {cashFlow.data.financing.items.map((fin: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-2 pl-4 text-gray-400 hover:bg-white/5">
                      <span>{fin.description}</span>
                      <span className="font-mono">{fin.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-3 pl-4 font-bold text-gray-200 border-t border-white/10 mt-2 bg-white/5">
                    <span>Efectivo Neto (Financiación)</span>
                    <span className="font-mono text-indigo-400">{cashFlow.data.financing.netCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Summary */}
                <div className="mt-8 pt-4 border-t-4 border-emerald-900 flex justify-between items-center bg-emerald-900/20 p-6 rounded-lg">
                  <span className="text-xl font-bold text-emerald-300">AUMENTO (DISMINUCIÓN) NETO DE EFECTIVO</span>
                  <span className="text-2xl font-mono font-bold text-white">
                    {cashFlow.data.netCashChange.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}

            {/* AGING REPORT RENDER */}
            {!loadAging && activeTab === 'aging' && agingReport?.data && (
              <div className="max-w-5xl mx-auto bg-[#0f2240] border border-white/7 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-8 border-b border-white/10 pb-6">
                  <h2 className="text-2xl font-black text-white uppercase tracking-widest">{activeCompany?.legalName}</h2>
                  <h3 className="text-lg text-gray-400 mt-1">Reporte de Antigüedad — Transacciones Pendientes</h3>
                  <p className="text-sm text-gray-500">A la fecha: {asOfDate}</p>
                  <div className="flex justify-center gap-8 mt-4">
                    <span className="text-sm text-gray-400">Total pendientes: <span className="font-bold text-white">{agingReport.data.totalPending}</span></span>
                    <span className="text-sm text-gray-400">Monto total: <span className="font-bold text-amber-400">$\{agingReport.data.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
                  </div>
                </div>
                {agingReport.data.buckets.map((bucket: any) => (
                  <div key={bucket.label} className="mb-6">
                    <div className={`flex justify-between items-center p-3 rounded-lg mb-2 ${bucket.minDays >= 91 ? 'bg-red-900/30 border border-red-800/50' : bucket.minDays >= 61 ? 'bg-orange-900/30 border border-orange-800/50' : bucket.minDays >= 31 ? 'bg-yellow-900/30 border border-yellow-800/50' : 'bg-[#0a1628] border border-white/5'}`}>
                      <span className={`font-bold text-sm ${bucket.minDays >= 91 ? 'text-red-400' : bucket.minDays >= 61 ? 'text-orange-400' : bucket.minDays >= 31 ? 'text-yellow-400' : 'text-gray-300'}`}>{bucket.label}</span>
                      <div className="flex gap-4 text-sm">
                        <span className="text-gray-400">{bucket.count} transacciones</span>
                        <span className="font-mono font-bold text-white">${bucket.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                    {bucket.transactions.length > 0 && (
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-white/5">
                          {bucket.transactions.map((tx: any) => (
                            <tr key={tx.id} className="hover:bg-white/5">
                              <td className="py-2 pl-4 text-gray-500 font-mono w-28">{tx.transactionDate}</td>
                              <td className="py-2 text-gray-300">{tx.description}</td>
                              <td className="py-2 pr-4 text-right font-mono text-gray-400">{tx.daysPending}d</td>
                              <td className="py-2 pr-4 text-right font-mono text-white">${Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* RECONCILIATION REPORT RENDER */}
            {!loadRec && activeTab === 'reconciliation' && reconciliationReport && (
              <div className="max-w-5xl mx-auto space-y-6">
                <div className="bg-[#0f2240] border border-white/7 p-8 rounded-xl shadow-2xl">
                  <div className="text-center mb-10 border-b border-white/10 pb-6">
                    <h2 className="text-2xl font-black text-white uppercase tracking-widest">{activeCompany?.legalName}</h2>
                    <h3 className="text-lg text-gray-400 mt-1">Conciliación Bancaria</h3>
                    <p className="text-sm text-gray-500">Cuenta: {reconciliationReport.bankAccount.accountName} ({reconciliationReport.bankAccount.accountNumber})</p>
                    <p className="text-sm text-gray-500">Periodo: {reconciliationReport.period.name} ({reconciliationReport.period.startDate} a {reconciliationReport.period.endDate})</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-[#0a1628] p-6 rounded-2xl border border-white/5 shadow-inner">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Saldo según Libros</p>
                      <p className="text-2xl font-mono font-bold text-white">${reconciliationReport.balancePerBooks.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-[#0a1628] p-6 rounded-2xl border border-white/5 shadow-inner">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Saldo según Extracto</p>
                      <p className="text-2xl font-mono font-bold text-white">${reconciliationReport.balancePerStatement.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className={`p-6 rounded-2xl border shadow-inner ${Math.abs(reconciliationReport.difference) < 0.01 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Diferencia</p>
                      <p className={`text-2xl font-mono font-bold ${Math.abs(reconciliationReport.difference) < 0.01 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ${reconciliationReport.difference.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div>
                      <h4 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em] mb-4 border-b border-white/5 pb-2">Partidas Conciliadas</h4>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b border-white/5">
                            <th className="py-2 pl-4">Fecha</th>
                            <th className="py-2">Descripción</th>
                            <th className="py-2 pr-4 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {reconciliationReport.reconciledItems.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-white/5">
                              <td className="py-2 pl-4 text-gray-500 font-mono w-28">{item.transactionDate}</td>
                              <td className="py-2 text-gray-300">{item.description}</td>
                              <td className="py-2 pr-4 text-right font-mono text-gray-300">${Math.abs(parseFloat(item.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h4 className="text-sm font-black text-amber-400/70 uppercase tracking-[0.2em] mb-4 border-b border-white/5 pb-2">Partidas Pendientes (No Conciliadas)</h4>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b border-white/5">
                            <th className="py-2 pl-4">Fecha</th>
                            <th className="py-2">Descripción</th>
                            <th className="py-2 pr-4 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {reconciliationReport.unreconciledItems.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-white/5">
                              <td className="py-2 pl-4 text-gray-500 font-mono w-28">{item.transactionDate}</td>
                              <td className="py-2 text-gray-300">{item.description}</td>
                              <td className="py-2 pr-4 text-right font-mono text-amber-400/80">${Math.abs(parseFloat(item.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* OPEN ITEMS REPORT RENDER */}
            {!loadOpen && activeTab === 'open-items' && openItemsReport && (
              <div className="max-w-5xl mx-auto space-y-6">
                 <div className="bg-[#0f2240] border border-white/7 p-8 rounded-xl shadow-2xl">
                    <div className="text-center mb-10 border-b border-white/10 pb-6">
                      <h2 className="text-2xl font-black text-white uppercase tracking-widest">{activeCompany?.legalName}</h2>
                      <h3 className="text-lg text-gray-400 mt-1">Reporte Global de Partidas Abiertas</h3>
                      <p className="text-sm text-gray-500 italic">Transacciones bancarias pendientes de conciliación en todas las cuentas</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {(openItemsReport as any[]).map((account) => (
                        <div key={account.accountId} className="bg-[#0a1628] border border-white/7 rounded-2xl overflow-hidden hover:border-[#0071c5]/50 transition-colors group shadow-lg">
                          <div className="p-5 border-b border-white/5 bg-[#0f2240]/50">
                            <h4 className="font-bold text-white truncate">{account.accountName}</h4>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-1">{account.bankName} · {account.accountNumber}</p>
                          </div>
                          <div className="p-5 space-y-4">
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Partidas Pendientes</p>
                                <p className="text-2xl font-mono font-black text-amber-400">{account.pendingCount}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Monto Total</p>
                                <p className="text-xl font-mono font-bold text-white">${account.totalPendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                setSelectedBankAccountId(account.accountId);
                                setActiveTab('reconciliation');
                              }}
                              className="w-full py-2 bg-[#0071c5]/10 hover:bg-[#0071c5]/20 text-[#0071c5] text-xs font-black uppercase tracking-widest rounded-lg border border-[#0071c5]/20 transition-all"
                            >
                              Ver Detalles
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                 </div>
              </div>
            )}

          </div>
        </div>
      </div>
      {/* Modal contents... */}

      {/* --- Print Preview Modal --- */}
      <PrintPreviewModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title={
          activeTab === 'balance-sheet' ? 'Balance General' :
          activeTab === 'income-statement' ? 'Estado de Resultados' :
          activeTab === 'trial-balance' ? 'Balance de Comprobación' :
          activeTab === 'cash-flow' ? 'Estado de Flujo de Efectivo' : 
          activeTab === 'reconciliation' ? 'Conciliación Bancaria' :
          activeTab === 'open-items' ? 'Reporte de Partidas Abiertas' : 'Antigüedad de Cuentas'
        }
        config={{
          moduleName: 'reports',
          dateRange: activeTab === 'income-statement' || activeTab === 'cash-flow',
          columnSelector: true,
          mandatoryColumns: ['name', 'balance']
        }}
        columns={[
          { key: 'code', label: 'Código', align: 'left' },
          { key: 'name', label: 'Concepto / Cuenta', align: 'left' },
          { key: 'balance', label: 'Monto / Saldo', align: 'right', format: (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: activeCompany?.currency || 'USD' }).format(val) }
        ]}
        data={(() => {
          if (activeTab === 'balance-sheet' && balanceSheet?.data) {
            const d = balanceSheet.data;
            return [
              { name: 'ACTIVOS', code: 'HEADER', balance: d.assets.total },
              ...d.assets.items,
              { name: 'PASIVOS', code: 'HEADER', balance: d.liabilities.total },
              ...d.liabilities.items,
              { name: 'CAPITAL', code: 'HEADER', balance: d.equity.total },
              ...d.equity.items
            ];
          }
          if (activeTab === 'income-statement' && incomeStatement?.data) {
            const d = incomeStatement.data;
            return [
              { name: 'INGRESOS', code: 'HEADER', balance: d.revenue.total },
              ...d.revenue.items,
              { name: 'GASTOS', code: 'HEADER', balance: d.expenses.total },
              ...d.expenses.items,
              { name: 'UTILIDAD NETA', code: 'TOTAL', balance: d.netIncome }
            ];
          }
          if (activeTab === 'trial-balance' && trialBalance?.data) {
            return trialBalance.data.items.map((i: any) => ({ ...i, balance: (i.totalDebits || 0) - (i.totalCredits || 0) }));
          }
          if (activeTab === 'cash-flow' && cashFlow?.data) {
            const cf = cashFlow.data;
            return [
              { name: 'Actividades de Operación', code: 'HEADER', balance: cf.operating.netCash },
              { name: 'Utilidad Neta', code: '', balance: cf.operating.netIncome },
              ...cf.operating.adjustments,
              { name: 'Actividades de Inversión', code: 'HEADER', balance: cf.investing.netCash },
              ...cf.investing.items,
              { name: 'Actividades de Financiación', code: 'HEADER', balance: cf.financing.netCash },
              ...cf.financing.items,
              { name: 'TOTAL CAMBIO EFECTIVO', code: 'TOTAL', balance: cf.netCashChange }
            ];
          }
          if (activeTab === 'aging' && agingReport?.data) {
            return agingReport.data.buckets.flatMap((b: any) => [
              { name: b.label, code: 'BUCKET', balance: b.total },
              ...b.transactions.map((t: any) => ({ ...t, name: t.description, balance: t.amount }))
            ]);
          }
          if (activeTab === 'reconciliation' && reconciliationReport) {
            const d = reconciliationReport;
            return [
              { name: 'Saldo según Libros', code: 'LEDGER', balance: d.balancePerBooks },
              { name: 'Saldo según Extracto', code: 'BANK', balance: d.balancePerStatement },
              { name: 'Diferencia', code: 'DIFF', balance: d.difference },
              { name: 'PARTIDAS CONCILIADAS', code: 'HEADER', balance: 0 },
              ...d.reconciledItems.map((i: any) => ({ ...i, name: i.description, balance: i.amount })),
              { name: 'PARTIDAS PENDIENTES', code: 'HEADER', balance: 0 },
              ...d.unreconciledItems.map((i: any) => ({ ...i, name: i.description, balance: i.amount }))
            ];
          }
          if (activeTab === 'open-items' && openItemsReport) {
            return (openItemsReport as any[]).flatMap(acc => [
              { name: acc.accountName, code: 'ACCOUNT', balance: acc.totalPendingAmount },
              ...acc.items.map((i: any) => ({ ...i, name: i.description, balance: i.amount }))
            ]);
          }
          return [];
        })()}
      />
    </div>
  );
}
