import React, { useState, useMemo } from 'react';
import { 
  Printer, 
  Download, 
  X, 
  Layout, 
  Eye, 
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Building2,
  FileText
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface Column {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: (value: any) => string;
}

interface PrintConfig {
  moduleName: string;
  dateRange?: boolean;
  searchByDescription?: boolean;
  columnSelector?: boolean;
  mandatoryColumns?: string[];
}

interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  config: PrintConfig;
  columns: Column[];
  data: any[];
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  config,
  columns,
  data
}) => {
  const activeCompany = useAuthStore((state) => (state.activeCompany as any));
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    columns.map(c => c.key)
  );

  // Filtered data based on search
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    return data.filter(item => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [data, searchTerm]);

  const visibleColumns = columns.filter(c => selectedColumns.includes(c.key));

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    // For now, trigger print which allows Save as PDF in most browsers
    // In a full implementation, we could use @react-pdf/renderer here
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-10">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-7xl h-full max-h-[90vh] bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-3xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        
        {/* Header (Non-Printable) */}
        <div className="flex flex-col md:flex-row items-center justify-between p-6 md:px-10 border-b border-slate-800 bg-slate-900/50 gap-6 print:hidden">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 flex items-center justify-center">
              <Eye className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Vista Previa de Impresión</h3>
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-0.5">{title}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-black rounded-xl transition-all border border-slate-700 uppercase tracking-widest"
            >
              <Download className="w-4 h-4" /> PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl transition-all shadow-lg shadow-indigo-500/20 uppercase tracking-widest"
            >
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button
              onClick={onClose}
              className="p-2.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Toolbar (Non-Printable) */}
        <div className="p-4 md:px-10 bg-slate-900/30 border-b border-slate-800 flex flex-wrap items-center gap-6 print:hidden">
          {config.searchByDescription && (
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Filtrar contenido del reporte..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
              />
            </div>
          )}

          {config.columnSelector && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Filter className="w-3 h-3 text-indigo-500" /> Columnas:
              </span>
              <div className="flex flex-wrap gap-2">
                {columns.map(col => {
                  const isMandatory = config.mandatoryColumns?.includes(col.key);
                  return (
                    <button
                      key={col.key}
                      disabled={isMandatory}
                      onClick={() => {
                        if (selectedColumns.includes(col.key)) {
                          setSelectedColumns(selectedColumns.filter(k => k !== col.key));
                        } else {
                          setSelectedColumns([...selectedColumns, col.key]);
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter transition-all border ${
                        selectedColumns.includes(col.key)
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 shadow-indigo-500/5'
                          : 'bg-slate-800/50 text-slate-500 border-slate-700/50'
                      } ${isMandatory ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                    >
                      {col.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Report Content (Printable) */}
        <div className="flex-1 overflow-auto p-8 md:p-12 bg-white print:p-0 print:overflow-visible" id="printable-report">
          <div className="max-w-4xl mx-auto space-y-8 print:max-w-none">
            
            {/* Report Header */}
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-8">
              <div className="space-y-3">
                {activeCompany?.logo ? (
                  <img src={activeCompany.logo} alt="Logo" className="h-16 w-auto object-contain" />
                ) : (
                  <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200">
                    <Building2 className="w-8 h-8 text-slate-400" />
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">{activeCompany?.legalName || 'AccountExpress Legal Entity'}</h1>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{activeCompany?.taxId || 'Tax ID: 000-00000-0'}</p>
                </div>
              </div>

              <div className="text-right space-y-2">
                <div className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-[0.2em]">
                  <FileText className="w-3.5 h-3.5" /> Reporte Oficial
                </div>
                <h2 className="text-2xl font-black text-slate-900 uppercase">{title}</h2>
                <div className="flex flex-col text-[10px] font-bold text-slate-500 uppercase items-end gap-1">
                  <span className="flex items-center gap-2"><Calendar className="w-3 h-3" /> Generado: {new Date().toLocaleString()}</span>
                  <span className="flex items-center gap-2"><Layout className="w-3 h-3" /> Sistema: AccountExpress Next-Gen</span>
                </div>
              </div>
            </div>

            {/* Sub-Header (Optional Filter Info) */}
            {(searchTerm || filteredData.length !== data.length) && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between print:hidden">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Search className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vista Filtrada</p>
                    <p className="text-xs font-bold text-slate-700">Mostrando {filteredData.length} de {data.length} registros</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSearchTerm('')}
                  className="text-[10px] font-black text-indigo-600 uppercase hover:underline"
                >
                  Limpiar Filtros
                </button>
              </div>
            )}

            {/* Table */}
            <div className="overflow-hidden border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    {visibleColumns.map(col => (
                      <th 
                        key={col.key} 
                        className={`px-4 py-4 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 last:border-0 ${
                          col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                        }`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      {visibleColumns.map(col => (
                        <td 
                          key={col.key} 
                          className={`px-4 py-3.5 text-[11px] font-medium text-slate-700 font-mono tracking-tighter ${
                            col.align === 'right' ? 'text-right font-bold' : col.align === 'center' ? 'text-center' : ''
                          }`}
                        >
                          {col.format ? col.format(row[col.key], row) : row[col.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="pt-20 grid grid-cols-2 gap-20">
              <div className="border-t border-slate-400 pt-4 text-center">
                <div className="h-20 flex items-end justify-center">
                  {/* Signature Placeholder */}
                </div>
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Responsable de área</p>
              </div>
              <div className="border-t border-slate-400 pt-4 text-center">
                <div className="h-20 flex items-end justify-center">
                   {/* Signature Placeholder */}
                </div>
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Auditoría / Control</p>
              </div>
            </div>

            <div className="text-center pt-8 border-t border-slate-100 pb-4">
              <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.4em]">Propiedad de {activeCompany?.legalName} — Emitido mediante AccountExpress Forensics Module</p>
            </div>
          </div>
        </div>

        {/* Global Print Styles */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-report, #printable-report * {
              visibility: visible;
            }
            #printable-report {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              height: auto;
              margin: 0;
              padding: 0;
              background: white !important;
            }
            @page {
              margin: 1cm;
              size: portrait;
            }
            .print\\:hidden {
              display: none !important;
            }
          }
        `}} />
      </div>
    </div>
  );
};
