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


  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`ELIMINAR EMPRESA PERMANENTEMENTE: ${name}?`)) {
      return;
    }

    try {
      await fetchApi(`/companies/${id}`, { method: 'DELETE' });
      alert('Empresa eliminada correctamente');
      loadCompanies();
    } catch (err: any) {
      alert(`Error al eliminar: ${err.message}`);
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
                              setEditingCompany(company);
                              setIsModalOpen(true);
                            }}
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button 
                            className="text-gray-400 hover:text-red-400" 
                            title="Eliminar"
                            onClick={() => handleDelete(company.id, company.legalName)}
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
    </div>
  );
}
