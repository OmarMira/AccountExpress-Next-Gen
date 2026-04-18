import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../../lib/api';
import { ShieldCheck, Lock, Unlock, Trash2, Pencil, Search, UserPlus, X } from 'lucide-react';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<AdminUser | null>(null);
  const [userModal, setUserModal] = useState<{ mode: 'create' | 'edit'; user?: AdminUser } | null>(null);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', username: '', email: '', password: '', companyId: '', roleId: 'admin' });
  const [notification, setNotification] = useState<{title: string, message: string, type: 'error' | 'success'} | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetchApi('/users/all');
      setUsers(res?.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleToggleActive = async (user: AdminUser) => {
    setToggling(user.id);
    try {
      await fetchApi(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await loadUsers();
    } catch (err: unknown) {
      setNotification({
        title: 'Error de Actualización',
        message: err instanceof Error ? err.message : 'Error al actualizar usuario',
        type: 'error'
      });
    } finally {
      setToggling(null);
    }
  };

  const handleOpenCreate = () => {
    setUserModal({ mode: 'create' });
    setFormData({ firstName: '', lastName: '', username: '', email: '', password: '', companyId: '', roleId: 'admin' });
  };

  const handleOpenEdit = (user: AdminUser) => {
    setUserModal({ mode: 'edit', user });
    setFormData({ 
      firstName: user.firstName, 
      lastName: user.lastName, 
      username: user.username, 
      email: user.email, 
      password: '',
      companyId: '', // We might need to fetch the actual companyId if we want to change it
      roleId: 'admin'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    try {
      if (userModal?.mode === 'edit') {
        const payload: any = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          username: formData.username,
          email: formData.email,
        };
        if (formData.password) payload.password = formData.password;
        
        await fetchApi(`/users/${userModal.user!.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        setNotification({ title: 'Actualización Exitosa', message: 'Usuario modificado correctamente.', type: 'success' });
      } else {
        // Create user
        // We need a companyId. In a multi-tenant system, common practice is to default or let admin pick.
        // For now, let's assume we need to provide a valid companyId from the user's focus or a list.
        // If we don't have one, this might fail unless we pick a default.
        // Let's assume most users have at least one company or we can get it from sessions.
        await fetchApi('/users', {
          method: 'POST',
          body: JSON.stringify({
            ...formData,
            companyId: formData.companyId || 'default-company', // Placeholder, should be handled better
          })
        });
        setNotification({ title: 'Usuario Creado', message: 'El usuario ha sido registrado exitosamente.', type: 'success' });
      }
      await loadUsers();
      setUserModal(null);
    } catch (err: any) {
      setNotification({ title: 'Error', message: err.message || 'Error al procesar la solicitud.', type: 'error' });
    } finally {
      setIsPending(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const executeDelete = async () => {
    if (!deleteDialog) return;
    try {
      await fetchApi(`/users/${deleteDialog.id}`, { method: 'DELETE' });
      setNotification({
        title: 'Operación Exitosa',
        message: 'Usuario eliminado correctamente de la base de datos.',
        type: 'success'
      });
      await loadUsers();
    } catch (err: any) {
      setNotification({
        title: 'No se Pudo Eliminar',
        message: err.message || 'Ocurrió un error inesperado al intentar borrar el usuario.',
        type: 'error'
      });
    } finally {
      setDeleteDialog(null);
    }
  };

  if (loading) return <div className="p-6 text-gray-400">Cargando usuarios...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  const FIELD_CLS = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-gray-500';
  const LABEL_CLS = 'block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1';

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Styled like Accounts */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Usuarios del Sistema</h1>
          <p className="text-sm text-gray-400 mt-1">Gestión global de accesos y registros administrativos</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="Buscar usuario..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-gray-500"
            />
          </div>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" /> Nuevo Usuario
          </button>
        </div>
      </div>

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <div className="bg-gray-800/50 rounded-xl overflow-hidden border border-gray-700/50 shadow-2xl">
              <table className="min-w-full divide-y divide-gray-700/50">
                <thead className="bg-gray-800/80 text-gray-400">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-bold uppercase tracking-wider sm:pl-6">Nombre</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Username</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Email</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Estado</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Super Admin</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Último Login</th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 text-center text-xs font-bold uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50 bg-gray-900/40">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-800/40 transition-colors group">
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">
                        {user.firstName} {user.lastName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        @{user.username}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {user.email}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${user.isActive ? 'bg-green-400/10 text-green-400 ring-green-400/20' : 'bg-red-400/10 text-red-400 ring-red-400/20'}`}>
                          {user.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        {user.isSuperAdmin ? (
                          <span className="inline-flex items-center gap-1 text-indigo-400">
                            <ShieldCheck className="h-4 w-4" />
                            Sí
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString()
                          : <span className="text-gray-500">Nunca</span>
                        }
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <div className="flex justify-end gap-1 opacity-10 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleOpenEdit(user)}
                              disabled={toggling === user.id}
                              className="text-gray-400 hover:text-indigo-400 transition-colors p-2 rounded hover:bg-indigo-500/10"
                              title="Editar usuario"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(user)}
                              disabled={toggling === user.id}
                              className={`p-2 rounded transition-colors ${user.isActive ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10' : 'text-green-400 hover:text-green-300 hover:bg-green-500/10'}`}
                              title={user.isActive ? 'Desactivar acceso' : 'Activar acceso'}
                            >
                              {user.isActive ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setDeleteDialog(user)}
                              disabled={toggling === user.id}
                              className="text-gray-400 hover:text-rose-400 transition-colors p-2 rounded hover:bg-rose-500/10"
                              title="Eliminar permanentemente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-sm text-gray-400">
                        No hay usuarios registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Unified User Modal (Create/Edit) */}
      {userModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {userModal.mode === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {userModal.mode === 'create' 
                    ? 'Registre una nueva cuenta administrativa en el sistema' 
                    : `Modificando perfil de @${userModal.user?.username}`}
                </p>
              </div>
              <button onClick={() => setUserModal(null)} className="text-gray-400 hover:text-white transition-colors p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="px-6 py-4 overflow-y-auto space-y-4">
              <form id="userForm" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={LABEL_CLS}>Nombre *</label>
                    <input 
                      required type="text" value={formData.firstName} 
                      onChange={e => setFormData({...formData, firstName: e.target.value})} 
                      className={FIELD_CLS} placeholder="Ej: Juan"
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Apellido *</label>
                    <input 
                      required type="text" value={formData.lastName} 
                      onChange={e => setFormData({...formData, lastName: e.target.value})} 
                      className={FIELD_CLS} placeholder="Ej: Pérez"
                    />
                  </div>
                </div>

                <div>
                  <label className={LABEL_CLS}>Nombre de Usuario *</label>
                  <input 
                    required type="text" value={formData.username} 
                    onChange={e => setFormData({...formData, username: e.target.value})} 
                    className={FIELD_CLS} placeholder="Ej: jperez"
                    disabled={userModal.mode === 'edit'} // Username typically fixed in many systems
                  />
                  {userModal.mode === 'edit' && <p className="text-[10px] text-gray-500 mt-1">El nombre de usuario no puede ser modificado.</p>}
                </div>

                <div>
                  <label className={LABEL_CLS}>Correo Electrónico *</label>
                  <input 
                    required type="email" value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                    className={FIELD_CLS} placeholder="usuario@empresa.com"
                  />
                </div>

                <div>
                  <label className={LABEL_CLS}>
                    {userModal.mode === 'create' ? 'Contraseña *' : 'Nueva Contraseña (Opcional)'}
                  </label>
                  <input 
                    required={userModal.mode === 'create'} 
                    type="password" value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})} 
                    className={FIELD_CLS} 
                    placeholder={userModal.mode === 'create' ? 'Mínimo 8 caracteres' : 'Dejar en blanco para no cambiar'} 
                  />
                </div>

                {userModal.mode === 'create' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL_CLS}>Empresa Principal *</label>
                      <input 
                        required type="text" value={formData.companyId} 
                        onChange={e => setFormData({...formData, companyId: e.target.value})} 
                        className={FIELD_CLS} placeholder="ID de Empresa o Código"
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Rol Inicial *</label>
                      <select 
                        value={formData.roleId} 
                        onChange={e => setFormData({...formData, roleId: e.target.value})}
                        className={`${FIELD_CLS} appearance-none`}
                      >
                        <option value="admin">Administrador de Empresa</option>
                        <option value="viewer">Auditor / Consulta</option>
                        <option value="accountant">Contador</option>
                      </select>
                    </div>
                  </div>
                )}
              </form>
            </div>

            <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 flex justify-end gap-3 flex-shrink-0">
              <button 
                type="button" onClick={() => setUserModal(null)} 
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                disabled={isPending}
              >
                Cancelar
              </button>
              <button 
                type="submit" form="userForm"
                disabled={isPending}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isPending ? 'Procesando...' : (userModal.mode === 'create' ? 'Crear Usuario' : 'Guardar Cambios')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-0 backdrop-blur-sm">
          <div className="relative w-full max-w-md transform rounded-xl bg-slate-800 p-6 text-left shadow-2xl transition-all border border-slate-700">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-red-500/10 rounded-full">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white">Cuidado: Eliminación Permanente</h3>
            </div>
            <p className="text-sm text-slate-300 mb-6">
              ¿Estás seguro de que deseas eliminar permanentemente al usuario <span className="font-bold text-white">{deleteDialog.firstName} (@{deleteDialog.username})</span>? Esta acción no se puede deshacer y fallará por motivos de auditoría si el usuario ya tiene asientos contables creados.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteDialog(null)}
                className="px-4 py-2 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition"
              >
                Cerrar
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 bg-red-600 rounded-lg text-white font-medium hover:bg-red-500 shadow-lg shadow-red-900/20 transition"
              >
                Sí, Eliminar Usuario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast/Modal */}
      {notification && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-transparent pointer-events-none p-4">
          <div className={`mt-auto mb-10 mx-auto max-w-md w-full pointer-events-auto p-4 rounded-xl border shadow-xl flex items-start gap-4 animate-in slide-in-from-bottom-5 ${
            notification.type === 'error' ? 'bg-red-950/90 border-red-900/50' : 'bg-emerald-950/90 border-emerald-900/50'
          }`}>
            <div className="flex-1">
              <h4 className={`text-sm font-bold ${notification.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                {notification.title}
              </h4>
              <p className="text-sm text-slate-300 mt-1">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        </div>
      )}

    </div>
  );
}
