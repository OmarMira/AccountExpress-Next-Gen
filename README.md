# AccountExpress — Core Contable Next-Gen

Sistema de contabilidad de doble entrada y conciliación bancaria diseñado para pequeñas y medianas empresas. Construido con un enfoque estricto en la **integridad financiera y seguridad**: cada asiento de diario genera una cadena de auditoría criptográfica, las transacciones usan bloqueos a nivel de fila (row-level locking) para evitar condiciones de carrera, y la arquitectura sigue un modelo "Fail-Fast".

## Progreso y Bitácora del Sistema (Changelog)

A lo largo del desarrollo, el sistema se ha refactorizado y asegurado sustancialmente. Esta bitácora resume la arquitectura actual y los hitos alcanzados:

- **Remoción de Inteligencia Artificial:** Se eliminó por completo la dependencia de paneles AI y componentes inyectados para mantener un sistema financiero puro, determinista y seguro, minimizando dependencias externas.
- **Motor Financiero Seguro:** Implementación de validación matemática estricta para la partida doble. Uso de transacciones atómicas de base de datos con `row-level locking` (bloqueo a nivel de fila) para prevenir condiciones de carrera en operaciones de alta concurrencia.
- **Plan de Cuentas (GL) Estándar:** Corrección profunda en el sembrado (seeding) de la BD para garantizar una estructura estándar US GAAP con esquemas en minúsculas estrictas (`asset`, `liability`, `equity`, `revenue`, `expense`). Sembrado automático garantizado al inicializar empresas.
- **Seguridad de Variables de Entorno (Fail-Fast):** Eliminación de lecturas directas y vulnerables a `process.env`. Todo el sistema utiliza el esquema de validación exportado de `src/config/validate.ts`, abortando la inicialización si faltan parámetros críticos.
- **Gestión de Usuarios Robusta:** Lógica de base de datos y backend endurecida para la desactivación y eliminación de usuarios, garantizando que siempre persista un único Super Administrador inmutable (previniendo auto-bloqueos).
- **Auditoría Integral:** Implementación de un `System Audit Log` para registrar acciones administrativas dentro del sistema, independiente de la validación criptográfica (HMAC SHA-256) exigida para los asientos del libro de diario.
- **Resolución de Deuda Técnica y Limpieza:** Auditoría profunda de tipado TypeScript para corregir errores silenciosos (type safety). Purga sistemática del directorio de archivos de diagnóstico temporales, módulos "dead code" obsoletos y reglas de `.gitignore` estrictas para preveer la fuga de secretos o logs locales en GitHub.

## Módulos del sistema

- **Plan de Cuentas (GL)** — Catálogo jerárquico contable con validación estricta y siembra automática por tenant (empresa).
- **Libro Diario y Transacciones** — Asientos de doble entrada atómicos, validación matemática de balance (`debit == credit`) en tiempo real y prevención de concurrencias colisionantes.
- **Gestión de Usuarios y RBAC** — Control de acceso estricto, gestión de usuarios segura y reglas inmutables de Super Administrador.
- **Registros de Auditoría** — Integración de logs a nivel infraestructura y aplicación ("System Audit Log").
- **Conciliación Bancaria** — Estructuras modulares preparadas para ingesta de datos bancarios.
- **Períodos Fiscales** — Apertura, cierre y bloqueo de períodos mediante enforcement de software para rechazar inserciones pasadas irrevocablemente.
- **Criptografía Contable** — Cadena HMAC persistente para garantizar total inmutabilidad e inviolabilidad humana del registro contable histórico.

## Stack Tecnológico y Arquitectura

### Backend (API REST)
- **Runtime:** Bun v1.2+
- **Framework:** Elysia.js (Tipado estricto end-to-end)
- **ORM:** Drizzle ORM
- **Base de Datos:** PostgreSQL 16
- **Seguridad:** 
  - Validaciones de variables Fail-Fast con Zod.
  - Hashing de credenciales con bcryptjs.
  - Firma inmutable con HMAC SHA-256.
  - Autenticación controlada mediante sesiones stateful HTTP-only, previniendo inyecciones y ataques de Account Takeover (ATO).

### Frontend (SPA)
- **Framework:** React 18 con TypeScript
- **Estilos:** Tailwind CSS (Arquitectura semántica)
- **Mutaciones HTTP:** React Query (`@tanstack/query`)
- **Estado Global:** Zustand
- **Bundler:** Vite

## Requisitos previos

- Bun v1.2 o superior
- PostgreSQL 16 v16+
- Node.js 18+ (Para tools de depuración satélites ocasionales)

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

