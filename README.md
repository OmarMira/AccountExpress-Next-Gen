# AccountExpress — Core Contable Next-Gen

Sistema de contabilidad de doble entrada y conciliación bancaria diseñado para pequeñas y medianas empresas. Construido con un enfoque estricto en la **integridad financiera y seguridad**: cada asiento de diario genera una cadena de auditoría criptográfica, las transacciones usan bloqueos a nivel de fila (row-level locking) para evitar condiciones de carrera, y la arquitectura sigue un modelo "Fail-Fast".

## Progreso y Bitácora del Sistema (Changelog)

A lo largo del desarrollo, el sistema se ha refactorizado y asegurado sustancialmente. Esta bitácora resume la arquitectura actual y los hitos alcanzados:

- **Motor de Reglas Bancarias Inteligente:** Implementación de un motor de clasificación automática de transacciones basado en prioridades (0-20), condiciones de coincidencia de texto y asignación automática de cuentas del Libro Mayor.
- **Gestión Centralizada de Empresas:** Transformación del módulo de configuración en un Panel de Gestión Multi-Empresa que permite a los Super Usuarios crear, editar y alternar entre espacios de trabajo (tenants) con un solo clic.
- **Seguridad de Respaldos e Integridad:** Añadido panel de generación de backups manuales y reportes de validación de integridad criptográfica para detectar cualquier manipulación externa de los datos contables.
- **Remoción de Inteligencia Artificial:** Se eliminó por completo la dependencia de paneles AI y componentes inyectados para mantener un sistema financiero puro, determinista y seguro.
- **Motor Financiero Seguro:** Validación matemática estricta para la partida doble y uso de transacciones atómicas con `row-level locking`.
- **Plan de Cuentas (GL) Estándar:** Estructura US GAAP con esquemas en minúsculas estrictas (`asset`, `liability`, `equity`, `revenue`, `expense`).
- **Seguridad de Variables de Entorno (Fail-Fast):** Uso exclusivo del esquema de validación en `src/config/validate.ts`.

## Módulos del Sistema

- **Gestión de Empresas (Multi-Tenant)** — Tablero administrativo para gestionar múltiples entidades jurídicas, logos, datos legales y cambio de contexto de trabajo.
- **Motor de Reglas Bancarias** — Automatización del flujo de caja mediante reglas con prioridad configurable, permitiendo que las reglas críticas se ejecuten antes que las generales.
- **Plan de Cuentas (GL)** — Catálogo jerárquico contable con validación estricta y siembra automática por empresa.
- **Libro Diario y Transacciones** — Asientos de doble entrada atómicos, validación matemática de balance (`debit == credit`) y prevención de concurrencias.
- **Gestión de Usuarios y RBAC** — Control de acceso estricto, gestión de usuarios segura y protección inmutable del Super Administrador.
- **Auditoría e Integridad** — Registro de acciones administrativas (System Audit Log) y verificación cruzada HMAC SHA-256 para asientos contables.
- **Conciliación Bancaria** — Herramientas para importar transacciones y conciliarlas contra el libro mayor usando el motor de reglas.
- **Períodos Fiscales** — Control total sobre cierres contables y bloqueos de períodos para evitar modificaciones en años fiscales cerrados.
- **Respaldos y Reportes** — Generación de copias de seguridad de la base de datos y exportación de reportes financieros certificados.

## Stack Tecnológico y Arquitectura

### Backend (API REST)
- **Runtime:** Bun v1.2+
- **Framework:** Elysia.js (Tipado estricto end-to-end)
- **ORM:** Drizzle ORM
- **Base de Datos:** PostgreSQL 16
- **Seguridad:** 
  - Validaciones de variables Fail-Fast con Zod.
  - Firma inmutable con HMAC SHA-256 para el Journal.
  - Trazabilidad HMAC para Logs de Auditoría.
  - Autenticación mediante sesiones stateful HTTP-only.

### Frontend (SPA)
- **Framework:** React 18 con TypeScript
- **Bundler:** Vite
- **Estado Global:** Zustand (Persistencia de sesión y empresa activa)
- **Mutaciones:** React Query (`@tanstack/query`)
- **Estilos:** Tailwind CSS con diseño de alta densidad (Glassmorphism)

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

1. **Jerarquía de Reglas Bancarias:** Las reglas se evalúan por su campo `priority`. Una regla con prioridad `0` (Crítica) siempre se aplicará antes que una con prioridad `20` (Muy Baja).
2. **Aislamiento Multitenant:** La seguridad de los datos depende del `companyId` inyectado en cada petición desde la sesión del usuario. Ninguna query puede saltarse este filtro.
3. **Bloqueo Fiscal Definitivo:** Una vez que un período fiscal se marca como `BLOQUEADO`, el backend rechazará cualquier intento de escritura (INSERT/UPDATE/DELETE) en fechas pertenecientes a dicho período.
4. **Integridad HMAC:** Cada fila del libro diario está vinculada a la anterior mediante un hash criptográfico. Si una sola entrada es alterada manualmente en la base de datos, la cadena se rompe y el sistema emitirá una alerta de seguridad.
