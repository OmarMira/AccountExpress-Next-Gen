import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../../lib/api';
import { Edit, Trash2, Users } from 'lucide-react';
import { CompanyFormModal, type CompanyData } from '../../components/admin/CompanyFormModal';

interface Company {
  id: string;
  legalName: string;
  tradeName?: string | null;
  ein: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  email?: string | null;
  fiscalYearStart?: string;
  currency?: string;
  isActive: boolean;
  createdAt: string;
}

export function Companies() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyData | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<{id: string, name: string} | null>(null);
  const [notification, setNotification] = useState<{title: string, message: string, type: 'error' | 'success'} | null>(null);

  const loadCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchApi('/companies');
      setCompanies(data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar empresas');
    } finally {
      setLoading(false);
    }
  }, []);

  const executeDelete = async () => {
    if (!deleteDialog) return;
    try {
      await fetchApi(`/companies/${deleteDialog.id}`, { method: 'DELETE' });
      setNotification({ title: 'Operación Exitosa', message: 'Empresa eliminada correctamente.', type: 'success' });
      loadCompanies();
    } catch (err: any) {
      setNotification({ title: 'No se Pudo Eliminar', message: err.message, type: 'error' });
    } finally {
      setDeleteDialog(null);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  if (loading) return <div className="p-6 text-gray-400">Cargando empresas...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-xl font-semibold text-white">Empresas</h1>
          <p className="mt-2 text-sm text-gray-400">
            Lista global de empresas en el sistema. Módulo exclusivo de Super Admin.
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <button
            type="button"
            onClick={() => {
              setEditingCompany(null);
              setIsModalOpen(true);
            }}
            className="block rounded-md bg-indigo-500 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            Crear Empresa
          </button>
        </div>
      </div>
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-800">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Nombre Legal</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">EIN</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Estado</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Fecha de Creación</th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700 bg-gray-900">
                  {companies.map((company) => (
                    <tr key={company.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">
                        {company.legalName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{company.ein || '-'}</td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${company.isActive ? 'bg-green-400/10 text-green-400 ring-green-400/20' : 'bg-red-400/10 text-red-400 ring-red-400/20'}`}>
                          {company.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">
                        {new Date(company.createdAt).toLocaleDateString()}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <div className="flex justify-end gap-2">
                          <button 
                            className="text-gray-400 hover:text-white" 
                            title="Editar"
                            onClick={() => {
                              setEditingCompany(company as any);
                              setIsModalOpen(true);
                            }}
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button 
                            className="text-gray-400 hover:text-red-400" 
                            title="Eliminar"
                            onClick={() => setDeleteDialog({id: company.id, name: company.legalName})}
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                          <button 
                            className="text-gray-400 hover:text-indigo-400" 
                            title="Ver Usuarios"
                            onClick={() => navigate(`/admin/companies/${company.id}`)}
                          >
                            <Users className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {companies.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-sm text-gray-400">No hay empresas registradas</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <CompanyFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        company={editingCompany}
        onSuccess={loadCompanies}
      />

      {/* Delete Confirmation Modal */}
      {deleteDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-0 backdrop-blur-sm">
          <div className="relative w-full max-w-md transform rounded-xl bg-slate-800 p-6 text-left shadow-2xl transition-all border border-slate-700">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-red-500/10 rounded-full">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white">Advertencia: Eliminar Empresa</h3>
            </div>
            <p className="text-sm text-slate-300 mb-6">
              ¿Estás seguro de que deseas eliminar permanentemente la empresa <span className="font-bold text-white">{deleteDialog.name}</span>? Esta acción purgará todo el catálogo si es seguro hacerlo, pero no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteDialog(null)}
                className="px-4 py-2 border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={executeDelete}
                className="px-4 py-2 bg-red-600 rounded-lg text-white font-medium hover:bg-red-500 shadow-lg shadow-red-900/20 transition"
              >
                Sí, Eliminar Empresa
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
