// frontend/src/locales/es/reports.ts
const reports = {
  titulo: 'Reportes',
  tipos: {
    balanceGeneral: 'Balance General',
    estadoResultados: 'Estado de Resultados',
    flujoCaja: 'Flujo de Caja',
    libroMayor: 'Libro Mayor',
    balanceComprobacion: 'Balance de Comprobación',
  },
  filtros: {
    periodo: 'Período',
    desde: 'Desde',
    hasta: 'Hasta',
    cuenta: 'Cuenta',
    empresa: 'Empresa',
    aplicar: 'Aplicar filtros',
  },
  cpaExport: {
    titulo: 'Exportar para CPA',
    subtitulo: 'Preparar documentación para el contador',
    descripcion: 'Exportá todos los datos contables del período seleccionado en formato estándar para tu contador o auditor.',
    descargarPdf: 'Descargar PDF',
    descargarCsv: 'Descargar CSV',
    incluyeAsientos: 'Incluye asientos contables',
    incluyeEstado: 'Incluye estado de resultados',
    incluyeBalance: 'Incluye balance general',
    advertencia: 'Revisá la información antes de enviar a tu CPA',
  },
  mensajes: {
    generando: 'Generando reporte...',
    descargando: 'Descargando...',
    exito: 'Reporte generado exitosamente',
    sinDatos: 'No hay datos para el período seleccionado',
    error: 'Error al generar el reporte',
  },
} as const;

export default reports;
export type ReportsTranslations = typeof reports;
