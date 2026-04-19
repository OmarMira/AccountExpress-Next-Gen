import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthLayout } from './components/AuthLayout';
import { Login } from './pages/Login';
import { SelectCompany } from './pages/SelectCompany';
import { AppShell } from './components/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { Journal } from './pages/Journal';
import BankReconciliation from './pages/BankReconciliation';
import { Reports } from './pages/Reports';
import { CpaExport } from './pages/CpaExport';
import { Settings } from './pages/Settings';
import { Banks } from './pages/Banks';
import { BankRules } from './pages/BankRules';
import { Users } from './pages/Users';
import { Onboarding } from './pages/Onboarding';
import { SuperAdminGuard } from './components/SuperAdminGuard';
import { Companies } from './pages/admin/Companies';
import { CompanyDetail } from './pages/admin/CompanyDetail';
import { AdminUsers } from './pages/admin/Users';
import { AuditLogs } from './pages/admin/AuditLogs';
import { AdminShell } from './components/admin/AdminShell';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Unauthenticated Routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
        </Route>
        
        {/* Semi-authenticated Routes (Needs Company Selection) */}
        <Route path="/select-company" element={
          <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
              <div className="bg-gray-800 py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-gray-700/50">
                <SelectCompany />
              </div>
            </div>
          </div>
        } />
        
        <Route path="/onboarding" element={<Onboarding />} />

        {/* Fully Authenticated Routes */}
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/banks" element={<Banks />} />
          <Route path="/reconciliation" element={<BankReconciliation />} />
          <Route path="/bank-rules" element={<BankRules />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/export" element={<CpaExport />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/users" element={<Users />} />
        </Route>

        {/* Super Admin Routes */}
        <Route element={<SuperAdminGuard />}>
          <Route element={<AdminShell />}>
            <Route path="/admin/companies" element={<Companies />} />
            <Route path="/admin/companies/:id" element={<CompanyDetail />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/logs" element={<AuditLogs />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
