// frontend/src/locales/es/accounts.ts
const accounts = {
  titulo: 'Plan de Cuentas',
  subtitulo: 'Estructura contable de',
  columnas: {
    codigo: 'Código',
    nombre: 'Nombre',
    tipo: 'Tipo',
    naturaleza: 'Naturaleza',
    nivel: 'Nivel',
    padre: 'Cuenta Padre',
    activa: 'Activa',
    acciones: 'Acciones',
  },
  tipos: {
    activo: 'Activo',
    pasivo: 'Pasivo',
    patrimonio: 'Patrimonio',
    ingreso: 'Ingreso',
    gasto: 'Gasto',
  },
  naturaleza: {
    deudora: 'Deudora',
    acreedora: 'Acreedora',
  },
  modal: {
    nueva: 'Nueva Cuenta',
    editar: 'Editar Cuenta',
    codigoPlaceholder: 'Ej: 1001',
    nombrePlaceholder: 'Nombre de la cuenta',
  },
  mensajes: {
    creadaExito: 'Cuenta creada exitosamente',
    actualizadaExito: 'Cuenta actualizada exitosamente',
    eliminadaExito: 'Cuenta eliminada exitosamente',
    errorCodigo: 'El código ya existe',
  },
} as const;

export default accounts;
export type AccountsTranslations = typeof accounts;
