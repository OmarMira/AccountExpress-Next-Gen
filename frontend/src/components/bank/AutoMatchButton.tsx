import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../../lib/api';
import { Zap } from 'lucide-react';

interface AutoMatchButtonProps {
  bankAccountId: string | null;
  periodId: string | null;
}

export const AutoMatchButton: React.FC<AutoMatchButtonProps> = ({ bankAccountId, periodId }) => {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  if (!bankAccountId || !periodId) return null;

  const handleAutoMatch = async () => {
    setLoading(true);
    try {
      const res = await fetchApi('/bank/auto-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bankAccountId, periodId }),
      });
      
      if (res.matchesFound === 0 && res.totalPending > 0) {
        window.alert(`Automatch completado: 0 conciliadas de ${Math.max(res.totalPending, 0)} pendientes`);
      } else if (res.totalPending === 0 && res.matchesFound > 0) {
        window.alert('Automatch completado: Se resolvieron todas las transacciones pendientes.');
      } else if (res.totalPending === 0 && res.matchesFound === 0) {
        window.alert('Automatch finalizado. No hay transacciones pendientes.');
      } else {
        window.alert(`Automatch completado: ${res.matchesFound} conciliadas de ${res.totalPending} pendientes`);
      }
      
      // Invalidate queries so tables refresh
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-history'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    } catch (err: any) {
      window.alert(err.message || 'Error al ejecutar automatch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleAutoMatch}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-60"
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <Zap className="w-4 h-4" />
      )}
      {loading ? 'Conciliando...' : 'Conciliar Automáticamente'}
    </button>
  );
};
