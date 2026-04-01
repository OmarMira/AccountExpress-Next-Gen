
import { fetchApi } from '../../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { Database, Clock, ChevronDown } from 'lucide-react';

export const ImportHistory: React.FC = () => {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();


  const { data: transactions, isLoading, error } = useQuery({
    queryKey: ['bank-transactions-history', activeCompany?.id],
    queryFn: () => fetchApi(`/bank/transactions?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany?.id
  });

  const { data: glAccountsData } = useQuery({
    queryKey: ['gl-accounts', activeCompany?.id],
    queryFn: () => fetchApi(`/gl-accounts?companyId=${activeCompany?.id}`),
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
                    : t.status === 'assigned' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : t.status === 'ignored' ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  }`}>
                    {t.status === 'reconciled' ? 'Conciliado' : t.status === 'assigned' ? 'Asignado' : t.status === 'ignored' ? 'Ignorado' : 'Pendiente'}
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
                <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
                  Pendientes de asignación ({pending.length})
                </h4>
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
    </div>
  );
};
