import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../lib/api';

export function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    legalName: '',
    tradeName: '',
    ein: '',
    currency: 'USD',
    fiscalYearStart: '01-01',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      // In a real scenario, we might need a specific endpoint to create and assign
      // but here we use the standard POST /companies assuming superadmin auth
      await fetchApi('/companies', {
        method: 'POST',
        body: JSON.stringify({
          legalName: formData.legalName,
          tradeName: formData.tradeName || undefined,
          ein: formData.ein || undefined,
          currency: formData.currency,
          fiscalYearStart: formData.fiscalYearStart,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          address: formData.address || undefined,
          city: formData.city || undefined,
          // country is not in the DB schema, so we skip it or could merge it into address
          // address: `${formData.address}${formData.city ? ', ' + formData.city : ''}${formData.country ? ', ' + formData.country : ''}`
        }),
      });

      // Redirect to dashboard (App.tsx will handle company selection if needed)
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Error al crear la empresa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-gray-800 rounded-2xl shadow-2xl border border-gray-700/50 p-8">
        
        {/* Header / Stepper UI */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Bienvenido a AccountExpress
          </h1>
          <p className="text-gray-400 mt-2">Configura tu primera empresa para comenzar.</p>
          
          <div className="flex items-center mt-8 space-x-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                  step === s ? 'bg-indigo-600 text-white' : 
                  step > s ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-500'
                }`}>
                  {step > s ? '✓' : s}
                </div>
                {s < 3 && <div className={`w-12 h-1 ${step > s ? 'bg-green-500' : 'bg-gray-700'} mx-2`} />}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Company Data */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-xl font-semibold border-l-4 border-indigo-500 pl-4">Paso 1: Datos de la Empresa</h2>
            
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1">Nombre Legal *</label>
                <input
                  type="text"
                  name="legalName"
                  value={formData.legalName}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ej: AccountExpress S.A."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Nombre Comercial</label>
                <input
                  type="text"
                  name="tradeName"
                  value={formData.tradeName}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ej: AE Biz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">ID Fiscal (EIN/RNC)</label>
                <input
                  type="text"
                  name="ein"
                  value={formData.ein}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Moneda Principal</label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="USD">USD - Dólar Estadounidense</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="DOP">DOP - Peso Dominicano</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Inicio de Año Fiscal</label>
                <select
                  name="fiscalYearStart"
                  value={formData.fiscalYearStart}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="01-01">01 de Enero</option>
                  <option value="04-01">01 de Abril</option>
                  <option value="07-01">01 de Julio</option>
                  <option value="10-01">01 de Octubre</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end mt-10">
              <button
                onClick={handleNext}
                disabled={!formData.legalName}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2 px-8 rounded-lg transition-all"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Contact Data */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-xl font-semibold border-l-4 border-indigo-500 pl-4">Paso 2: Datos de Contacto</h2>
            
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Teléfono</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-400 mb-1">Dirección Física</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Ciudad</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">País</label>
                <input
                  type="text"
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-between mt-10">
              <button
                onClick={handleBack}
                className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-8 rounded-lg transition-all"
              >
                Atrás
              </button>
              <button
                onClick={handleNext}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-8 rounded-lg transition-all"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-xl font-semibold border-l-4 border-indigo-500 pl-4">Paso 3: Confirmación</h2>
            
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-700 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <p className="text-sm text-gray-500">Empresa:</p>
                <p className="text-sm font-medium">{formData.legalName}</p>
                <p className="text-sm text-gray-500">Moneda:</p>
                <p className="text-sm font-medium">{formData.currency}</p>
                <p className="text-sm text-gray-500">Año Fiscal:</p>
                <p className="text-sm font-medium">Inicia el {formData.fiscalYearStart}</p>
                <p className="text-sm text-gray-500">Ubicación:</p>
                <p className="text-sm font-medium">
                  {[formData.city, formData.country].filter(Boolean).join(', ') || 'No especificada'}
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-400 italic">
              Al hacer clic en "Crear empresa", se inicializará tu entorno contable seguro bajo el estándar inmutable de AccountExpress.
            </p>

            <div className="flex justify-between mt-10">
              <button
                onClick={handleBack}
                disabled={loading}
                className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-bold py-2 px-8 rounded-lg transition-all"
              >
                Atrás
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-2 px-8 rounded-lg transition-all flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Procesando...
                  </>
                ) : 'Crear empresa'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
