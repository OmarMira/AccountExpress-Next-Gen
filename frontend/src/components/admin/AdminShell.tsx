import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Building2, Users, Shield, ChevronLeft, LogOut } from 'lucide-react';

const navItems = [
  { name: 'Empresas', path: '/admin/companies', icon: Building2 },
  { name: 'Usuarios', path: '/admin/users', icon: Users },
  { name: 'Bitácora', path: '/admin/logs', icon: Shield },
];

export function AdminShell() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-[#0d1b2e] text-gray-100 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-[#0a1628] border-r border-white/5 flex flex-col h-screen">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="text-white font-bold text-sm">AE</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-sm text-white tracking-tight">Account Express</span>
              <span className="text-xs text-indigo-400 font-medium">Panel Admin</span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col justify-start px-3 py-4 space-y-1">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-500/10 text-indigo-400'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer actions */}
        <div className="border-t border-white/5 pt-4 pb-4 px-3 space-y-1 flex-shrink-0">
          <button
            onClick={() => navigate('/select-company')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Volver al sistema</span>
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

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-[#0a1628]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-8 shrink-0 z-10 sticky top-0">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Panel de Administración</span>
            <span className="text-sm font-bold text-white">Super Admin</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-indigo-500/20">
              {user?.firstName?.charAt(0) || user?.username?.charAt(0) || 'A'}
            </div>
            <div className="flex flex-col hidden sm:flex">
              <span className="text-sm font-semibold text-white">{user?.firstName} {user?.lastName}</span>
              <span className="text-xs text-indigo-400">Super Administrador</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-[#0d1b2e]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
