import { useState } from 'react';
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
} from 'lucide-react';

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
    <div className={`bg-gray-800 border ${color} rounded-2xl p-6 shadow-lg flex flex-col gap-3`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 opacity-60" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
    </div>
  );
}

// ── Grand Total row ───────────────────────────────────────────
function GrandTotalRow({ grandTotal }: { grandTotal: MovementSummaryData['grandTotal'] }) {
  return (
    <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 bg-indigo-600/20 rounded-xl border border-indigo-500/30 flex items-center justify-center">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
        </div>
        <span className="text-sm font-black text-indigo-300 uppercase tracking-widest">
          Gran Total — Las 3 fuentes combinadas
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Debe</p>
          <p className="text-xl font-bold text-white">${fmt(grandTotal.totalDebit)}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Haber</p>
          <p className="text-xl font-bold text-white">${fmt(grandTotal.totalCredit)}</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Diferencia Neta</p>
          <p className="text-xl font-bold"><DiffBadge value={grandTotal.difference} /></p>
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
  const [activeTab, setActiveTab] = useState<ViewTab>('bankPending');

  // Build query string
  const qs = new URLSearchParams();
  if (startDate) qs.set('startDate', startDate);
  if (endDate)   qs.set('endDate', endDate);

  const { data, isLoading, error, refetch } = useQuery<{ success: boolean; data: MovementSummaryData }>({
    queryKey: ['movement-summary', activeCompany?.id, startDate, endDate],
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
      color: 'border-indigo-500/40 text-indigo-400',
      block: summary?.manualEntries,
    },
  ];

  const activeTabDef = tabs.find((t) => t.key === activeTab)!;
  const block = activeTabDef.block;

  const cardColorMap: Record<ViewTab, { border: string; icon: string }> = {
    bankPending:   { border: 'border-amber-500/20',   icon: 'text-amber-400' },
    bankAssigned:  { border: 'border-emerald-500/20', icon: 'text-emerald-400' },
    manualEntries: { border: 'border-indigo-500/20',  icon: 'text-indigo-400' },
  };
  const cc = cardColorMap[activeTab];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Resumen de Movimientos</h1>
        <p className="text-sm text-gray-400 mt-1">
          Totales consolidados de{' '}
          <span className="text-white font-medium">{activeCompany.legalName}</span>
        </p>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-5 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Desde</label>
          <input
            id="movement-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hasta</label>
          <input
            id="movement-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <button
          id="movement-clear-dates"
          onClick={() => { setStartDate(''); setEndDate(''); }}
          className="text-xs font-bold text-slate-400 hover:text-white uppercase tracking-widest px-4 py-2 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors"
        >
          Todo el período
        </button>
        <button
          id="movement-refresh"
          onClick={() => refetch()}
          className="ml-auto text-xs font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest px-4 py-2 rounded-xl border border-indigo-500/30 hover:border-indigo-500/60 bg-indigo-500/5 transition-colors"
        >
          Actualizar
        </button>
      </div>

      {/* ── Saldo Inicial de Cuentas Bancarias ── */}
      {summary?.bankAccountsBalance && (
        <div className="bg-gray-800 border border-emerald-500/20 rounded-2xl p-5 flex flex-wrap items-center gap-6 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Landmark className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Saldo Inicial Registrado</p>
              <p className="text-xs text-slate-400">
                {summary.bankAccountsBalance.earliestPeriodStart
                  ? `Inicio del período: ${summary.bankAccountsBalance.earliestPeriodStart}`
                  : `${summary.bankAccountsBalance.accountCount} cuenta${summary.bankAccountsBalance.accountCount !== 1 ? 's' : ''} bancaria${summary.bankAccountsBalance.accountCount !== 1 ? 's' : ''} activa${summary.bankAccountsBalance.accountCount !== 1 ? 's' : ''}`
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Wallet className="w-4 h-4 text-emerald-400 opacity-60" />
            <span className="text-2xl font-bold text-emerald-400">${fmt(summary.bankAccountsBalance.total)}</span>
          </div>
        </div>
      )}

      {/* ── View tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              id={`movement-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                isActive
                  ? `${tab.color} bg-slate-800 border-current shadow-lg`
                  : 'text-gray-500 border-gray-700 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Main block ── */}
      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
        </div>
      ) : error ? (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-8 text-center">
          <p className="text-rose-400 font-black uppercase text-sm tracking-widest">
            Error al cargar el resumen
          </p>
          <p className="text-slate-500 text-xs mt-2">{(error as Error).message}</p>
        </div>
      ) : block ? (
        <div className="bg-gray-800 border border-gray-700/50 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-6">
            <activeTabDef.icon className={`w-5 h-5 ${cc.icon}`} />
            <span className="text-sm font-black text-white uppercase tracking-widest">
              {activeTabDef.label}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              label="Transacciones"
              value={block.count.toLocaleString()}
              color={`border-gray-700/50`}
              icon={Hash}
            />
            <MetricCard
              label="Total Debe"
              value={<span className="text-blue-400">${fmt(block.totalDebit)}</span>}
              color={`border-blue-500/20`}
              icon={TrendingUp}
            />
            <MetricCard
              label="Total Haber"
              value={<span className="text-purple-400">${fmt(block.totalCredit)}</span>}
              color={`border-purple-500/20`}
              icon={TrendingDown}
            />
            <MetricCard
              label="Diferencia"
              value={<DiffBadge value={block.difference} />}
              color={`border-slate-700/50`}
              icon={Minus}
            />
          </div>
        </div>
      ) : null}

      {/* ── Grand Total ── */}
      {summary && <GrandTotalRow grandTotal={summary.grandTotal} />}
    </div>
  );
}
