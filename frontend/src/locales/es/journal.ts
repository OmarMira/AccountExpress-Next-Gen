// frontend/src/locales/es/journal.ts
const journal = {
  titulo: 'Diario Contable',
  subtitulo: 'Asientos de',
  columnas: {
    fecha: 'Fecha',
    numero: 'N°',
    descripcion: 'Descripción',
    referencia: 'Referencia',
    debito: 'Débito',
    credito: 'Crédito',
    estado: 'Estado',
    acciones: 'Acciones',
  },
  estados: {
    borrador: 'Borrador',
    publicado: 'Publicado',
    anulado: 'Anulado',
  },
  modal: {
    nuevoAsiento: 'Nuevo Asiento',
    editarAsiento: 'Editar Asiento',
    agregarLinea: 'Agregar línea',
    cuenta: 'Cuenta',
    descripcionLinea: 'Descripción de la línea',
    debito: 'Débito',
    credito: 'Crédito',
  },
  validacion: {
    debeBalancear: 'El asiento debe balancear (Débito = Crédito)',
    minimoLineas: 'Se requieren al menos 2 líneas',
    montoPositivo: 'El monto debe ser positivo',
  },
  mensajes: {
    creadoExito: 'Asiento creado exitosamente',
    publicadoExito: 'Asiento publicado exitosamente',
    anuladoExito: 'Asiento anulado exitosamente',
    errorBalance: 'El asiento no balancea',
  },
} as const;

export default journal;
export type JournalTranslations = typeof journal;
