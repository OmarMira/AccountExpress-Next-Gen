# Guía de Internacionalización (i18n)

Account Express Next-Gen usa **i18next** + **react-i18next** con traducciones en TypeScript para tipado estricto.

## Estructura

```
frontend/src/
├── i18n/
│   ├── index.ts       ← configuración principal
│   └── types.ts       ← tipado global para i18next
└── locales/
    └── es/
        ├── common.ts  ← botones, estados, errores genéricos
        ├── auth.ts    ← login, sesión, permisos
        ├── dashboard.ts
        ├── accounts.ts
        ├── journal.ts
        ├── banks.ts
        ├── reports.ts
        ├── settings.ts
        └── ai.ts
```

## Uso en componentes

```tsx
import { useTranslation } from 'react-i18next';

function MiComponente() {
  const { t } = useTranslation('common');

  return <button>{t('buttons.guardar')}</button>;
}
```

Para usar múltiples namespaces:
```tsx
const { t: tc } = useTranslation('common');
const { t: td } = useTranslation('dashboard');

tc('buttons.cancelar')      // → 'Cancelar'
td('tarjetas.ingresos')     // → 'INGRESOS'
```

## Agregar una nueva clave

1. Abrí el archivo de locale correspondiente, por ejemplo `locales/es/common.ts`
2. Agregá la nueva clave en el objeto con tipado estricto:
   ```ts
   buttons: {
     // ...existentes
     nuevo: 'Nuevo',   // ← nueva clave
   }
   ```
3. TypeScript validará automáticamente que `t('buttons.nuevo')` sea una clave válida

## Agregar un nuevo idioma (ej: inglés)

1. Crear la carpeta `frontend/src/locales/en/`
2. Copiar todos los archivos `.ts` de `locales/es/` a `locales/en/`
3. Traducir los valores (no las claves)
4. En `i18n/index.ts`, agregar el recurso:
   ```ts
   import commonEn from '../locales/en/common';
   // ...resto de imports en

   resources: {
     es: { common, auth, ...},
     en: { common: commonEn, auth: authEn, ... },  // ← nueva entrada
   }
   ```
5. Para cambiar el idioma en runtime:
   ```ts
   import i18n from './i18n/index';
   i18n.changeLanguage('en');
   ```

## Reglas

- **No usar `.json`** — los archivos `.ts` permiten tipado completo
- **No modificar las claves** — solo los valores al traducir
- **Un namespace por módulo** — no poner todo en `common`
- **`as const`** en cada archivo de locales — necesario para que TypeScript infiera el tipo exacto

## Namespaces disponibles

| Namespace    | Archivo          | Módulos que lo usan                   |
|-------------|------------------|---------------------------------------|
| `common`    | `common.ts`      | Todos los componentes                 |
| `auth`      | `auth.ts`        | `Login.tsx`, `SelectCompany.tsx`      |
| `dashboard` | `dashboard.ts`   | `Dashboard.tsx`                       |
| `accounts`  | `accounts.ts`    | `Accounts.tsx`                        |
| `journal`   | `journal.ts`     | `Journal.tsx`                         |
| `banks`     | `banks.ts`       | `Banks.tsx`, `BankReconciliation.tsx` |
| `reports`   | `reports.ts`     | `Reports.tsx`, `CpaExport.tsx`        |
| `settings`  | `settings.ts`    | `Settings.tsx`, `Users.tsx`           |
| `ai`        | `ai.ts`          | `AIPanel.tsx`                         |
