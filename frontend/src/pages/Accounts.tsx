import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { Plus, Search, Trash2, FolderTree, AlertCircle, Pencil, Printer } from 'lucide-react';
import { PrintPreviewModal } from '../components/PrintPreviewModal';
import { PermissionGate } from '../components/PermissionGate';

import type { Account } from '../components/accounts/types';
import { BALANCE_LABELS } from '../components/accounts/constants';
import { ConfirmDialog } from '../components/accounts/ConfirmDialog';
import { CreateAccountModal } from '../components/accounts/CreateAccountModal';
import { EditAccountModal } from '../components/accounts/EditAccountModal';

// ── Main Component ───────────────────────────────────────────────────────────
export function Accounts() {
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editParentCode, setEditParentCode] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void, isDangerous?: boolean} | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [formData, setFormData] = useState({
    code: '', name: '', accountType: 'asset', normalBalance: 'debit',
    parentCode: '', description: '',
  });

  const { data: accounts = [], isLoading, error } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return [];
      return fetchApi(`/gl-accounts`);
    },
    enabled: !!activeCompany,
  });

  // Resolve parent code from parentId
  const getParentCode = (parentId: string | null): string => {
    if (!parentId) return '';
    return accounts.find(a => a.id === parentId)?.code ?? '';
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      fetchApi('/gl-accounts', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      setShowModal(false);
      setFormData({ code: '', name: '', accountType: 'asset', normalBalance: 'debit', parentCode: '', description: '' });
      setFormError('');
    },
    onError: (err: any) => setFormError(err.message || 'Error al crear la cuenta'),
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: string; name: string; code: string; description: string; parentCode: string | null }) =>
      fetchApi(`/gl-accounts/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: data.name,
          code: data.code,
          description: data.description,
          parentCode: data.parentCode ?? null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      setEditingAccount(null);
      setFormError('');
    },
    onError: (err: any) => setFormError(err.message || 'Error al editar la cuenta'),
  });

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) =>
      fetchApi(`/gl-accounts/${accountId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] }),
    onError: (err: any) => alert(`Error al desactivar: ${err.message}`),
  });

  const handleDelete = (id: string, name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Desactivar Cuenta',
      message: `¿Estás seguro de que deseas desactivar la cuenta "${name}"?`,
      isDangerous: true,
      onConfirm: () => {
        setConfirmDialog(null);
        deleteMutation.mutate(id);
      }
    });
  };

  const handleEditOpen = (acc: Account) => {
    setEditingAccount(acc);
    setEditParentCode(getParentCode(acc.parentId));
    setFormError('');
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value;
    setFormData({ ...formData, accountType: type, normalBalance: ['asset', 'expense'].includes(type) ? 'debit' : 'credit' });
  };

  const handleCloseCreate = () => {
    const hasChanges = formData.code !== '' || formData.name !== '' || formData.description !== '' || formData.parentCode !== '';
    const doClose = () => {
      setShowModal(false);
      setFormData({ code: '', name: '', accountType: 'asset', normalBalance: 'debit', parentCode: '', description: '' });
      setFormError('');
    };

    if (hasChanges) {
      setConfirmDialog({
        isOpen: true,
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar. ¿Estás seguro de que deseas cerrar y perder estos datos?',
        isDangerous: true,
        onConfirm: () => {
          setConfirmDialog(null);
          doClose();
        }
      });
      return;
    }
    doClose();
  };

  const handleCloseEdit = () => {
    if (!editingAccount) return;
    const original = accounts.find(a => a.id === editingAccount.id);
    const originalParentCode = getParentCode(original?.parentId || null);
    
    const hasChanges = 
      original?.code !== editingAccount.code ||
      original?.name !== editingAccount.name ||
      (original?.description ?? '') !== (editingAccount.description ?? '') ||
      originalParentCode !== editParentCode;

    const doClose = () => {
      setEditingAccount(null);
      setFormError('');
    };

    if (hasChanges) {
      setConfirmDialog({
        isOpen: true,
        title: 'Descartar cambios',
        message: 'Tienes cambios sin guardar. ¿Estás seguro de que deseas cerrar y perder estos datos?',
        isDangerous: true,
        onConfirm: () => {
          setConfirmDialog(null);
          doClose();
        }
      });
      return;
    }
    doClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDialog?.isOpen) {
          setConfirmDialog(null);
        } else if (showModal) {
          handleCloseCreate();
        } else if (editingAccount) {
          handleCloseEdit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal, editingAccount, confirmDialog, formData, editParentCode, accounts]);

  // ── Group & filter accounts ──────────────────────────────────────────────
  const groupedAccounts = useMemo(() => {
    const groups: Record<string, Account[]> = { asset: [], liability: [], equity: [], revenue: [], expense: [] };
    for (const acc of accounts) {
      const key = acc.accountType?.toLowerCase();
      if (groups[key]) groups[key].push(acc);
    }
    return groups;
  }, [accounts]);

  const renderAccountGroup = (title: string, type: string) => {
    const group = groupedAccounts[type];
    if (!group || group.length === 0) return null;
    const q = searchTerm.toLowerCase();
    const filtered = group.filter(a => !q || a.code.includes(q) || a.name.toLowerCase().includes(q));
    if (filtered.length === 0) return null;

    return (
      <div key={type} className="mb-8">
        <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
          <span>{title}</span>
          <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{filtered.length}</span>
        </h3>
        <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-800 text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium w-24">Código</th>
                <th className="px-4 py-3 font-medium">Nombre de Cuenta</th>
                <th className="px-4 py-3 font-medium text-center w-16 hidden md:table-cell">Balance</th>
                <th className="px-4 py-3 font-medium text-center w-24">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {filtered.map(acc => (
                <tr 
                  key={acc.id} 
                  onDoubleClick={() => handleEditOpen(acc)}
                  className="hover:bg-gray-700/30 transition-colors group cursor-pointer select-none"
                >
                  <td className="px-4 py-2.5 text-gray-300 font-mono text-xs">{acc.code}</td>
                  <td className="px-4 py-2.5 text-white">
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${(acc.level - 1) * 20}px` }}>
                      {acc.level === 1
                        ? <FolderTree className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        : <div className="w-4 border-l-2 border-b-2 border-gray-600 rounded-bl-sm h-4 -mt-2 opacity-40 flex-shrink-0" />
                      }
                      <span className="truncate">{acc.name}</span>
                      {acc.isSystem === 1 && (
                        <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0">Sistema</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${acc.normalBalance === 'debit' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {BALANCE_LABELS[acc.normalBalance] ?? acc.normalBalance}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditOpen(acc)} className="text-gray-500 hover:text-indigo-400 transition-colors p-1.5 rounded hover:bg-indigo-500/10" title="Editar cuenta">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(acc.id, acc.name)} className="text-gray-500 hover:text-rose-400 transition-colors p-1.5 rounded hover:bg-rose-500/10" title="Desactivar cuenta">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Error & Loading ──────────────────────────────────────────────────────
  if (error) return (
    <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 flex items-center gap-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      Error al cargar cuentas: {(error as Error).message}
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Plan de Cuentas</h1>
          <p className="text-sm text-gray-400 mt-1">US GAAP — Gestión jerárquica de cuentas contables</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="Buscar cuenta..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder:text-gray-500"
            />
          </div>
          <button
            onClick={() => setShowPrintModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors border border-gray-700"
          >
            <Printer className="w-4 h-4" /> Imprimir Plan
          </button>
          <PermissionGate module="accounts" action="create">
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Nueva cuenta
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="animate-pulse bg-gray-800/50 h-32 rounded-lg border border-gray-700/50 w-full" />)}
        </div>
      ) : (
        <div className="pt-2">
          {renderAccountGroup('Activos', 'asset')}
          {renderAccountGroup('Pasivos', 'liability')}
          {renderAccountGroup('Capital', 'equity')}
          {renderAccountGroup('Ingresos', 'revenue')}
          {renderAccountGroup('Gastos', 'expense')}
          {accounts.length === 0 && (
            <div className="text-center py-12 bg-gray-800/30 rounded-2xl border border-gray-700/50 border-dashed">
              <FolderTree className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No se encontraron cuentas.</p>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL CREAR ─────────────────────────────────────────── */}
      <CreateAccountModal
        isOpen={showModal}
        onClose={handleCloseCreate}
        formData={formData}
        setFormData={setFormData}
        handleTypeChange={handleTypeChange}
        accounts={accounts}
        error={formError}
        isPending={createMutation.isPending}
        onSubmit={e => { e.preventDefault(); createMutation.mutate(formData); }}
      />

      {/* ── MODAL EDITAR ─────────────────────────────────────────── */}
      <EditAccountModal
        editingAccount={editingAccount}
        onClose={handleCloseEdit}
        editParentCode={editParentCode}
        setEditParentCode={setEditParentCode}
        setEditingAccount={(acc) => setEditingAccount(acc)}
        accounts={accounts}
        error={formError}
        isPending={editMutation.isPending}
        onSubmit={e => {
          e.preventDefault();
          if (!editingAccount) return;
          editMutation.mutate({
            id: editingAccount.id,
            name: editingAccount.name,
            code: editingAccount.code,
            description: editingAccount.description ?? '',
            parentCode: editParentCode || null,
          });
        }}
      />

      {/* ── MODAL DE CONFIRMACIÓN ─────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={confirmDialog?.isOpen || false}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        isDangerous={confirmDialog?.isDangerous}
        onConfirm={confirmDialog?.onConfirm || (() => {})}
        onCancel={() => setConfirmDialog(null)}
      />

      {/* --- Print Preview Modal --- */}
      <PrintPreviewModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="Plan de Cuentas (Nomenclatura)"
        config={{
          moduleName: 'accounts',
          searchByDescription: true,
          columnSelector: true,
          mandatoryColumns: ['code', 'name']
        }}
        columns={[
          { key: 'code', label: 'Código', align: 'left' },
          { key: 'name', label: 'Nombre de Cuenta', align: 'left' },
          { key: 'accountType', label: 'Tipo', align: 'center', format: (val) => val.toUpperCase() },
          { key: 'normalBalance', label: 'Naturaleza', align: 'center', format: (val) => val === 'debit' ? 'Deudora' : 'Acreedora' },
          { key: 'description', label: 'Descripción', align: 'left' }
        ]}
        data={accounts}
      />
    </div>
  );
}
