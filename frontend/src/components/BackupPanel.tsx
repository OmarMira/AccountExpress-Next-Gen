import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Upload, Download, FolderOpen, Loader2, AlertTriangle, CheckCircle, Clock, Database, RotateCcw, X } from 'lucide-react';
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
        },
        onError: (err: any) => setError(`Error al generar respaldo: ${err.message}`)
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
    const handleCreateBackup = () => {
        setError('');
        setStatus('');
        setSuccessToast('');
        const pwd = window.prompt("Ingresa una contraseña fuerte para cifrar este respaldo (AES-256-GCM):");
        if (!pwd) return;
        setStatus('Iniciando protocolo de cifrado...');
        createBackupMutation.mutate(pwd);
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
                                defaultValue={backupStatusResponse?.info?.scheduledHourUTC ?? 0}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                            >
                                {Array.from({ length: 24 }).map((_, i) => (
                                    <option key={i} value={i}>{`${i.toString().padStart(2, '0')}:00 UTC`}</option>
                                ))}
                            </select>
                            <button 
                                type="submit"
                                disabled={scheduleBackupMutation.isPending}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg disabled:opacity-50"
                            >
                                Guardar horario
                            </button>
                        </form>
                    </div>
                </div>
                <div className="pt-2 border-t border-slate-800/50">
                    <p className="text-xs text-slate-500 italic">
                        Nota: el servidor debe estar encendido a esa hora para que el backup se ejecute.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card Crear Respaldo */}
                <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 hover:border-slate-700 transition-all relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 blur-[50px] -mr-10 -mt-10 pointer-events-none"></div>

                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-6 text-white group-hover:scale-110 transition-transform">
                            <Download className="w-6 h-6" />
                        </div>

                        <h3 className="text-xl font-black tracking-tight text-white mb-2">Crear Respaldo</h3>
                        <p className="text-sm text-slate-400 mb-6 min-h-[40px]">
                            Genera una copia maestra cifrada y descargable de toda la base de datos y su cadena de auditoría forense.
                        </p>

                        <button
                            onClick={handleCreateBackup}
                            disabled={isLoading}
                            className="w-full py-4 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-violet-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {createBackupMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <FolderOpen className="w-5 h-5" />}
                            {createBackupMutation.isPending ? 'Creando respaldo...' : 'Crear Respaldo Ahora'}
                        </button>
                    </div>
                </div>

                {/* Card Importar / File Picker */}
                <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 hover:border-slate-700 transition-all relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[50px] -mr-10 -mt-10 pointer-events-none"></div>

                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-6 text-white group-hover:scale-110 transition-transform">
                            <Upload className="w-6 h-6" />
                        </div>

                        <h3 className="text-xl font-black tracking-tight text-white mb-2">Restaurar Copia</h3>
                        <p className="text-sm text-slate-400 mb-6 min-h-[40px]">
                            Restaura el sistema seleccionando un backup de la bóveda. Requiere la contraseña original para descifrar.
                        </p>

                        <button
                            onClick={() => {
                                setSelectedBackupForRestore('');
                                setRestorePassword('');
                                setShowRestoreModal(true);
                            }}
                            disabled={isLoading}
                            className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl font-bold transition-all border border-slate-700 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {restoreBackupMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                            {restoreBackupMutation.isPending ? 'Restaurando...' : 'Restaurar desde archivo'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Success Toast / Error Status Area */}
            {successToast && (
                <div className="fixed top-8 right-8 z-50 animate-in fade-in slide-in-from-top-4 bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-4 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-2xl">
                    <CheckCircle className="w-6 h-6 shrink-0" />
                    <p className="font-medium text-sm pr-4">{successToast}</p>
                </div>
            )}
            
            {(status || error) && !successToast && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${error ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'}`}>
                    {error ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <Loader2 className="w-5 h-5 shrink-0 animate-spin" />}
                    <div>
                        <p className="font-bold text-sm">{error ? 'Error en la Operación' : 'Procesando...'}</p>
                        <p className="text-xs opacity-80 mt-1">{error || status}</p>
                    </div>
                </div>
            )}

            {/* Tabla de Historial */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 mt-8">
                <div className="flex items-center gap-3 mb-6">
                    <Database className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-white font-bold uppercase text-sm tracking-wider">Historial de Respaldos</h3>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="text-slate-500 border-b border-slate-800 text-xs uppercase">
                            <tr>
                                <th className="py-3 px-4 font-bold">Fecha y Hora</th>
                                <th className="py-3 px-4 font-bold">Nombre del Archivo</th>
                                <th className="py-3 px-4 font-bold">Carpeta</th>
                                <th className="py-3 px-4 font-bold">Tamaño</th>
                                <th className="py-3 px-4 font-bold">Hash SHA-256</th>
                                <th className="py-3 px-4 font-bold text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {backups.map((b: any) => (
                                <tr key={b.filename} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="py-3 px-4 text-slate-200">
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
