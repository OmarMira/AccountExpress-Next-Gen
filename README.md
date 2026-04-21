# AccountExpress — Core Contable Next-Gen

Sistema de contabilidad de doble entrada y conciliación bancaria diseñado para pequeñas y medianas empresas. Construido con un enfoque estricto en la **integridad financiera, seguridad y estabilidad técnica**: cada asiento de diario genera una cadena de auditoría criptográfica, las transacciones usan bloqueos a nivel de fila (row-level locking) para evitar condiciones de carrera, y la arquitectura sigue un modelo "Fail-Fast".

## Progreso y Bitácora del Sistema (Changelog)

A lo largo del desarrollo, el sistema se ha refactorizado y asegurado sustancialmente. Esta bitácora resume la arquitectura actual y los hitos alcanzados:

- **Panel de Diagnóstico de Salud Integral:** Implementación de un tablero proactivo que permite verificar en tiempo real el estado de las sesiones, la integridad de los logs de auditoría y la salud de los respaldos automáticos, permitiendo reparaciones atómicas con un solo clic.
- **Motor de Reglas Bancarias Inteligente:** Sistema de clasificación automática basado en prioridades (0-20), condiciones de coincidencia lógica y asignación automática del Libro Mayor (GL).
- **Selector de Cuentas Premium:** Integración del componente `AccountSelector` con búsqueda avanzada y badges visuales para identificar rápidamente el Balance Normal (Débito/Crédito) y el Tipo de Cuenta (Activo, Pasivo, etc.).
- **Estabilización Técnica Total:** Resolución del 100% de errores de TypeScript (`bun run typecheck`) y endurecimiento de la cadena de auditoría mediante sincronización de caché en memoria para registros inmutables.
- **Gestión Centralizada de Empresas:** Panel multi-tenant que permite a los Super Usuarios gestionar espacios de trabajo independientes con un solo clic.
- **Seguridad de Respaldos:** Sistema automatizado de backups para PostgreSQL 17 con validación de rutas y entorno.
- **Plan de Cuentas Standard:** Estructura US GAAP estricta con esquemas en minúsculas y siembra automática jerárquica.

## Módulos del Sistema

- **Diagnóstico y Salud** — Tablero administrativo para detectar y reparar inconsistencias de datos, sesiones expiradas y brechas en la cadena de auditoría.
- **Gestión de Empresas (Multi-Tenant)** — Control total sobre entidades jurídicas, logos, datos legales y cambio de contexto operativo.
- **Motor de Reglas Bancarias** — Automatización del flujo de caja mediante reglas con prioridad configurable (Crítica a Muy Baja).
- **Plan de Cuentas (GL)** — Catálogo contable jerárquico con validación estricta y badges dinámicos de estado.
- **Libro Diario y Transacciones** — Asientos de doble entrada atómicos, validación matemática de balance (`debit == credit`) y prevención de concurrencias.
- **Auditoría e Integridad** — Registro inmutable de acciones (Audit Log) y verificación cruzada HMAC SHA-256 para la integridad del Journal.
- **Conciliación Bancaria** — Importación y conciliación de extractos bancarios contra el libro mayor mediante el motor de reglas y smart-match.
- **Períodos Fiscales** — Control de cierres y bloqueos definitivos para evitar modificaciones en ejercicios contables finalizados.

## Stack Tecnológico y Arquitectura


### Backend (API REST)


- **Runtime:** Bun v1.2+
- **Framework:** Elysia.js (Tipado estricto end-to-end con 0 errores reportados)
- **ORM:** Drizzle ORM
- **Base de Datos:** PostgreSQL 17
- **Seguridad:** 
  - Validaciones Fail-Fast con Zod y tipado seguro `companyId`.
  - Firma HMAC SHA-256 inmutable para el Journal y Logs de Auditoría.
  - Autenticación mediante sesiones stateful HTTP-only endurecidas.

### Frontend (SPA)


- **Framework:** React 18 con TypeScript
- **Bundler:** Vite
- **Estado Global:** Zustand (Persistencia de sesión y contexto de empresa)
- **UX/UI:** Tailwind CSS con temas dinámicos, Glassmorphism y componentes personalizados (`AccountSelector`).

## Instalación y Despliegue

### 1 — Clonar e instalar dependencias

```bash
git clone <repo-url>
cd "Nuevo Sistema"
bun install
cd frontend
bun install
cd ..
```

### 2 — Inicializar la Base de Datos

```bash
bun run db:migrate
bun run db:seed
```

### 3 — Ejecución en Desarrollo

```bash
bun run dev:all
```

## Reglas Maestras de Operación

1. **Prioridad de Reglas:** Las reglas bancarias se evalúan estrictamente por su campo `priority`. Las reglas de baja numeración (0) se ejecutan antes que las generales (20).
2. **Aislamiento Multitenant:** La seguridad depende del `companyId` inyectado. El backend rechaza peticiones sin contexto de empresa válido para usuarios administrativos.
3. **Inmutabilidad de Auditoría:** La tabla `audit_logs` es físicamente inmutable mediante triggers. Las reparaciones de integridad se realizan sincronizando el caché de la aplicación con la base de datos.
4. **Integridad HMAC:** Cada fila del libro diario está encadenada criptográficamente. Cualquier alteración externa invalida la cadena y dispara alertas de seguridad.
