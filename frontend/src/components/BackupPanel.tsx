import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Download, FolderOpen, Loader2, AlertTriangle, CheckCircle, Clock, Database, RotateCcw, X, KeyRound } from 'lucide-react';
import { fetchApi } from '../lib/api';

export const BackupPanel: React.FC = () => {
    const queryClient = useQueryClient();
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [successToast, setSuccessToast] = useState('');
    
    // Modal states
    const [showRestoreModal, setShowRestoreModal] = useState(false);
    const [selectedBackupForRestore, setSelectedBackupForRestore] = useState('');
    const [restorePassword, setRestorePassword] = useState('');

    // ⚠️ FIX: Replaced window.prompt() with a controlled modal.
    // window.prompt() sends the password as plaintext in a browser-native dialog
    // with no styling controls, and is blocked in many secure contexts.
    // This modal uses a proper <input type="password"> and controlled React state.
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createPassword, setCreatePassword] = useState('');
    const [createPasswordConfirm, setCreatePasswordConfirm] = useState('');
    const [createPasswordError, setCreatePasswordError] = useState('');

    // Queries
    const { data: backupListResponse = [] } = useQuery({
        queryKey: ['backups-list'],
        queryFn: () => fetchApi(`/backup/list`)
    });
    const backups = Array.isArray(backupListResponse) ? backupListResponse : (backupListResponse?.backups || []);

    const { data: backupStatusResponse = null } = useQuery({
        queryKey: ['backup-status'],
        queryFn: () => fetchApi(`/backup/status`)
    });

    // Helpers
    const showSuccess = (msg: string) => {
        setSuccessToast(msg);
        setStatus('');
        setError('');
        setTimeout(() => setSuccessToast(''), 4000);
    };

    // Mutations
    const createBackupMutation = useMutation({
        mutationFn: async (password: string) => fetchApi(`/backup/create`, {
            method: 'POST',
            body: JSON.stringify({ password })
        }),
        onSuccess: (data) => {
            showSuccess(`✅ Respaldo creado exitosamente: ${data.filename}`);
            queryClient.invalidateQueries({ queryKey: ['backups-list'] });
            queryClient.invalidateQueries({ queryKey: ['backup-status'] });
            setShowCreateModal(false);
            setCreatePassword('');
            setCreatePasswordConfirm('');
        },
        onError: (err: any) => {
            setError(`Error al generar respaldo: ${err.message}`);
        }
    });

    const scheduleBackupMutation = useMutation({
        mutationFn: async (hourUTC: number) => fetchApi(`/backup/schedule`, {
            method: 'PUT',
            body: JSON.stringify({ hourUTC })
        }),
        onSuccess: (_, variables) => {
            showSuccess(`Backup programado para las ${variables.toString().padStart(2, '0')}:00 UTC diariamente`);
            queryClient.invalidateQueries({ queryKey: ['backup-status'] });
        },
        onError: (err: any) => setError(`Error de programación: ${err.message}`)
    });

    const restoreBackupMutation = useMutation({
        mutationFn: async ({ filename, password }: { filename: string, password: string }) => fetchApi(`/backup/restore`, {
            method: 'POST',
            body: JSON.stringify({ filename, password })
        }),
        onSuccess: () => {
            showSuccess("✅ Respaldo restaurado con éxito. Recargando...");
            setShowRestoreModal(false);
            window.setTimeout(() => window.location.reload(), 2000);
        },
        onError: (err: any) => setError(`Fallo crítico de restauración: ${err.message}`)
    });

    // Handlers
    const handleOpenCreateModal = () => {
        setError('');
        setStatus('');
        setSuccessToast('');
        setCreatePassword('');
        setCreatePasswordConfirm('');
        setCreatePasswordError('');
        setShowCreateModal(true);
    };

    const handleConfirmCreate = () => {
        if (createPassword.length < 8) {
            setCreatePasswordError('La contraseña debe tener al menos 8 caracteres.');
            return;
        }
        if (createPassword !== createPasswordConfirm) {
            setCreatePasswordError('Las contraseñas no coinciden.');
            return;
        }
        setCreatePasswordError('');
        setStatus('Iniciando protocolo de cifrado...');
        createBackupMutation.mutate(createPassword);
    };

    const handleRestoreFromTable = (filename: string) => {
        setSelectedBackupForRestore(filename);
        setRestorePassword('');
        setError('');
        setStatus('');
        setSuccessToast('');
        setShowRestoreModal(true);
    };

    const executeRestore = () => {
        if (!selectedBackupForRestore || !restorePassword) return;
        
        if (!window.confirm(`⚠️ ADVERTENCIA: Esta operación reemplazará TODOS los datos actuales con el contenido del archivo ${selectedBackupForRestore}. Esta acción no se puede deshacer. ¿Desea continuar?`)) {
            return;
        }

        setStatus('Verificando firma y descifrando archivo...');
        setError('');
        restoreBackupMutation.mutate({ filename: selectedBackupForRestore, password: restorePassword });
    };

    const handleScheduleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setStatus('');
        const form = e.target as HTMLFormElement;
        const hourString = new FormData(form).get('hourUTC') as string;
        scheduleBackupMutation.mutate(parseInt(hourString, 10));
    };

    const isLoading = createBackupMutation.isPending || restoreBackupMutation.isPending || scheduleBackupMutation.isPending;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-violet-500/10 rounded-2xl border border-violet-500/20">
                    <Shield className="w-8 h-8 text-violet-400" />
                </div>
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Centro de Seguridad</h1>
                    <p className="text-slate-400">Protección en reposo (AES-256-GCM) y recuperación de datos.</p>
                </div>
            </div>

            {/* Programación Automática */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex flex-col gap-2">
                        <h3 className="text-emerald-400 font-bold text-sm tracking-wider uppercase flex items-center gap-2">
                            <Clock className="w-5 h-5" /> ⏰ BACKUP AUTOMÁTICO DIARIO
                        </h3>
                        <p className="text-sm text-slate-400 max-w-xl">
                            El sistema creará un respaldo cifrado automáticamente todos los días a la hora seleccionada.
                        </p>
                    </div>
                    <div>
                        <form onSubmit={handleScheduleSubmit} className="flex gap-3">
                            <select 
                                name="hourUTC"
                                defaultValue={backupStatusResponse?.scheduledHourUTC ?? 2}
                                className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                            >
                                {Array.from({ length: 24 }, (_, i) => (
                                    <option key={i} value={i}>{String(i).padStart(2, '0')}:00 UTC</option>
                                ))}
                            </select>
                            <button
                                type="submit"
                                disabled={scheduleBackupMutation.isPending}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                {scheduleBackupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Status / Error / Success Toast */}
            {error && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-rose-300">{error}</p>
                </div>
            )}
            {successToast && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-emerald-300">{successToast}</p>
                </div>
            )}
            {status && !error && !successToast && (
                <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    <p className="text-sm text-indigo-300">{status}</p>
                </div>
            )}

            {/* Create Backup Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleOpenCreateModal}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-violet-900/20 disabled:opacity-50"
                >
                    {createBackupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    Crear Respaldo Ahora
                </button>
            </div>

            {/* Backup History Table */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden">
                <div className="p-5 border-b border-slate-800 flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-slate-400" />
                    <h3 className="font-bold text-white">Historial de Respaldos</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-800/50 text-slate-400">
                            <tr>
                                <th className="py-3 px-4 font-semibold">Fecha</th>
                                <th className="py-3 px-4 font-semibold">Archivo</th>
                                <th className="py-3 px-4 font-semibold">Ruta</th>
                                <th className="py-3 px-4 font-semibold">Tamaño</th>
                                <th className="py-3 px-4 font-semibold">Hash Auditoría</th>
                                <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {backups.map((b: any) => (
                                <tr key={b.filename} className="hover:bg-slate-800/20 transition-colors">
                                    <td className="py-3 px-4 text-slate-300 text-sm">
                                        {b.createdAt ? new Date(b.createdAt).toLocaleString('es-ES', { 
                                            day: '2-digit', month: '2-digit', year: 'numeric', 
                                            hour: '2-digit', minute: '2-digit' 
                                        }) : 'Desconocido'}
                                    </td>
                                    <td className="py-3 px-4 text-slate-300 font-medium">
                                        {b.filename}
                                    </td>
                                    <td className="py-3 px-4 text-slate-500 text-xs">
                                        data/backups/
                                    </td>
                                    <td className="py-3 px-4 text-slate-400">
                                        {((b.size || 0) / (1024 * 1024)).toFixed(2)} MB
                                    </td>
                                    <td className="py-3 px-4 font-mono text-emerald-500/70 text-xs" title={b.auditHash}>
                                        {b.auditHash ? `${b.auditHash.substring(0, 8)}...` : 'N/A'}
                                    </td>
                                    <td className="py-3 px-4 text-right space-x-3">
                                        <a 
                                            href={`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/backup/download/${b.filename}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                                        >
                                            <Download className="w-4 h-4" /> Descargar
                                        </a>
                                        <button 
                                            onClick={() => handleRestoreFromTable(b.filename)}
                                            className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 transition-colors font-medium"
                                        >
                                            <RotateCcw className="w-4 h-4" /> Restaurar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {backups.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-slate-500">
                                        No existen respaldos en el historial. Crea uno para comenzar.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="text-center pt-8">
                <p className="text-[10px] text-slate-600 uppercase font-bold tracking-widest">
                    AES-256-GCM / PBKDF2 HARDENED VAULT
                </p>
            </div>

            {/* ⚠️ FIX: Create Backup Modal — replaces window.prompt() */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <KeyRound className="w-5 h-5 text-violet-400" />
                                Cifrar Nuevo Respaldo
                            </h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-400">
                                Ingresa una contraseña fuerte para cifrar este respaldo con AES-256-GCM. Guárdala en un lugar seguro — sin ella no podrás restaurar el archivo.
                            </p>
                            
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-300">Contraseña de Cifrado</label>
                                <input 
                                    type="password"
                                    value={createPassword}
                                    onChange={(e) => setCreatePassword(e.target.value)}
                                    placeholder="Mínimo 8 caracteres"
                                    autoComplete="new-password"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-violet-500 outline-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-slate-300">Confirmar Contraseña</label>
                                <input 
                                    type="password"
                                    value={createPasswordConfirm}
                                    onChange={(e) => setCreatePasswordConfirm(e.target.value)}
                                    placeholder="Repite la contraseña"
                                    autoComplete="new-password"
                                    onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreate()}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-violet-500 outline-none"
                                />
                            </div>

                            {createPasswordError && (
                                <p className="text-sm text-rose-400 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    {createPasswordError}
                                </p>
                            )}
                        </div>

                        <div className="p-5 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3">
                            <button 
                                onClick={() => setShowCreateModal(false)}
                                className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleConfirmCreate}
                                disabled={!createPassword || !createPasswordConfirm || createBackupMutation.isPending}
                                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-lg shadow-violet-900/20"
                            >
                                {createBackupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                                Crear y Cifrar Respaldo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Restore Modal */}
            {showRestoreModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <RotateCcw className="w-5 h-5 text-rose-400" />
                                Restaurar Sistema desde Archivo
                            </h3>
                            <button onClick={() => setShowRestoreModal(false)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <p className="text-sm text-slate-400">
                                Selecciona un archivo de la bóveda para restaurar la base de datos.
                            </p>
                            
                            <div className="border border-slate-800 rounded-xl overflow-hidden">
                                <div className="max-h-64 overflow-y-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-800/80 text-slate-400 sticky top-0">
                                            <tr>
                                                <th className="p-3 font-semibold">Archivo</th>
                                                <th className="p-3 font-semibold text-right">Tamaño</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {backups.map((b: any) => (
                                                <tr 
                                                    key={b.filename} 
                                                    onClick={() => setSelectedBackupForRestore(b.filename)}
                                                    className={`cursor-pointer transition-colors ${selectedBackupForRestore === b.filename ? 'bg-indigo-500/20' : 'hover:bg-slate-800/40'}`}
                                                >
                                                    <td className="p-3 font-medium text-slate-200">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-3 h-3 rounded-full ${selectedBackupForRestore === b.filename ? 'bg-indigo-500' : 'bg-transparent border border-slate-600'}`}></div>
                                                            {b.filename}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-slate-400 text-right">
                                                        {((b.size || 0) / (1024 * 1024)).toFixed(2)} MB
                                                    </td>
                                                </tr>
                                            ))}
                                            {backups.length === 0 && (
                                                <tr><td colSpan={2} className="p-4 text-center text-slate-500">No hay backups disponibles</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {selectedBackupForRestore && (
                                <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                                    <label className="block text-sm font-bold text-slate-300">Contraseña de Descifrado</label>
                                    <input 
                                        type="password" 
                                        value={restorePassword}
                                        onChange={(e) => setRestorePassword(e.target.value)}
                                        placeholder="Ingresa la contraseña maestra del archivo"
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div className="p-5 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3">
                            <button 
                                onClick={() => setShowRestoreModal(false)}
                                className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={executeRestore}
                                disabled={!selectedBackupForRestore || !restorePassword || restoreBackupMutation.isPending}
                                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors shadow-lg shadow-rose-900/20"
                            >
                                {restoreBackupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                Ejecutar Restauración
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
