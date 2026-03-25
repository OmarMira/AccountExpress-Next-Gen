// frontend/src/locales/es/ai.ts
const ai = {
  panel: {
    titulo: 'Asistente Contable',
    placeholder: 'Preguntá algo... (Enter para enviar)',
    placeholderOffline: 'Ollama offline',
    turnoNuevaLinea: 'Shift+Enter para nueva línea',
    mistralActivo: 'Mistral activo',
    ollamaOffline: 'Ollama offline',
  },
  comandosRapidos: {
    titulo: 'Comandos rápidos:',
    analizarRiesgos: 'Analizar riesgos',
    verificarBalance: 'Verificar balance',
    resumenFinanciero: 'Resumen financiero',
    transaccionesPendientes: 'Transacciones pendientes',
  },
  instalacion: {
    ollamaNoInstalado: 'Ollama no está instalado',
    descripcion: 'Para usar el asistente IA necesitás instalar Ollama en tu computadora.',
    descargar: 'Descargar Ollama',
    descargando: 'Descargando Ollama...',
    descargaIniciada: 'Descarga iniciada',
    revisarDownloads: 'Revisá tu carpeta de Downloads.',
    descargarDeNuevo: 'Descargar de nuevo',
    comandoLinux: 'Ejecutá en tu terminal:',
    noGmailVentana: 'No cierres esta ventana...',
  },
  modeloPull: {
    descargandoMistral: 'Descargando Mistral...',
    descripcion: 'Descargando el modelo de IA (~4 GB). Esto puede tardar varios minutos según tu conexión.',
    errorDescarga: 'Error descargando modelo',
    reintentar: 'Reintentar',
    postInstalacion: 'Una vez instalado ejecutá:',
    modeloNoDescargado: 'Modelo no descargado',
  },
  errores: {
    sinConexion: 'Error connecting to AI. Make sure Ollama is running.',
    iaNoDisponible: 'Servicio de IA no disponible',
  },
} as const;

export default ai;
export type AiTranslations = typeof ai;
