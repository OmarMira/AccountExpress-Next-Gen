import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { 
  Building2, 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldCheck,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Landmark
} from 'lucide-react';

interface DashboardAlert {
  pendingCount: number;
  chainValid: boolean;
  activePeriod: {
    name: string;
    endDate: string;
  };
}

function getDaysUntil(dateStr: string): number | null {
  if (!dateStr || dateStr === 'N/A') return null;
  const end = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function Dashboard() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  
  // Métricas contables (journal summary)
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', activeCompany?.id],
    queryFn: () => fetchApi(`/journal/summary?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany,
  });

  // Alertas operativas (dashboard endpoint)
  const { data: alertData, isLoading: isLoadingAlerts } = useQuery<{ success: boolean; data: DashboardAlert }>({
    queryKey: ['dashboard-alerts', activeCompany?.id],
    queryFn: () => fetchApi(`/dashboard?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany,
    refetchInterval: 60_000, // refetch every 60s
  });

  if (!activeCompany) return null;

  const alerts = alertData?.data;
  const daysLeft = alerts?.activePeriod?.endDate ? getDaysUntil(alerts.activePeriod.endDate) : null;

  // Build alert list
  const activeAlerts: { type: 'error' | 'warning' | 'info'; message: string; icon: React.ElementType }[] = [];

  if (alerts) {
    if (!alerts.chainValid) {
      activeAlerts.push({
        type: 'error',
        message: 'Cadena de auditoría comprometida — revisar el registro de asientos de inmediato.',
        icon: XCircle,
      });
    }
    if (alerts.pendingCount > 0) {
      activeAlerts.push({
        type: 'warning',
        message: `${alerts.pendingCount} transacción${alerts.pendingCount > 1 ? 'es' : ''} bancaria${alerts.pendingCount > 1 ? 's' : ''} pendiente${alerts.pendingCount > 1 ? 's' : ''} de categorizar.`,
        icon: Landmark,
      });
    }
    if (daysLeft !== null && daysLeft <= 10 && daysLeft >= 0) {
      activeAlerts.push({
        type: daysLeft <= 3 ? 'error' : 'warning',
        message: `El período fiscal "${alerts.activePeriod.name}" vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}.`,
        icon: Clock,
      });
    }
    if (daysLeft !== null && daysLeft < 0) {
      activeAlerts.push({
        type: 'error',
        message: `El período fiscal "${alerts.activePeriod.name}" venció hace ${Math.abs(daysLeft)} día${Math.abs(daysLeft) !== 1 ? 's' : ''}. Se requiere cierre.`,
        icon: Clock,
      });
    }
  }

  const alertStyles = {
    error:   { container: 'bg-rose-500/10 border-rose-500/30 text-rose-400',   icon: 'text-rose-400' },
    warning: { container: 'bg-amber-500/10 border-amber-500/30 text-amber-300', icon: 'text-amber-400' },
    info:    { container: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300', icon: 'text-indigo-400' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Resumen General</h1>
        <p className="text-sm text-gray-400 mt-1">Métricas de <span className="text-white font-medium">{activeCompany?.legalName}</span></p>
      </div>

      {/* ── ALERTAS OPERATIVAS ── */}
      {!isLoadingAlerts && (
        <div className="space-y-2">
          {activeAlerts.length === 0 ? (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-sm font-medium text-emerald-400">Todo en orden — sin alertas pendientes.</p>
            </div>
          ) : (
            activeAlerts.map((alert, i) => {
              const Icon = alert.icon;
              const style = alertStyles[alert.type];
              return (
                <div key={i} className={`flex items-center gap-3 border rounded-xl px-4 py-3 ${style.container}`}>
                  <Icon className={`w-4 h-4 shrink-0 ${style.icon}`} />
                  <p className="text-sm font-medium">{alert.message}</p>
                </div>
              );
            })
          )}
        </div>
      )}

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

          {/* Período Activo */}
          <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg flex flex-col justify-center items-center text-center relative overflow-hidden group md:col-span-2 lg:col-span-2">
            {alerts?.activePeriod?.name && alerts.activePeriod.name !== 'No open period' ? (
              <>
                <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center mb-3 border border-indigo-500/20">
                  <Clock className="w-6 h-6 text-indigo-400" />
                </div>
                <p className="text-lg font-bold text-white tracking-tight">{alerts.activePeriod.name}</p>
                <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-widest font-bold">
                  Período Fiscal Activo · Cierre: {alerts.activePeriod.endDate}
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3 border border-emerald-500/20">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <p className="text-lg font-bold text-emerald-400 tracking-tight">Cierre de Libros Transparente</p>
                <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-widest font-bold">Ledger Integrity Verified</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
