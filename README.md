# AccountExpress — Core Contable

Sistema de contabilidad de doble entrada y conciliación bancaria diseñado para pequeñas y medianas empresas. Construido con un enfoque de integridad financiera: cada asiento de diario genera una cadena de auditoría criptográfica que garantiza la inmutabilidad del historial contable.

## Módulos del sistema

- **Plan de Cuentas (GL)** — Catálogo jerárquico US GAAP con siembra automática
- **Libro Diario** — Asientos de doble entrada con validación de cuadre en tiempo real
- **Conciliación Bancaria** — Importación de estados de cuenta PDF, CSV, OFX y QFX
- **Períodos Fiscales** — Apertura, cierre y bloqueo de períodos con enforcement en BD
- **Reportes** — Balance General y Estado de Resultados en tiempo real
- **Auditoría Criptográfica** — Cadena HMAC que detecta cualquier alteración del historial

## Stack tecnológico

### Backend

- **Runtime:** Bun
- **Framework:** Elysia
- **ORM:** Drizzle ORM
- **Base de datos:** PostgreSQL 16
- **Seguridad:** bcryptjs, HMAC SHA-256, sesiones HTTP-only

### Frontend

- **Framework:** React 18 con TypeScript
- **Estilos:** Tailwind CSS (dark mode)
- **Estado del servidor:** React Query (@tanstack/query)
- **Estado global:** Zustand
- **Build:** Vite

## Requisitos previos

- Bun v1.2 o superior
- PostgreSQL 16
- Node.js 18 o superior (solo para herramientas de desarrollo)

## Instalación

### 1 — Clonar e instalar dependencias

```bash
git clone <repo-url>
cd "Nuevo Sistema"
bun install
cd frontend
bun install
cd ..
```

### 2 — Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y completa los valores obligatorios descritos en la sección de Variables de entorno.

### 3 — Ejecutar migraciones

```bash
bun run db:migrate
```

### 4 — Crear datos iniciales (seed)

```bash
bun run db:seed
```

Esto crea el super administrador, roles, permisos y una empresa de demostración.

## Inicio del sistema

### Ambos servidores simultáneamente (recomendado)

```bash
bun run dev:all
```

### Por separado

Backend (puerto 3000):

```bash
bun run dev
```

Frontend (puerto 5173):

```bash
bun run dev:frontend
```

## Variables de entorno

| Variable | Descripción | Obligatoria |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión PostgreSQL para la app | Sí |
| `DATABASE_ADMIN_URL` | Cadena de conexión con permisos de admin (migraciones) | Sí |
| `SESSION_SECRET` | Clave secreta para sesiones HTTP-only (mín. 16 chars) | Sí |
| `AUDIT_HMAC_SECRET` | Clave HMAC para la cadena de auditoría | Sí |
| `JOURNAL_HMAC_SECRET` | Clave HMAC para el libro diario | Sí |
| `SUPER_ADMIN_USERNAME` | Usuario del administrador inicial | Sí |
| `SUPER_ADMIN_EMAIL` | Email del administrador inicial | Sí |
| `SUPER_ADMIN_PASSWORD` | Contraseña del administrador inicial | Sí |
| `PORT` | Puerto del servidor backend (default: 3000) | No |
| `CORS_ORIGIN` | Origen permitido para CORS (default: localhost:5173) | No |
| `NODE_ENV` | Entorno de ejecución (`development` / `production`) | No |

Para generar un secreto seguro:

```bash
openssl rand -hex 64
```

## Credenciales iniciales

Las credenciales del primer acceso se definen en el archivo `.env`. Por defecto en el ejemplo:

- **Usuario:** `admin`
- **Contraseña:** `ChangeMe@2026!`

Cambia estas credenciales antes de cualquier despliegue en producción.

## Estructura del proyecto

```
Nuevo Sistema/
├── src/                    # Backend (Bun + Elysia)
│   ├── db/                 # Esquemas Drizzle, migraciones y seeds
│   ├── middleware/         # Auth, RBAC, tenant isolation
│   ├── routes/             # Endpoints de la API REST
│   ├── services/           # Lógica de negocio y servicios
│   └── server.ts           # Punto de entrada del servidor
├── frontend/               # Frontend (React + Vite)
│   └── src/
│       ├── components/     # Componentes reutilizables
│       ├── pages/          # Páginas de la aplicación
│       ├── store/          # Estado global (Zustand)
│       └── lib/            # Utilidades y cliente API
├── drizzle/                # Migraciones generadas por Drizzle Kit
├── scripts/                # Scripts de prueba y mantenimiento
├── tests/                  # Pruebas de integración y unitarias
├── .env.example            # Plantilla de variables de entorno
└── docker-compose.yml      # Configuración de contenedores
```

## Comandos disponibles

| Comando | Descripción |
|---|---|
| `bun run dev:all` | Inicia backend y frontend simultáneamente |
| `bun run dev` | Solo backend con hot-reload |
| `bun run dev:frontend` | Solo frontend |
| `bun run db:migrate` | Aplica migraciones pendientes |
| `bun run db:seed` | Inserta datos iniciales |
| `bun run typecheck` | Verifica tipos TypeScript sin compilar |
| `bun run test` | Ejecuta pruebas unitarias |
| `bun run test:integration` | Ejecuta pruebas de integración |

## Seguridad

- Sesiones almacenadas en cookies HTTP-only sin exposición al cliente
- `companyId` siempre leído desde el contexto de sesión, nunca desde el cuerpo de la petición
- Control de acceso basado en roles (RBAC) por módulo y acción
- Cadena de auditoría criptográfica (HMAC) en asientos de diario
- Bloqueo de inserts en períodos fiscales cerrados a nivel de base de datos
- Escaneo de secretos en cada commit con GitLeaks
