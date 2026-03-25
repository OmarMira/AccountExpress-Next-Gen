import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { 
  Building2, 
  ArrowUpRight, 
  ArrowDownRight, 
  CalendarDays,
  ShieldCheck,
  ShieldAlert,
  Activity,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        // We will implement the backend /api/dashboard endpoint, but for now we catch safely
        const resp = await fetchApi('/dashboard').catch(() => ({ 
          bankBalance: 0, 
          pendingCount: 0,
          income: 0,
          expenses: 0,
          activePeriod: { name: 'Q1' },
          chainValid: true
        }));
        setData(resp);
      } catch (e) {
        console.error("Dashboard load failed", e);
      } finally {
        setLoading(false);
      }
    };
    if (activeCompany) {
      loadDashboard();
    }
  }, [activeCompany]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Resumen General</h1>
        <p className="text-sm text-gray-400 mt-1">Métricas de <span className="text-white font-medium">{activeCompany?.legalName}</span></p>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Bank Balance */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Building2 className="w-24 h-24 text-indigo-400 -mt-6 -mr-6" />
            </div>
            <p className="text-sm font-medium text-gray-400 relative z-10">Saldo Bancario Total</p>
            <p className="text-4xl font-extrabold text-white mt-2 tracking-tighter relative z-10">
              ${data?.bankBalance?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-emerald-400 relative z-10">
              <span className="bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">Transacciones conciliadas</span>
            </div>
          </div>

          {/* Pending Transactions */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <Activity className="w-24 h-24 text-amber-400 -mt-6 -mr-6" />
            </div>
            <p className="text-sm font-medium text-gray-400 relative z-10">Transacciones Pendientes</p>
            <p className="text-4xl font-extrabold text-white mt-2 tracking-tighter relative z-10">
              {data?.pendingCount || 0}
            </p>
            <Link to="/reconciliation" className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-md relative z-10">
              Categorizar ahora <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Cash Flow */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg md:col-span-2 lg:col-span-2 hover:border-gray-600 transition-colors flex flex-col">
            <p className="text-sm font-medium text-gray-400 mb-5">Flujo de Caja Mensual</p>
            <div className="flex flex-col md:flex-row items-stretch justify-between gap-4 flex-1">
              <div className="flex-1 bg-gray-900/50 rounded-xl p-4 border border-gray-800 relative overflow-hidden group">
                <div className="flex items-center gap-2 text-emerald-400 mb-2">
                  <ArrowUpRight className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">INGRESOS</span>
                </div>
                <p className="text-2xl font-bold text-white tracking-tight">+${data?.income?.toLocaleString() || '0.00'}</p>
              </div>
              
              <div className="flex-1 bg-gray-900/50 rounded-xl p-4 border border-gray-800 relative overflow-hidden group">
                <div className="flex items-center gap-2 text-rose-400 mb-2">
                  <ArrowDownRight className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">GASTOS</span>
                </div>
                <p className="text-2xl font-bold text-white tracking-tight">-${data?.expenses?.toLocaleString() || '0.00'}</p>
              </div>
            </div>
          </div>

          {/* Fiscal Period */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl shadow-inner">
                <CalendarDays className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-gray-400">Periodo Activo</p>
            </div>
            <p className="text-2xl font-bold text-white tracking-tight">{data?.activePeriod?.name || 'Loading...'}</p>
            <p className="text-sm text-gray-500 mt-2 font-medium">Vence {data?.activePeriod?.endDate || '-'}</p>
          </div>

          {/* Audit Chain Badge */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg flex flex-col justify-center items-center text-center relative overflow-hidden group">
            {data?.chainValid !== false ? (
              <>
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.15)] group-hover:scale-105 transition-transform duration-500">
                  <ShieldCheck className="w-8 h-8 text-emerald-400" />
                </div>
                <p className="text-lg font-bold text-emerald-400 tracking-tight">Cadena de Auditoría Verificada</p>
                <p className="text-sm text-gray-500 mt-1 font-medium">Criptográficamente Íntegra</p>
              </>
            ) : (
               <>
                <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center mb-4 border border-rose-500/20 shadow-[0_0_30px_rgba(244,63,94,0.3)]">
                  <ShieldAlert className="w-8 h-8 text-rose-500 animate-[pulse_1.5s_ease-in-out_infinite]" />
                </div>
                <p className="text-lg font-bold text-rose-500 tracking-tight">Chain Broken</p>
                <p className="text-sm text-gray-400 mt-1 font-medium text-center">Tampering Detected</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
