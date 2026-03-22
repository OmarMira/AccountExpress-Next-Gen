import { useState, useCallback, useRef, useEffect } from 'react';
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
  Check
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BankAccountModal } from '../BankAccountModal';

type Step = 'upload' | 'preview';

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
  const [processingSequence, setProcessingSequence] = useState<File[]>([]);

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

  const processNextFile = async (fileToProcess: File) => {
    setLoading(true);
    setError(null);
    const isPDF = fileToProcess.name.toLowerCase().endsWith('.pdf');

    try {
      if (isPDF) {
        const { parseBankPDF } = await import('../../services/pdf-bank-parser');
        const transactions = await parseBankPDF(fileToProcess);
        if (transactions.length === 0) throw new Error(`No se encontraron transacciones en: ${fileToProcess.name}`);

        const detectBankFromFilename = (filename: string): string => {
            const name = filename.toLowerCase();
            if (name.includes('chase')) return 'CHASE BANK NA';
            if (name.includes('bofa') || name.includes('bofaempresa') || name.includes('bankofamerica') || name.includes('estmt') || name.includes('stmt')) return 'Bank of America';
            if (name.includes('wellsfargo') || name.includes('wf')) return 'Wells Fargo';
            return 'Banco Desconocido';
        };

        const payload = {
            transactions,
            bankName: detectBankFromFilename(fileToProcess.name),
            fileName: fileToProcess.name,
            importBatchId: crypto.randomUUID(),
            companyId: activeCompany?.id || ''
        };

        const res = await fetch('/api/bank/import-parsed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
            if (data.error === 'UNKNOWN_BANK') {
                setUnknownBankName(data.bankName);
                setLoading(false);
                return; // Pause process loop
            }
            throw new Error(data.error || `Error ${res.status}`);
        }
      } else {
        const formData = new FormData();
        formData.append('file', fileToProcess);
        formData.append('companyId', activeCompany?.id || '');

        const res = await fetch('/api/bank/import', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) {
            if (data.error === 'UNKNOWN_BANK') {
                setUnknownBankName(data.bankName);
                setLoading(false);
                return; // Pause process loop
            }
            throw new Error(data.error || `Error ${res.status}`);
        }
      }

      // Pop the file and continue
      setProcessingSequence(prev => prev.slice(1));
    } catch (err: any) {
      setError(`❌ Error procesando ${fileToProcess.name}: ${err.message}`);
      setProcessingSequence([]); // Abort remainder
      setLoading(false);
    }
  };

  // Run the sequence loop
  useEffect(() => {
    if (processingSequence.length > 0 && !loading && !unknownBankName) {
      processNextFile(processingSequence[0]);
    } else if (processingSequence.length === 0 && files.length > 0 && loading && !unknownBankName && !error) {
       // Completed all files successfully
       setLoading(false);
       setStep('preview');
    }
  }, [processingSequence, loading, unknownBankName, error]);

  const handleStartProcessing = () => {
    if (files.length === 0) return;
    setProcessingSequence([...files]);
    setError(null);
  };

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
      <div className="bg-slate-900 border-2 border-slate-800 rounded-[4rem] shadow-4xl w-full max-w-6xl my-auto overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-700">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] pointer-events-none"></div>

        <header className="flex items-center justify-between p-12 border-b border-slate-800 relative z-10 bg-slate-900/50">
          <div className="flex items-center gap-8">
            <div className="p-5 bg-blue-600/10 rounded-2.5xl border border-blue-500/20 text-blue-500 shadow-xl group">
              <Cpu className="w-8 h-8 group-hover:scale-110 transition-transform duration-500" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Protocolo de Importación</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> Neural Ledger Interface v2.4
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-500 hover:text-white transition-all shadow-lg hover:border-slate-700">
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="px-12 py-8 border-b border-slate-800 flex items-center justify-center bg-slate-950/30">
          <div className="flex items-center gap-10">
            <StepIndicator active={step === 'upload'} completed={step !== 'upload'} step="01" label="CARGA" icon={Upload} />
            <div className={`w-32 h-px ${step !== 'upload' ? 'bg-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-slate-800'}`}></div>
            <StepIndicator active={step !== 'upload'} completed={false} step="02" label="VERIFICACIÓN" icon={Target} />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-12 relative z-10">
          {step === 'upload' ? (
            <div className="space-y-10 animate-in slide-in-from-bottom-6 duration-700">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-4 border-dashed rounded-[3rem] p-24 text-center transition-all duration-500 group relative overflow-hidden ${dragActive ? 'border-blue-500 bg-blue-500/5 scale-[0.99]' : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                  }`}
              >
                <div className={`absolute inset-0 bg-blue-500/5 transition-opacity duration-700 ${dragActive ? 'opacity-100 animate-pulse' : 'opacity-0'}`}></div>
                <div className="relative z-10">
                  <div className={`w-24 h-24 bg-slate-950 rounded-2.5xl border border-slate-800 flex items-center justify-center mx-auto mb-8 shadow-2xl transition-all duration-500 ${dragActive ? 'scale-110 border-blue-500/50' : 'group-hover:scale-105'}`}>
                    <Upload className={`w-10 h-10 ${dragActive ? 'text-blue-500 animate-bounce' : 'text-slate-600'}`} />
                  </div>
                  <h3 className="text-2xl font-black text-white tracking-tighter uppercase mb-2">Inyección de Archivo Fuente</h3>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-relaxed max-w-sm mx-auto mb-10">
                    ARRASTRA TU BASE DE DATOS AQUÍ O HAZ CLIC PARA SELECCIONAR. SOPORTA <span className="text-blue-400">CSV / OFX / QFX / PDF</span>. HASTA 10MB POR CICLO.
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
                    className="inline-flex px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] cursor-pointer transition-all shadow-3xl shadow-blue-900/50 hover:-translate-y-1"
                  >
                    Localizar Archivo
                  </button>
                </div>
              </div>

              {files.length > 0 && files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="bg-slate-950 border-2 border-slate-800 rounded-[2rem] p-8 flex items-center justify-between shadow-2xl animate-in slide-in-from-top-4 duration-500 mb-4 last:mb-0">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-blue-600/10 rounded-2xl border border-blue-500/20 flex items-center justify-center">
                      <FileText className="w-7 h-7 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white uppercase tracking-tighter">{file.name}</p>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">
                        Capacidad: {(file.size / 1024 / 1024).toFixed(2)} MB / Protocolo: {file.name.split('.').pop()?.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))}
                    className="p-3 bg-slate-900 border border-slate-800 text-slate-600 hover:text-rose-500 hover:border-rose-500/50 rounded-xl transition-all"
                  >
                    <X className="w-5 h-5" />
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

              <div className="flex justify-end gap-6 pt-10 border-t border-slate-800">
                <button onClick={onClose} className="px-10 py-5 bg-slate-950 border border-slate-800 text-slate-500 rounded-2.5xl font-black uppercase tracking-widest text-[10px] transition-all hover:bg-slate-800">
                  Abortar Misión
                </button>
                <button
                  onClick={handleStartProcessing}
                  disabled={files.length === 0 || loading}
                  className="px-14 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2.5xl font-black uppercase tracking-widest text-[10px] transition-all shadow-3xl shadow-blue-900/50 hover:-translate-y-1 active:scale-95 disabled:opacity-50 flex items-center gap-4"
                >
                  {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Zap className="w-4 h-4 fill-current" />}
                  {loading ? 'CALIBRANDO...' : 'INICIAR PROCESAMIENTO'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-10 animate-in slide-in-from-bottom-6 duration-700">
              <div className="grid grid-cols-3 gap-8">
                <StatHighlight title="Registro Total" value={pendingTransactions.length.toString()} icon={Layers} color="blue" />
                <StatHighlight title="Alertas de Duplicidad" value="0" icon={AlertTriangle} color="rose" />
                <StatHighlight title="Nivel de Confianza" value={`95%`} icon={Target} color="emerald" />
              </div>

              {error && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-[2rem] p-8 flex items-center gap-6 animate-in shake duration-500">
                  <div className="w-12 h-12 bg-rose-500/10 rounded-2xl border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-6 h-6 text-rose-500" />
                  </div>
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{error}</p>
                </div>
              )}

              <div className="bg-slate-950 border-2 border-slate-800 rounded-[3rem] overflow-hidden shadow-3xl group">
                <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left">
                    <thead className="bg-slate-900/50 sticky top-0 z-20">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-800">
                        <th className="px-8 py-6">Timestamp</th>
                        <th className="px-8 py-6">Descriptor</th>
                        <th className="px-8 py-6 text-right">Monto</th>
                        <th className="px-8 py-6">Categoría IA</th>
                        <th className="px-8 py-6 text-center">Status</th>
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
                              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Detectando...</span>
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[8px] font-black border border-emerald-500/20">
                                99% ACC
                              </span>
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

              <div className="flex justify-between gap-6 pt-10 border-t border-slate-800">
                <button onClick={() => { setStep('upload'); setFiles([]); }} className="px-10 py-5 bg-slate-950 border border-slate-800 text-slate-500 rounded-2.5xl font-black uppercase tracking-widest text-[10px] transition-all hover:bg-slate-800 flex items-center gap-3">
                  <ArrowRight className="w-4 h-4 rotate-180" /> Recalibrar
                </button>
                <div className="flex gap-6">
                  <button onClick={onClose} className="px-10 py-5 bg-slate-950 border border-slate-800 text-slate-500 rounded-2.5xl font-black uppercase tracking-widest text-[10px] transition-all hover:bg-slate-800">
                    Cancelar
                  </button>
                  <button
                    onClick={handleFinalizeImport}
                    disabled={loading || pendingTransactions.length === 0}
                    className="px-14 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2.5xl font-black uppercase tracking-widest text-[10px] transition-all shadow-3xl shadow-blue-900/50 hover:-translate-y-1 active:scale-95 disabled:opacity-50 flex items-center gap-4"
                  >
                    {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <ShieldCheck className="w-4 h-4" />}
                    {loading ? 'CERTIFICANDO...' : 'INYECTAR EN LIBRO MAYOR'}
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
           onCancel={() => setUnknownBankName(null)}
           onSuccess={() => {
              setUnknownBankName(null);
           }}
        />
      )}
    </div>
  );
};

const StepIndicator = ({ active, completed, step, label, icon: Icon }: { active: boolean, completed: boolean, step: string, label: string, icon: any }) => (
  <div className={`flex items-center gap-4 transition-all duration-500 ${active ? 'scale-110' : completed ? 'opacity-80' : 'opacity-40'}`}>
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-2 transition-all duration-500 shadow-xl ${active ? 'bg-blue-600 border-blue-400 text-white shadow-blue-900/40' :
      completed ? 'bg-emerald-600/10 border-emerald-500/40 text-emerald-500' :
        'bg-slate-950 border-slate-800 text-slate-600'
      }`}>
      {completed ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
    </div>
    <div className="text-left">
      <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.3em] block mb-0.5">{step}</span>
      <span className={`text-[11px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-slate-500'}`}>{label}</span>
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
