import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchApi } from '../../lib/api';
import { Zap, CheckCircle2, AlertCircle, X, Calendar, Plus, Play, ShieldAlert, GripVertical } from 'lucide-react';

interface AutoMatchButtonProps {
  companyId: string | null;
  bankAccountId: string | null;
  periodId: string | null;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export const AutoMatchButton: React.FC<AutoMatchButtonProps> = ({ companyId, bankAccountId, periodId }) => {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [results, setResults] = useState<{ matched: number; crossed: number; pending: number; errors: any[] } | null>(null);

  const queryClient = useQueryClient();


  // Dragging State
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number, startY: number, startPosX: number, startPosY: number } | null>(null);

  // Period Form State
  const [newPeriod, setNewPeriod] = useState({
    name: '',
    startDate: '',
    endDate: '',
    periodType: 'monthly'
  });

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Reset position when modal opens
  useEffect(() => {
    if (showPeriodModal) {
      setPosition({ x: 0, y: 0 });
    }
  }, [showPeriodModal]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      
      setPosition({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position]);

  const openPeriodMutation = useMutation({
    mutationFn: async (cid: string) => {
      if (!cid) {
        throw new Error('No se pudo determinar la empresa activa. Por favor, recarga la página.');
      }
      return fetchApi('/fiscal-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          companyId: cid, 
          ...newPeriod 
        })
      });
    },
    onSuccess: () => {
      setToast({ message: 'Periodo fiscal abierto exitosamente.', type: 'success' });
      setShowPeriodModal(false);
      queryClient.invalidateQueries({ queryKey: ['open-periods'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] });
    },
    onError: (err: any) => setToast({ message: `Error: ${err.message}`, type: 'error' })
  });

  const handleAutoMatch = async () => {
    if (!bankAccountId) {
      setToast({ message: 'No se detectó una cuenta bancaria vinculada a estas transacciones.', type: 'error' });
      return;
    }
    if (!periodId) {
      setShowPeriodModal(true);
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetchApi('/bank/auto-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bankAccountId, periodId }),
      });
      
      setResults(res);
      
      if (res.matched === 0 && res.errors.length === 0 && res.pending === 0) {
        setToast({ message: 'No hay transacciones pendientes para conciliar.', type: 'info' });
      }

      
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-history'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    } catch (err: any) {
      setToast({ message: err.message || 'Error al ejecutar el proceso de conciliación.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const modalContent = showPeriodModal ? (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto">
      <div 
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        className={`
          bg-[#1e293b] border border-slate-700/50 rounded-[2.5rem] shadow-[0_20px_70px_-15px_rgba(0,0,0,0.8),0_0_50px_-12px_rgba(79,70,229,0.3)] 
          w-full max-w-lg overflow-hidden transition-shadow duration-300
          ${isDragging ? 'shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9),0_0_70px_-10px_rgba(79,70,229,0.5)] cursor-grabbing' : ''}
        `}
      >
        {/* Draggable Header */}
        <div 
          onMouseDown={handleMouseDown}
          className="p-8 border-b border-slate-700/50 bg-slate-800/40 flex items-center justify-between relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
        >
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-2xl border border-indigo-500/30 flex items-center justify-center shadow-inner">
              <ShieldAlert className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Periodo Fiscal Requerido</h3>
              <div className="flex items-center gap-2">
                <GripVertical className="w-3 h-3 text-indigo-500/50" />
                <p className="text-[10px] font-bold text-indigo-400/80 uppercase tracking-widest">Panel Movible de Validación</p>
              </div>
            </div>
          </div>
          <button 
            onClick={() => setShowPeriodModal(false)} 
            onMouseDown={(e) => e.stopPropagation()}
            className="w-10 h-10 rounded-full bg-slate-900/50 flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-700/50 transition-all border border-slate-700/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="bg-slate-900/60 border border-slate-700/50 p-5 rounded-3xl relative">
            <div className="absolute -top-3 left-6 px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-[9px] font-black text-slate-400 uppercase tracking-widest">Aviso Contable</div>
            <p className="text-sm text-slate-300 leading-relaxed font-medium">
              El sistema no detectó un **Periodo Fiscal Abierto**. Por seguridad, las conciliaciones deben registrarse en un periodo válido.
            </p>
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Configurar Periodo Operativo</h4>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-5">
                <div className="group">
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 ml-1 transition-colors group-focus-within:text-indigo-400">Nombre del Periodo</label>
                  <input
                    type="text"
                    placeholder="Ej: Abril 2026"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl px-5 py-4 text-white text-sm focus:border-indigo-500 focus:bg-slate-950 outline-none transition-all shadow-inner"
                    value={newPeriod.name}
                    onChange={e => setNewPeriod({...newPeriod, name: e.target.value})}
                  />
                </div>
                <div className="group">
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 ml-1 transition-colors group-focus-within:text-indigo-400">Tipo de Periodo</label>
                  <select
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl px-5 py-4 text-white text-sm focus:border-indigo-500 focus:bg-slate-950 outline-none transition-all shadow-inner appearance-none"
                    value={newPeriod.periodType}
                    onChange={e => setNewPeriod({...newPeriod, periodType: e.target.value})}
                  >
                    <option value="monthly">Mensual</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="annual">Anual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="group">
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 ml-1 transition-colors group-focus-within:text-indigo-400">Fecha de Inicio</label>
                  <input
                    type="date"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl px-5 py-4 text-white text-sm focus:border-indigo-500 focus:bg-slate-950 outline-none transition-all shadow-inner"
                    value={newPeriod.startDate}
                    onChange={e => setNewPeriod({...newPeriod, startDate: e.target.value})}
                  />
                </div>
                <div className="group">
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5 ml-1 transition-colors group-focus-within:text-indigo-400">Fecha de Fin</label>
                  <input
                    type="date"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl px-5 py-4 text-white text-sm focus:border-indigo-500 focus:bg-slate-950 outline-none transition-all shadow-inner"
                    value={newPeriod.endDate}
                    onChange={e => setNewPeriod({...newPeriod, endDate: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 bg-slate-900/30 border-t border-slate-700/50 flex flex-col gap-4">
          <button
            onClick={() => {
              if (companyId) {
                openPeriodMutation.mutate(companyId);
              } else {
                setToast({ message: 'Error: ID de empresa no encontrado.', type: 'error' });
              }
            }}
            disabled={openPeriodMutation.isPending || !newPeriod.name || !newPeriod.startDate || !newPeriod.endDate}
            className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-black uppercase text-xs tracking-[0.2em] rounded-[1.25rem] shadow-xl shadow-indigo-600/20 hover:shadow-indigo-500/40 transition-all flex items-center justify-center gap-3 active:scale-95"
          >
            {openPeriodMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            {openPeriodMutation.isPending ? 'Procesando...' : 'Activar y Conciliar'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={handleAutoMatch}
        disabled={loading}
        className={`
          group relative flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300
          ${loading 
            ? 'bg-slate-800 text-slate-500 cursor-wait' 
            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5'
          }
        `}
      >
        <div className="absolute inset-0 bg-white/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
        
        {loading ? (
          <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
        ) : (
          <Zap className={`w-4 h-4 transition-transform duration-500 ${loading ? '' : 'group-hover:scale-125 group-hover:rotate-12'}`} />
        )}
        
        <span className="relative z-10">
          {loading ? 'Procesando Reglas...' : 'Conciliación Automática'}
        </span>
      </button>

      {/* Portal for Modal and Toast - Ensures they are at the root and overcomes z-index issues */}
      {createPortal(
        <>
          {modalContent}
          
          {results && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
              <div className="bg-[#0f2240] border border-white/10 rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-[#0a1628]/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                      <Zap className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white tracking-tight">Resumen de Conciliación</h3>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Motor de Auto-Match Finalizado</p>
                    </div>
                  </div>
                  <button onClick={() => setResults(null)} className="p-3 hover:bg-white/5 rounded-2xl transition-colors">
                    <X className="w-6 h-6 text-gray-400" />
                  </button>
                </div>

                <div className="p-8 overflow-y-auto space-y-8">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-5 rounded-3xl text-center">
                      <p className="text-[10px] font-black text-emerald-500/50 uppercase tracking-widest mb-1">Conciliadas</p>
                      <p className="text-3xl font-black text-emerald-400">{results.matched}</p>
                    </div>
                    <div className="bg-blue-500/5 border border-blue-500/10 p-5 rounded-3xl text-center">
                      <p className="text-[10px] font-black text-blue-500/50 uppercase tracking-widest mb-1">Cruzadas</p>
                      <p className="text-3xl font-black text-blue-400">{results.crossed}</p>
                    </div>
                    <div className="bg-rose-500/5 border border-rose-500/10 p-5 rounded-3xl text-center">
                      <p className="text-[10px] font-black text-rose-500/50 uppercase tracking-widest mb-1">Fallidas</p>
                      <p className="text-3xl font-black text-rose-400">{results.errors.length}</p>
                    </div>
                    <div className="bg-slate-500/5 border border-white/5 p-5 rounded-3xl text-center">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Pendientes</p>
                      <p className="text-3xl font-black text-gray-400">{results.pending}</p>
                    </div>
                  </div>


                  {/* Detailed Errors */}
                  {results.errors.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                        Detalle de Excepciones ({results.errors.length})
                      </h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {results.errors.map((err, i) => (
                          <div key={i} className="bg-slate-900/50 border border-white/5 p-4 rounded-2xl flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-bold text-gray-300">ID: {err.transactionId || 'N/A'}</p>
                              <p className="text-[10px] text-rose-400/80 mt-0.5">{err.reason}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(results.matched > 0 || results.crossed > 0) && (
                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-6 rounded-3xl flex items-center gap-4">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      <p className="text-sm text-emerald-200/80 leading-relaxed font-medium">
                        Se han procesado **{results.matched + results.crossed}** transacciones exitosamente. El Libro Mayor y los auxiliares bancarios han sido actualizados en tiempo real.
                      </p>
                    </div>
                  )}

                </div>

                <div className="p-8 border-t border-white/5 bg-[#0a1628]/30 flex justify-end">
                  <button
                    onClick={() => setResults(null)}
                    className="px-8 py-3 bg-[#0071c5] hover:bg-[#005fa3] text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-[#0071c5]/20"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </div>
          )}

          {modalContent}

          {toast && (
            <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[1000000] animate-in fade-in slide-in-from-top-10 duration-500 w-full max-w-xl px-4">
              <div className={`
                flex items-center gap-6 px-10 py-6 rounded-[2.5rem] border shadow-[0_30px_90px_-20px_rgba(0,0,0,0.7)] backdrop-blur-3xl
                ${toast.type === 'success' ? 'bg-emerald-600 border-emerald-400/50 text-white' : 
                  toast.type === 'error' ? 'bg-rose-600 border-rose-400/50 text-white' : 
                  'bg-indigo-600 border-indigo-400/50 text-white'}
              `}>
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner shrink-0">
                  {toast.type === 'success' && <CheckCircle2 className="w-8 h-8 text-white" />}
                  {toast.type === 'error' && <AlertCircle className="w-8 h-8 text-white" />}
                  {toast.type === 'info' && <Zap className="w-8 h-8 text-white" />}
                </div>
                
                <div className="flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Sistema AccountExpress</p>
                  <p className="text-base font-black leading-tight tracking-tight">{toast.message}</p>
                </div>
                
                <button 
                  onClick={() => setToast(null)}
                  className="w-12 h-12 rounded-full hover:bg-white/10 flex items-center justify-center transition-all text-white/50 hover:text-white border border-white/10"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </>
  );
};
