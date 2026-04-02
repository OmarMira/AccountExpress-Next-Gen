import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { FileBarChart, Download, Building, Calendar } from 'lucide-react';

export function Reports() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  
  const [activeTab, setActiveTab] = useState<'balance-sheet' | 'income-statement' | 'trial-balance' | 'cash-flow' | 'aging'>('balance-sheet');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().substring(0, 10));
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().substring(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().substring(0, 10));

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
    }
  };

  const renderSection = (title: string, items: any[], total: number) => (
    <div className="mb-8">
      <h3 className="text-lg font-bold text-white mb-3 bg-gray-800/80 p-3 rounded-lg border border-gray-700">{title}</h3>
      <table className="w-full text-left text-sm whitespace-nowrap">
        <tbody className="divide-y divide-gray-800/50">
          {items.map((item, i) => (
            <tr key={i} className="hover:bg-gray-800/30 transition-colors">
              <td className="py-2 pl-4 text-gray-400 w-24 font-mono">{item.code}</td>
              <td className="py-2 text-gray-200">{item.name || item.description}</td>
              <td className="py-2 pr-4 text-right font-mono text-gray-300">
                {(item.balance ?? item.amount)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-700/80 font-bold bg-gray-900/40">
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

        <button 
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
        >
          <Download className="w-4 h-4" />
          Exportar a Excel
        </button>
      </div>

      {/* Tabs and Controls */}
      <div className="bg-gray-800/80 rounded-xl border border-gray-700 shadow-lg overflow-hidden flex flex-col lg:flex-row">
        {/* Tab Sidebar */}
        <div className="w-full lg:w-64 bg-gray-900/50 border-r border-gray-700 p-4 space-y-2">
          {[
            { id: 'balance-sheet', name: 'Balance General' },
            { id: 'income-statement', name: 'Estado de Resultados' },
            { id: 'cash-flow', name: 'Flujo de Caja' },
            { id: 'trial-balance', name: 'Bal. Comprobación' },
            { id: 'aging', name: 'Antigüedad' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* Date Controls & Report Content */}
        <div className="flex-1 flex flex-col h-full bg-gray-800/20">
          <div className="p-4 border-b border-gray-700/80 bg-gray-900/30 flex items-center gap-4">
            <Calendar className="w-5 h-5 text-gray-500" />
            {(activeTab === 'balance-sheet' || activeTab === 'trial-balance' || activeTab === 'aging') ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-400">A la fecha:</span>
                <input 
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-white text-sm focus:border-indigo-500"
                />
              </div>
            ) : (
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-400">Desde:</span>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-white text-sm focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-400">Hasta:</span>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-white text-sm focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-6 md:p-8 flex-1 overflow-auto bg-gray-900/20">
            
            {/* Loading State */}
            {(loadBS || loadCF || loadIS || loadTB || loadAging) && (
              <div className="flex flex-col items-center justify-center p-12 text-gray-500">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                Compilando reporte contable...
              </div>
            )}

            {/* BALANCE SHEET RENDER */}
            {!loadBS && activeTab === 'balance-sheet' && balanceSheet?.data && (
              <div className="max-w-4xl mx-auto bg-gray-900 border border-gray-800 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-10 border-b border-gray-800 pb-6">
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
              <div className="max-w-4xl mx-auto bg-gray-900 border border-gray-800 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-10 border-b border-gray-800 pb-6">
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
              <div className="max-w-5xl mx-auto bg-gray-900 border border-gray-800 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-10 border-b border-gray-800 pb-6">
                  <h2 className="text-2xl font-black text-white uppercase tracking-widest">{activeCompany?.legalName}</h2>
                  <h3 className="text-lg text-gray-400 mt-1">Balance de Comprobación</h3>
                  <p className="text-sm text-gray-500">A la fecha: {trialBalance.data.date}</p>
                </div>
                
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="border-b border-gray-700 bg-gray-800/80">
                    <tr>
                      <th className="py-3 px-4 text-gray-400">Código</th>
                      <th className="py-3 px-4 text-gray-400">Cuenta</th>
                      <th className="py-3 px-4 text-right text-gray-400">Débitos</th>
                      <th className="py-3 px-4 text-right text-gray-400">Créditos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {trialBalance.data.items.map((i: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-800/30">
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
                    <tr className="border-t-4 border-gray-700 bg-gray-900 font-bold">
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
              <div className="max-w-4xl mx-auto bg-gray-900 border border-gray-800 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-10 border-b border-gray-800 pb-6">
                  <h2 className="text-2xl font-black text-white uppercase tracking-widest">{activeCompany?.legalName}</h2>
                  <h3 className="text-lg text-gray-400 mt-1">Estado de Flujo de Efectivo</h3>
                  <p className="text-sm text-gray-500">Periodo: {cashFlow.data.startDate} a {cashFlow.data.endDate}</p>
                </div>
                
                {/* Operating */}
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-indigo-400 mb-3 border-b border-gray-800 pb-2">Actividades de Operación</h3>
                  <div className="flex justify-between py-2 pl-4 text-gray-300 border-b border-gray-800/50 hover:bg-gray-800/20">
                    <span>Utilidad Neta</span>
                    <span className="font-mono">{cashFlow.data.operating.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  {cashFlow.data.operating.adjustments.map((adj: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-2 pl-8 text-gray-400 hover:bg-gray-800/20">
                      <span>{adj.description}</span>
                      <span className="font-mono">{adj.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-3 pl-4 font-bold text-gray-200 border-t border-gray-700 mt-2 bg-gray-800/30">
                    <span>Efectivo Neto (Operación)</span>
                    <span className="font-mono text-indigo-400">{cashFlow.data.operating.netCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Investing */}
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-indigo-400 mb-3 border-b border-gray-800 pb-2">Actividades de Inversión</h3>
                  {cashFlow.data.investing.items.length === 0 && <p className="text-gray-600 pl-4 py-2 italic">Sin movimientos en este periodo</p>}
                  {cashFlow.data.investing.items.map((inv: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-2 pl-4 text-gray-400 hover:bg-gray-800/20">
                      <span>{inv.description}</span>
                      <span className="font-mono">{inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-3 pl-4 font-bold text-gray-200 border-t border-gray-700 mt-2 bg-gray-800/30">
                    <span>Efectivo Neto (Inversión)</span>
                    <span className="font-mono text-indigo-400">{cashFlow.data.investing.netCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Financing */}
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-indigo-400 mb-3 border-b border-gray-800 pb-2">Actividades de Financiación</h3>
                  {cashFlow.data.financing.items.length === 0 && <p className="text-gray-600 pl-4 py-2 italic">Sin movimientos en este periodo</p>}
                  {cashFlow.data.financing.items.map((fin: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-2 pl-4 text-gray-400 hover:bg-gray-800/20">
                      <span>{fin.description}</span>
                      <span className="font-mono">{fin.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-3 pl-4 font-bold text-gray-200 border-t border-gray-700 mt-2 bg-gray-800/30">
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
              <div className="max-w-5xl mx-auto bg-gray-900 border border-gray-800 p-8 rounded-xl shadow-2xl">
                <div className="text-center mb-8 border-b border-gray-800 pb-6">
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
                    <div className={`flex justify-between items-center p-3 rounded-lg mb-2 ${bucket.minDays >= 91 ? 'bg-red-900/30 border border-red-800/50' : bucket.minDays >= 61 ? 'bg-orange-900/30 border border-orange-800/50' : bucket.minDays >= 31 ? 'bg-yellow-900/30 border border-yellow-800/50' : 'bg-gray-800/50 border border-gray-700/50'}`}>
                      <span className={`font-bold text-sm ${bucket.minDays >= 91 ? 'text-red-400' : bucket.minDays >= 61 ? 'text-orange-400' : bucket.minDays >= 31 ? 'text-yellow-400' : 'text-gray-300'}`}>{bucket.label}</span>
                      <div className="flex gap-4 text-sm">
                        <span className="text-gray-400">{bucket.count} transacciones</span>
                        <span className="font-mono font-bold text-white">${bucket.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                    {bucket.transactions.length > 0 && (
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-800/30">
                          {bucket.transactions.map((tx: any) => (
                            <tr key={tx.id} className="hover:bg-gray-800/20">
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

          </div>
        </div>
      </div>
    </div>
  );
}
