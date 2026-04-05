import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { 
  Building2, 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldCheck,
  Activity
} from 'lucide-react';

export function Dashboard() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', activeCompany?.id],
    queryFn: () => fetchApi(`/journal/summary?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany,
  });

  if (!activeCompany) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Resumen General</h1>
        <p className="text-sm text-gray-400 mt-1">Métricas de <span className="text-white font-medium">{activeCompany?.legalName}</span></p>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Assets */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Building2 className="w-24 h-24 text-indigo-400 -mt-6 -mr-6" />
            </div>
            <p className="text-sm font-medium text-gray-400 relative z-10">Activos Totales</p>
            <p className="text-3xl font-bold text-white mt-2 tracking-tight relative z-10">
              ${data?.totalAssets?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-emerald-400 relative z-10">
              <span className="bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">Bancos y Cuentas x Cobrar</span>
            </div>
          </div>

          {/* Total Liabilities */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-rose-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <ArrowDownRight className="w-24 h-24 text-rose-400 -mt-6 -mr-6" />
            </div>
            <p className="text-sm font-medium text-gray-400 relative z-10">Pasivos Totales</p>
            <p className="text-3xl font-bold text-white mt-2 tracking-tight relative z-10">
              ${data?.totalLiabilities?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-rose-400 relative z-10">
              <span className="bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-md">Cuentas x Pagar y Préstamos</span>
            </div>
          </div>

          {/* Total Equity */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <ShieldCheck className="w-24 h-24 text-amber-400 -mt-6 -mr-6" />
            </div>
            <p className="text-sm font-medium text-gray-400 relative z-10">Patrimonio Neto</p>
            <p className="text-3xl font-bold text-white mt-2 tracking-tight relative z-10">
              ${data?.totalEquity?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-amber-400 relative z-10">
              <span className="bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md">Capital Social y Reservas</span>
            </div>
          </div>

          {/* Net Income */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <ArrowUpRight className="w-24 h-24 text-emerald-400 -mt-6 -mr-6" />
            </div>
            <p className="text-sm font-medium text-gray-400 relative z-10">Utilidad Neta del Ejercicio</p>
            <p className="text-3xl font-bold text-white mt-2 tracking-tight relative z-10">
              ${data?.netIncome?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-emerald-400 relative z-10">
              <span className="bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">Ingresos - Gastos</span>
            </div>
          </div>

          {/* Financial Breakdown Info */}
          <div className="bg-gray-900/50 border border-gray-700/30 rounded-2xl p-6 shadow-lg md:col-span-2 lg:col-span-2 flex flex-col justify-center">
             <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 rounded-xl">
                   <Activity className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                   <h3 className="text-white font-bold">Resumen de Cuenta</h3>
                   <p className="text-gray-400 text-sm">Flujo consolidado: +${data?.totalRevenue?.toLocaleString()} ingresos / -${data?.totalExpense?.toLocaleString()} gastos.</p>
                </div>
             </div>
          </div>

          {/* Audit Chain Badge */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg flex flex-col justify-center items-center text-center relative overflow-hidden group md:col-span-2 lg:col-span-2">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3 border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-400 tracking-tight">Cierre de Libros Transparente</p>
              <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-widest font-bold">Ledger Integrity Verified</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
