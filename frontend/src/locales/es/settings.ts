// frontend/src/locales/es/settings.ts
const settings = {
  titulo: 'Configuración',
  secciones: {
    empresa: 'Datos de la Empresa',
    periodoFiscal: 'Período Fiscal',
    seguridad: 'Seguridad',
    integraciones: 'Integraciones',
    impuestos: 'Tasas de Impuestos',
  },
  empresa: {
    nombre: 'Nombre legal',
    rut: 'RUT / EIN',
    direccion: 'Dirección',
    email: 'Email de contacto',
    telefono: 'Teléfono',
  },
  usuarios: {
    titulo: 'Usuarios y Roles',
    subtitulo: 'Gestión de usuarios del sistema',
    columnas: {
      nombre: 'Nombre',
      email: 'Email',
      rol: 'Rol',
      estado: 'Estado',
      ultimoAcceso: 'Último acceso',
      acciones: 'Acciones',
    },
    roles: {
      superAdmin: 'Super Admin',
      admin: 'Administrador',
      contador: 'Contador',
      visor: 'Visor',
    },
    modal: {
      nuevoUsuario: 'Nuevo Usuario',
      editarUsuario: 'Editar Usuario',
      nombre: 'Nombre',
      apellido: 'Apellido',
      email: 'Email',
      rol: 'Rol',
      contrasena: 'Contraseña temporal',
    },
    mensajes: {
      creadoExito: 'Usuario creado exitosamente',
      actualizadoExito: 'Usuario actualizado exitosamente',
      desactivadoExito: 'Usuario desactivado',
      activadoExito: 'Usuario activado',
    },
  },
  periodoFiscal: {
    activo: 'Período activo',
    iniciar: 'Iniciar nuevo período',
    cerrar: 'Cerrar período',
    advertencia: 'Cerrar un período es irreversible',
  },
  mensajes: {
    guardadoExito: 'Configuración guardada exitosamente',
    errorGuardar: 'Error al guardar la configuración',
  },
} as const;

export default settings;
export type SettingsTranslations = typeof settings;
