import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { fetchApi } from '../lib/api';
import { PermissionGate } from './PermissionGate';
import { 
  Building2, 
  LayoutDashboard, 
  BookOpen, 
  Receipt, 
  FileText, 
  Download,
  LogOut,
  Settings,
  ShieldCheck
} from 'lucide-react';

export function AppShell() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!activeCompany) {
    return <Navigate to="/select-company" replace />;
  }

  const handleLogout = async () => {
    await fetchApi('/auth/logout', { method: 'POST' }).catch(() => {});
    logout();
  };

  const navItems = [
    { name: 'Resumen General', path: '/', icon: LayoutDashboard },
    { name: 'Plan de Cuentas', path: '/accounts', icon: BookOpen, module: 'accounts', action: 'read' },
    { name: 'Diario Contable', path: '/journal', icon: Receipt, module: 'journal', action: 'read' },
    { name: 'Conciliación Bancaria', path: '/reconciliation', icon: Building2, module: 'banking', action: 'read' },
    { name: 'Reportes', path: '/reports', icon: FileText, module: 'reports', action: 'read' },
    { name: 'Exportar para CPA', path: '/export', icon: Download, module: 'reports', action: 'read' },
  ];

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-10">
        <div className="h-16 flex items-center px-6 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-bold text-sm">AE</span>
            </div>
            <span className="font-bold text-lg text-white tracking-tight">Account Express</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const link = (
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-indigo-500/10 text-indigo-400'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {item.name}
                </Link>
              );

              if (item.module && item.action) {
                return (
                  <li key={item.path}>
                    <PermissionGate module={item.module} action={item.action}>
                      {link}
                    </PermissionGate>
                  </li>
                );
              }

              return <li key={item.path}>{link}</li>;
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-800 space-y-2">
          {user?.isSuperAdmin && (
             <Link to="/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
               <Settings className="w-5 h-5" /> Configuración
             </Link>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-gray-900/50 backdrop-blur-md border-b border-gray-800 flex items-center justify-between px-8 shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Empresa Activa</span>
              <span className="text-sm font-bold text-white flex items-center gap-3">
                {activeCompany.legalName}
                <Link to="/select-company" className="text-xs text-indigo-400 font-medium px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all">
                  Cambiar
                </Link>
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold shadow-[0_0_10px_rgba(16,185,129,0.1)]">
              <ShieldCheck className="w-4 h-4" />
              Cifrado AES
            </div>

            <div className="flex items-center gap-3 pl-5 border-l border-gray-800">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-indigo-500/20">
                {user?.firstName?.charAt(0) || user?.username?.charAt(0) || 'U'}
              </div>
              <div className="flex flex-col hidden sm:flex">
                <span className="text-sm font-semibold text-white">{user?.firstName} {user?.lastName}</span>
                <span className="text-xs text-gray-400">{user?.isSuperAdmin ? 'Super Administrador' : 'Contador'}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-[#0a0a0f] p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
