import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { PermissionGate } from '../components/PermissionGate';
import { Plus, Search, Trash2, CheckCircle, XCircle, FileText, AlertCircle, X, FileCheck2, Printer } from 'lucide-react';
import { PrintPreviewModal } from '../components/PrintPreviewModal';

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  reference: string | null;
  status: 'draft' | 'posted' | 'voided';
  total_amount: number;
}

interface Account {
  id: string;
  code: string;
  name: string;
}

interface FiscalPeriod {
  id: string;
  name: string;
  status: 'open' | 'closed' | 'locked';
}

interface DraftLine {
  accountId: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
}

export function Journal() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().substring(0, 10));
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [periodId, setPeriodId] = useState('');

  const [lines, setLines] = useState<DraftLine[]>([
    { accountId: '', description: '', debitAmount: '', creditAmount: '' },
    { accountId: '', description: '', debitAmount: '', creditAmount: '' }
  ]);

  // Queries
  const { data: entries = [], isLoading: loadingEntries } = useQuery<JournalEntry[]>({
    queryKey: ['journal', activeCompany?.id],
    queryFn: () => fetchApi(`/journal?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany
  });

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: () => fetchApi(`/gl-accounts`),
    enabled: !!activeCompany
  });

  const { data: periods = [], isLoading: loadingPeriods } = useQuery<FiscalPeriod[]>({
    queryKey: ['fiscal-periods', activeCompany?.id],
    queryFn: () => fetchApi(`/fiscal-periods?companyId=${activeCompany?.id}`),
    enabled: !!activeCompany
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      return fetchApi('/journal', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal', activeCompany?.id] });
      closeModal();
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Error al crear el asiento de diario');
    }
  });

  const postMutation = useMutation({
    mutationFn: async (id: string) => fetchApi(`/journal/${id}/post`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal', activeCompany?.id] }),
    onError: (err: Error) => alert(`Error al publicar: ${err.message}`)
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => fetchApi(`/journal/${id}/void`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal', activeCompany?.id] }),
    onError: (err: Error) => alert(`Error al anular: ${err.message}`)
  });

  const closeModal = () => {
    setShowModal(false);
    setFormError('');
    setDescription('');
    setReference('');
    setLines([
      { accountId: '', description: '', debitAmount: '', creditAmount: '' },
      { accountId: '', description: '', debitAmount: '', creditAmount: '' }
    ]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);

    try {
      if (!periodId && openPeriods.length > 0) {
        throw new Error('Debe seleccionar un periodo fiscal');
      }

      const formattedLines = lines.map((l, i) => ({
        accountId: l.accountId,
        description: l.description || null,
        debitAmount: parseFloat(l.debitAmount) || 0,
        creditAmount: parseFloat(l.creditAmount) || 0,
        lineNumber: i + 1
      })).filter(l => l.accountId && (l.debitAmount > 0 || l.creditAmount > 0));

      if (formattedLines.length < 2) {
        throw new Error('El asiento requiere al menos 2 líneas válidas');
      }

      await createMutation.mutateAsync({
        companyId: activeCompany?.id,
        entryDate,
        description,
        reference: reference || null,
        periodId: periodId || openPeriods[0]?.id,
        isAdjusting: false,
        lines: formattedLines
      });
    } catch (err: any) {
      const error = err as Error;
      setFormError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addLine = () => {
    setLines([...lines, { accountId: '', description: '', debitAmount: '', creditAmount: '' }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof DraftLine, value: string) => {
    const newLines = [...lines];
    if (field === 'debitAmount' && parseFloat(value) > 0) newLines[idx].creditAmount = '';
    if (field === 'creditAmount' && parseFloat(value) > 0) newLines[idx].debitAmount = '';
    newLines[idx][field] = value;
    setLines(newLines);
  };

  const totalDebits = lines.reduce((sum, l) => sum + (parseFloat(l.debitAmount) || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (parseFloat(l.creditAmount) || 0), 0);
  const diff = Math.abs(totalDebits - totalCredits);
  const isBalanced = diff < 0.01 && totalDebits > 0;

  const openPeriods = periods.filter(p => p.status === 'open');

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const matchSearch = e.entry_number.includes(searchTerm) ||
        e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.reference && e.reference.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchStatus = statusFilter ? e.status === statusFilter : true;
      return matchSearch && matchStatus;
    });
  }, [entries, searchTerm, statusFilter]);

  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'posted':
        return <span className="px-2 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Publicado</span>;
      case 'voided':
        return <span className="px-2 py-1 text-xs rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">Anulado</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Borrador</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Diario Contable</h1>
          <p className="text-sm text-gray-400 mt-1">Gestión de asientos y movimientos de doble partida</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#0a1628] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-[#0071c5]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-40 py-2 px-3 bg-[#0a1628] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-[#0071c5] appearance-none"
          >
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="posted">Publicado</option>
            <option value="voided">Anulado</option>
          </select>

          <button
            onClick={() => setShowPrintModal(true)}
            className="w-full sm:w-auto flex justify-center items-center gap-2 px-4 py-2 bg-[#0f2240] hover:bg-[#0f2240]/70 text-white text-sm font-medium rounded-lg transition-colors border border-white/10"
          >
            <Printer className="w-4 h-4 text-gray-400" />
            Imprimir Diario
          </button>

          <PermissionGate module="journal" action="create">
            <button
              onClick={() => setShowModal(true)}
              className="w-full sm:w-auto flex justify-center items-center gap-2 px-4 py-2 bg-[#0071c5] hover:bg-[#005fa3] text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-[#0071c5]/20 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Nuevo Asiento
            </button>
          </PermissionGate>
        </div>
      </div>

      {loadingEntries ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse bg-[#0f2240]/50 h-16 rounded-lg border border-white/5" />
          ))}
        </div>
      ) : (
        <div className="bg-[#0f2240] rounded-xl overflow-hidden border border-white/7 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#0a1628] text-gray-400">
                <tr>
                  <th className="px-6 py-4 font-medium">Asiento</th>
                  <th className="px-6 py-4 font-medium">Fecha</th>
                  <th className="px-6 py-4 font-medium">Descripción</th>
                  <th className="px-6 py-4 font-medium text-right">Monto</th>
                  <th className="px-6 py-4 font-medium text-center">Estado</th>
                  <th className="px-6 py-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      No se encontraron asientos en el diario.
                    </td>
                  </tr>
                ) : filteredEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-mono text-indigo-400 font-medium">{entry.entry_number}</div>
                      {entry.reference && <div className="text-xs text-gray-500 mt-1">Ref: {entry.reference}</div>}
                    </td>
                    <td className="px-6 py-4 text-gray-300">{entry.entry_date}</td>
                    <td className="px-6 py-4 text-gray-200">
                      <div className="truncate max-w-xs">{entry.description}</div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-gray-300">
                      ${entry.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={entry.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {entry.status === 'draft' && (
                          <PermissionGate module="journal" action="approve">
                            <button
                              onClick={() => {
                                if (confirm('¿Publicar asiento? Una vez publicado no podrá ser editado.')) {
                                  postMutation.mutate(entry.id);
                                }
                              }}
                              title="Publicar Asiento"
                              className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-md transition-colors"
                            >
                              <FileCheck2 className="w-4 h-4" />
                            </button>
                          </PermissionGate>
                        )}
                        {entry.status === 'posted' && (
                          <PermissionGate module="journal" action="void">
                            <button
                              onClick={() => {
                                if (confirm('¿Anular asiento? Esto creará una reversión automática.')) {
                                  voidMutation.mutate(entry.id);
                                }
                              }}
                              title="Anular Asiento"
                              className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-md transition-colors"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </PermissionGate>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f2240] border border-white/7 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                Nuevo Asiento de Diario
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {formError && (
                <div className="mb-6 bg-rose-500/10 border border-rose-500/50 rounded-lg p-3 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-400 leading-relaxed">{formError}</p>
                </div>
              )}

              {openPeriods.length === 0 && !loadingPeriods && (
                <div className="mb-6 bg-amber-500/10 border border-amber-500/50 rounded-lg p-3 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-400 leading-relaxed">No hay periodos fiscales abiertos. Debe abrir un periodo antes de registrar asientos.</p>
                </div>
              )}

              <form id="journalForm" onSubmit={handleCreate} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Fecha</label>
                    <input
                      type="date"
                      required
                      value={entryDate}
                      onChange={e => setEntryDate(e.target.value)}
                      className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-[#0071c5] focus:ring-1 focus:ring-[#0071c5] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Periodo Fiscal</label>
                    <select
                      required
                      disabled={openPeriods.length === 0}
                      value={periodId || openPeriods[0]?.id || ''}
                      onChange={e => setPeriodId(e.target.value)}
                      className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-[#0071c5] focus:ring-1 focus:ring-[#0071c5] outline-none appearance-none"
                    >
                      {openPeriods.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Referencia (Opcional)</label>
                    <input
                      type="text"
                      value={reference}
                      onChange={e => setReference(e.target.value)}
                      placeholder="Factura, cheque..."
                      className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-[#0071c5] focus:ring-1 focus:ring-[#0071c5] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Descripción del Asiento</label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Descripción general del movimiento..."
                    className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-[#0071c5] focus:ring-1 focus:ring-[#0071c5] outline-none"
                  />
                </div>

                <div className="bg-[#0f2240]/30 rounded-xl border border-white/5 overflow-hidden">
                  <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-[#0a1628] border-b border-white/5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <div className="col-span-4">Cuenta</div>
                    <div className="col-span-4">Descripción de Línea</div>
                    <div className="col-span-2 text-right">Débitos</div>
                    <div className="col-span-2 text-right">Créditos</div>
                  </div>

                  <div className="divide-y divide-gray-700/50">
                    {lines.map((line, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-4 p-4 items-start group">
                        <div className="col-span-4 relative">
                          <select
                            required
                            disabled={loadingAccounts}
                            value={line.accountId}
                            onChange={(e) => updateLine(idx, 'accountId', e.target.value)}
                            className="w-full bg-[#0a1628] border border-white/10 rounded-lg pl-3 pr-8 py-2 text-white text-sm focus:border-[#0071c5] appearance-none"
                          >
                            <option value="">{loadingAccounts ? 'Cargando...' : 'Seleccione cuenta...'}</option>
                            {accounts.map(acc => (
                              <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-4">
                          <input
                            type="text"
                            placeholder="Descripción (opcional)..."
                            value={line.description}
                            onChange={e => updateLine(idx, 'description', e.target.value)}
                            className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-[#0071c5]"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0" step="0.01"
                            placeholder="0.00"
                            value={line.debitAmount}
                            onChange={e => updateLine(idx, 'debitAmount', e.target.value)}
                            className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm text-right focus:border-[#0071c5] font-mono disabled:opacity-50"
                            disabled={parseFloat(line.creditAmount) > 0}
                          />
                        </div>
                        <div className="col-span-2 relative">
                          <input
                            type="number"
                            min="0" step="0.01"
                            placeholder="0.00"
                            value={line.creditAmount}
                            onChange={e => updateLine(idx, 'creditAmount', e.target.value)}
                            className="w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm text-right focus:border-[#0071c5] font-mono disabled:opacity-50"
                            disabled={parseFloat(line.debitAmount) > 0}
                          />
                          {lines.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="absolute -right-8 top-1/2 -translate-y-1/2 text-gray-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-[#0f2240]/20 border-t border-white/5">
                    <button
                      type="button"
                      onClick={addLine}
                      className="text-sm font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-2 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Agregar línea
                    </button>
                  </div>
                </div>

                <div className="bg-[#0a1628] border border-white/7 rounded-xl p-6 flex flex-col md:flex-row justify-between items-center gap-6 shadow-inner">
                  <div className="flex items-center gap-4">
                    <div className={`flex items-center justify-center w-12 h-12 rounded-full ${isBalanced ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'} transition-colors`}>
                      {isBalanced ? <CheckCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm font-medium">Estado del Asiento</p>
                      <p className={`font-bold ${isBalanced ? 'text-emerald-400' : 'text-rose-400'} flex items-center gap-2`}>
                        {isBalanced ? 'Asiento Cuadrado' : 'Asiento Descuadrado'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div>
                      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider text-right mb-1">Total Débitos</p>
                      <p className="text-2xl font-mono text-white text-right">${totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="w-px h-10 bg-white/10"></div>
                    <div>
                      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider text-right mb-1">Total Créditos</p>
                      <p className="text-2xl font-mono text-white text-right">${totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>

              </form>
            </div>

            <div className="p-6 border-t border-white/5 bg-[#0a1628]/80 flex justify-end gap-3 shrink-0 rounded-b-2xl">
              <button
                type="button"
                onClick={closeModal}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                disabled={isSubmitting || createMutation.isPending}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="journalForm"
                disabled={isSubmitting || createMutation.isPending || !isBalanced || openPeriods.length === 0}
                className="px-6 py-2.5 bg-[#0071c5] hover:bg-[#005fa3] text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-[#0071c5]/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(isSubmitting || createMutation.isPending) ? 'Guardando...' : 'Guardar Borrador'}
              </button>
            </div>
          </div>
        </div>
      )}
    <PrintPreviewModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="Libro Diario de Contabilidad"
        config={{
          moduleName: 'journal',
          dateRange: true,
          searchByDescription: true,
          columnSelector: true,
          mandatoryColumns: ['entry_number', 'entry_date', 'total_amount']
        }}
        columns={[
          { key: 'entry_number', label: 'N° Asiento', align: 'left' },
          { key: 'entry_date', label: 'Fecha', align: 'left' },
          { key: 'description', label: 'Glosa / Descripción', align: 'left' },
          { key: 'reference', label: 'Referencia', align: 'left' },
          { key: 'total_amount', label: 'Monto Total', align: 'right', format: (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: activeCompany?.currency || 'USD' }).format(val) },
          { key: 'status', label: 'Estado', align: 'center', format: (val) => val === 'posted' ? 'Publicado' : val === 'voided' ? 'Anulado' : 'Borrador' }
        ]}
        data={filteredEntries}
      />
    </div>
  );
}
