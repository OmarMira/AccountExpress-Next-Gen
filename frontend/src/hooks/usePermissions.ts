import { useAuthStore } from '../store/authStore';

export function usePermissions() {
  const permissions = useAuthStore((state) => state.permissions);
  const user = useAuthStore((state) => state.user);

  const hasPermission = (moduleName: string, actionName: string): boolean => {
    // Super admins bypass all permission checks natively
    if (user?.isSuperAdmin) return true;
    
    // Explicitly scan mapped arrays resolving strictly authorized actions
    const modulePerms = permissions[moduleName] || [];
    return modulePerms.includes(actionName);
  };

  return { hasPermission };
}
