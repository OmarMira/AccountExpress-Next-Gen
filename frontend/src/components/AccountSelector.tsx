import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

export interface GlAccount {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
}

export function getNormalBalanceBadge(normalBalance: string) {
  if (normalBalance === 'debit') {
    return { label: 'Débito', className: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' };
  }
  return { label: 'Crédito', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' };
}

export function getAccountTypeBadge(accountType: string) {
  switch (accountType) {
    case 'asset':     return { label: 'Activo',  className: 'bg-sky-500/10 text-sky-400 border border-sky-500/20' };
    case 'liability': return { label: 'Pasivo',  className: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' };
    case 'equity':    return { label: 'Capital', className: 'bg-violet-500/10 text-violet-400 border border-violet-500/20' };
    case 'revenue':   return { label: 'Ingreso', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' };
    case 'expense':   return { label: 'Gasto',   className: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' };
    default:          return { label: accountType, className: 'bg-slate-700 text-slate-300' };
  }
}

interface AccountSelectorProps {
  accounts: GlAccount[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
}

export function AccountSelector({ accounts, value, onChange, required }: AccountSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => accounts.find(a => a.id === value), [accounts, value]);

  const filtered = useMemo(() => {
    return accounts.filter(a =>
      a.code.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [accounts, search]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSelect = (acc: GlAccount) => {
    onChange(acc.id);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  return (
    <div className="relative group" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-[#0a1628] border border-white/10 p-3 rounded-xl text-white outline-none focus:border-[#0071c5] flex items-center justify-between text-left transition-all"
      >
        <div className="flex items-center gap-2 flex-1 truncate">
          {selected ? (
            <>
              <span className="font-mono text-[#0071c5] whitespace-nowrap">{selected.code}</span>
              <span className="truncate text-slate-200">{selected.name}</span>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${getNormalBalanceBadge(selected.normalBalance).className}`}>
                {getNormalBalanceBadge(selected.normalBalance).label}
              </span>
            </>
          ) : (
            <span className="text-slate-500">Seleccionar cuenta...</span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-2">
          {selected && (
            <div onClick={handleClear} className="p-1 hover:bg-white/5 rounded-md transition-colors">
              <X className="w-3.5 h-3.5 text-slate-500 hover:text-rose-400" />
            </div>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <input
        required={required}
        value={value}
        onChange={() => {}}
        className="absolute opacity-0 pointer-events-none w-full h-10 bottom-0 left-0"
      />

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#0f2240] border border-white/7 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 border-b border-white/10 bg-[#0a1628]/50 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-500 ml-2" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar por código o nombre..."
              className="w-full bg-transparent p-2 text-sm text-white outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <ul className="max-h-64 overflow-y-auto p-1 custom-scrollbar">
            {filtered.length > 0 ? (
              filtered.map((acc) => (
                <li
                  key={acc.id}
                  onClick={() => handleSelect(acc)}
                  className={`
                    flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all
                    ${value === acc.id ? 'bg-[#0071c5]/20 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}
                  `}
                >
                  <span className="font-mono text-[#0071c5] w-12 text-xs font-bold">{acc.code}</span>
                  <span className="flex-1 truncate text-sm">{acc.name}</span>
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${getAccountTypeBadge(acc.accountType).className}`}>
                      {getAccountTypeBadge(acc.accountType).label}
                    </span>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${getNormalBalanceBadge(acc.normalBalance).className}`}>
                      {getNormalBalanceBadge(acc.normalBalance).label}
                    </span>
                  </div>
                </li>
              ))
            ) : (
              <li className="p-4 text-center text-slate-500 text-sm">No se encontraron cuentas</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
