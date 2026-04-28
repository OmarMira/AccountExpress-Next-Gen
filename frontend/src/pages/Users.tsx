// ============================================================
// USERS PAGE
// Gestión de usuarios y roles por tenant.
// ============================================================

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { UserPlus, Shield, Lock, Unlock, RefreshCw, Printer } from 'lucide-react';
import { PrintPreviewModal } from '../components/PrintPreviewModal';

// ── Tipos ────────────────────────────────────────────────────

interface UserRow {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: number;
  isLocked: number;
  roleName: string;
  roleDisplayName: string;
  lastLoginAt: string | null;
}

interface Role {
  id: string;
  name: string;
  displayName: string;
}

// ── Componente principal ─────────────────────────────────────

export function Users() {
  const activeCompany = useAuthStore((s) => s.activeCompany);
  const queryClient = useQueryClient();
  
  if (!activeCompany) {
    return <div className="p-8 text-white">Cargando contexto de empresa...</div>;
  }

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    username: '', email: '', password: '',
    firstName: '', lastName: '', roleId: '',
  });
  const [roleModal, setRoleModal] = useState<{ userId: string; currentRoleId: string } | null>(null);
  const [newRoleId, setNewRoleId] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);

  const companyId = activeCompany?.id;

  // ── Queries ───────────────────────────────────────────────

  const { data: users = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ['users', companyId],
    queryFn: async () => {
      const res = await fetchApi(`/users?companyId=${companyId}`);
      return Array.isArray(res) ? res : res?.data ?? [];
    },
    enabled: !!companyId,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      return await fetchApi('/users/roles');
    },
  });

  const safeUsers = useMemo(() => {
    return (users || []).map((u: any) => ({
      ...u,
      firstName: u?.firstName || '',
      lastName: u?.lastName || '',
      username: u?.username || '—',
      email: u?.email || '—',
      roleDisplayName: u?.roleDisplayName || '—',
      isActive: u?.isActive === 1 || u?.isActive === true
    }));
  }, [users]);

  // ── Mutations ─────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (body: typeof form & { companyId: string }) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', companyId] });
      setShowForm(false);
      setForm({ username: '', email: '', password: '', firstName: '', lastName: '', roleId: '' });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive }),
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', companyId] }),
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ companyId, roleId }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', companyId] });
      setRoleModal(null);
    },
  });

  // ── Handlers ──────────────────────────────────────────────

  const handleCreate = () => {
    if (!companyId) return;
    createMutation.mutate({ ...form, companyId });
  };

  const handleAssignRole = () => {
    if (!roleModal || !newRoleId) return;
    assignRoleMutation.mutate({ userId: roleModal.userId, roleId: newRoleId });
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuarios y Roles</h1>
          <p className="text-gray-400 text-sm mt-1">Gestión de accesos para esta empresa</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-2 bg-[#0f2240] hover:bg-[#0f2240]/70 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/10 shadow-lg"
          >
            <Printer size={16} />
            Imprimir Lista
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-[#0071c5] hover:bg-[#005fa3] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-[#0071c5]/50 shadow-lg shadow-[#0071c5]/10"
          >
            <UserPlus size={16} />
            Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Formulario de creación */}
      {showForm && (
        <div className="bg-[#0f2240] border border-white/7 rounded-xl p-5 space-y-4">
          <h2 className="text-white font-semibold">Crear Usuario</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'firstName', label: 'Nombre' },
              { key: 'lastName',  label: 'Apellido' },
              { key: 'username',  label: 'Usuario' },
              { key: 'email',     label: 'Email' },
              { key: 'password',  label: 'Contraseña' },
            ].map(({ key, label }) => (
              <input
                key={key}
                type={key === 'password' ? 'password' : 'text'}
                placeholder={label}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="bg-[#0a1628] border border-white/10 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:border-[#0071c5]"
              />
            ))}
            <select
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
              className="bg-[#0a1628] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0071c5]"
            >
              <option value="">Seleccionar Rol</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.displayName}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-[#0071c5] hover:bg-[#005fa3] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {createMutation.isPending ? 'Creando...' : 'Crear Usuario'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-red-400 text-sm">Error al crear usuario.</p>
          )}
        </div>
      )}

      {/* Tabla de usuarios */}
      <div className="bg-[#0f2240] border border-white/7 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando usuarios...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No hay usuarios en esta empresa.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/7 text-gray-400 text-left">
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Último acceso</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">
                    {u.firstName} {u.lastName}
                    <span className="block text-gray-400 text-xs">@{u.username}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 bg-blue-900/40 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded text-xs">
                      <Shield size={11} />
                      {u.roleDisplayName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-US') : 'Nunca'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      u.isActive ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'
                    }`}>
                      {u.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActiveMutation.mutate({ userId: u.id, isActive: !u.isActive })}
                        title={u.isActive ? 'Desactivar' : 'Activar'}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {u.isActive ? <Lock size={15} /> : <Unlock size={15} />}
                      </button>
                      <button
                        onClick={() => { setRoleModal({ userId: u.id, currentRoleId: u.roleName }); setNewRoleId(''); }}
                        title="Cambiar rol"
                        className="text-gray-400 hover:text-[#0071c5] transition-colors"
                      >
                        <RefreshCw size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal cambio de rol */}
      {roleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#0f2240] border border-white/7 rounded-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-white font-semibold">Cambiar Rol</h3>
            <select
              value={newRoleId}
              onChange={(e) => setNewRoleId(e.target.value)}
              className="w-full bg-[#0a1628] border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0071c5]"
            >
              <option value="">Seleccionar nuevo rol</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.displayName}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={handleAssignRole}
                disabled={!newRoleId || assignRoleMutation.isPending}
                className="flex-1 bg-[#0071c5] hover:bg-[#005fa3] disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {assignRoleMutation.isPending ? 'Guardando...' : 'Confirmar'}
              </button>
              <button
                onClick={() => setRoleModal(null)}
                className="flex-1 bg-white/10 hover:bg-white/15 text-white py-2 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      <PrintPreviewModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="Nómina de Usuarios (Permisos)"
        config={{
          moduleName: 'users',
          columnSelector: true,
          mandatoryColumns: ['username', 'roleDisplayName']
        }}
        columns={[
          { key: 'firstName', label: 'Nombre', align: 'left' },
          { key: 'lastName', label: 'Apellido', align: 'left' },
          { key: 'username', label: 'Usuario', align: 'left' },
          { key: 'email', label: 'Email', align: 'left' },
          { key: 'roleDisplayName', label: 'Rol', align: 'center' },
          { key: 'isActive', label: 'Estado', align: 'center', format: (val: any) => val ? 'ACTIVO' : 'INACTIVO' },
          { key: 'lastLoginAt', label: 'Último Acceso', align: 'left', format: (val: any) => {
              if (!val) return 'Nunca';
              try {
                const date = new Date(val);
                if (isNaN(date.getTime())) return '—';
                return date.toLocaleString();
              } catch (e) { return '—'; }
          }}
        ]}
        data={safeUsers}
      />
    </div>
  );
}
