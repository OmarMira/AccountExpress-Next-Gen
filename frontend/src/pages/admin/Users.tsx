import { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../../lib/api';
import { ShieldCheck, Lock, Unlock, Trash2 } from 'lucide-react';

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
  const [toggling, setToggling] = useState<string | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<AdminUser | null>(null);
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-white">Usuarios del Sistema</h1>
          <p className="mt-2 text-sm text-gray-400">
            Lista global de todos los usuarios registrados. Módulo exclusivo de Super Admin.
          </p>
        </div>
      </div>

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-800">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Nombre</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Username</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Email</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Estado</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Super Admin</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Último Login</th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700 bg-gray-900">
                  {users.map((user) => (
                    <tr key={user.id}>
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
                        <div className="flex justify-end gap-3">
                            <button
                              onClick={() => handleToggleActive(user)}
                              disabled={toggling === user.id}
                              title={user.isActive ? 'Desactivar' : 'Activar'}
                              className={`flex items-center gap-1 disabled:opacity-50 transition-colors ${user.isActive ? 'text-amber-400 hover:text-amber-300' : 'text-green-400 hover:text-green-300'}`}
                            >
                              {user.isActive ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                              <span className="hidden sm:inline">{user.isActive ? 'Desactivar' : 'Activar'}</span>
                            </button>
                            <button
                              onClick={() => setDeleteDialog(user)}
                              disabled={toggling === user.id}
                              title="Eliminar permanentemente"
                              className="flex items-center gap-1 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="hidden sm:inline">Eliminar</span>
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
