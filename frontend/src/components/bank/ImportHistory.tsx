
import { fetchApi } from '../../lib/api';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { Database, Clock } from 'lucide-react';

export const ImportHistory: React.FC = () => {
  const activeCompany = useAuthStore((state) => state.activeCompany);

  const { data: transactions, isLoading, error } = useQuery({
    queryKey: ['bank-transactions-history', activeCompany?.id],
    queryFn: () => fetchApi(`/bank/transactions?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany?.id
  });

  if (isLoading) {
    return (
      <div className="p-12 bg-slate-900 border-2 border-slate-800 rounded-[3.5rem] flex items-center justify-center animate-pulse">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border-2 border-slate-800 rounded-[3.5rem] p-12 text-center shadow-3xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-rose-500/5 blur-[120px] pointer-events-none"></div>
        <p className="text-rose-400 font-black uppercase text-sm relative z-10">
          Error al cargar el historial
        </p>
      </div>
    );
  }

  const txs = transactions || [];

  return (
    <div className="bg-slate-900 border-2 border-slate-800 rounded-[3.5rem] shadow-3xl overflow-hidden relative">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] pointer-events-none"></div>
      
      <div className="p-10 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-indigo-600/10 rounded-2.5xl border border-indigo-500/20 flex items-center justify-center shadow-lg">
            <Database className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Registro Histórico</h3>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1 text-indigo-400">
              ÚLTIMAS 50 TRANSACCIONES INYECTADAS
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
          <div className="bg-slate-950 border-2 border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-800">
                    <th className="px-8 py-5">Fecha</th>
                    <th className="px-8 py-5">Descripción</th>
                    <th className="px-8 py-5 text-right">Monto</th>
                    <th className="px-8 py-5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {txs.map((t: any) => (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-8 py-5 text-[10px] font-black text-slate-400 font-mono tracking-tighter">
                        {new Date(t.transactionDate).toLocaleDateString()}
                      </td>
                      <td className="px-8 py-5 text-[11px] font-black text-white uppercase tracking-tighter">
                        {t.description.substring(0, 50)} {t.description.length > 50 && '...'}
                      </td>
                      <td className={`px-8 py-5 text-right font-mono font-black text-sm tracking-tighter ${t.amount < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        ${Math.abs(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className={`inline-flex px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                          t.status === 'reconciled' 
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                            : t.status === 'ignored'
                            ? 'bg-slate-800 text-slate-400 border-slate-700'
                            : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        }`}>
                          {t.status === 'reconciled' ? 'Conciliado' : t.status === 'ignored' ? 'Ignorado' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
