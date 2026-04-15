import { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Account } from './types';
import { FIELD_CLS } from './constants';

export function ParentSelector({
  accounts, value, onChange, currentId,
}: {
  accounts: Account[];
  value: string;
  onChange: (v: string) => void;
  currentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const options = useMemo(() => {
    const q = search.toLowerCase();
    return accounts
      .filter(a => a.id !== currentId)
      .filter(a => !q || a.code.includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 60);
  }, [accounts, search, currentId]);

  const selected = accounts.find(a => a.code === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`${FIELD_CLS} flex items-center justify-between text-left`}
      >
        <span className={selected ? 'text-white' : 'text-gray-500'}>
          {selected ? `${selected.code} — ${selected.name}` : 'Sin cuenta padre (cuenta raíz)'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-gray-700">
            <input
              autoFocus
              type="text"
              placeholder="Buscar por código o nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors ${!value ? 'text-indigo-400 font-medium' : 'text-gray-400'}`}
            >
              — Sin cuenta padre (cuenta raíz)
            </button>
            {options.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(a.code); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2 ${value === a.code ? 'bg-indigo-600/20 text-indigo-300' : 'text-white'}`}
                style={{ paddingLeft: `${8 + (a.level - 1) * 16}px` }}
              >
                <span className="font-mono text-xs text-gray-400 w-12 flex-shrink-0">{a.code}</span>
                <span className="truncate">{a.name}</span>
              </button>
            ))}
            {options.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-500 text-center">Sin resultados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
