import { useState } from 'react';
import {
  Upload,
  History,
  Bot,
  FileUp,
  Zap,
  ShieldCheck,
  Database,
  Terminal as TerminalIcon,
  Layers,
  Sparkles,
  ArrowRight,
  Shield,
  Activity,
  Cpu
} from 'lucide-react';
import { BankImportWizard } from './BankImportWizard';
import { ImportHistory } from './ImportHistory';

type Tab = 'import' | 'history';

export const BankImport: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('import');
  const [showWizard, setShowWizard] = useState(false);

  const handleImportComplete = () => {
    setShowWizard(false);
    setActiveTab('history');
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      {/* Header Hub */}
      <div className="flex flex-col xl:flex-row items-center justify-between gap-8 border-b border-slate-800 pb-10">
        <div className="flex items-center gap-6">
          <div className="p-4 bg-blue-600/10 rounded-2.5xl border border-blue-500/20 shadow-blue-900/10 shadow-lg group">
            <Bot className="w-10 h-10 text-blue-500 group-hover:scale-110 transition-transform duration-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tighter uppercase">Importar Extractos</h1>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" /> Sincronización de Libros Bancarios
            </p>
          </div>
        </div>

        {/* Tab Switcher - Kinetic Design */}
        <div className="flex gap-2 p-1.5 bg-slate-950 border border-slate-900 rounded-2.5xl shadow-3xl overflow-hidden">
          <TabButton
            active={activeTab === 'import'}
            onClick={() => setActiveTab('import')}
            label="IMPORTAR"
            icon={Upload}
            color="blue"
          />
          <TabButton
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            label="HISTORIAL"
            icon={History}
            color="indigo"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="relative">
        {activeTab === 'import' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 border-slate-800 animate-in slide-in-from-bottom-6 duration-700">
            {/* Main Action Card - High stakes design */}
            <div className="lg:col-span-2 p-12 bg-slate-900 border-2 border-slate-800 rounded-[3.5rem] shadow-3xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] -mr-48 -mt-48 group-hover:bg-blue-500/10 transition-all duration-700"></div>

              <div className="relative z-10 text-center py-10">
                <div className="w-40 h-40 bg-slate-950 rounded-[3rem] border-2 border-slate-800 flex items-center justify-center mx-auto mb-10 shadow-2xl group-hover:scale-105 group-hover:border-blue-500/50 transition-all duration-500 relative">
                  <div className="absolute inset-0 bg-blue-500/5 rounded-[3rem] animate-pulse"></div>
                  <FileUp className="w-16 h-16 text-blue-500 relative z-10" />
                </div>
                <h2 className="text-2xl font-black text-white tracking-tighter uppercase mb-4">Sincroniza tus Activos</h2>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest max-w-xl mx-auto mb-10">
                  Carga archivos <span className="text-blue-400 font-medium">CSV / OFX / QFX / PDF</span>. Nuestro motor neuronal detectará anomalías, categorizará vía heurística y vinculará cada transacción al libro mayor.
                </p>

                <button
                  onClick={() => setShowWizard(true)}
                  className="flex items-center gap-5 px-14 py-7 bg-blue-600 hover:bg-blue-500 text-white rounded-2.5xl font-black uppercase tracking-widest text-[11px] transition-all shadow-3xl shadow-blue-900/50 hover:-translate-y-1 active:scale-95 mx-auto group/btn cursor-pointer"
                >
                  <Zap className="w-4 h-4 fill-current" />
                  Ejecutar Importación de Élite
                  <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* Sidebar Guidelines - Forensic Style */}
            <div className="space-y-6">
              <GuidelineCard
                step="01"
                title="Extracción"
                desc="Obtén el resumen bancario desde tu bóveda digital oficial."
                icon={Database}
                color="blue"
              />
              <GuidelineCard
                step="02"
                title="Refinado IA"
                desc="El motor mapea las cuentas basado en patrones transaccionales."
                icon={Layers}
                color="emerald"
              />
              <GuidelineCard
                step="03"
                title="Certificación"
                desc="Las transacciones se integran con firma de integridad SHA-256."
                icon={ShieldCheck}
                color="indigo"
              />

              <div className="p-10 bg-slate-950 border border-slate-800 rounded-[2.5rem] text-center shadow-xl group">
                <TerminalIcon className="w-8 h-8 text-slate-800 mx-auto mb-6 group-hover:text-blue-500 group-hover:scale-110 transition-all" />
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                    <Shield className="w-3 h-3 text-blue-600" /> Security Layer: AES-256
                  </p>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                    <Activity className="w-3 h-3 text-emerald-600" /> Sync Rate: Real-Time
                  </p>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center justify-center gap-2">
                    <Cpu className="w-3 h-3 text-indigo-600" /> Neural Engine: Active
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
            <ImportHistory />
          </div>
        )}
      </div>

      {showWizard && (
        <BankImportWizard
          onClose={() => setShowWizard(false)}
          onComplete={handleImportComplete}
        />
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, label, icon: Icon, color }: { active: boolean, onClick: () => void, label: string, icon: any, color: string }) => {
  const themes: any = {
    blue: active ? 'bg-blue-600 shadow-blue-900/40' : 'hover:bg-blue-600/10',
    indigo: active ? 'bg-indigo-600 shadow-indigo-900/40' : 'hover:bg-indigo-600/10',
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-10 py-4 rounded-[1.4rem] font-black uppercase tracking-[0.2em] text-[10px] transition-all duration-500 border-2 ${active ? `${themes[color]} text-white border-transparent shadow-xl` : 'text-slate-500 border-transparent hover:text-white'}`}
    >
      <Icon className={`w-4 h-4 ${active ? 'animate-pulse' : 'text-slate-700'}`} />
      {label}
    </button>
  );
};

const GuidelineCard = ({ step, title, desc, icon: Icon, color }: { step: string, title: string, desc: string, icon: any, color: string }) => {
  const themes: any = {
    blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20 shadow-blue-950/20',
    emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 shadow-emerald-950/20',
    indigo: 'text-indigo-500 bg-indigo-600/10 border-indigo-500/20 shadow-indigo-950/20'
  };

  return (
    <div className="p-8 bg-slate-900 border border-slate-800 rounded-[2.5rem] flex items-center gap-6 group hover:border-slate-700 transition-all duration-500 hover:-translate-x-1 shadow-xl">
      <div className={`w-16 h-16 rounded-2.2xl flex items-center justify-center flex-shrink-0 transition-all duration-500 group-hover:scale-110 shadow-lg border ${themes[color]}`}>
        <Icon className="w-8 h-8" />
      </div>
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-slate-800 pb-0.5">{step}</span>
          <h4 className="text-sm font-black text-white uppercase tracking-tighter group-hover:text-blue-400 transition-colors">{title}</h4>
        </div>
        <p className="text-[10px] font-black text-slate-500 leading-tight uppercase tracking-wide">{desc}</p>
      </div>
    </div>
  );
};
