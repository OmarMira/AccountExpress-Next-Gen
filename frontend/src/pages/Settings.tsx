import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { Settings as SettingsIcon, Building, Users, Calendar, KeyRound, Save, UserPlus, XCircle, CheckCircle, ShieldAlert, Database, Shield } from 'lucide-react';
import { BackupPanel } from '../components/BackupPanel';

export function Settings() {
  const user = useAuthStore((state) => state.user);
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const setActiveCompany = useAuthStore((state) => state.setActiveCompany);
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'company' | 'users' | 'roles' | 'periods' | 'security' | 'backups'>('company');

  // --- Company Form State ---
  const [companyForm, setCompanyForm] = useState({
    legalName: activeCompany?.legalName || '',
    ein: activeCompany?.ein || '',
    address: activeCompany?.address || '',
    email: activeCompany?.email || '',
    phone: activeCompany?.phone || ''
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: typeof companyForm) => fetchApi(`/companies/${activeCompany?.id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      alert("Datos de la empresa actualizados");
      setActiveCompany({ ...activeCompany, ...companyForm } as any);
    },
    onError: (err: any) => alert(`Error: ${err.message}`)
  });

  const handleCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompanyMutation.mutate(companyForm);
  };

  // --- Users State ---
  const { data: users = [] } = useQuery({
    queryKey: ['company-users', activeCompany?.id],
    queryFn: () => fetchApi(`/companies/${activeCompany?.id}/users`),
    enabled: activeTab === 'users' && !!activeCompany
  });

  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('accountant');

  const inviteUserMutation = useMutation({
    mutationFn: async () => fetchApi(`/companies/${activeCompany?.id}/users`, {
      method: 'POST',
      body: JSON.stringify({ userId: inviteUserId, roleId: inviteRoleId })
    }),
    onSuccess: () => {
      alert("Usuario invitado con éxito");
      setInviteUserId('');
      queryClient.invalidateQueries({ queryKey: ['company-users'] });
    },
    onError: (err: any) => alert(`Error: ${err.message}`)
  });

  const revokeUserMutation = useMutation({
    mutationFn: async (userId: string) => fetchApi(`/companies/${activeCompany?.id}/users/${userId}`, {
      method: 'DELETE'
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-users'] }),
    onError: (err: any) => alert(`Error al revocar: ${err.message}`)
  });

  // --- Fiscal Periods State ---
  const { data: periods = [] } = useQuery({
    queryKey: ['fiscal-periods', activeCompany?.id],
    queryFn: () => fetchApi(`/fiscal-periods?companyId=${activeCompany?.id}`),
    enabled: activeTab === 'periods' && !!activeCompany
  });

  const closePeriodMutation = useMutation({
    mutationFn: async (periodId: string) => fetchApi(`/fiscal-periods/${periodId}/close`, {
      method: 'POST'
    }),
    onSuccess: () => {
      alert("Periodo cerrado exitosamente");
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] });
    },
    onError: (err: any) => alert(`Error al cerrar periodo: ${err.message}`)
  });

  // --- Security State ---
  const [passForm, setPassForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  
  const changePasswordMutation = useMutation({
    mutationFn: async () => fetchApi(`/auth/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword: passForm.currentPassword, newPassword: passForm.newPassword })
    }),
    onSuccess: () => {
      alert("Contraseña actualizada exitosamente");
      setPassForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (err: any) => alert(`Error: ${err.message}`)
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passForm.newPassword !== passForm.confirmPassword) return alert("Las contraseñas no coinciden");
    changePasswordMutation.mutate();
  };

  // (Backup Hooks have been migrated to BackupPanel component)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <SettingsIcon className="w-8 h-8 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Configuración del Sistema</h1>
          <p className="text-sm text-gray-400">Preferencias, seguridad y administración para {activeCompany?.legalName}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 space-y-2">
          <button onClick={() => setActiveTab('company')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'company' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'}`}>
            <Building className="w-5 h-5" /> Datos de la Empresa
          </button>
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'}`}>
            <Users className="w-5 h-5" /> Gestión de Usuarios
          </button>
          <button onClick={() => setActiveTab('roles')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'roles' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'}`}>
            <Shield className="w-5 h-5" /> Roles y Permisos
          </button>
          <button onClick={() => setActiveTab('periods')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'periods' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'}`}>
            <Calendar className="w-5 h-5" /> Periodos Fiscales
          </button>
          <button onClick={() => setActiveTab('security')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'security' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'}`}>
            <KeyRound className="w-5 h-5" /> Privacidad y Seguridad
          </button>
          <button onClick={() => setActiveTab('backups')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'backups' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent'}`}>
            <Database className="w-5 h-5" /> Respaldos del Sistema
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-6 md:p-8 min-h-[500px]">
          
          {/* TAB: COMPANY */}
          {activeTab === 'company' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white border-b border-gray-800 pb-3">Perfil Legal de la Empresa</h2>
              <form onSubmit={handleCompanySubmit} className="space-y-4 max-w-2xl">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nombre Legal Completo</label>
                  <input type="text" value={companyForm.legalName} onChange={e => setCompanyForm({...companyForm, legalName: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">EIN / Identificación Tributaria</label>
                    <input type="text" value={companyForm.ein} onChange={e => setCompanyForm({...companyForm, ein: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Teléfono Fijo / Móvil</label>
                    <input type="text" value={companyForm.phone} onChange={e => setCompanyForm({...companyForm, phone: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Correo Electrónico Oficial</label>
                  <input type="email" value={companyForm.email} onChange={e => setCompanyForm({...companyForm, email: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Dirección Registrada</label>
                  <input type="text" value={companyForm.address} onChange={e => setCompanyForm({...companyForm, address: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="pt-4">
                  <button type="submit" disabled={updateCompanyMutation.isPending} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-lg disabled:opacity-50">
                    <Save className="w-5 h-5" /> Guardar Cambios
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-8">
              <h2 className="text-xl font-bold text-white border-b border-gray-800 pb-3">Directorio de Accesos</h2>
              
              <div className="bg-gray-800/40 p-5 rounded-xl border border-gray-700/50">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-500" /> Invitar a un Usuario Existente
                </h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input value={inviteUserId} onChange={e => setInviteUserId(e.target.value)} type="text" placeholder="User ID interno" className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:border-emerald-500 outline-none" />
                  <select value={inviteRoleId} onChange={e => setInviteRoleId(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-300 text-sm focus:border-emerald-500 outline-none">
                    <option value="admin">Administrador</option>
                    <option value="viewer">Solo Lectura</option>
                  </select>
                  <button onClick={() => inviteUserMutation.mutate()} disabled={!inviteUserId || inviteUserMutation.isPending} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg disabled:opacity-50">
                    Vincular Usuario
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="text-gray-500 border-b border-gray-800 uppercase text-xs">
                    <tr>
                      <th className="py-3 px-4">Usuario</th>
                      <th className="py-3 px-4">Correo</th>
                      <th className="py-3 px-4">Rol en Empresa</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {users.map((u: any) => (
                      <tr key={u.user_id} className="hover:bg-gray-800/30">
                        <td className="py-3 px-4 text-gray-200">{u.username} {u.is_super_admin === 1 && <span className="ml-2 px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded text-xs font-bold">SUPER</span>}</td>
                        <td className="py-3 px-4 text-gray-400">{u.email}</td>
                        <td className="py-3 px-4 font-mono text-emerald-400">{u.role_id}</td>
                        <td className="py-3 px-4 text-right">
                          <button 
                            onClick={() => confirm("¿Seguro de revocar acceso?") && revokeUserMutation.mutate(u.user_id)}
                            disabled={user?.id === u.user_id || u.is_super_admin === 1}
                            className="text-rose-400 hover:text-rose-300 disabled:opacity-30 disabled:hover:text-rose-400 transition-colors flex items-center gap-1 justify-end ml-auto"
                          >
                            <XCircle className="w-4 h-4" /> Revocar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: ROLES */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div className="border-b border-gray-800 pb-3">
                <h2 className="text-xl font-bold text-white">Roles y Permisos del Sistema</h2>
                <p className="text-sm text-gray-400 mt-1">Los roles son fijos a nivel del sistema. Asigná el rol adecuado a cada usuario al vincularlo a la empresa.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    id: 'admin',
                    name: 'Administrador',
                    color: 'indigo',
                    badge: 'ADMIN',
                    description: 'Acceso completo a la empresa. Puede gestionar usuarios, registrar asientos, conciliar y cerrar periodos.',
                    permissions: ['Todas las operaciones contables', 'Gestión de usuarios', 'Conciliación bancaria', 'Exportar para CPA', 'Cierre de periodos'],
                  },
                  {
                    id: 'viewer',
                    name: 'Solo Lectura',
                    color: 'amber',
                    badge: 'VIEWER',
                    description: 'Acceso de consulta únicamente. No puede crear ni modificar ningún registro.',
                    permissions: ['Ver plan de cuentas', 'Ver diario contable', 'Ver reportes', 'Sin escritura', 'Sin acceso bancario'],
                  },
                ].map((role) => (
                  <div key={role.id} className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-5 hover:border-gray-600 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-white text-sm">{role.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold bg-${role.color}-500/20 text-${role.color}-400`}>{role.badge}</span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3 leading-relaxed">{role.description}</p>
                    <ul className="space-y-1">
                      {role.permissions.map((p) => (
                        <li key={p} className="flex items-center gap-2 text-xs text-gray-300">
                          <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: PERIODS */}
          {activeTab === 'periods' && (
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-gray-800 pb-3">
                <h2 className="text-xl font-bold text-white">Periodos Fiscales (Cierres Contables)</h2>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-400 leading-relaxed">
                  Para emitir el reporte del CPA (Módulo 5), debe cerrar el periodo fiscal. <strong>El backend rechazará el cierre si existen transacciones bancarias pendientes de conciliar</strong>, garantizando que el Balance General y el Diario cuadran perfectamente con la realidad extracontable.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                {periods.map((p: any) => (
                  <div key={p.id} className="bg-gray-800/40 border border-gray-700 rounded-xl p-5 hover:border-gray-600 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-bold text-gray-100">{p.name}</h4>
                      {p.status === 'open' ? (
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded uppercase">Abierto</span>
                      ) : p.status === 'closed' ? (
                        <span className="px-2 py-1 bg-gray-600/50 text-gray-300 text-xs font-bold rounded uppercase">Cerrado</span>
                      ) : (
                        <span className="px-2 py-1 bg-rose-500/20 text-rose-400 text-xs font-bold rounded uppercase">Locked</span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm text-gray-400 mb-6">
                      <p>Inicio: <span className="text-gray-300">{p.start_date.substring(0,10)}</span></p>
                      <p>Fin: <span className="text-gray-300">{p.end_date.substring(0,10)}</span></p>
                    </div>
                    
                    {p.status === 'open' && (
                      <button 
                        onClick={() => {
                          if (confirm(`¿Está seguro de cerrar permanentemente el periodo ${p.name}? Este proceso verificará si las conciliaciones bancarias están completas.`)) {
                            closePeriodMutation.mutate(p.id);
                          }
                        }}
                        disabled={closePeriodMutation.isPending}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" /> Ejecutar Cierre Contable
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white border-b border-gray-800 pb-3">Credenciales de Acceso</h2>
              <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-sm">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Contraseña Actual</label>
                  <input type="password" value={passForm.currentPassword} onChange={e => setPassForm({...passForm, currentPassword: e.target.value})} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nueva Contraseña Segura</label>
                  <input type="password" value={passForm.newPassword} onChange={e => setPassForm({...passForm, newPassword: e.target.value})} minLength={8} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Repetir Nueva Contraseña</label>
                  <input type="password" value={passForm.confirmPassword} onChange={e => setPassForm({...passForm, confirmPassword: e.target.value})} minLength={8} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" required />
                </div>
                <div className="pt-4">
                  <button type="submit" disabled={changePasswordMutation.isPending || !passForm.newPassword} className="flex items-center gap-2 w-full justify-center px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-lg">
                    <KeyRound className="w-5 h-5" /> Aplicar Rotación de Credenciales
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB: BACKUPS */}
          {activeTab === 'backups' && <BackupPanel />}

        </div>
      </div>
    </div>
  );
}