### 2 — Configuración de Variables de Entorno

Debes crear un archivo `.env` en la raíz del proyecto.

> **NOTA CRÍTICA:** El sistema se negará a enrutar cualquier conexión si falta una variable fundamental. Debes declarar todas las variables obligatorias en `.env`.

Para generar secretos criptográficos seguros para los HMAC y la Sesión HTTP (`SESSION_SECRET`, `AUDIT_HMAC_SECRET`, `JOURNAL_HMAC_SECRET`):
```bash
openssl rand -hex 64
```

### 3 — Inicializar la Base de Datos (Estructura y Seed)

Este paso materializa el esquema SQL Drizzle, define los constrains restrictivos e inyecta al Super Admin originario, los roles base y las cuentas estándar maestras:

```bash
bun run db:migrate
bun run db:seed
```

## Ejecución del Sistema

### Modo Desarrollo Múltiple (Recomendado)

Levanta el servidor Backend (Elysia, Puerto `3000`) y Frontend (Vite, Puerto `5173`) en simultáneo bajo el mismo thread process:

```bash
bun run dev:all
```

### Ejecutar Servicios Individualmente

Solo Backend REST (Con hot-reload de Bun):
```bash
bun run dev
```

Solo el UI Frontend:
```bash
bun run dev:frontend
```

## Variables de Entorno Fundamentales

| Variable | Propósito | Mandatoria |
|---|---|---|
| `DATABASE_URL` | Conexión pool para las queries y transacciones del app | Sí |
| `DATABASE_ADMIN_URL` | Conexión con grants altos para `bun run db:migrate` | Sí |
| `SESSION_SECRET` | Semilla de encriptación para las cookies seguras de auth | Sí |
| `AUDIT_HMAC_SECRET` | Llave privativa de firmado digital para trazabilidad de logs | Sí |
| `JOURNAL_HMAC_SECRET` | Llave privativa de firmado para los registros de libro mayor | Sí |
| `SUPER_ADMIN_USERNAME` | Identificador del admin de provisión originaria ("root") | Sí |
| `SUPER_ADMIN_EMAIL` | Email de contacto/login para este admin inicial | Sí |
| `SUPER_ADMIN_PASSWORD` | Passkey temporal para el perfil root (Se inyecta al seed) | Sí |
| `PORT` | Exposición de puerto local de la API REST (Defecto: 3000) | No |
| `CORS_ORIGIN` | Whitelisting origin (Defecto: http://localhost:5173) | No |

## Manejo de Credenciales

Las credenciales root del Super Administrador se dictan desde las variables `SUPER_ADMIN_*` que son incrustadas de forma encriptada en la BD la primera vez que se lanza `bun run db:seed`.

**Regla Cero de Acceso:** La cuenta sembrada como Super Admin inicial posee una constraint en backend que imposibilita su eliminación manual o accidental desde la interfaz. 

## Estructura de Directorios Clave

```
Nuevo Sistema/
├── src/                    # Backend Source Code (Bun + Elysia)
│   ├── config/             # Schemas de validación central (Fail-Fast checks)
│   ├── db/                 # Archivos Drizzle: tables, constraints, migrators
│   ├── middleware/         # Security guards, Auth Contexts, HTTP-Only cookies
│   ├── routes/             # Endpoints (Handlers lógicos del API)
│   └── services/           # Repositorios funcionales (ACID transaccional, cripto)
├── frontend/               # Frontend Project Web
│   ├── src/components/     # Bloques de vista React sin estado puro
│   ├── src/pages/          # Mapeo de vistas unidas por el react-router
│   └── src/store/          # Estados reactivos volátiles (Zustand)
├── drizzle/                # Artefactos SQL nativos producidos en la migración
└── tests/                  # Estructuras para los tests unitarios e integrales
```

## Reglas Maestras de Seguridad Arquitectónica A Implementar / Implementadas

1. **Aislamiento Multitenant Inviolable:** El `companyId` dictamina el alcance de visibilidad de cualquier usuario. JAMÁS se acepta o lee desde la petición REST. Proviene intrínsecamente del Token/Sessión interno.
2. **Atomicidad Exclusiva:** Las consultas complejas (Libro mayor, diarios) están acopladas con transaccionalidad total (`tx`) y `SELECT ... FOR UPDATE` (row locks) impidiendo concurrencias desleales.
3. **Bloqueo Fiscal Definitivo:** Operaciones solicitadas para ser registradas en un período fiscal con estado `CERRADO` fallarán irrevocablemente sin posibilidad de over-write humano.
