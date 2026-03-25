// frontend/src/locales/es/dashboard.ts
const dashboard = {
  titulo: 'Resumen General',
  subtitulo: 'Métricas de',
  tarjetas: {
    saldoBancario: 'Saldo Bancario Total',
    transaccionesConciliadas: 'Transacciones conciliadas',
    transaccionesPendientes: 'Transacciones Pendientes',
    categorizarAhora: 'Categorizar ahora',
    flujoCaja: 'Flujo de Caja Mensual',
    ingresos: 'INGRESOS',
    gastos: 'GASTOS',
    periodoActivo: 'Periodo Activo',
    vence: 'Vence',
  },
  auditoria: {
    cadenaVerificada: 'Cadena de Auditoría Verificada',
    criptograficamenteIntegra: 'Criptográficamente Íntegra',
    cadenaRota: 'Cadena Rota',
    tamperingDetectado: 'Manipulación Detectada',
  },
} as const;

export default dashboard;
export type DashboardTranslations = typeof dashboard;
