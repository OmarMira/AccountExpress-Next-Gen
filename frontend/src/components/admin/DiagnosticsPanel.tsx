import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  CheckCircle2, 
  Wrench, 
  PlayCircle,
  AlertTriangle,
  RefreshCcw,
  Database,
  History,
  Lock,
  UserPlus,
  Settings,
  MousePointer2,
  HardDrive
} from 'lucide-react';
import { fetchApi } from '../../lib/api';

interface DiagnosticItem {
  id: string;
  name: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
  canRepair: boolean;
}

const DiagnosticsPanel: React.FC = () => {
  const [items, setItems] = useState<DiagnosticItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [repairingId, setRepairingId] = useState<string | null>(null);
  const [isGlobalRepairing, setIsGlobalRepairing] = useState(false);
  const [showConfirm, setShowConfirm] = useState<{ id: string; name: string } | null>(null);
  const [notification, setNotification] = useState<{ title: string; message: string; type: 'success' | 'error' } | null>(null);

  const fetchDiagnostics = async () => {
    try {
      setLoading(true);
      const data = await fetchApi('/diagnostics/check');
      if (data && data.success) {
        setItems(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch diagnostics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const handleRepair = async (id: string) => {
    try {
      setRepairingId(id);
      const data = await fetchApi(`/diagnostics/repair/${id}`, { method: 'POST' });
      if (data && data.success) {
        setNotification({ title: 'Éxito', message: data.message || 'Reparación completada.', type: 'success' });
        await fetchDiagnostics();
      } else {
        setNotification({ title: 'Error', message: data?.message || 'La reparación no pudo completarse.', type: 'error' });
      }
    } catch (err: any) {
      console.error('Repair failed', err);
      setNotification({ title: 'Fallo Técnico', message: err.message || 'Ocurrió un error inesperado durante la reparación.', type: 'error' });
    } finally {
      setRepairingId(null);
      setShowConfirm(null);
    }
  };

  const handleGlobalRepair = async () => {
    try {
      setIsGlobalRepairing(true);
      const data = await fetchApi('/diagnostics/repair-all', { method: 'POST' });
      if (data && data.success) {
        setNotification({ title: 'Reparación Global', message: 'Se han ejecutado todas las rutinas de reparación.', type: 'success' });
        await fetchDiagnostics();
      } else {
        setNotification({ title: 'Error', message: data?.message || 'Algunas reparaciones fallaron.', type: 'error' });
      }
    } catch (err: any) {
      console.error('Global repair failed', err);
      setNotification({ title: 'Fallo Técnico', message: err.message || 'Ocurrió un error crítico durante la reparación global.', type: 'error' });
    } finally {
      setIsGlobalRepairing(false);
    }
  };

  const getIcon = (id: string, size = 20) => {
    switch (id) {
      case 'db': return <Database size={size} />;
      case 'journal': return <History size={size} />;
      case 'audit': return <ShieldCheck size={size} />;
      case 'roles': return <UserPlus size={size} />;
      case 'config': return <Settings size={size} />;
      case 'sessions': return <MousePointer2 size={size} />;
      case 'backup': return <HardDrive size={size} />;
      default: return <AlertCircle size={size} />;
    }
  };

  const hasErrors = items.some(item => item.status === 'error');

  return (
    <div className="space-y-6 pt-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="text-indigo-400" />
            Salud y Diagnóstico del Sistema
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Verificación técnica de integridad criptográfica e infraestructura.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchDiagnostics}
            disabled={loading || isGlobalRepairing}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/10 disabled:opacity-50"
          >
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          {hasErrors && (
            <button
              onClick={handleGlobalRepair}
              disabled={loading || isGlobalRepairing}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            >
              {isGlobalRepairing ? <Loader2 size={18} className="animate-spin" /> : <Wrench size={18} />}
              Reparar Todo
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading && items.length === 0 ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-20 bg-white/5 rounded-xl border border-white/10 animate-pulse" />
          ))
        ) : (
          items.map((item) => (
            <div 
              key={item.id}
              className={`p-4 rounded-xl border transition-all duration-300 ${
                item.status === 'success' 
                  ? 'bg-emerald-500/5 border-emerald-500/20' 
                  : item.status === 'error'
                  ? 'bg-rose-500/5 border-rose-500/20 shadow-lg shadow-rose-500/5'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${
                    item.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                    item.status === 'error' ? 'bg-rose-500/20 text-rose-400' :
                    'bg-white/10 text-gray-400'
                  }`}>
                    {getIcon(item.id, 24)}
                  </div>
                  <div>
                    <h3 className="text-white font-medium flex items-center gap-2">
                      {item.name}
                      {item.status === 'pending' && <Loader2 size={16} className="animate-spin text-indigo-400" />}
                    </h3>
                    {item.status === 'error' && (
                      <p className="text-rose-400 text-xs mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {item.message}
                      </p>
                    )}
                    {item.status === 'success' && (
                      <p className="text-emerald-400/80 text-xs mt-1">Estado nominal verificado.</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    {item.status === 'success' ? (
                      <div className="flex items-center gap-2 text-emerald-400 px-3 py-1 bg-emerald-500/10 rounded-full text-xs font-bold border border-emerald-500/20">
                        <CheckCircle2 size={14} />
                        CORRECTO
                      </div>
                    ) : item.status === 'error' ? (
                      <div className="flex items-center gap-2 text-rose-400 px-3 py-1 bg-rose-500/10 rounded-full text-xs font-bold border border-rose-500/20">
                        <AlertCircle size={14} />
                        FALLO
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-400 px-3 py-1 bg-white/5 rounded-full text-xs font-bold border border-white/10">
                        <Loader2 size={14} className="animate-spin" />
                        PROCESANDO
                      </div>
                    )}
                  </div>

                  {item.status === 'error' && item.canRepair && (
                    <button
                      onClick={() => setShowConfirm({ id: item.id, name: item.name })}
                      disabled={repairingId === item.id}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm transition-all flex items-center gap-2 shadow-lg shadow-rose-500/20 disabled:opacity-50"
                    >
                      {repairingId === item.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Wrench size={16} />
                      )}
                      Reparar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4 items-start">
        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
          <AlertCircle size={20} />
        </div>
        <div>
          <h4 className="text-blue-400 font-medium text-sm">Información de Seguridad</h4>
          <p className="text-gray-400 text-xs mt-1 leading-relaxed">
            Este panel realiza verificaciones forenses de las cadenas HMAC (Journal y Auditoría). 
            Las reparaciones recalculan los hashes de integridad basándose en la información actual de la base de datos. 
            Utilice las herramientas de reparación únicamente bajo supervisión técnica.
          </p>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[#1a1c2e] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-rose-500" />
            <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
              <AlertTriangle className="text-rose-500" />
              ¿Confirmar Reparación?
            </h3>
            <p className="text-gray-300 text-sm mb-6 leading-relaxed">
              Estás a punto de ejecutar la reparación de <strong>"{showConfirm.name}"</strong>.
              {showConfirm.id === 'journal' && (
                <span className="block mt-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 font-medium">
                  <strong>AVISO:</strong> Esta acción recalculará y re-sellará la cadena HMAC del libro diario.
                </span>
              )}
              {showConfirm.id === 'audit' && (
                <span className="block mt-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 font-medium">
                  <strong>AVISO TÉCNICO:</strong> Esta acción sincroniza el caché de seguridad con el estado actual de la tabla. No modifica registros existentes debido a restricciones de inmutabilidad (WORM), pero restablece el punto de partida para la validación de la cadena.
                </span>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(null)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleRepair(showConfirm.id)}
                className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-lg shadow-rose-500/20"
              >
                Confirmar Ejecución
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Notification Modal */}
      {notification && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-2xl border border-gray-800 transform animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${notification.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-500'}`}>
                {notification.type === 'success' ? <CheckCircle2 className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{notification.title}</h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">{notification.message}</p>
              {notification.type === 'error' && (
                <p className="text-gray-400 text-sm mt-4 p-3 bg-red-500/5 border border-red-500/10 rounded overflow-auto max-h-32 font-mono">
                  {notification.message}
                </p>
              )}
              <button
                onClick={() => setNotification(null)}
                className="w-full mt-6 py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiagnosticsPanel;
