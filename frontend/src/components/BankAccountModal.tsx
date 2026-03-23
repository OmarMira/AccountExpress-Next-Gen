import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { Save, XCircle, Landmark } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface BankAccountModalProps {
    prefilledBankName: string;
    prefilledAccountNumber?: string;
    onSuccess: (newAccountId: string) => void;
    onCancel: () => void;
}

export const BankAccountModal: React.FC<BankAccountModalProps> = ({ prefilledBankName, prefilledAccountNumber, onSuccess, onCancel }) => {
    const activeCompany = useAuthStore(s => s.activeCompany);
    const queryClient = useQueryClient();
    
    const [accountName, setAccountName] = useState(prefilledBankName || '');
    const [bankName, setBankName] = useState(prefilledBankName);
    const [accountNumber, setAccountNumber] = useState(prefilledAccountNumber || '');
    const [accountType, setAccountType] = useState('checking');
    const [routingNumber, setRoutingNumber] = useState('');
    const [balance, setBalance] = useState('0');
    const [currency, setCurrency] = useState('USD');
    const [notes, setNotes] = useState('');

    const createMutation = useMutation({
        mutationFn: async () => {
             return fetchApi('/bank-accounts', {
                 method: 'POST',
                 body: JSON.stringify({
                     companyId: activeCompany?.id,
                     accountName,
                     bankName,
                     accountNumber,
                     accountType,
                     routingNumber,
                     balance: Number(balance),
                     currency,
                     notes
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
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl p-8 md:p-10 relative flex flex-col shadow-2xl">
                <div className="flex justify-between items-start mb-8">
                   <div>
                       <h2 className="text-xl font-bold text-white flex items-center gap-3 tracking-tight">
                           <Landmark className="text-indigo-400 w-6 h-6" />
                           Banco No Registrado
                       </h2>
                       <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                           El banco <span className="text-indigo-400 font-medium">{prefilledBankName}</span> no existe en el sistema. <br/> Por favor, complete el registro para continuar.
                       </p>
                   </div>
                   <button onClick={onCancel} className="text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-xl p-2 transition-all">
                       <XCircle className="w-5 h-5" />
                   </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left Column */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 ml-1">Nombre de la cuenta (Alias) *</label>
                                <input required value={accountName} onChange={e => setAccountName(e.target.value)} className="w-full bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-white focus:border-indigo-500 focus:outline-none text-sm transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 ml-1">Banco Emisor *</label>
                                <input required value={bankName} onChange={e => setBankName(e.target.value)} className="w-full bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-white focus:border-indigo-500 focus:outline-none text-sm transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 ml-1">Número de Cuenta *</label>
                                <input required value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="w-full bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-white focus:border-indigo-500 focus:outline-none text-sm transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 ml-1">Tipo de Cuenta</label>
                                <select value={accountType} onChange={e => setAccountType(e.target.value)} className="w-full bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-white focus:border-indigo-500 focus:outline-none text-sm transition-colors appearance-none cursor-pointer">
                                    <option value="checking">Corriente (Checking)</option>
                                    <option value="savings">Ahorro (Savings)</option>
                                    <option value="credit">Crédito (Credit)</option>
                                    <option value="other">Otro</option>
                                </select>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 ml-1">Número de Ruta (ABA)</label>
                                <input value={routingNumber} onChange={e => setRoutingNumber(e.target.value)} className="w-full bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-white focus:border-indigo-500 focus:outline-none text-sm transition-colors" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 ml-1">Saldo Inicial</label>
                                    <input type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)} className="w-full bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-white focus:border-indigo-500 focus:outline-none text-sm transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 ml-1">Moneda</label>
                                    <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-white focus:border-indigo-500 focus:outline-none text-sm transition-colors appearance-none cursor-pointer">
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="MXN">MXN</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 ml-1">Notas / Memo</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-white focus:border-indigo-500 focus:outline-none text-sm transition-colors resize-none"></textarea>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-slate-800">
                        <button 
                            type="button" 
                            onClick={onCancel}
                            className="px-6 py-2.5 bg-slate-900 border border-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors hover:bg-slate-800 hover:text-white"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={createMutation.isPending} 
                            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                        >
                            {createMutation.isPending ? 'Guardando...' : 'Crear Banco y Reanudar'} <Save className="w-4 h-4" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
