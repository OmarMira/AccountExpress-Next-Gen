import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { fetchApi } from '../../lib/api';
import { Shield, Search, Filter, Printer } from 'lucide-react';
import { format } from 'date-fns';

const safeFormatDate = (date: any, formatStr: string) => {
  try {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return format(d, formatStr);
  } catch (e) {
    return '—';
  }
};

interface AuditLog {
  id: string;
  action: string;
  module: string;
  description: string;
  userId: string;
  createdAt: string;
}

import { PrintPreviewModal } from '../../components/PrintPreviewModal';

export function AuditLogs() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);

  if (!activeCompany) {
    return (
      <div className="p-8 text-white min-h-screen bg-gray-950">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-[#0a1628] rounded-xl w-1/4"></div>
          <div className="h-64 bg-[#0a1628] rounded-2xl"></div>
        </div>
      </div>
    );
  }

  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ['audit-logs', activeCompany?.id],
    queryFn: () => fetchApi(`/audit?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany,
    select: (res: any) => (Array.isArray(res) ? res : res?.data ?? [])
  });

  const safeLogs = useMemo(() => {
    return (logs || []).map((l: any) => ({
      ...l,
      action: l?.action || 'Desconocida',
      module: l?.module || 'Global',
      createdAt: l?.createdAt || new Date().toISOString(),
      userId: l?.userId || 'Sistema'
    }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!Array.isArray(safeLogs)) return [];
    return safeLogs.filter(log => {
      const actionRaw = log.action || '';
      const moduleRaw = log.module || '';
      return actionRaw.toLowerCase().includes(searchTerm.toLowerCase()) ||
             moduleRaw.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [safeLogs, searchTerm]);

  if (!activeCompany) return <div className="p-8 text-white">Seleccione una empresa primero.</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center bg-[#0a1628]/80 p-8 rounded-3xl border border-white/7">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Shield className="w-8 h-8 text-[#0071c5]" />
            Bitácora de Auditoría
          </h1>
          <p className="text-gray-400">Historial forense e inmutable de operaciones.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPrintModal(true)}
            disabled={isLoading || logs.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-[#0f2240] hover:bg-[#0f2240]/70 disabled:opacity-50 text-white rounded-2xl text-sm font-bold transition-all border border-white/10 shadow-xl"
          >
            <Printer className="w-5 h-5 text-gray-400" />
            Imprimir Bitácora
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input 
            className="w-full bg-[#0a1628] border border-white/10 p-3 pl-12 rounded-xl text-white outline-none"
            placeholder="Buscar registros..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-[#0a1628] border border-white/7 rounded-3xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-500">Cargando bitácora...</div>
        ) : (
          <table className="w-full text-left text-white">
            <thead className="bg-[#0f2240]/80 text-xs uppercase tracking-widest text-gray-500">
              <tr>
                <th className="p-4">Fecha</th>
                <th className="p-4">Accion</th>
                <th className="p-4">Modulo</th>
                <th className="p-4">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log: any) => (
                <tr key={log.id} className="border-t border-white/7">
                  <td className="p-4 font-mono text-sm">{safeFormatDate(log.createdAt, 'dd/MM/yyyy HH:mm:ss')}</td>
                  <td className="p-4 font-bold">{log.action}</td>
                  <td className="p-4 text-[#0071c5]">{log.module}</td>
                  <td className="p-4 text-gray-400">{log.userId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PrintPreviewModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="Bitácora de Auditoría Forense"
        config={{
          moduleName: 'audit-logs',
          searchByDescription: true,
          columnSelector: true,
          mandatoryColumns: ['createdAt', 'action', 'userId']
        }}
        columns={[
          { key: 'createdAt', label: 'Fecha', align: 'left', format: (val: any) => safeFormatDate(val, 'dd/MM/yyyy HH:mm:ss') },
          { key: 'userId', label: 'Usuario', align: 'left' },
          { key: 'action', label: 'Acción', align: 'left' },
          { key: 'module', label: 'Módulo', align: 'left' },
          { key: 'description', label: 'Descripción', align: 'left' }
        ]}
        data={safeLogs}
      />
    </div>
  );
}
