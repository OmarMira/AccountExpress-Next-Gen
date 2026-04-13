import { useEffect, useState } from 'react';
import { fetchApi } from '../../lib/api';

export interface CompanyData {
  id?: string;
  legalName: string;
  tradeName?: string;
  ein?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
  fiscalYearStart?: string;
  currency?: string;
  isActive?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  company?: CompanyData | null;
  onSuccess: () => void;
}

export function CompanyFormModal({ isOpen, onClose, company, onSuccess }: Props) {
  const isEditing = !!company;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CompanyData>({
    legalName: '',
    tradeName: '',
    ein: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    email: '',
    fiscalYearStart: '01-01',
    currency: 'USD',
  });

  useEffect(() => {
    if (isOpen) {
      if (company) {
        setFormData({
          legalName: company.legalName || '',
          tradeName: company.tradeName || '',
          ein: company.ein || '',
          address: company.address || '',
          city: company.city || '',
          state: company.state || '',
          zipCode: company.zipCode || '',
          phone: company.phone || '',
          email: company.email || '',
          fiscalYearStart: company.fiscalYearStart || '01-01',
          currency: company.currency || 'USD',
        });
      } else {
        setFormData({
          legalName: '',
          tradeName: '',
          ein: '',
          address: '',
          city: '',
          state: '',
          zipCode: '',
          phone: '',
          email: '',
          fiscalYearStart: '01-01',
          currency: 'USD',
        });
      }
      setError(null);
    }
  }, [isOpen, company]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
        legalName: formData.legalName,
        tradeName: formData.tradeName || undefined,
        ein: formData.ein || undefined,
        address: formData.address || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        zipCode: formData.zipCode || undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        fiscalYearStart: formData.fiscalYearStart || '01-01',
        currency: formData.currency || 'USD',
    };

    try {
      if (isEditing && company?.id) {
        await fetchApi(`/companies/${company.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi('/companies', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-gray-900 border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-8 py-5">
          <h2 className="text-xl font-bold text-white tracking-tight">
            {isEditing ? 'Editar Empresa' : 'Crear Nueva Empresa'}
          </h2>
          <button onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-8 py-8 custom-scrollbar">
          {error && (
            <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
              <p className="flex items-center gap-2 font-medium">
                <span className="h-2 w-2 rounded-full bg-red-500"></span>
                Error: {error}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-full space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Nombre Legal de la Empresa <span className="text-red-500">*</span></label>
                <input
                  required
                  name="legalName"
                  value={formData.legalName}
                  onChange={handleChange}
                  placeholder="Ej: AccountExpress S.A."
                  className="block w-full rounded-lg border border-gray-700 bg-gray-800/50 text-white px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Nombre Comercial</label>
                <input
                  name="tradeName"
                  value={formData.tradeName}
                  onChange={handleChange}
                  placeholder="Ej: AccountExpress"
                  className="block w-full rounded-lg border border-gray-700 bg-gray-800/50 text-white px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Identificación Fiscal (EIN/RUC)</label>
                <input
                  name="ein"
                  value={formData.ein}
                  onChange={handleChange}
                  placeholder="99-9999999"
                  className="block w-full rounded-lg border border-gray-700 bg-gray-800/50 text-white px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="col-span-full space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Dirección Física</label>
                <input
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Calle Principal #123"
                  className="block w-full rounded-lg border border-gray-700 bg-gray-800/50 text-white px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Ciudad</label>
                <input
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-gray-700 bg-gray-800/50 text-white px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">País / Estado</label>
                <input
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-gray-700 bg-gray-800/50 text-white px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Email de Contacto</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="admin@empresa.com"
                  className="block w-full rounded-lg border border-gray-700 bg-gray-800/50 text-white px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Teléfono</label>
                <input
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="block w-full rounded-lg border border-gray-700 bg-gray-800/50 text-white px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Inicio de Año Fiscal <span className="text-red-500">*</span></label>
                <input
                  required
                  name="fiscalYearStart"
                  value={formData.fiscalYearStart}
                  onChange={handleChange}
                  placeholder="01-01"
                  className="block w-full rounded-lg border border-gray-700 bg-gray-800/50 text-white px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Moneda Base <span className="text-red-500">*</span></label>
                <input
                  required
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  placeholder="USD"
                  className="block w-full rounded-lg border border-gray-700 bg-gray-800/50 text-white px-4 py-2.5 text-sm placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-white/5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-700 bg-transparent py-2.5 px-6 text-sm font-semibold text-gray-300 hover:bg-white/5 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center rounded-lg bg-indigo-600 py-2.5 px-8 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 hover:shadow-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:shadow-none transition-all"
              >
                {loading ? 'Guardando...' : 'Guardar Empresa'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
