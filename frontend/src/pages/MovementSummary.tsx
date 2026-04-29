import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import {
  BarChart3,
  Clock,
  CheckCircle2,
  BookOpen,
  TrendingUp,
  TrendingDown,
  Minus,
  Hash,
  Landmark,
  Wallet,
  Calendar,
  Building,
  ArrowRight,
  Zap
} from 'lucide-react';
import { AutoMatchButton } from '../components/bank/AutoMatchButton';

// ── Types ─────────────────────────────────────────────────────
interface SummaryBlock {
  count: number;
  totalDebit: number;
  totalCredit: number;
  difference: number;
}

interface MovementSummaryData {
  bankPending: SummaryBlock;
  bankAssigned: SummaryBlock;
  manualEntries: SummaryBlock;
  grandTotal: {
    totalDebit: number;
    totalCredit: number;
    difference: number;
  };
  bankAccountsBalance: {
    total: number;
    accountCount: number;
    earliestPeriodStart: string | null;
  };
}

// ── View Tab type ─────────────────────────────────────────────
type ViewTab = 'bankPending' | 'bankAssigned' | 'manualEntries';

// ── Helpers ───────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DiffBadge({ value }: { value: number }) {
  const abs = Math.abs(value);
  if (Math.abs(value) < 0.005) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <Minus className="w-4 h-4" />
        ${fmt(abs)}
      </span>
    );
  }
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-blue-400">
        <TrendingUp className="w-4 h-4" />
        +${fmt(abs)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-rose-400">
      <TrendingDown className="w-4 h-4" />
      -${fmt(abs)}
    </span>
  );
}

// ── Main metric card ──────────────────────────────────────────
function MetricCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className={`bg-[#0f2240] border ${color} rounded-2xl p-6 shadow-lg flex flex-col gap-3 group hover:border-[#0071c5]/40 transition-all`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 opacity-60 group-hover:text-[#4db3ff] transition-colors" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
    </div>
  );
}

