import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function AuthLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const activeCompany = useAuthStore((state) => state.activeCompany);

  // If already authenticated and has a company, redirect to dashboard
  if (isAuthenticated && activeCompany) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-[#0d1b2e] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-[#0071c5] rounded-xl flex items-center justify-center shadow-lg shadow-[#0071c5]/30">
            <span className="text-white font-bold text-2xl">AE</span>
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight">
          Account Express
        </h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          Professional Multitenant Bookkeeping
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#112d4e] py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-[#0071c5]/40 shadow-[0_0_40px_rgba(0,113,197,0.15)]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
