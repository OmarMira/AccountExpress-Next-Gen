// frontend/src/locales/es/auth.ts
const auth = {
  login: {
    titulo: 'Iniciar Sesión',
    subtitulo: 'Ingresá tus credenciales para continuar',
    email: 'Correo electrónico',
    password: 'Contraseña',
    boton: 'Iniciar Sesión',
    cargando: 'Iniciando sesión...',
    errorCredenciales: 'Credenciales incorrectas',
    errorConexion: 'Error al conectar con el servidor',
  },
  sesion: {
    cerrarSesion: 'Cerrar sesión',
    sesionExpirada: 'Tu sesión ha expirado',
    redirigiendo: 'Redirigiendo al login...',
  },
  empresa: {
    seleccionar: 'Seleccionar empresa',
    activa: 'Empresa activa',
    cambiar: 'Cambiar',
    sinEmpresas: 'No tenés empresas asignadas',
  },
  permisos: {
    sinAcceso: 'No tenés permiso para acceder a esta sección',
    requiereRol: 'Se requiere el rol',
    accesoRestringido: 'Acceso restringido',
  },
} as const;

export default auth;
export type AuthTranslations = typeof auth;
