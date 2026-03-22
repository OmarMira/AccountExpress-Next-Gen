import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { Save, XCircle, Building2, Landmark, Layers } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface BankAccountModalProps {
    prefilledBankName: string;
    onSuccess: (newAccountId: string) => void;
    onCancel: () => void;
}

export const BankAccountModal: React.FC<BankAccountModalProps> = ({ prefilledBankName, onSuccess, onCancel }) => {
    const activeCompany = useAuthStore(s => s.activeCompany);
    const queryClient = useQueryClient();
    
    const [accountName, setAccountName] = useState('');
    const [bankName, setBankName] = useState(prefilledBankName);
    const [accountNumber, setAccountNumber] = useState('');

    const createMutation = useMutation({
        mutationFn: async () => {
             return fetchApi('/bank-accounts', {
                 method: 'POST',
                 body: JSON.stringify({
                     companyId: activeCompany?.id,
                     accountName,
                     bankName,
                     accountNumber
                 })
             });
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
            onSuccess(res.id);
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate();
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[100] p-6 animate-in fade-in zoom-in duration-300">
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-2xl p-8 md:p-10 relative flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                <div className="flex justify-between items-start mb-8">
                   <div>
                       <h2 className="text-2xl font-black text-white flex items-center gap-3">
                           <Landmark className="text-indigo-500 w-8 h-8" />
                           Banco No Registrado
                       </h2>
                       <p className="text-slate-400 text-[11px] mt-2 uppercase tracking-widest font-bold">
                           El banco <span className="text-indigo-400">{prefilledBankName}</span> no existe en el sistema. <br/> Por favor, regístrelo rápidamente para continuar la importación.
                       </p>
                   </div>
                   <button onClick={onCancel} className="text-slate-500 hover:text-white bg-slate-950 rounded-full p-2 border border-slate-800 hover:border-slate-700 transition-all">
                       <XCircle className="w-5 h-5" />
                   </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-2 ml-1">
                            <Building2 className="w-3.5 h-3.5 text-indigo-500" /> Nombre de la Cuenta (Alias)
                        </label>
                        <input 
                            required 
                            value={accountName} 
                            onChange={e => setAccountName(e.target.value)} 
                            placeholder="Ej: Cuenta de Cheques Principal" 
                            className="w-full bg-slate-950 text-white px-5 py-4 rounded-xl border border-slate-800 focus:border-indigo-500 focus:outline-none font-bold placeholder:font-normal placeholder:text-slate-600 transition-colors" 
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-2 ml-1">
                            <Landmark className="w-3.5 h-3.5 text-indigo-500" /> Banco Emisor
                        </label>
                        <input 
                            required 
                            value={bankName} 
                            onChange={e => setBankName(e.target.value)} 
                            className="w-full bg-slate-950 text-white px-5 py-4 rounded-xl border border-slate-800 focus:border-indigo-500 focus:outline-none font-bold transition-colors" 
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-2 ml-1">
                            <Layers className="w-3.5 h-3.5 text-indigo-500" /> Terminación / Cuenta
                        </label>
                        <input 
                            value={accountNumber} 
                            onChange={e => setAccountNumber(e.target.value)} 
                            placeholder="Últimos 4 dígitos (Opcional)" 
                            className="w-full bg-slate-950 text-white px-5 py-4 rounded-xl border border-slate-800 focus:border-indigo-500 focus:outline-none font-bold placeholder:font-normal placeholder:text-slate-600 transition-colors" 
                        />
                    </div>

                    <div className="flex justify-end pt-4 mt-8 border-t border-slate-800/50">
                        <button 
                            type="submit" 
                            disabled={createMutation.isPending} 
                            className="mt-4 flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors shadow-lg shadow-indigo-900/20 disabled:opacity-50"
                        >
                            {createMutation.isPending ? 'Guardando...' : 'Crear Banco y Reanudar'} <Save className="w-4 h-4" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
