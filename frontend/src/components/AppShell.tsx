import { Outlet, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

import { PermissionGate } from './PermissionGate';
import { 
  LayoutDashboard, 
  BookOpen, 
  Receipt, 
  FileText, 
  Download,
  LogOut,
  Settings,
  ShieldCheck,
  Landmark,
  ArrowLeftRight,
  Users
} from 'lucide-react';

export function AppShell() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const activeCompany = useAuthStore((state) => state.activeCompany);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!activeCompany) {
    return <Navigate to="/select-company" replace />;
  }


  const navItems = [
    { name: 'Resumen General', path: '/', icon: LayoutDashboard },
    { name: 'Plan de Cuentas', path: '/accounts', icon: BookOpen, module: 'accounts', action: 'read' },
    { name: 'Diario Contable', path: '/journal', icon: Receipt, module: 'journal', action: 'read' },
    { name: 'Cuentas Bancarias', path: '/banks', icon: Landmark, module: 'banking', action: 'read' },
    { name: 'Conciliación Bancaria', path: '/reconciliation', icon: ArrowLeftRight, module: 'banking', action: 'read' },
    { name: 'Reportes', path: '/reports', icon: FileText, module: 'reports', action: 'read' },
    { name: 'Exportar para CPA', path: '/export', icon: Download, module: 'reports', action: 'read' },
    { name: 'Usuarios y Roles', path: '/users', icon: Users, module: 'users', action: 'read' },
  ];

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen">
        <div className="h-16 flex items-center px-6 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-bold text-sm">AE</span>
            </div>
            <span className="font-bold text-lg text-white tracking-tight">Account Express</span>
          </div>
        </div>

        <nav className="flex-1 flex flex-col justify-start px-3 py-4 space-y-1">
          <ul className="space-y-1">
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

        <div className="border-t border-slate-800 pt-4 pb-4 px-3 space-y-1 flex-shrink-0">
          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm"
          >
            <Settings className="w-4 h-4" />
            <span>Configuración</span>
          </button>

          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar sesión</span>
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
