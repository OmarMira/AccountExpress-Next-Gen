// frontend/src/locales/es/common.ts
const common = {
  buttons: {
    guardar: 'Guardar',
    cancelar: 'Cancelar',
    eliminar: 'Eliminar',
    editar: 'Editar',
    nuevo: 'Nuevo',
    exportar: 'Exportar',
    importar: 'Importar',
    confirmar: 'Confirmar',
    volver: 'Volver',
    cerrar: 'Cerrar',
    agregar: 'Agregar',
    buscar: 'Buscar',
    limpiar: 'Limpiar',
    enviar: 'Enviar',
  },
  estados: {
    cargando: 'Cargando...',
    sinDatos: 'Sin datos para mostrar',
    error: 'Ocurrió un error',
    exito: 'Operación exitosa',
    activo: 'Activo',
    inactivo: 'Inactivo',
    pendiente: 'Pendiente',
    completado: 'Completado',
    procesando: 'Procesando...',
  },
  tabla: {
    acciones: 'Acciones',
    pagina: 'Página',
    de: 'de',
    filasPorPagina: 'Filas por página',
    sinResultados: 'Sin resultados',
  },
  errores: {
    requerido: 'Este campo es requerido',
    formato: 'Formato inválido',
    conexion: 'Error de conexión',
    noAutorizado: 'No autorizado',
    noEncontrado: 'No encontrado',
    servidorError: 'Error del servidor',
  },
  confirmaciones: {
    eliminar: '¿Estás seguro de que querés eliminar este registro?',
    cancelar: '¿Querés cancelar los cambios sin guardar?',
    accionIrreversible: 'Esta acción no se puede deshacer.',
  },
} as const;

export default common;
export type CommonTranslations = typeof common;
