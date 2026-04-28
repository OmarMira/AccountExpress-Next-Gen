import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../../lib/api';
import { ArrowLeft, UserPlus, UserMinus, Building2 } from 'lucide-react';

interface CompanyDetail {
  id: string;
  legalName: string;
  tradeName: string | null;
  ein: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  email: string | null;
  fiscalYearStart: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
}

interface CompanyUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  roleName: string;
  roleActive: boolean;
  grantedAt: string;
  revokedAt: string | null;
}

interface Role {
  id: string;
  name: string;
  displayName: string;
}

interface AllUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AssignModalState {
  open: boolean;
  userId: string;
  roleId: string;
  allUsers: AllUser[];
  roles: Role[];
  loading: boolean;
  error: string | null;
}

export function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [modal, setModal] = useState<AssignModalState>({
    open: false,
    userId: '',
    roleId: '',
    allUsers: [],
    roles: [],
    loading: false,
    error: null,
  });

  const loadCompany = useCallback(async () => {
    if (!id) return;
    try {
      const companies = await fetchApi('/companies');
      const found = (companies as CompanyDetail[]).find((c) => c.id === id);
      if (found) {
        setCompany(found);
      } else {
        setError('Empresa no encontrada');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar empresa');
    } finally {
      setLoadingCompany(false);
    }
  }, [id]);

  const loadCompanyUsers = useCallback(async () => {
    if (!id) return;
    setLoadingUsers(true);
    try {
      const data = await fetchApi(`/companies/${id}/users`);
      setCompanyUsers(data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
    } finally {
      setLoadingUsers(false);
    }
  }, [id]);

  useEffect(() => {
    loadCompany();
    loadCompanyUsers();
  }, [loadCompany, loadCompanyUsers]);

  const handleRevoke = async (userId: string) => {
    if (!id) return;
    setRevoking(userId);
    try {
      await fetchApi(`/companies/${id}/users/${userId}`, { method: 'DELETE' });
      await loadCompanyUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al revocar usuario');
    } finally {
      setRevoking(null);
    }
  };

  const openAssignModal = async () => {
    setModal(prev => ({ ...prev, open: true, loading: true, error: null }));
    try {
      const [rolesData, allUsersData] = await Promise.all([
        fetchApi('/users/roles'),
        fetchApi('/users/all'),
      ]);

      const roles: Role[] = rolesData?.data ?? [];
      const usersList: AllUser[] = allUsersData?.data ?? [];
      
      setModal(prev => ({
        ...prev,
        roles,
        allUsers: usersList,
        loading: false,
      }));
    } catch (err: unknown) {
      setModal(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Error al cargar datos',
      }));
    }
  };

  const handleAssign = async () => {
    if (!id || !modal.userId || !modal.roleId) return;
    setModal(prev => ({ ...prev, loading: true, error: null }));
    try {
      await fetchApi(`/companies/${id}/users`, {
        method: 'POST',
        body: JSON.stringify({ userId: modal.userId, roleId: modal.roleId }),
      });
      setModal({ open: false, userId: '', roleId: '', allUsers: [], roles: [], loading: false, error: null });
      await loadCompanyUsers();
    } catch (err: unknown) {
      setModal(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Error al asignar usuario',
      }));
    }
  };

  if (loadingCompany) return <div className="p-6 text-gray-400">Cargando empresa...</div>;
  if (error && !company) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/admin/companies')}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Empresas
        </button>
        <div className="flex items-start gap-4">
          <div className="p-3 bg-[#0071c5]/10 rounded-lg">
            <Building2 className="h-8 w-8 text-[#0071c5]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{company?.legalName}</h1>
            {company?.tradeName && (
              <p className="text-gray-400 text-sm mt-1">{company.tradeName}</p>
            )}
            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset mt-2 ${company?.isActive ? 'bg-green-400/10 text-green-400 ring-green-400/20' : 'bg-red-400/10 text-red-400 ring-red-400/20'}`}>
              {company?.isActive ? 'Activa' : 'Inactiva'}
            </span>
          </div>
        </div>
      </div>

      {/* Company Info */}
      <div className="bg-[#0f2240] rounded-lg border border-white/7 p-6 mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Datos de la Empresa</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {company?.ein && (
            <div>
              <dt className="text-xs text-gray-500">EIN</dt>
              <dd className="mt-1 text-sm text-white">{company.ein}</dd>
            </div>
          )}
          {company?.email && (
            <div>
              <dt className="text-xs text-gray-500">Email</dt>
              <dd className="mt-1 text-sm text-white">{company.email}</dd>
            </div>
          )}
          {company?.phone && (
            <div>
              <dt className="text-xs text-gray-500">Teléfono</dt>
              <dd className="mt-1 text-sm text-white">{company.phone}</dd>
            </div>
          )}
          {company?.address && (
            <div>
              <dt className="text-xs text-gray-500">Dirección</dt>
              <dd className="mt-1 text-sm text-white">
                {[company.address, company.city, company.state, company.zipCode].filter(Boolean).join(', ')}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-gray-500">Año Fiscal Inicia</dt>
            <dd className="mt-1 text-sm text-white">{company?.fiscalYearStart}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Moneda</dt>
            <dd className="mt-1 text-sm text-white">{company?.currency}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Creada</dt>
            <dd className="mt-1 text-sm text-white">
              {company ? new Date(company.createdAt).toLocaleDateString() : '-'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Users Section */}
      <div>
        <div className="sm:flex sm:items-center mb-4">
          <div className="sm:flex-auto">
            <h2 className="text-lg font-semibold text-white">Usuarios Asignados</h2>
            <p className="mt-1 text-sm text-gray-400">Usuarios con acceso activo o revocado a esta empresa.</p>
          </div>
          <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
            <button
              onClick={openAssignModal}
              className="flex items-center gap-2 rounded-md bg-[#0071c5] px-3 py-2 text-sm font-semibold text-white hover:bg-[#005fa3]"
            >
              <UserPlus className="h-4 w-4" />
              Asignar Usuario
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-400/10 border border-red-400/20 rounded-md">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {loadingUsers ? (
          <div className="text-gray-400 text-sm py-4">Cargando usuarios...</div>
        ) : (
          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
            <table className="min-w-full divide-y divide-white/7">
              <thead className="bg-[#0a1628]">
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Usuario</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Email</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Rol</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Estado</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Asignado</th>
                  <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/7 bg-[#0f2240]">
                {companyUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">
                      {u.firstName} {u.lastName}
                      <div className="text-xs text-gray-400">@{u.username}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{u.email}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{u.roleName}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${u.roleActive ? 'bg-green-400/10 text-green-400 ring-green-400/20' : 'bg-gray-400/10 text-gray-400 ring-gray-400/20'}`}>
                        {u.roleActive ? 'Activo' : 'Revocado'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                      {new Date(u.grantedAt).toLocaleDateString()}
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                      {u.roleActive && (
                        <button
                          onClick={() => handleRevoke(u.id)}
                          disabled={revoking === u.id}
                          className="flex items-center gap-1 text-red-400 hover:text-red-300 disabled:opacity-50"
                          title="Revocar acceso"
                        >
                          <UserMinus className="h-4 w-4" />
                          {revoking === u.id ? 'Revocando...' : 'Revocar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {companyUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-sm text-gray-400">
                      No hay usuarios asignados a esta empresa
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign User Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-0 backdrop-blur-sm">
          <div className="relative w-full max-w-md transform rounded-xl bg-[#0f2240] p-6 text-left shadow-2xl transition-all border border-white/7">
            <button 
              onClick={() => setModal(prev => ({ ...prev, open: false }))} 
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold text-white mb-6">Asignar Usuario a Empresa</h3>

              {modal.error && (
                <div className="mb-4 p-3 bg-red-400/10 border border-red-400/20 rounded-md">
                  <p className="text-sm text-red-500">{modal.error}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Usuario
                  </label>
                  {modal.loading ? (
                    <div className="text-sm text-gray-400">Cargando usuarios...</div>
                  ) : (
                    <select
                      value={modal.userId}
                      onChange={(e) => setModal(prev => ({ ...prev, userId: e.target.value }))}
                      className="block w-full rounded-md border-white/10 bg-[#0a1628] text-white shadow-sm focus:border-[#0071c5] focus:ring-[#0071c5] sm:text-sm p-2 outline-none"
                    >
                      <option value="">Seleccionar un usuario</option>
                      {modal.allUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.firstName} {user.lastName} (@{user.username})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Rol</label>
                  {modal.loading ? (
                    <div className="text-sm text-gray-400">Cargando roles...</div>
                  ) : (
                    <select
                      value={modal.roleId}
                      onChange={(e) => setModal(prev => ({ ...prev, roleId: e.target.value }))}
                      className="block w-full rounded-md border-white/10 bg-[#0a1628] text-white shadow-sm focus:border-[#0071c5] focus:ring-[#0071c5] sm:text-sm p-2 outline-none"
                    >
                      <option value="">Seleccionar rol</option>
                      {modal.roles.map((role) => (
                        <option key={role.id} value={role.id}>{role.displayName}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModal(prev => ({ ...prev, open: false }))}
                  className="rounded-md border border-white/10 bg-transparent py-2 px-4 text-sm font-medium text-gray-300 hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={modal.loading || !modal.userId || !modal.roleId}
                  className="rounded-md bg-[#0071c5] py-2 px-4 text-sm font-medium text-white hover:bg-[#005fa3] disabled:opacity-50"
                >
                  {modal.loading ? 'Asignando...' : 'Asignar'}
                </button>
              </div>
            </div>
          </div>
      )}
    </div>
  );
}
