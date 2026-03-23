import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle,
  X,
  Zap,
  ShieldCheck,
  Cpu,
  Layers,
  Target,
  ArrowRight,
  AlertTriangle,
  Landmark,
  Save,
  Check
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BankAccountModal } from '../BankAccountModal';

import type { ParsedBankStatement } from '../../services/pdf-bank-parser';

const InfoRow = ({ label, value }: { label: string, value: string }) => (
  <div className="flex flex-col">
    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{label}</span>
    <span className="text-white font-medium">{value}</span>
  </div>
);

type Step = 'upload' | 'confirm' | 'preview';

interface StatementGroup {
  accountNumber: string;
  bankName: string;
  accountHolder: string;
  accountType: string;
  statements: ParsedBankStatement[];
  earliestBalance: number;
  totalTransactions: number;
}

interface BankImportWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

export const BankImportWizard: React.FC<BankImportWizardProps> = ({ onClose, onComplete }) => {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unknownBankName, setUnknownBankName] = useState<string | null>(null);
  const [unknownAccountNumber, setUnknownAccountNumber] = useState<string | undefined>(undefined);
  
  const [statementGroups, setStatementGroups] = useState<StatementGroup[]>([]);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);

  // Fetch pending transactions for preview step
  const { data: pendingTxsResponse } = useQuery({
    queryKey: ['bank-transactions-pending', activeCompany?.id],
    queryFn: () => fetchApi(`/bank/transactions?companyId=${activeCompany?.id}&status=pending`),
    enabled: step === 'preview' && !!activeCompany?.id,
  });

  const pendingTransactions = pendingTxsResponse?.data || [];

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setFiles(prev => [...prev, ...newFiles]);
      setError(null);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
      setError(null);
    }
  };

  const handleStartProcessing = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    const allStatements: ParsedBankStatement[] = [];

    const detectBankFromFilename = (filename: string): string => {
        const name = filename.toLowerCase();
        if (name.includes('chase')) return 'CHASE BANK NA';
        if (name.includes('bofa') || name.includes('bofaempresa') || name.includes('bankofamerica') || name.includes('estmt') || name.includes('stmt')) return 'Bank of America';
        if (name.includes('wellsfargo') || name.includes('wf')) return 'Wells Fargo';
        return 'Banco Desconocido';
    };

    for (const fileToProcess of files) {
      if (fileToProcess.name.toLowerCase().endsWith('.pdf')) {
        try {
          const { parseBankPDF } = await import('../../services/pdf-bank-parser');
          const statement = await parseBankPDF(fileToProcess);
          if (statement.transactions.length === 0) throw new Error(`No se encontraron transacciones en: ${fileToProcess.name}`);
          
          if (statement.bankName === "Desconocido") {
             statement.bankName = detectBankFromFilename(fileToProcess.name);
          }
          allStatements.push(statement);
        } catch (err: any) {
          setError(`❌ Error parseando ${fileToProcess.name}: ${err.message}`);
          setLoading(false);
          return;
        }
      } else {
        // CSV/OFX/QFX — flujo existente
        try {
          const formData = new FormData();
          formData.append('file', fileToProcess);
          formData.append('companyId', activeCompany?.id || '');

          const res = await fetch('/api/bank/import', { method: 'POST', body: formData });
          const data = await res.json();
          if (!res.ok) {
              if (data.error === 'UNKNOWN_BANK') {
                  setUnknownBankName(data.bankName);
                  if (data.accountNumber) setUnknownAccountNumber(data.accountNumber);
                  setLoading(false);
                  return; 
              }
              throw new Error(data.error || `Error ${res.status}`);
          }
        } catch (err: any) {
          setError(`❌ Error procesando ${fileToProcess.name}: ${err.message}`);
          setLoading(false);
          return;
        }
      }
    }

    // Agrupar por número de cuenta (solo para los PDFs)
    if (allStatements.length > 0) {
        const groups = new Map<string, StatementGroup>();
        for (const stmt of allStatements) {
          const key = stmt.accountNumber || "0000000000";
          if (!groups.has(key)) {
            groups.set(key, {
              accountNumber: key,
              bankName: stmt.bankName,
              accountHolder: stmt.accountHolder,
              accountType: stmt.accountType,
              statements: [],
              earliestBalance: 0,
              totalTransactions: 0
            });
          }
          groups.get(key)!.statements.push(stmt);
          groups.get(key)!.totalTransactions += stmt.transactions.length;
        }

        // Ordenar cada grupo por fecha ASC y tomar saldo inicial del más antiguo
        for (const group of groups.values()) {
          group.statements.sort((a, b) =>
            new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
          );
          if (group.statements.length > 0) {
            group.earliestBalance = group.statements[0].beginningBalance;
          }
        }

        setStatementGroups([...groups.values()]);
        setCurrentGroupIndex(0);
        setStep('confirm');
    } else {
        // Solo había CSVs o archivos soportados "directos", pasamos al preview
        setStep('preview');
    }
    setLoading(false);
  };

  async function handleConfirmGroup(index: number) {
    const group = statementGroups[index];
    setLoading(true);
    setError(null);

    try {
      // 1. Crear la cuenta bancaria si no existe
      const bankAccountRes = await fetch('/api/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: activeCompany?.id,
          accountName: `${group.bankName} - ${group.accountNumber}`,
          bankName: group.bankName,
          accountNumber: group.accountNumber,
          accountType: group.accountType,
          balance: group.earliestBalance,
          currency: 'USD'
        })
      });

      if (!bankAccountRes.ok) {
        throw new Error('Error al crear la cuenta bancaria');
      }

      // 2. Importar todas las transacciones de todos los extractos en orden
      const allTransactions = group.statements
        .flatMap(stmt => stmt.transactions)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const importRes = await fetch('/api/bank/import-parsed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: allTransactions,
          bankName: group.bankName,
          accountNumber: group.accountNumber,
          fileName: `${group.bankName}-${group.accountNumber}`,
          importBatchId: crypto.randomUUID(),
          companyId: activeCompany?.id || ''
        })
      });

      const importData = await importRes.json();
      if (!importRes.ok) {
          if (importData.error === 'UNKNOWN_BANK') {
              setUnknownBankName(importData.bankName);
              if (importData.accountNumber) setUnknownAccountNumber(importData.accountNumber);
              setLoading(false);
              return; 
          }
          throw new Error('Error al importar transacciones');
      }

      // 3. Avanzar al siguiente grupo o terminar
      if (index + 1 < statementGroups.length) {
        setCurrentGroupIndex(index + 1);
      } else {
        setStep('preview');
      }
      setLoading(false);
    } catch(err: any) {
       setError(err.message);
       setLoading(false);
    }
  }

  function handleRejectGroup(index: number) {
    if (index + 1 < statementGroups.length) {
      setCurrentGroupIndex(index + 1);
    } else {
      setStep('preview');
    }
  }

  const reconcileMutation = useMutation({
    mutationFn: async (tx: any) => fetchApi(`/bank/reconcile/${tx.id}`, {
      method: 'POST',
      body: JSON.stringify({
        companyId: activeCompany?.id,
        targetAccountId: tx.defaultTargetAccount || null // Uses default mapped or undefined
      })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-pending'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions-history'] });
    }
  });

  const handleFinalizeImport = async () => {
    if (pendingTransactions.length === 0) {
      onComplete();
      return;
    }
    setLoading(true);
    let successCount = 0;
    try {
      for (const tx of pendingTransactions) {
         await reconcileMutation.mutateAsync(tx);
         successCount++;
      }
      onComplete();
    } catch (err: any) {
      setError(`Error inyectando: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center z-[60] p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-5xl my-auto overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-700">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-500/5 blur-[100px] pointer-events-none"></div>

        <header className="flex items-center justify-between p-6 border-b border-slate-800 relative z-10 bg-slate-900/50">
          <div className="flex items-center gap-6">
            <div className="p-3 bg-blue-600/10 rounded-xl border border-blue-500/20 text-blue-500 shadow-md group">
              <Cpu className="w-6 h-6 group-hover:scale-110 transition-transform duration-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Protocolo de Importación</h2>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Neural Ledger Interface v2.4
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-center bg-gray-900/30">
          <div className="flex items-center gap-6">
            <StepIndicator active={step === 'upload'} completed={step !== 'upload'} step="01" label="Carga" icon={Upload} />
            <div className={`w-12 h-px ${step !== 'upload' ? 'bg-indigo-500' : 'bg-gray-800'}`}></div>
            <StepIndicator active={step === 'confirm'} completed={step === 'preview'} step="02" label="Confirmación" icon={Target} />
            <div className={`w-12 h-px ${step === 'preview' ? 'bg-indigo-500' : 'bg-gray-800'}`}></div>
            <StepIndicator active={step === 'preview'} completed={false} step="03" label="Verificación" icon={Check} />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6 relative z-10">
          {step === 'upload' ? (
            <div className="space-y-6 animate-in slide-in-from-bottom-6 duration-700">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-500 group relative overflow-hidden ${dragActive ? 'border-blue-500 bg-blue-500/5 scale-[0.99]' : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                  }`}
              >
                <div className={`absolute inset-0 bg-blue-500/5 transition-opacity duration-700 ${dragActive ? 'opacity-100 animate-pulse' : 'opacity-0'}`}></div>
                <div className="relative z-10">
                  <div className={`w-16 h-16 bg-gray-900 rounded-2xl border border-gray-800 flex items-center justify-center mx-auto mb-6 shadow-md transition-all duration-500 ${dragActive ? 'scale-110 border-indigo-500/50' : 'group-hover:scale-105'}`}>
                    <Upload className={`w-8 h-8 ${dragActive ? 'text-indigo-400 animate-bounce' : 'text-gray-500'}`} />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight mb-2">Inyección de Archivo Fuente</h3>
                  <p className="text-sm text-gray-400 leading-relaxed max-w-sm mx-auto mb-6">
                    Arrastra tu archivo aquí o haz clic para seleccionar. Soporta <span className="text-indigo-400 font-medium">CSV / OFX / QFX / PDF</span>. Hasta 10MB.
                  </p>

                  <input
                    type="file"
                    accept=".csv,.ofx,.qfx,.pdf"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    ref={fileInputRef}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex justify-center items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 cursor-pointer"
                  >
                    Localizar Archivo
                  </button>
                </div>
              </div>

              {files.length > 0 && files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between shadow-sm animate-in slide-in-from-top-4 duration-500 mb-3 last:mb-0">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-lg border border-indigo-500/20 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{file.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • {file.name.split('.').pop()?.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))}
                    className="p-2 text-gray-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-md transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {error && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-[2rem] p-8 flex items-center gap-6 animate-in shake duration-500">
                  <div className="w-12 h-12 bg-rose-500/10 rounded-2xl border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-6 h-6 text-rose-500" />
                  </div>
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest leading-loose">{error}</p>
                </div>
              )}

              <div className="flex justify-end gap-4 pt-8 border-t border-gray-800">
                <button onClick={onClose} className="px-6 py-2.5 bg-gray-900 border border-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                  Cancelar
                </button>
                <button
                  onClick={handleStartProcessing}
                  disabled={files.length === 0 || loading}
                  className="flex justify-center items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Zap className="w-4 h-4" />}
                  {loading ? 'Procesando...' : 'Iniciar Procesamiento'}
                </button>
              </div>
            </div>
          ) : step === 'confirm' && statementGroups.length > 0 ? (
            <div className="space-y-8 animate-in slide-in-from-bottom-6 duration-700">
              {error && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-3xl p-6 flex items-center gap-4 animate-in shake duration-500">
                  <div className="w-10 h-10 bg-rose-500/10 rounded-xl border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-rose-500" />
                  </div>
                  <p className="text-xs font-semibold text-rose-500 leading-relaxed">{error}</p>
                </div>
              )}
              
              <div className="bg-slate-950 border-2 border-blue-500/30 rounded-[2.5rem] p-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[60px] pointer-events-none rounded-full"></div>
                <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-8 relative z-10 flex items-center gap-4">
                  <Landmark className="w-8 h-8 text-blue-400" />
                  Nueva cuenta bancaria detectada
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-8 gap-x-6 relative z-10">
                  <InfoRow label="Banco" value={statementGroups[currentGroupIndex].bankName} />
                  <InfoRow label="Número de cuenta" value={statementGroups[currentGroupIndex].accountNumber} />
                  <InfoRow label="Titular" value={statementGroups[currentGroupIndex].accountHolder} />
                  <InfoRow label="Tipo de cuenta" value={statementGroups[currentGroupIndex].accountType} />
                  <InfoRow label="Saldo inicial" value={`$${statementGroups[currentGroupIndex].earliestBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}`} />
                  <InfoRow label="Total transacciones" value={statementGroups[currentGroupIndex].totalTransactions.toString()} />
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
                <div className="px-8 py-5 border-b border-slate-800 bg-slate-900/40">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Extractos a importar ({statementGroups[currentGroupIndex].statements.length})
                  </p>
                </div>
                <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                  {statementGroups[currentGroupIndex].statements.map((stmt, i) => (
                    <div key={i} className="px-8 py-5 border-b border-slate-800/50 flex justify-between items-center hover:bg-white/[0.02] transition-colors">
                      <span className="text-xs text-white font-bold tracking-tight bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                        {stmt.periodStart} <ArrowRight className="w-3 h-3 inline mx-1 text-slate-500" /> {stmt.periodEnd}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {stmt.transactions.length} transacciones
                      </span>
                      <span className="text-xs font-mono font-black text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                        Saldo inicial: ${stmt.beginningBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-8 border-t border-slate-800">
                <button
                  onClick={() => handleRejectGroup(currentGroupIndex)}
                  className="px-10 py-4 bg-rose-600/10 border border-rose-500/30 text-rose-400 hover:bg-rose-600/20 hover:text-white transition-colors rounded-2xl font-black uppercase tracking-widest text-[10px]"
                >
                  Rechazar esta cuenta
                </button>
                <button
                  onClick={() => handleConfirmGroup(currentGroupIndex)}
                  disabled={loading}
                  className="px-14 py-4 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all rounded-2xl font-black uppercase tracking-widest text-[11px] flex gap-3 items-center"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                  {loading ? 'Procesando...' : 'Confirmar e Importar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-10 animate-in slide-in-from-bottom-6 duration-700">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-[2rem] p-8 text-center">
                <p className="text-emerald-400 font-black uppercase tracking-widest">
                  ✅ Importación completada
                </p>
                <p className="text-slate-400 text-sm mt-2">
                  Las transacciones importadas aparecen en Conciliación Bancaria → pestaña Historial
                </p>
                <p className="text-slate-400 text-sm">
                  Ve a Conciliación Bancaria para categorizar cada transacción y vincularla a tu plan de cuentas.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-8">
                <StatHighlight title="Registro Total" value={pendingTransactions.length.toString()} icon={Layers} color="blue" />
                <StatHighlight title="Alertas de Duplicidad" value={pendingTransactions.filter((t: any) => t.isDuplicate).length.toString()} icon={AlertTriangle} color="rose" />
                <StatHighlight title="Nivel de Confianza" value={
                  pendingTransactions.length > 0
                    ? Math.round(pendingTransactions.reduce((a: number, t: any) => 
                        a + (t.confidenceScore || 0), 0) / pendingTransactions.length) + '%'
                    : 'N/A'
                } icon={Target} color="emerald" />
              </div>

              {error && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-3xl p-6 flex items-center gap-4 animate-in shake duration-500">
                  <div className="w-10 h-10 bg-rose-500/10 rounded-xl border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-rose-500" />
                  </div>
                  <p className="text-xs font-semibold text-rose-500 leading-relaxed">{error}</p>
                </div>
              )}

              <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl group">
                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900/50 sticky top-0 z-20">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-800">
                        <th className="px-6 py-4">Timestamp</th>
                        <th className="px-6 py-4">Descriptor</th>
                        <th className="px-6 py-4 text-right">Monto</th>
                        <th className="px-6 py-4">Categoría IA</th>
                        <th className="px-6 py-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {pendingTransactions.map((txn: any) => (
                        <tr
                          key={txn.id}
                          className={`hover:bg-white/[0.02] transition-colors group/row`}
                        >
                          <td className="px-8 py-6 text-[10px] font-black text-slate-400 font-mono tracking-tighter">{new Date(txn.transactionDate).toLocaleDateString()}</td>
                          <td className="px-8 py-6 text-[11px] font-black text-white uppercase tracking-tighter leading-none">{txn.description}</td>
                          <td className={`px-8 py-6 text-right font-mono font-black text-sm tracking-tighter ${txn.amount < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            ${Math.abs(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-8 py-6">
                             <div className="flex items-center gap-3">
                              {txn.suggestedCategory 
                                ? <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{txn.suggestedCategory}</span>
                                : <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Sin categoría asignada</span>
                              }
                              {txn.confidenceScore != null && (
                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black border ${
                                  txn.confidenceScore >= 70 
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : txn.confidenceScore >= 40
                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                    : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                }`}>
                                  {txn.confidenceScore}% ACC
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-6 text-center">
                            <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mx-auto">
                              <Check className="w-4 h-4 text-emerald-500" />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {pendingTransactions.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-20 text-center font-black uppercase text-slate-500 tracking-widest text-xs">No hay transacciones pendientes.</td>
                          </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between gap-4 pt-8 border-t border-gray-800">
                <button onClick={() => { setStep('upload'); setFiles([]); }} className="flex justify-center items-center gap-2 px-6 py-2.5 bg-gray-900 border border-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                  <ArrowRight className="w-4 h-4 rotate-180" /> Volver atrás
                </button>
                <div className="flex gap-4">
                  <button onClick={onClose} className="px-6 py-2.5 bg-gray-900 border border-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors hover:bg-gray-800 hover:text-white">
                    Cancelar
                  </button>
                  <button
                    onClick={handleFinalizeImport}
                    disabled={loading || pendingTransactions.length === 0}
                    className="flex justify-center items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                  >
                    {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <ShieldCheck className="w-4 h-4" />}
                    {loading ? 'Importando...' : 'Importar a Libros'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {unknownBankName && (
        <BankAccountModal
           prefilledBankName={unknownBankName}
           prefilledAccountNumber={unknownAccountNumber}
           onCancel={() => {
              setUnknownBankName(null);
              setUnknownAccountNumber(undefined);
              setError('Importación cancelada: Registro de banco abortado.');
           }}
           onSuccess={() => {
              setUnknownBankName(null);
              setUnknownAccountNumber(undefined);
           }}
        />
      )}
    </div>
  );
};

const StepIndicator = ({ active, completed, step, label, icon: Icon }: { active: boolean, completed: boolean, step: string, label: string, icon: any }) => (
  <div className={`flex items-center gap-3 transition-all duration-300 ${active ? 'scale-105' : completed ? 'opacity-80' : 'opacity-50'}`}>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-300 shadow-sm ${active ? 'bg-indigo-600 border-indigo-500 text-white' :
      completed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' :
        'bg-gray-800 border-gray-700 text-gray-400'
      }`}>
      {completed ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
    </div>
    <div className="text-left">
      <span className="text-xs font-semibold text-gray-500 block">{step}</span>
      <span className={`text-sm font-semibold ${active ? 'text-white' : 'text-gray-400'}`}>{label}</span>
    </div>
  </div>
);

const StatHighlight = ({ title, value, icon: Icon, color }: { title: string, value: string | number, icon: any, color: string }) => {
  const themes: any = {
    blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20 shadow-blue-950/20',
    rose: 'text-rose-500 bg-rose-500/10 border-rose-500/20 shadow-rose-950/20',
    emerald: 'text-emerald-500 bg-emerald-600/10 border-emerald-500/20 shadow-emerald-950/20'
  };

  return (
    <div className="bg-slate-950 border-2 border-slate-800 p-8 rounded-[2.5rem] flex items-center gap-6 group hover:border-slate-700 transition-all shadow-xl">
      <div className={`w-16 h-16 rounded-2.2xl flex items-center justify-center border transition-all duration-500 group-hover:scale-110 shadow-lg ${themes[color]}`}>
        <Icon className="w-8 h-8" />
      </div>
      <div>
        <div className="text-2xl font-black text-white font-mono tracking-tighter leading-none mb-1.5">{value}</div>
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{title}</div>
      </div>
    </div>
  );
};
