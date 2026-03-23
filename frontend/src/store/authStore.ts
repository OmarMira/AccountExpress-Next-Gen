import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
}

export interface Company {
  id: string;
  legalName: string;
  ein?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
  fiscalYearStart?: string;
  currency?: string;
}

export interface AuthState {
  user: User | null;
  activeCompany: Company | null;
  permissions: Record<string, string[]>;
  availableCompanies: Company[];
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setActiveCompany: (company: Company | null) => void;
  setPermissions: (permissions: Record<string, string[]>) => void;
  setAvailableCompanies: (companies: Company[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(persist((set) => ({
  user: null,
  activeCompany: null,
  permissions: {},
  availableCompanies: [],
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setActiveCompany: (company) => set({ activeCompany: company }),
  setPermissions: (permissions) => set({ permissions }),
  setAvailableCompanies: (companies) => set({ availableCompanies: companies }),
  logout: () => set({ user: null, activeCompany: null, permissions: {}, availableCompanies: [], isAuthenticated: false }),
}), { name: 'auth-store' }));
