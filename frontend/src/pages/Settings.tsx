import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { 
  Settings as SettingsIcon, 
  Building, 
  Users, 
  Calendar, 
  Save, 
  UserPlus, 
  XCircle, 
  CheckCircle, 
  ShieldAlert, 
  Database, 
  Shield, 
  Eye, 
  EyeOff, 
  Trash2, 
  FileText, 
  Clock, 
  Search, 
  Download, 
  Printer, 
  ShieldCheck 
} from 'lucide-react';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { BackupPanel } from '../components/BackupPanel';
import DiagnosticsPanel from '../components/admin/DiagnosticsPanel';

export function Settings() {
  const user = useAuthStore((state) => state.user);
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const setActiveCompany = useAuthStore((state) => state.setActiveCompany);
  const queryClient = useQueryClient();
  
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'company' | 'users' | 'roles' | 'periods' | 'backups' | 'diagnostics'>(
    (searchParams.get('tab') as 'company' | 'users' | 'roles' | 'periods' | 'backups' | 'diagnostics') ?? 'company'
  );
  const [companyViewMode, setCompanyViewMode] = useState<'list' | 'edit' | 'create'>('list');
  const [selectedCompany, setSelectedCompany] = useState<any>(null);

  // --- Modals State ---
  const [notification, setNotification] = useState<{title: string, message: string, type: 'success' | 'error'} | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // --- Companies List State ---
  const { data: companies = [], refetch: refetchCompanies } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await fetchApi('/companies');
      return res || [];
    },
    enabled: activeTab === 'company'
  });

  // --- Company Form State ---
  const [companyForm, setCompanyForm] = useState({
    legalName: '',
    tradeName: '',
    ein: '',
    address: '',
    email: '',
    phone: '',
    logo: '',
    fiscalYearStart: '01-01',
    currency: 'USD'
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: any) => fetchApi(`/companies/${selectedCompany?.id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      setNotification({ title: 'Éxito', message: 'Empresa actualizada correctamente', type: 'success' });
      setCompanyViewMode('list');
      refetchCompanies();
      
      // Actualizar la tienda si la empresa editada es la activa
      if (selectedCompany?.id === activeCompany?.id) {
        setActiveCompany({ ...activeCompany, ...companyForm } as any);
      }
      
      // Sincronizar disponible
      const newList = companies.map((c: any) => 
        c.id === selectedCompany?.id ? { ...c, ...companyForm } : c
      );
      useAuthStore.getState().setAvailableCompanies(newList);
    },
    onError: (err: Error) => setNotification({ title: 'Error', message: err.message, type: 'error' })
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (data: any) => fetchApi('/companies', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      setNotification({ title: 'Éxito', message: 'Empresa creada exitosamente', type: 'success' });
      setCompanyViewMode('list');
      refetchCompanies();
    },
    onError: (err: Error) => setNotification({ title: 'Error al crear', message: err.message, type: 'error' })
  });

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!companyForm.legalName.trim()) errors.legalName = 'El nombre legal es obligatorio.';
    if (!companyForm.ein.trim()) errors.ein = 'El EIN / Identificación es requerido para fines legales.';
    if (!companyForm.email.trim()) errors.email = 'Debe proporcionar un correo electrónico oficial.';
    if (!companyForm.phone.trim()) errors.phone = 'El teléfono de contacto es necesario.';
    if (!companyForm.address.trim()) errors.address = 'La dirección física no puede estar vacía.';
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      if (companyViewMode === 'create') {
        createCompanyMutation.mutate(companyForm);
      } else {
        updateCompanyMutation.mutate(companyForm);
      }
    }
  };

  const openCompanyEdit = (c: any) => {
    setSelectedCompany(c);
    setCompanyForm({
      legalName: c.legalName || '',
      tradeName: c.tradeName || '',
      ein: c.ein || '',
      address: c.address || '',
      email: c.email || '',
      phone: c.phone || '',
      logo: c.logo || '',
      fiscalYearStart: c.fiscalYearStart || '01-01',
      currency: c.currency || 'USD'
    });
    setCompanyViewMode('edit');
    setFormErrors({});
  };

  const handleSwitchCompany = (c: any) => {
    setActiveCompany(c);
    setNotification({ title: 'Empresa Cambiada', message: `Ahora gestionando ${c.legalName}`, type: 'success' });
  };

  // --- Users State ---
  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ['users', activeCompany?.id],
    queryFn: () => fetchApi(`/users?companyId=${activeCompany?.id}`),
    enabled: activeTab === 'users' && !!activeCompany,
    select: (res: { data: any[] }) => res.data ?? [],
  });
  const users: any[] = usersData ?? [];

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    roleId: 'role-company-admin-00-000000000002',
  });
  const [createError, setCreateError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // --- Edit User State ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '',
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    roleId: '',
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: typeof editForm) => fetchApi(`/users/${data.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username,
        email: data.email,
        password: data.password || undefined,
        roleId: data.roleId,
        companyId: activeCompany?.id,
      }),
    }),
    onSuccess: async (_, variables) => {
      setShowEditModal(false);
      refetchUsers();

      try {
        // Refrescar los datos del usuario logueado directamente desde el servidor
        const meResponse = await fetchApi('/auth/me');
        if (meResponse && meResponse.user) {
          useAuthStore.getState().setUser(meResponse.user);
        }
      } catch (e) {
        // Si no existe el endpoint /me, intentamos la sincronización manual robusta
        const currentUser = useAuthStore.getState().user;
        if (currentUser && String(variables.id) === String(currentUser.id)) {
          useAuthStore.getState().setUser({
            ...currentUser,
            firstName: variables.firstName,
            lastName: variables.lastName,
            email: variables.email,
            username: variables.username
          });
        }
      }
      
      setNotification({ title: 'Éxito', message: 'Usuario actualizado correctamente', type: 'success' });
    },
    onError: (err: Error) => alert(`Error al actualizar usuario: ${err.message}`),
  });

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editForm.password && editForm.password !== editForm.confirmPassword) {
      alert('Las contraseñas no coinciden');
      return;
    }
    updateUserMutation.mutate(editForm);
  };

  const openEditModal = (u: any) => {
    setEditForm({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      email: u.email,
      password: '',
      confirmPassword: '',
      roleId: u.roleId || 'role-auditor-000000-000000000004',
    });
    setShowEditModal(true);
  };

  const createUserMutation = useMutation({
    mutationFn: async () => fetchApi('/users', {
      method: 'POST',
      body: JSON.stringify({
        ...createForm,
        companyId: activeCompany?.id,
      }),
    }),
    onSuccess: () => {
      setShowCreateForm(false);
      setCreateForm({ firstName: '', lastName: '', username: '', email: '', password: '', confirmPassword: '', roleId: 'role-company-admin-00-000000000002' });
      setCreateError('');
      refetchUsers();
    },
    onError: (err: Error) => setCreateError(err.message ?? 'Error al crear usuario'),
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (createForm.password !== createForm.confirmPassword) {
      setCreateError('Las contraseñas no coinciden');
      return;
    }
    createUserMutation.mutate();
  };

  const revokeUserMutation = useMutation({
    mutationFn: async (userId: string) => fetchApi(`/users/${userId}`, { method: 'PATCH',
      body: JSON.stringify({ isActive: false }),
    }),
    onSuccess: () => {
      refetchUsers();
      setNotification({ title: 'Usuario Desactivado', message: 'El usuario ha sido desactivado exitosamente.', type: 'success' });
    },
    onError: (err: Error) => setNotification({ title: 'Error', message: err.message, type: 'error' }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => fetchApi(`/users/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refetchUsers();
      setNotification({ title: 'Usuario Eliminado', message: 'El usuario ha sido eliminado permanentemente.', type: 'success' });
    },
    onError: (err: Error) => setNotification({ title: 'No se pudo eliminar', message: err.message, type: 'error' }),
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) =>
      fetchApi(`/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ companyId: activeCompany?.id, roleId }),
      }),
    onSuccess: () => {
      refetchUsers();
      setNotification({ title: 'Rol Actualizado', message: 'El rol del usuario ha sido cambiado.', type: 'success' });
    },
    onError: (err: Error) => setNotification({ title: 'Error al cambiar rol', message: err.message, type: 'error' }),
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
    onError: (err: Error) => alert(`Error al cerrar periodo: ${err.message}`)
  });

  const lockPeriodMutation = useMutation({
    mutationFn: async (periodId: string) => fetchApi(`/fiscal-periods/${periodId}/lock`, {
      method: 'POST'
    }),
    onSuccess: () => {
      alert("Periodo bloqueado permanentemente.");
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] });
    },
    onError: (err: Error) => alert(`Error al bloquear periodo: ${err.message}`)
  });

  const [showNewPeriod, setShowNewPeriod] = useState(false);
  const [newPeriod, setNewPeriod] = useState({
    name: '', periodType: 'monthly' as 'monthly' | 'quarterly' | 'annual',
    startDate: '', endDate: ''
  });
  const openPeriodMutation = useMutation({
    mutationFn: async () => fetchApi('/fiscal-periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: activeCompany!.id, ...newPeriod })
    }),
    onSuccess: () => {
      alert("Nuevo periodo abierto exitosamente.");
      setShowNewPeriod(false);
      setNewPeriod({ name: '', periodType: 'monthly', startDate: '', endDate: '' });
      queryClient.invalidateQueries({ queryKey: ['fiscal-periods'] });
    },
    onError: (err: Error) => alert(`Error al crear periodo: ${err.message}`)
  });

  // (Backup Hooks have been migrated to BackupPanel component)
  
  const handleDownloadIntegrityReport = async () => {
    try {
      const data = await fetchApi('/audit/integrity-report');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `integrity-report-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setNotification({
        title: 'Reporte Generado',
        message: 'El reporte de integridad criptográfica se ha descargado exitosamente.',
        type: 'success'
      });
    } catch (err: any) {
      setNotification({
        title: 'Error de Auditoría',
        message: err.message || 'No se pudo generar el reporte de integridad',
        type: 'error'
      });
    }
  };

  const [tempAuditFilters, setTempAuditFilters] = useState({
    userId: '',
    date: '', // Permite ver todo si está vacío
    startTime: '00:00',
    endTime: '23:59'
  });
  const [appliedAuditFilters, setAppliedAuditFilters] = useState(tempAuditFilters);

  const { data: auditLogsData, isLoading: isLoadingAudit } = useQuery({
    queryKey: ['audit-logs', activeCompany?.id, appliedAuditFilters],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (activeCompany) q.append('companyId', activeCompany.id);
      if (appliedAuditFilters.userId) q.append('userId', appliedAuditFilters.userId);
      if (appliedAuditFilters.date) q.append('date', appliedAuditFilters.date);
      if (appliedAuditFilters.startTime) q.append('startTime', appliedAuditFilters.startTime);
      if (appliedAuditFilters.endTime) q.append('endTime', appliedAuditFilters.endTime);
      const res = await fetchApi(`/audit?${q.toString()}`);
      return res.data || [];
    },
    enabled: activeTab === 'audit' && !!activeCompany
  });
  const auditLogsList: any[] = auditLogsData || [];

  const [selectedLog, setSelectedLog] = useState<any>(null);

  const getHumanReadableAction = (action: string) => {
    const map: Record<string, string> = {
      'session:select_company': 'Cambio de empresa activa',
      'user:login': 'Inicio de sesión',
      'user:logout': 'Cierre de sesión',
      'user:create': 'Creación de usuario',
      'user:update': 'Actualización de usuario',
      'user:delete': 'Eliminación de usuario',
      'journal:create': 'Nuevo asiento contable',
      'journal:update': 'Modificación de asiento',
      'journal:delete': 'Anulación de asiento',
      'gl_account:create': 'Creación de cuenta contable',
      'gl_account:update': 'Edición de cuenta contable',
      'bank_account:create': 'Vincular cuenta bancaria',
      'fiscal_period:close': 'Cierre de período fiscal',
      'fiscal_period:lock': 'Bloqueo de período fiscal',
      'reconciliation:perform': 'Conciliación bancaria',
      'backup:perform': 'Generación de respaldo',
    };
    return map[action] || action.replace(/:/g, ' ').replace(/_/g, ' ');
  };

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
          <button onClick={() => setActiveTab('company')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'company' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
            <Building className="w-5 h-5" /> Datos de la Empresa
          </button>
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
            <Users className="w-5 h-5" /> Gestión de Usuarios
          </button>
          <button onClick={() => setActiveTab('roles')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'roles' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
            <Shield className="w-5 h-5" /> Roles y Permisos
          </button>
          <button onClick={() => setActiveTab('periods')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'periods' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
            <Calendar className="w-5 h-5" /> Periodos Fiscales
          </button>
          <button onClick={() => setActiveTab('backups')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'backups' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
            <Database className="w-5 h-5" /> Respaldos del Sistema
          </button>
          {user?.isSuperAdmin && (
            <button 
              onClick={() => setActiveTab('diagnostics')} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'diagnostics' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
            >
              <ShieldCheck className="w-5 h-5" /> Diagnóstico
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-[#0d1b2e] border border-white/5 rounded-xl shadow-2xl p-6 md:p-8 min-h-[500px]">
          
          {/* TAB: COMPANY */}
          {activeTab === 'company' && (
            <div className="space-y-6">
              {companyViewMode === 'list' ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                    <h2 className="text-xl font-bold text-white">Gestión de Empresas</h2>
                    {user?.isSuperAdmin && (
                      <button
                        onClick={() => {
                          setCompanyForm({ legalName: '', tradeName: '', ein: '', address: '', email: '', phone: '', logo: '', fiscalYearStart: '01-01', currency: 'USD' });
                          setCompanyViewMode('create');
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <Building className="w-4 h-4" />
                        Nueva Empresa
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="text-gray-500 border-b border-gray-800 uppercase text-xs">
                        <tr>
                          <th className="py-3 px-4">Empresa</th>
                          <th className="py-3 px-4">EIN</th>
                          <th className="py-3 px-4">Contacto</th>
                          <th className="py-3 px-4">Estado</th>
                          <th className="py-3 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {companies.length === 0 && (
                          <tr><td colSpan={5} className="py-6 text-center text-gray-500 text-sm">No hay empresas asignadas.</td></tr>
                        )}
                        {companies.map((c: any) => (
                          <tr 
                            key={c.id} 
                            onDoubleClick={() => openCompanyEdit(c)}
                            className={`hover:bg-gray-800/50 cursor-pointer transition-colors group ${activeCompany?.id === c.id ? 'bg-indigo-500/5' : ''}`}
                            title="Doble clic para editar"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-gray-950 flex items-center justify-center overflow-hidden border border-gray-800">
                                  {c.logo ? <img src={c.logo} alt="" className="w-full h-full object-contain" /> : <Building className="w-4 h-4 text-gray-700" />}
                                </div>
                                <div>
                                  <div className="font-medium text-gray-200">{c.legalName}</div>
                                  <div className="text-[10px] text-gray-500 uppercase tracking-tighter">{c.tradeName || 'S/NM'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-gray-400 font-mono text-xs">{c.ein || 'N/A'}</td>
                            <td className="py-3 px-4">
                              <div className="text-gray-300 text-xs">{c.email}</div>
                              <div className="text-[10px] text-gray-500">{c.phone}</div>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                c.isActive !== false ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-600/40 text-gray-400'
                              }`}>
                                {c.isActive !== false ? 'ACTIVA' : 'INACTIVA'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-3 ml-auto">
                                <button
                                  onClick={() => handleSwitchCompany(c)}
                                  className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded transition-all ${
                                    activeCompany?.id === c.id 
                                      ? 'bg-indigo-500 text-white cursor-default' 
                                      : 'bg-gray-800 text-indigo-400 hover:bg-indigo-500/20'
                                  }`}
                                >
                                  {activeCompany?.id === c.id ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                                  {activeCompany?.id === c.id ? 'Activa' : 'Gestionar'}
                                </button>
                                <button
                                  onClick={() => openCompanyEdit(c)}
                                  className="text-gray-400 hover:text-white p-1.5 hover:bg-gray-800 rounded transition-colors"
                                  title="Editar"
                                >
                                  <SettingsIcon className="w-4 h-4" />
                                </button>
                                {user?.isSuperAdmin && activeCompany?.id !== c.id && (
                                  <button
                                    onClick={() => setConfirmDialog({
                                      title: '¿Archivar Empresa?',
                                      message: 'Esta empresa dejará de estar disponible para el uso diario.',
                                      onConfirm: () => {
                                        fetchApi(`/companies/${c.id}`, { method: 'DELETE' })
                                          .then(() => {
                                            refetchCompanies();
                                            setNotification({ title: 'Éxito', message: 'Empresa archivada', type: 'success' });
                                          })
                                          .catch(err => setNotification({ title: 'Error', message: err.message, type: 'error' }));
                                      }
                                    })}
                                    className="text-gray-600 hover:text-rose-400 p-1.5 hover:bg-rose-500/10 rounded transition-colors"
                                    title="Archivar"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                    <h2 className="text-xl font-bold text-white">
                      {companyViewMode === 'create' ? 'Nueva Empresa' : `Editar: ${selectedCompany?.legalName}`}
                    </h2>
                    <button 
                      onClick={() => setCompanyViewMode('list')}
                      className="text-xs font-bold text-indigo-400 hover:text-white transition-colors"
                    >
                      &larr; Volver a la lista
                    </button>
                  </div>
                  <form onSubmit={handleCompanySubmit} className="space-y-4 max-w-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Nombre Legal Completo</label>
                        <input 
                          type="text" 
                          value={companyForm.legalName} 
                          onChange={e => setCompanyForm({...companyForm, legalName: e.target.value})} 
                          placeholder="Nombre Legal, Inc."
                          className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-white focus:outline-none transition-colors ${formErrors.legalName ? 'border-rose-500 focus:border-rose-500' : 'border-gray-700 focus:border-indigo-500'}`} 
                        />
                        {formErrors.legalName && <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {formErrors.legalName}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Nombre Comercial (DBA)</label>
                        <input 
                          type="text" 
                          value={companyForm.tradeName} 
                          onChange={e => setCompanyForm({...companyForm, tradeName: e.target.value})} 
                          placeholder="Nombre Fantasía (Opcional)"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors" 
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">EIN / Identificación Tributaria</label>
                        <input 
                          type="text" 
                          value={companyForm.ein} 
                          onChange={e => setCompanyForm({...companyForm, ein: e.target.value})} 
                          className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-white focus:outline-none transition-colors ${formErrors.ein ? 'border-rose-500 focus:border-rose-500' : 'border-gray-700 focus:border-indigo-500'}`} 
                        />
                        {formErrors.ein && <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {formErrors.ein}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Teléfono Fijo / Móvil</label>
                        <input 
                          type="text" 
                          value={companyForm.phone} 
                          onChange={e => setCompanyForm({...companyForm, phone: e.target.value})} 
                          className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-white focus:outline-none transition-colors ${formErrors.phone ? 'border-rose-500 focus:border-rose-500' : 'border-gray-700 focus:border-indigo-500'}`} 
                        />
                        {formErrors.phone && <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {formErrors.phone}</p>}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Correo Electrónico Oficial</label>
                      <input 
                        type="email" 
                        value={companyForm.email} 
                        onChange={e => setCompanyForm({...companyForm, email: e.target.value})} 
                        className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-white focus:outline-none transition-colors ${formErrors.email ? 'border-rose-500 focus:border-rose-500' : 'border-gray-700 focus:border-indigo-500'}`} 
                      />
                      {formErrors.email && <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {formErrors.email}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Dirección Física</label>
                      <input 
                        type="text" 
                        value={companyForm.address} 
                        onChange={e => setCompanyForm({...companyForm, address: e.target.value})} 
                        className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-white focus:outline-none transition-colors ${formErrors.address ? 'border-rose-500 focus:border-rose-500' : 'border-gray-700 focus:border-indigo-500'}`} 
                      />
                      {formErrors.address && <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {formErrors.address}</p>}
                    </div>

                    <div className="pt-4 border-t border-gray-800">
                      <label className="block text-sm font-medium text-gray-400 mb-3">Logo de la Empresa</label>
                      <div className="flex items-center gap-6">
                        <div className="w-24 h-24 bg-gray-950 border-2 border-dashed border-gray-800 rounded-2xl flex items-center justify-center overflow-hidden shrink-0">
                          {companyForm.logo ? (
                            <img src={companyForm.logo} alt="Preview" className="w-full h-full object-contain p-2" />
                          ) : (
                            <div className="text-center p-2 text-gray-600">
                              <Building className="w-6 h-6 mx-auto mb-1 opacity-20" />
                              <span className="text-[8px] font-bold uppercase">Sin Logo</span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-4">
                          <p className="text-[10px] text-gray-500 leading-relaxed font-medium max-w-sm">Este logo se utilizará automáticamente en todos los reportes oficiales.</p>
                          <div className="flex gap-2">
                            <label className="cursor-pointer px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl text-xs font-bold border border-indigo-500/20 transition-all flex items-center gap-2">
                              <Download className="w-3.5 h-3.5 rotate-180" />
                              Subir
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => setCompanyForm({...companyForm, logo: reader.result as string});
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                            {companyForm.logo && (
                              <button 
                                type="button"
                                onClick={() => setCompanyForm({...companyForm, logo: ''})}
                                className="px-4 py-2 bg-gray-800 hover:bg-rose-500/10 text-gray-500 hover:text-rose-400 rounded-xl text-xs font-bold border border-gray-700 hover:border-rose-500/20 transition-all"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button 
                        type="submit" 
                        disabled={updateCompanyMutation.isPending || createCompanyMutation.isPending} 
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-lg disabled:opacity-50"
                      >
                        <Save className="w-5 h-5" /> 
                        {companyViewMode === 'create' ? 'Crear Empresa' : 'Guardar Cambios'}
                      </button>
                      <button 
                        type="button"
                        onClick={() => setCompanyViewMode('list')}
                        className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

              {/* TAB: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h2 className="text-xl font-bold text-white">Gestión de Usuarios</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPrintModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors border border-gray-700"
                  >
                    <Printer className="w-4 h-4 text-gray-400" />
                    Imprimir
                  </button>
                  <button
                    onClick={() => { setShowCreateForm(!showCreateForm); setCreateError(''); }}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    {showCreateForm ? 'Cancelar' : 'Nuevo Usuario'}
                  </button>
                </div>
              </div>

              {/* Formulario de alta */}
              {showCreateForm && (
                <form onSubmit={handleCreateUser} className="bg-[#0f2240]/40 border border-white/7 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-emerald-400" /> Crear Nuevo Usuario
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Nombre *</label>
                      <input
                        required
                        value={createForm.firstName}
                        onChange={e => setCreateForm({ ...createForm, firstName: e.target.value })}
                        placeholder="Juan"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Apellido *</label>
                      <input
                        required
                        value={createForm.lastName}
                        onChange={e => setCreateForm({ ...createForm, lastName: e.target.value })}
                        placeholder="Pérez"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Correo electrónico *</label>
                      <input
                        required
                        type="email"
                        value={createForm.email}
                        onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                        placeholder="juan@empresa.com"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Nombre de usuario *</label>
                      <input
                        required
                        value={createForm.username}
                        onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                        placeholder="jperez"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Contraseña *</label>
                      <div className="relative">
                        <input
                          required
                          type={showPass ? 'text' : 'password'}
                          minLength={8}
                          value={createForm.password}
                          onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                          placeholder="Mínimo 8 caracteres"
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 pr-10 text-white text-sm focus:border-emerald-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(!showPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Confirmar Contraseña *</label>
                      <div className="relative">
                        <input
                          required
                          type={showConfirmPass ? 'text' : 'password'}
                          minLength={8}
                          value={createForm.confirmPassword}
                          onChange={e => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                          placeholder="Repetir contraseña"
                          className={`w-full bg-gray-900 border rounded-lg px-3 py-2 pr-10 text-white text-sm focus:outline-none ${
                            createForm.confirmPassword && createForm.password !== createForm.confirmPassword
                              ? 'border-rose-500 focus:border-rose-500'
                              : 'border-gray-700 focus:border-emerald-500'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPass(!showConfirmPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1">Rol *</label>
                      <select
                        value={createForm.roleId}
                        onChange={e => setCreateForm({ ...createForm, roleId: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-sm focus:border-emerald-500 outline-none"
                      >
                        <option value="role-company-admin-00-000000000002">Administrador</option>
                        <option value="role-auditor-000000-000000000004">Solo Lectura</option>
                      </select>
                    </div>
                  </div>

                  {createError && (
                    <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{createError}</p>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={createUserMutation.isPending}
                      className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      {createUserMutation.isPending ? 'Creando...' : 'Crear Usuario'}
                    </button>
                  </div>
                </form>
              )}

              {/* Tabla de usuarios */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="text-gray-500 border-b border-gray-800 uppercase text-xs">
                    <tr>
                      <th className="py-3 px-4">Usuario</th>
                      <th className="py-3 px-4">Correo</th>
                      <th className="py-3 px-4">Rol</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {users.length === 0 && (
                      <tr><td colSpan={5} className="py-6 text-center text-gray-500 text-sm">No hay usuarios. Creá el primero con el botón de arriba.</td></tr>
                    )}
                    {users.map((u: any) => (
                      <tr 
                        key={u.id} 
                        onDoubleClick={() => openEditModal(u)}
                        className="hover:bg-gray-800/50 cursor-pointer transition-colors group"
                        title="Doble clic para editar"
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-200">{u.firstName} {u.lastName}</div>
                          <div className="text-xs text-gray-500">{u.username}</div>
                        </td>
                        <td className="py-3 px-4 text-gray-400">{u.email}</td>
                        <td className="py-3 px-4">
                          <select
                            value={u.roleId ?? 'role-auditor-000000-000000000004'}
                            onChange={e => assignRoleMutation.mutate({ userId: u.id, roleId: e.target.value })}
                            disabled={u.isSuperAdmin || assignRoleMutation.isPending}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs font-medium focus:border-indigo-500 outline-none disabled:opacity-40 cursor-pointer"
                          >
                            <option value="role-company-admin-00-000000000002">Administrador</option>
                            <option value="role-auditor-000000-000000000004">Solo Lectura</option>
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            u.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-600/40 text-gray-400'
                          }`}>
                            {u.isActive ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-3 ml-auto">
                            <button
                              onClick={() => openEditModal(u)}
                              className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                            >
                              <SettingsIcon className="w-4 h-4" /> Editar
                            </button>
                            <button
                              onClick={() => setConfirmDialog({
                                title: '¿Desactivar usuario?',
                                message: 'El usuario ya no podrá acceder al sistema, pero sus datos y auditoría se preservarán.',
                                onConfirm: () => revokeUserMutation.mutate(u.id)
                              })}
                              disabled={user?.id === u.id || u.isSuperAdmin}
                              className="text-rose-400 hover:text-rose-300 disabled:opacity-30 transition-colors flex items-center gap-1"
                            >
                              <XCircle className="w-4 h-4" /> Desactivar
                            </button>
                            
                            {(user as any)?.isSuperAdmin && (
                              <button
                                onClick={() => setConfirmDialog({
                                  title: '¿Eliminar permanentemente?',
                                  message: 'Esta acción es irreversible y solo funcionará si el usuario no tiene actividad operativa (asientos, conciliaciones, etc).',
                                  onConfirm: () => deleteUserMutation.mutate(u.id)
                                })}
                                disabled={user?.id === u.id}
                                className="text-red-500 hover:text-red-400 disabled:opacity-30 transition-colors flex items-center gap-1"
                              >
                                <Trash2 className="w-4 h-4" /> Eliminar
                              </button>
                            )}
                          </div>
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
                  <div key={role.id} className="bg-[#0f2240]/60 border border-white/7 rounded-xl p-5 hover:border-white/20 transition-colors">
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
                <button
                  onClick={() => setShowNewPeriod(!showNewPeriod)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Calendar className="w-4 h-4" /> {showNewPeriod ? 'Cancelar' : 'Nuevo Per\u00edodo'}
                </button>
              </div>
              {showNewPeriod && (
                <div className="bg-[#0f2240]/60 border border-white/7 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-300">Crear Nuevo Per\u00edodo Fiscal</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Nombre</label>
                      <input
                        type="text"
                        value={newPeriod.name}
                        onChange={e => setNewPeriod(p => ({ ...p, name: e.target.value }))}
                        placeholder="Ej: Enero 2025"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Tipo</label>
                      <select
                        value={newPeriod.periodType}
                        onChange={e => setNewPeriod(p => ({ ...p, periodType: e.target.value as 'monthly' | 'quarterly' | 'annual' }))}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="monthly">Mensual</option>
                        <option value="quarterly">Trimestral</option>
                        <option value="annual">Anual</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Fecha de Inicio</label>
                      <input
                        type="date"
                        value={newPeriod.startDate}
                        onChange={e => setNewPeriod(p => ({ ...p, startDate: e.target.value }))}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Fecha de Fin</label>
                      <input
                        type="date"
                        value={newPeriod.endDate}
                        onChange={e => setNewPeriod(p => ({ ...p, endDate: e.target.value }))}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => openPeriodMutation.mutate()}
                    disabled={openPeriodMutation.isPending || !newPeriod.name || !newPeriod.startDate || !newPeriod.endDate}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {openPeriodMutation.isPending ? 'Creando...' : 'Crear Per\u00edodo'}
                  </button>
                </div>
              )}
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-lg flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-400 leading-relaxed">
                  Para emitir el reporte del CPA (Módulo 5), debe cerrar el periodo fiscal. <strong>El backend rechazará el cierre si existen transacciones bancarias pendientes de conciliar</strong>, garantizando que el Balance General y el Diario cuadran perfectamente con la realidad extracontable.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                {periods.map((p: any) => (
                  <div key={p.id} className="bg-[#0f2240]/60 border border-white/7 rounded-xl p-5 hover:border-white/20 transition-colors">
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
                      <p>Inicio: <span className="text-gray-300">{(p.startDate || p.start_date || '').substring(0,10)}</span></p>
                      <p>Fin: <span className="text-gray-300">{(p.endDate || p.end_date || '').substring(0,10)}</span></p>
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
                    {p.status === 'closed' && (
                      <button
                        onClick={() => {
                          if (confirm(`\u00bfEst\u00e1 seguro de BLOQUEAR PERMANENTEMENTE el periodo ${p.name}? Esta acci\u00f3n es irreversible y no puede deshacerse.`)) {
                            lockPeriodMutation.mutate(p.id);
                          }
                        }}
                        disabled={lockPeriodMutation.isPending}
                        className="w-full py-2 bg-rose-700 hover:bg-rose-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <Shield className="w-4 h-4" /> Bloquear Permanentemente
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: BACKUPS */}
          {activeTab === 'backups' && <BackupPanel />}

          {/* TAB: DIAGNOSTICS */}
          {activeTab === 'diagnostics' && <DiagnosticsPanel />}

          {/* TAB: AUDIT */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Bitácora de Auditoría</h2>
                  <p className="text-sm text-gray-400">Registro inmutable de todas las acciones realizadas en el sistema.</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setTempAuditFilters({ userId: '', date: '', startTime: '00:00', endTime: '23:59' });
                      setAppliedAuditFilters({ userId: '', date: '', startTime: '00:00', endTime: '23:59' });
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-medium rounded-lg transition-colors border border-gray-700"
                  >
                    Limpiar
                  </button>
                  <button 
                    onClick={() => setAppliedAuditFilters(tempAuditFilters)}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-indigo-600/20"
                  >
                    <Search className="w-4 h-4" /> Buscar / Actualizar
                  </button>
                  <button 
                    onClick={handleDownloadIntegrityReport}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-emerald-500/20 ml-2"
                  >
                    <Download className="w-4 h-4" /> Reporte de Integridad
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-[#0f2240]/40 p-4 rounded-xl border border-white/7">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                    <Users className="w-3 h-3" /> Usuario
                  </label>
                  <select 
                    value={tempAuditFilters.userId}
                    onChange={e => setTempAuditFilters({...tempAuditFilters, userId: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  >
                    <option value="">Todos los usuarios</option>
                    {users.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.username})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Día (Opcional)
                  </label>
                  <input 
                    type="date"
                    value={tempAuditFilters.date}
                    onChange={e => setTempAuditFilters({...tempAuditFilters, date: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Desde
                  </label>
                  <input 
                    type="time"
                    disabled={!tempAuditFilters.date}
                    value={tempAuditFilters.startTime}
                    onChange={e => setTempAuditFilters({...tempAuditFilters, startTime: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none disabled:opacity-30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Hasta
                  </label>
                  <input 
                    type="time"
                    disabled={!tempAuditFilters.date}
                    value={tempAuditFilters.endTime}
                    onChange={e => setTempAuditFilters({...tempAuditFilters, endTime: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none disabled:opacity-30"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#0a1628] text-gray-400 text-xs uppercase font-bold">
                    <tr>
                      <th className="py-3 px-4">Fecha y Hora</th>
                      <th className="py-3 px-4">Usuario</th>
                      <th className="py-3 px-4">Módulo</th>
                      <th className="py-3 px-4">Acción Realizada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {isLoadingAudit ? (
                      <tr><td colSpan={4} className="py-12 text-center text-gray-500"><Clock className="w-6 h-6 animate-spin mx-auto mb-2" /> Cargando bitácora...</td></tr>
                    ) : auditLogsList.length === 0 ? (
                      <tr><td colSpan={4} className="py-12 text-center text-gray-500">No se encontraron registros para los filtros seleccionados.</td></tr>
                    ) : (
                      auditLogsList.map((log: any) => (
                        <tr 
                          key={log.id} 
                          onClick={() => setSelectedLog(log)}
                          className="hover:bg-indigo-500/5 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 font-mono text-xs text-indigo-400">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-gray-200 font-medium">
                              {users.find(u => u.id === log.userId)?.username || log.userId || 'Sistema'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-[10px] font-bold uppercase">{log.module}</span>
                          </td>
                          <td className="py-3 px-4 text-gray-200 font-medium">
                            {getHumanReadableAction(log.action)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Editar Usuario (Paridad Total con Formulario de Creación) */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-[#0f2240] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-2xl space-y-6 animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 border-b border-gray-800 pb-4">
              <UserPlus className="w-6 h-6 text-indigo-400" />
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Modificar Perfil de Usuario</h3>
                <p className="text-xs text-gray-500 mt-1">Actualice cualquier atributo de la cuenta. Deje la contraseña en blanco para no cambiarla.</p>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Nombre *</label>
                  <input
                    required
                    value={editForm.firstName}
                    onChange={e => setEditForm({...editForm, firstName: e.target.value})}
                    placeholder="Ej: Juan"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Apellido *</label>
                  <input
                    required
                    value={editForm.lastName}
                    onChange={e => setEditForm({...editForm, lastName: e.target.value})}
                    placeholder="Ej: Pérez"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Correo Electrónico *</label>
                  <input
                    required
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm({...editForm, email: e.target.value})}
                    placeholder="juan@empresa.com"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Nombre de Usuario *</label>
                  <input
                    required
                    value={editForm.username}
                    onChange={e => setEditForm({...editForm, username: e.target.value})}
                    placeholder="jperez"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Nueva Contraseña</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      minLength={8}
                      value={editForm.password}
                      onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                      placeholder="Dejar en blanco para no cambiar"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 pr-10 text-white text-sm focus:border-indigo-500 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Confirmar Contraseña</label>
                  <div className="relative">
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      value={editForm.confirmPassword}
                      onChange={e => setEditForm({ ...editForm, confirmPassword: e.target.value })}
                      placeholder="Repetir nueva contraseña"
                      className={`w-full bg-gray-800 border rounded-xl px-4 py-2.5 pr-10 text-white text-sm focus:outline-none transition-all ${
                        editForm.confirmPassword && editForm.password !== editForm.confirmPassword
                          ? 'border-rose-500 focus:border-rose-500'
                          : 'border-gray-700 focus:border-indigo-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Rol de Usuario *</label>
                  <select
                    value={editForm.roleId}
                    onChange={e => setEditForm({ ...editForm, roleId: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-indigo-500 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="role-company-admin-00-000000000002">Administrador</option>
                    <option value="role-auditor-000000-000000000004">Solo Lectura</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl transition-all shadow-lg shadow-indigo-500/20"
                >
                  {updateUserMutation.isPending ? 'Procesando...' : 'Guardar Cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-2xl transition-all border border-white/10"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Notification Modal --- */}
      {notification && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0f2240] rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-2xl border border-white/10 transform animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${notification.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-500'}`}>
                {notification.type === 'success' ? <CheckCircle className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{notification.title}</h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">{notification.message}</p>
              <button
                onClick={() => setNotification(null)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Confirm Dialog Modal --- */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0f2240] rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-white/10 transform animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-amber-500/20 text-amber-500">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{confirmDialog.title}</h3>
              <p className="text-gray-400 text-sm mb-8 leading-relaxed">{confirmDialog.message}</p>
              
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 px-6 rounded-xl transition-colors duration-200 shadow-lg shadow-rose-600/20"
                >
                  Sí, Proceder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Audit Log Detail Modal --- */}
      {selectedLog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#0a1628] rounded-3xl w-full max-w-2xl shadow-2xl border border-white/10 overflow-hidden transform animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-[#0d1b2e]/80 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                  <FileText className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Detalle de Operación</h3>
                  <p className="text-xs text-gray-500">Ref: {selectedLog.id.substring(0,8)}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#0d1b2e]/60 p-3 rounded-xl border border-white/5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Usuario</p>
                  <p className="text-white font-medium">{users.find(u => u.id === selectedLog.userId)?.username || selectedLog.userId || 'Sistema'}</p>
                </div>
                <div className="bg-[#0d1b2e]/60 p-3 rounded-xl border border-white/5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Fecha y Hora</p>
                  <p className="text-white font-medium">{new Date(selectedLog.createdAt).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-2">Acción</p>
                <div className="bg-indigo-500/5 border border-indigo-500/20 p-4 rounded-xl">
                  <p className="text-indigo-100 text-lg font-semibold">{getHumanReadableAction(selectedLog.action)}</p>
                </div>
              </div>

              {/* Technical Info Area - Made Stacked for more horizontal space */}
              {(selectedLog.beforeState || selectedLog.afterState) && (
                <div className="space-y-4">
                  <p className="text-[10px] font-bold text-gray-500 uppercase border-b border-gray-800 pb-1">Información Técnica (Estados)</p>
                  <div className="space-y-4">
                    {selectedLog.beforeState && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-rose-400 font-bold uppercase">● Estado Anterior</p>
                        <pre className="bg-black/40 p-4 rounded-xl text-[12px] text-gray-400 font-mono overflow-auto max-h-60 border border-gray-800 leading-relaxed">
                          {JSON.stringify(JSON.parse(selectedLog.beforeState), null, 2)}
                        </pre>
                      </div>
                    )}
                    {selectedLog.afterState && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-emerald-400 font-bold uppercase">● Estado Resultante</p>
                        <pre className="bg-black/40 p-4 rounded-xl text-[12px] text-gray-200 font-mono overflow-auto max-h-60 border border-gray-800 leading-relaxed">
                          {JSON.stringify(JSON.parse(selectedLog.afterState), null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl flex gap-3">
                <Shield className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="text-[10px] text-amber-400/80 leading-relaxed">
                  Registro firmado criptográficamente (Hash: {selectedLog.entryHash.substring(0, 16)}...). 
                  Garantiza la inmutabilidad de la cadena de auditoría.
                </div>
              </div>
            </div>

            <div className="p-6 bg-[#0d1b2e]/80 border-t border-white/5 flex justify-end">
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <PrintPreviewModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="Directorio de Usuarios de la Empresa"
        config={{
          moduleName: 'users',
          dateRange: false,
          searchByDescription: true,
          columnSelector: true,
          mandatoryColumns: ['username', 'email']
        }}
        columns={[
          { key: 'firstName', label: 'Nombre', align: 'left' },
          { key: 'lastName', label: 'Apellido', align: 'left' },
          { key: 'username', label: 'Usuario', align: 'left' },
          { key: 'email', label: 'Correo', align: 'left' },
          { key: 'roleId', label: 'Rol', align: 'center', format: (val) => val === 'role-company-admin-00-000000000002' ? 'Administrador' : 'Solo Lectura' },
          { key: 'isActive', label: 'Estado', align: 'center', format: (val) => val ? 'Activo' : 'Inactivo' }
        ]}
        data={users}
      />
    </div>
  );
}
