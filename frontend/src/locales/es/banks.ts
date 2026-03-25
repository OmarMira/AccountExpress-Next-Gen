// frontend/src/locales/es/banks.ts
const banks = {
  titulo: 'Cuentas Bancarias',
  reconciliacion: {
    titulo: 'Conciliación Bancaria',
    subtitulo: 'Conciliar transacciones de',
    transaccionPendiente: 'Transacción pendiente',
    asignarCuenta: 'Asignar cuenta contable',
    conciliar: 'Conciliar',
    importar: 'Importar extracto',
  },
  columnas: {
    fecha: 'Fecha',
    descripcion: 'Descripción',
    monto: 'Monto',
    tipo: 'Tipo',
    estado: 'Estado',
    cuenta: 'Cuenta',
    acciones: 'Acciones',
  },
  estados: {
    pendiente: 'Pendiente',
    conciliado: 'Conciliado',
    ignorado: 'Ignorado',
  },
  tipos: {
    deposito: 'Depósito',
    retiro: 'Retiro',
    transferencia: 'Transferencia',
  },
  importar: {
    titulo: 'Importar Extracto Bancario',
    seleccionarArchivo: 'Seleccionar archivo PDF o CSV',
    arrastrarAqui: 'Arrastrá el archivo aquí',
    formatosSoportados: 'Formatos soportados: PDF, CSV',
    procesando: 'Procesando extracto...',
    exito: 'Extracto importado exitosamente',
    errorFormato: 'Formato de archivo no soportado',
  },
  mensajes: {
    conciliadoExito: 'Transacción conciliada exitosamente',
    importadoExito: 'Extracto importado exitosamente',
    errorImport: 'Error al importar el extracto',
  },
} as const;

export default banks;
export type BanksTranslations = typeof banks;
