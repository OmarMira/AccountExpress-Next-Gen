import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, type Company } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { Building2, ChevronRight, LogOut } from 'lucide-react';

export function SelectCompany() {
  const user = useAuthStore((state) => state.user);
  const companies = useAuthStore((state) => state.availableCompanies);
  const setActiveCompany = useAuthStore((state) => state.setActiveCompany);
  const setPermissions = useAuthStore((state) => state.setPermissions);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleSelect = async (company: Company) => {
    setLoadingId(company.id);
    setError('');
    try {
      const resp = await fetchApi('/auth/select-company', {
        method: 'POST',
        body: JSON.stringify({ companyId: company.id })
      });
      setActiveCompany(company);
      setPermissions(resp.permissions ?? {});
      navigate('/', { replace: true });
    } catch (e: any) {
      setError(e.message);
      setLoadingId(null);
    }
  };

  const handleLogout = async () => {
    await fetchApi('/auth/logout', { method: 'POST' }).catch(() => {});
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h3 className="text-xl font-bold text-white">Bienvenido, {user?.firstName}</h3>
        <p className="text-sm text-gray-400 mt-1">Selecciona una empresa para continuar</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-500 font-medium">{error}</p>
        </div>
      )}

      {companies.length === 0 ? (
        <div className="text-center py-10 bg-gray-800/30 rounded-2xl border border-gray-700/50 shadow-inner">
          <h2 className="text-lg font-bold text-white mb-2">No tienes empresas asignadas</h2>
          <p className="text-sm text-gray-400 mb-6">Contacta al administrador del sistema</p>
          {user?.isSuperAdmin && (
            <button 
              onClick={() => navigate('/setup')}
              className="inline-flex items-center justify-center py-2 px-5 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-900"
            >
              Crear primera empresa
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => (
            <button
              key={company.id}
              onClick={() => handleSelect(company)}
              disabled={!!loadingId}
              className={`w-full text-left group flex items-center justify-between p-4 rounded-xl border transition-all ${
                loadingId === company.id 
                  ? 'bg-indigo-900/50 border-indigo-500 cursor-wait' 
                  : 'bg-gray-800 border-gray-700 hover:border-indigo-500 hover:bg-gray-700/50 disabled:opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${loadingId === company.id ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-300 group-hover:bg-indigo-500 group-hover:text-white transition-colors'}`}>
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-white">{company.legalName}</h4>
                  <p className="text-xs text-gray-400">Company ID: {company.id.split('-')[0]}...</p>
                </div>
              </div>
              <ChevronRight className={`w-5 h-5 text-gray-500 group-hover:text-white transition-colors ${loadingId === company.id ? 'animate-pulse text-indigo-400' : ''}`} />
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-300 bg-transparent hover:bg-gray-700 focus:outline-none transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
