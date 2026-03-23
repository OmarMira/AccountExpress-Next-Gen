import { useState } from 'react';
import {
  Upload,
  History,
  Bot,
  FileUp,
  Zap,
  ShieldCheck,
  Database,
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
    <div className="space-y-6 animate-in fade-in duration-700 pb-4">
      {/* Header Hub */}
      <div className="flex flex-col xl:flex-row items-center justify-between gap-6 pb-2">
        <div className="flex items-center gap-6">
          <div className="p-4 bg-blue-600/10 rounded-2.5xl border border-blue-500/20 shadow-blue-900/10 shadow-lg group">
            <Bot className="w-10 h-10 text-blue-500 group-hover:scale-110 transition-transform duration-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Importar Extractos</h1>
            <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" /> Sincronización de libros bancarios
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 p-1.5 bg-gray-900/50 border border-gray-800 rounded-2xl">
          <TabButton
            active={activeTab === 'import'}
            onClick={() => setActiveTab('import')}
            label="Importar"
            icon={Upload}
          />
          <TabButton
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            label="Historial"
            icon={History}
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="relative">
        {activeTab === 'import' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 border-slate-800 animate-in slide-in-from-bottom-6 duration-700">
            {/* Main Action Card */}
            <div className="lg:col-span-2 p-8 bg-gray-900 border border-gray-800 rounded-3xl shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-500/5 blur-[100px] -mr-40 -mt-40 group-hover:bg-indigo-500/10 transition-all duration-700"></div>

              <div className="relative z-10 text-center py-4">
                <div className="w-20 h-20 bg-gray-950 rounded-2xl border border-gray-800 flex items-center justify-center mx-auto mb-5 shadow-xl group-hover:scale-105 group-hover:border-indigo-500/50 transition-all duration-500 relative">
                  <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl animate-pulse"></div>
                  <FileUp className="w-8 h-8 text-indigo-400 relative z-10" />
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight mb-2">Sincroniza tus Activos</h2>
                <p className="text-sm text-gray-400 max-w-lg mx-auto mb-6 leading-relaxed">
                  Sube tu extracto bancario en formato CSV, OFX, QFX o PDF.<br/>
                  El sistema detectará el banco, categorizará cada transacción automáticamente y la vinculará a tu plan de cuentas.
                </p>

                <button
                  onClick={() => setShowWizard(true)}
                  className="flex justify-center items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 mx-auto group/btn"
                >
                  <Zap className="w-4 h-4" />
                  Importar Extracto Bancario
                  <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* Sidebar Guidelines - Forensic Style */}
            <div className="space-y-4">
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

              <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl shadow-inner">
                <div className="space-y-2.5">
                  <p className="text-xs font-medium text-gray-400 flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" /> Security Layer: AES-256
                  </p>
                  <p className="text-xs font-medium text-gray-400 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" /> Sync Rate: Real-Time
                  </p>
                  <p className="text-xs font-medium text-gray-400 flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-purple-400" /> Neural Engine: Active
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

const TabButton = ({ active, onClick, label, icon: Icon }: { active: boolean, onClick: () => void, label: string, icon: any }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 ${active ? 'bg-gray-800 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
    >
      <Icon className={`w-4 h-4 ${active ? 'text-indigo-400' : 'text-gray-500'}`} />
      {label}
    </button>
  );
};

const GuidelineCard = ({ step, title, desc, icon: Icon, color }: { step: string, title: string, desc: string, icon: any, color: string }) => {
  const themes: any = {
    blue: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    indigo: 'text-purple-400 bg-purple-500/10 border-purple-500/20'
  };

  return (
    <div className="p-4 bg-gray-800/40 border border-gray-700/50 rounded-xl flex items-start gap-4 group hover:bg-gray-800 transition-all duration-300 shadow-sm">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${themes[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-semibold text-gray-500">{step}</span>
          <h4 className="text-xs font-semibold text-white">{title}</h4>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
};
