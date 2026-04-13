import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function SuperAdminGuard() {
  const user = useAuthStore((state) => state.user);

  if (!user?.isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
