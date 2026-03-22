// ============================================================
// ROLES SEED DATA
// 4 system roles — is_system=1, cannot be deleted.
// ============================================================

export interface RoleSeed {
  id: string;
  name: string;
  displayName: string;
  description: string;
  isSystem: number;
  isActive: number;
  createdAt: string;
}

const NOW = new Date().toISOString();

export const SYSTEM_ROLES_IDS = {
  superAdmin:    "role-super-admin-0000-000000000001",
  companyAdmin:  "role-company-admin-00-000000000002",
  accountant:    "role-accountant-0000-000000000003",
  auditor:       "role-auditor-000000-000000000004",
} as const;

export const ROLES_SEED: RoleSeed[] = [
  {
    id:          SYSTEM_ROLES_IDS.superAdmin,
    name:        "super_admin",
    displayName: "Super Administrador",
    description: "Control total de la instalación. Crea/archiva empresas, gestiona todos los usuarios.",
    isSystem: 1,
    isActive: 1,
    createdAt: NOW,
  },
  {
    id:          SYSTEM_ROLES_IDS.companyAdmin,
    name:        "company_admin",
    displayName: "Admin de Empresa",
    description: "Control total dentro de su(s) empresa(s). Abre/cierra periodos fiscales.",
    isSystem: 1,
    isActive: 1,
    createdAt: NOW,
  },
  {
    id:          SYSTEM_ROLES_IDS.accountant,
    name:        "accountant",
    displayName: "Contador / CPA",
    description: "Opera todos los módulos contables. Genera reportes para CPA.",
    isSystem: 1,
    isActive: 1,
    createdAt: NOW,
  },
  {
    id:          SYSTEM_ROLES_IDS.auditor,
    name:        "auditor",
    displayName: "Auditor (Solo lectura)",
    description: "Acceso de solo lectura. Puede exportar. No puede crear ni modificar.",
    isSystem: 1,
    isActive: 1,
    createdAt: NOW,
  },
];
