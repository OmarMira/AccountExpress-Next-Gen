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
      setError(err instanceof Error ? err.message : 'Error al actualizar usuario');
    } finally {
      setToggling(null);
    }
  };


  const handleDeleteUser = async (user: AdminUser) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente al usuario ${user.firstName} (@${user.username})? Esta acción no se puede deshacer y fallará si el usuario tiene actividad registrada.`)) {
      return;
    }

    try {
      await fetchApi(`/users/${user.id}`, { method: 'DELETE' });
      alert('Usuario eliminado correctamente');
      loadUsers();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
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
                        {!user.isSuperAdmin && (
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
                              onClick={() => handleDeleteUser(user)}
                              disabled={toggling === user.id}
                              title="Eliminar permanentemente"
                              className="flex items-center gap-1 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="hidden sm:inline">Eliminar</span>
                            </button>
                          </div>
                        )}
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
    </div>
  );
}
