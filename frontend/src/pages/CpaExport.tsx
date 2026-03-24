import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { ShieldCheck, FileType2, FileText, Lock, AlertTriangle, Printer } from 'lucide-react';

interface Period {
  id: string;
  name: string;
  status: 'open' | 'closed' | 'locked';
  start_date: string;
  end_date: string;
}

interface CpaSummary {
  companyId: string;
  periodId: string;
  disclaimer: string;
  hashTimestamp: string;
  sha256ChainResult: string;
  taxes: { taxCategory: string, totalBalance: number }[];
}

export function CpaExport() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const [periodId, setPeriodId] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const { data: periods = [] } = useQuery<Period[]>({
    queryKey: ['fiscal-periods', activeCompany?.id],
    queryFn: () => fetchApi(`/fiscal-periods?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany
  });

  const closedPeriods = periods.filter(p => p.status === 'closed' || p.status === 'locked');
  const selectedPeriodObj = closedPeriods.find(p => p.id === periodId);

  const { data: trialBalance, isFetching: loadTB } = useQuery({
    queryKey: ['report-trial-balance', activeCompany?.id, selectedPeriodObj?.end_date],
    queryFn: () => fetchApi(`/reports/trial-balance?companyId=${activeCompany?.id}&asOfDate=${selectedPeriodObj?.end_date}`),
    enabled: !!activeCompany && !!selectedPeriodObj
  });

  const cpaMutation = useMutation({
    mutationFn: async (pId: string) => fetchApi('/export/cpa-summary', {
      method: 'POST',
      body: JSON.stringify({ companyId: activeCompany?.id, periodId: pId })
    }),
    onError: (err: any) => alert(`Error generando tax summary: ${err.message}`)
  });

  const handleAnalizar = () => {
    if (periodId) {
      cpaMutation.mutate(periodId);
    }
  };

  const handleDownload = () => {
    if (!activeCompany?.id || !periodId) return;
    const url = `http://localhost:3000/api/export/cpa-summary/download?companyId=${activeCompany.id}&periodId=${periodId}`;
    window.open(url, "_blank");
  };

  const summaryData = cpaMutation.data?.data as CpaSummary | undefined;
  const tbData = trialBalance?.data;

  return (
    <div className="space-y-6 max-w-5xl mx-auto print:max-w-none print:m-0 print:space-y-4">
      {/* Header (Hidden in Print) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-indigo-500" />
            Certificaci&oacute;n y Exportación CPA
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Mapeo de impuestos IRS y validación criptográfica de periodos cerrados
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select 
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="w-full sm:w-64 py-2 px-3 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 appearance-none"
          >
            <option value="">Seleccione Periodo Cerrado</option>
            {closedPeriods.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.start_date} a {p.end_date})</option>
            ))}
          </select>
          
          <button 
            onClick={handleAnalizar}
            disabled={!periodId || cpaMutation.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap disabled:opacity-50"
          >
            {cpaMutation.isPending ? 'Validando...' : 'Generar Exportación'}
          </button>

          {summaryData && (
            <button 
              onClick={handleDownload}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors shadow-lg whitespace-nowrap flex items-center gap-2"
            >
              <Printer className="w-4 h-4" /> Download PDF
            </button>
          )}
        </div>
      </div>

      {closedPeriods.length === 0 && (
         <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-4 flex items-start gap-3 print:hidden">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-400">No hay periodos fiscales cerrados. Debe realizar el Cierre Contable en un periodo abierto antes de exportar datos oficiales para el CPA.</p>
         </div>
      )}

      {/* Printable Area */}
      {summaryData && tbData && (
        <div ref={printRef} className="bg-white rounded-xl shadow-2xl p-8 md:p-12 text-gray-900 print:shadow-none print:p-0 print:bg-transparent">
          
          {/* Official Document Header */}
          <div className="border-b-2 border-gray-900 pb-6 mb-8 flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-black uppercase tracking-widest text-gray-900">{activeCompany?.legalName}</h2>
              <p className="text-lg text-gray-600 font-serif italic mt-1">Official Tax Export &amp; CPA Summary</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-800 uppercase">Periodo Fiscal Cerrado</p>
              <p className="text-gray-600">{selectedPeriodObj?.name}</p>
              <p className="text-gray-500 text-xs mt-1">Desde: {selectedPeriodObj?.start_date} Hasta: {selectedPeriodObj?.end_date}</p>
            </div>
          </div>

          {/* Cryptographic Proof Section */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mb-8 break-inside-avoid">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-5 h-5 text-indigo-700" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Verificación de Integridad Inmutable</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">Timestamp de Certificación</p>
                <p className="text-sm font-mono text-gray-800">{new Date(summaryData.hashTimestamp).toLocaleString()}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs font-bold text-gray-500 uppercase">SHA-256 Ledger Chain Hash (Audit Lock)</p>
                <p className="text-xs font-mono text-indigo-700 bg-indigo-50 p-2 rounded border border-indigo-100 break-all select-all">
                  {summaryData.sha256ChainResult}
                </p>
              </div>
            </div>
          </div>

          {/* Tax Categories Mapping (IRS Schedule C) */}
          <div className="mb-10 break-inside-avoid">
            <h3 className="text-lg font-bold text-gray-900 border-b border-gray-300 pb-2 mb-4 flex items-center gap-2">
              <FileType2 className="w-5 h-5 text-emerald-700" />
              Mapeo Tributario (IRS Schedule C)
            </h3>
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-700 font-bold">
                <tr>
                  <th className="py-2 px-4 border-b border-gray-200">Categoría Tributaria Asignada</th>
                  <th className="py-2 px-4 text-right border-b border-gray-200">Balance Neto Formateado ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summaryData.taxes.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 px-4 text-center text-gray-500 italic">No se hallaron cuentas categorizadas operando en este periodo</td>
                  </tr>
                )}
                {summaryData.taxes.map((t, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="py-2 px-4 text-gray-800 font-medium">{t.taxCategory}</td>
                    <td className="py-2 px-4 text-right font-mono font-medium text-gray-900">
                      {t.totalBalance >= 0 ? t.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }) : `(${Math.abs(t.totalBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Trial Balance Overview */}
          <div className="mb-10 page-break-before">
            <h3 className="text-lg font-bold text-gray-900 border-b border-gray-300 pb-2 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-700" />
              Resumen Final: Balance de Comprobación
            </h3>
            {loadTB ? <p className="text-sm text-gray-500">Cargando saldos...</p> : (
            <table className="w-full text-left text-sm mb-4">
              <thead className="text-gray-600 font-bold border-b-2 border-gray-300">
                <tr>
                  <th className="py-2 px-1">Cód.</th>
                  <th className="py-2 px-1">Cuenta</th>
                  <th className="py-2 px-1">Nat.</th>
                  <th className="py-2 px-1 text-right">Débitos</th>
                  <th className="py-2 px-1 text-right">Créditos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tbData.items.map((i: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-1 px-1 font-mono text-gray-600 text-xs">{i.code}</td>
                    <td className="py-1 px-1 text-gray-800 font-medium">{i.name}</td>
                    <td className="py-1 px-1 text-gray-500 uppercase text-xs">{i.normalBalance.substring(0,2)}</td>
                    <td className="py-1 px-1 text-right font-mono text-gray-700">
                      {i.totalDebits > 0 ? i.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                    </td>
                    <td className="py-1 px-1 text-right font-mono text-gray-700">
                      {i.totalCredits > 0 ? i.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-400 font-bold text-gray-900 bg-gray-50">
                <td colSpan={3} className="py-2 px-1 text-right">SUMAS IGUALES</td>
                <td className="py-2 px-1 text-right font-mono">{tbData.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="py-2 px-1 text-right font-mono">{tbData.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            </tfoot>
            </table>
            )}
          </div>

          {/* Legal Footer */}
          <div className="mt-16 pt-8 border-t-2 border-gray-900 text-justify text-xs text-gray-500 leading-relaxed font-serif break-inside-avoid">
            <strong>{summaryData.disclaimer.split(':')[0]}:</strong>{summaryData.disclaimer.split(':')[1]}
            <p className="mt-2 text-center uppercase tracking-widest font-bold text-gray-400">--- Fin del Documento ---</p>
          </div>
        </div>
      )}

      {/* Global CSS injected for Printing */}
      <style dangerouslySetInnerHTML={{__html:`
        @media print {
          @page { margin: 1.5cm; size: letter; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
          .page-break-before { page-break-before: always; }
          .break-inside-avoid { break-inside: avoid; }
        }
      `}} />
    </div>
  );
}