// ── Grand Total row ───────────────────────────────────────────
function GrandTotalRow({ grandTotal }: { grandTotal: MovementSummaryData['grandTotal'] }) {
  return (
    <div className="bg-[#0a1628] border border-[#0071c5]/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#0071c5]/5 blur-3xl -mr-32 -mt-32" />
      <div className="flex items-center justify-between gap-3 mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#0071c5]/20 rounded-xl border border-[#0071c5]/30 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <span className="text-sm font-black text-[#4db3ff] uppercase tracking-widest block">
              Consolidado General
            </span>
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Impacto total en el Mayor General</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative z-10">
        <div className="bg-[#0f2240]/60 rounded-2xl p-5 border border-white/7 backdrop-blur-sm">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Suma de Débitos</p>
          <p className="text-2xl font-bold text-white">${fmt(grandTotal.totalDebit)}</p>
        </div>
        <div className="bg-[#0f2240]/60 rounded-2xl p-5 border border-white/7 backdrop-blur-sm">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Suma de Créditos</p>
          <p className="text-2xl font-bold text-white">${fmt(grandTotal.totalCredit)}</p>
        </div>
        <div className="bg-[#0f2240]/60 rounded-2xl p-5 border border-white/7 backdrop-blur-sm">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Balance Neto</p>
          <p className="text-2xl font-bold"><DiffBadge value={grandTotal.difference} /></p>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export function MovementSummary() {
  const activeCompany = useAuthStore((state) => state.activeCompany);

  // Filter state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ViewTab>('bankPending');

  // Fetch helper data
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

  // Sync dates with period if selected
  useEffect(() => {
    if (selectedPeriodId && fiscalPeriods) {
      const period = (fiscalPeriods as any[]).find(p => p.id === selectedPeriodId);
      if (period) {
        setStartDate(period.startDate);
        setEndDate(period.endDate);
      }
    }
  }, [selectedPeriodId, fiscalPeriods]);

  // Build query string
  const qs = new URLSearchParams();
  if (startDate) qs.set('startDate', startDate);
  if (endDate)   qs.set('endDate', endDate);
  if (selectedBankAccountId) qs.set('bankAccountId', selectedBankAccountId);

  const { data, isLoading, error, refetch } = useQuery<{ success: boolean; data: MovementSummaryData }>({
    queryKey: ['movement-summary', activeCompany?.id, startDate, endDate, selectedBankAccountId],
    queryFn: () => fetchApi(`/movement-summary?${qs.toString()}`),
    enabled: !!activeCompany,
  });

  if (!activeCompany) return null;

  const summary = data?.data;

  // Tab definitions
  const tabs: { key: ViewTab; label: string; icon: React.ElementType; color: string; block?: SummaryBlock }[] = [
    {
      key: 'bankPending',
      label: 'Banco Pendiente',
      icon: Clock,
      color: 'border-amber-500/40 text-amber-400',
      block: summary?.bankPending,
    },
    {
      key: 'bankAssigned',
      label: 'Banco Asignado',
      icon: CheckCircle2,
      color: 'border-emerald-500/40 text-emerald-400',
      block: summary?.bankAssigned,
    },
    {
      key: 'manualEntries',
      label: 'Asientos Manuales',
      icon: BookOpen,
      color: 'border-[#0071c5]/40 text-[#0071c5]',
      block: summary?.manualEntries,
    },
  ];

  const activeTabDef = tabs.find((t) => t.key === activeTab)!;
  const block = activeTabDef.block;

  const cardColorMap: Record<ViewTab, { border: string; icon: string }> = {
    bankPending:   { border: 'border-amber-500/20',   icon: 'text-amber-400' },
    bankAssigned:  { border: 'border-emerald-500/20', icon: 'text-emerald-400' },
    manualEntries: { border: 'border-[#0071c5]/20',  icon: 'text-[#0071c5]' },
  };
  const cc = cardColorMap[activeTab];

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-10">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Análisis Operativo de Movimientos</h1>
          <p className="text-sm text-gray-400 mt-1">
            Resumen consolidado para <span className="text-[#4db3ff] font-semibold">{activeCompany.legalName}</span>
          </p>
        </div>
        
        {activeTab === 'bankPending' && block && block.count > 0 && (
          <div className="flex items-center gap-3">
             <AutoMatchButton 
                companyId={activeCompany.id} 
                bankAccountId={selectedBankAccountId || null}
                periodId={selectedPeriodId || null}
             />
          </div>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-[#0a1628] border border-white/10 rounded-2.5xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-[#0071c5]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Building className="w-3 h-3" /> Cuenta Bancaria
            </label>
            <select
              value={selectedBankAccountId}
              onChange={(e) => setSelectedBankAccountId(e.target.value)}
              className="w-full bg-[#0f2240] border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#0071c5] transition-all"
            >
              <option value="">Todas las cuentas</option>
              {(bankAccounts as any[])?.map((b) => (
                <option key={b.id} value={b.id}>{b.accountName} ({b.accountNumber.slice(-4)})</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Calendar className="w-3 h-3" /> Periodo Fiscal
            </label>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="w-full bg-[#0f2240] border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#0071c5] transition-all"
            >
              <option value="">Rango personalizado</option>
              {(fiscalPeriods as any[])?.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.status === 'open' ? 'Abierto' : 'Cerrado'})</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setSelectedPeriodId(''); }}
              className="w-full bg-[#0f2240] border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#0071c5] transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">Hasta</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setSelectedPeriodId(''); }}
                className="w-full bg-[#0f2240] border border-white/10 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#0071c5] transition-all"
              />
              <button
                onClick={() => refetch()}
                className="p-2.5 bg-[#0071c5]/10 border border-[#0071c5]/30 rounded-xl text-[#4db3ff] hover:bg-[#0071c5]/20 transition-all shadow-lg shadow-blue-900/20"
                title="Refrescar"
              >
                <Zap className="w-4 h-4 fill-current" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Saldo Inicial de Cuentas Bancarias ── */}
      {summary?.bankAccountsBalance && (
        <div className="bg-[#0f2240] border border-emerald-500/20 rounded-2.5xl p-6 flex flex-wrap items-center gap-6 shadow-xl relative group">
          <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2.5xl" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-110 transition-transform">
              <Landmark className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Base de Conciliación (Saldo Inicial)</p>
              <p className="text-xs text-slate-400 font-medium">
                {selectedBankAccountId 
                  ? `Cuenta seleccionada: ${summary.bankAccountsBalance.total === 0 ? 'Sin saldo inicial' : 'Verificado'}`
                  : `${summary.bankAccountsBalance.accountCount} cuentas bancarias activas`
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto relative z-10">
            <div className="text-right mr-2 hidden sm:block">
              <p className="text-[10px] font-black text-emerald-500/50 uppercase tracking-[0.2em]">Caudal Disponible</p>
              <p className="text-[9px] text-slate-500 uppercase">Integridad Verificada</p>
            </div>
            <div className="px-6 py-3 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
              <span className="text-3xl font-black text-emerald-400 tracking-tighter">${fmt(summary.bankAccountsBalance.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── View tabs ── */}
      <div className="flex gap-2 p-1.5 bg-[#0a1628]/80 border border-white/7 rounded-2xl w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-3 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                isActive
                  ? `bg-[#0f2240] text-white shadow-xl border border-white/10`
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? tab.color.split(' ')[1] : 'text-gray-500'}`} />
              {tab.label}
              {tab.block && tab.block.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${isActive ? 'bg-[#0071c5] text-white' : 'bg-slate-800 text-slate-400'}`}>
                  {tab.block.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Main block ── */}
      {isLoading ? (
        <div className="h-64 flex items-center justify-center bg-[#0a1628]/50 border border-white/5 rounded-3xl">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0071c5] shadow-lg shadow-blue-900/20" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest animate-pulse">Sincronizando Métricas...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-3xl p-12 text-center shadow-2xl">
          <Landmark className="w-12 h-12 text-rose-500/20 mx-auto mb-4" />
          <p className="text-rose-400 font-black uppercase text-sm tracking-widest">
            Falla en el Motor de Análisis
          </p>
          <p className="text-slate-500 text-xs mt-2 max-w-md mx-auto">{(error as Error).message}</p>
          <button onClick={() => refetch()} className="mt-6 px-6 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-xs font-black uppercase tracking-widest rounded-xl border border-rose-500/30 transition-all">
            Reintentar Conexión
          </button>
        </div>
      ) : block ? (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-[#0f2240] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600/20" />
             
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
               <div className="flex items-center gap-4">
                 <div className={`p-4 rounded-2xl ${activeTab === 'bankPending' ? 'bg-amber-500/10 border-amber-500/20' : activeTab === 'bankAssigned' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-blue-500/10 border-blue-500/20'} border shadow-inner`}>
                   <activeTabDef.icon className={`w-8 h-8 ${cc.icon}`} />
                 </div>
                 <div>
                   <h2 className="text-xl font-bold text-white tracking-tight">{activeTabDef.label}</h2>
                   <p className="text-xs text-gray-400 mt-0.5">Distribución de flujos monetarios en el periodo</p>
                 </div>
               </div>

               {activeTab === 'bankPending' && block.count > 0 && (
                 <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-center gap-4">
                   <p className="text-xs text-amber-200/70 max-w-[200px] leading-tight">
                     Tienes <strong>{block.count}</strong> transacciones sin reconciliar. Ejecuta el motor para resolverlas.
                   </p>
                   <ArrowRight className="w-4 h-4 text-amber-500 animate-pulse" />
                 </div>
               )}
             </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                label="Transacciones"
                value={block.count.toLocaleString()}
                color={`border-white/5`}
                icon={Hash}
              />
              <MetricCard
                label="Entradas (Débito)"
                value={<span className="text-blue-400">${fmt(block.totalDebit)}</span>}
                color={`border-blue-500/10`}
                icon={TrendingUp}
              />
              <MetricCard
                label="Salidas (Haber)"
                value={<span className="text-purple-400">${fmt(block.totalCredit)}</span>}
                color={`border-purple-500/10`}
                icon={TrendingDown}
              />
              <MetricCard
                label="Diferencia Neta"
                value={<DiffBadge value={block.difference} />}
                color={`border-white/5`}
                icon={Minus}
              />
            </div>
          </div>

          {/* ── Grand Total ── */}
          {summary && <GrandTotalRow grandTotal={summary.grandTotal} />}
        </div>
      ) : null}
    </div>
  );
}
