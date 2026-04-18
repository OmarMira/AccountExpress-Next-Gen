# Architecture Guidelines — Account Express Next Gen

Estas reglas son obligatorias. Antigravity las lee antes de cada sesión de desarrollo.

---

## Regla 1 — Límite de tamaño de módulos

Ningún archivo `.service.ts` puede superar 250 líneas.

Si un servicio supera ese límite, se divide en archivos separados por responsabilidad:

- `[modulo]-draft.service.ts` → creación de borradores
- `[modulo]-math.service.ts` → validación matemática
- `[modulo]-hash.service.ts` → generación de hashes
- `[modulo]-void.service.ts` → anulación / reversión

**Control:** antes de cada commit, ejecutá:
```powershell
Get-ChildItem -Path "src" -Recurse -Filter "*.service.ts" | Where-Object { (Get-Content $_.FullName).Count -gt 250 } | Select-Object Name, @{N="Lines";E={(Get-Content $_.FullName).Count}}
```
Si devuelve resultados, hay que dividir antes de continuar.

---

## Regla 2 — Tipado estricto. Prohibido `as any` y `as string`

`fix-types.ts` no existe en este proyecto. Nunca debe volver a existir.

- Todos los endpoints usan `t.Object()` de Elysia para tipar el body
- `tsconfig.json` tiene `"strict": true` y `"noImplicitAny": true`
- Si TypeScript se queja de un tipo, se corrige el tipo real — nunca se castea

**Señal de alerta:** si aparece `as any` o `as string` en un archivo nuevo, es un bug, no una solución.

**Control:** antes de cada commit, ejecutá:
```powershell
Select-String -Path "src\**\*.ts" -Pattern "as any|as string" -Recurse
```
Si devuelve resultados, hay que corregir antes de continuar.

---

## Regla 3 — Sin credenciales ni rutas absolutas en el código

Ningún archivo `.ts` o `.js` puede contener:
- Contraseñas en texto plano
- Rutas absolutas del tipo `C:\Users\...`
- URLs hardcodeadas a entornos locales

Todo va en `.env`. El archivo `.env` está en `.gitignore` y nunca se commitea.

**Control:** antes de cada commit, ejecutá:
```powershell
Select-String -Path "src\**\*.ts" -Pattern "C:\\Users|password\s*=\s*['\"][^'\"]+['\"]" -Recurse
```
Si devuelve resultados, hay que mover esos valores a `.env` antes de continuar.

---

## Regla 4 — Pruebas con curl en PowerShell

Nunca usar `-d '{"json":"inline"}'` en curl desde PowerShell. PowerShell stripea las comillas y el body llega inválido.

Siempre usar archivo JSON:
```powershell
'{"clave":"valor"}' | Out-File -FilePath "test.json" -Encoding utf8NoBOM
curl.exe -s -i -X POST "http://localhost:3000/api/ruta" -H "Content-Type: application/json" --data-binary "@test.json"
```

---

## Checklist pre-sesión (Antigravity la ejecuta al inicio de cada sesión)

1. ¿Algún `.service.ts` supera 250 líneas? → dividir
2. ¿Existe `fix-types.ts`? → eliminar
3. ¿Hay `as any` o `as string` nuevo en el código? → corregir el tipo
4. ¿Hay rutas absolutas o contraseñas en el código fuente? → mover a `.env`
5. ¿Los curls de prueba usan `--data-binary "@archivo.json"`? → si no, corregir

---

## Protocolo de verificación obligatorio

Este protocolo es de cumplimiento estricto para Antigravity en cada interacción:

1. **Verificación de TypeScript**: Cuando sea necesario verificar errores, Antigravity indicará exactamente qué comando correr y esperará el output del usuario.
2. **Evidencia Fresca**: Nunca se usarán archivos en disco (`errors.txt`, logs antiguos, etc.) como prueba del estado actual. Siempre se solicitará el output fresco del terminal.
3. **Comunicación Directa**: Si Antigravity no puede ejecutar un comando debido a limitaciones técnicas (como el *sandboxing* en Windows), lo dirá explícitamente y proporcionará el comando exacto para que el usuario lo ejecute en su terminal local. No se buscarán alternativas que "parezcan" equivalentes sin previo aviso.
4. **Confirmación de Correcciones**: Antes de declarar una tarea como "corregida", Antigravity solicitará al usuario ejecutar `bun tsc --noEmit` y `echo "Exit code: $LASTEXITCODE"` para validación final.

---

## Deuda Técnica Documentada

### DT-002 — Migración doble en arranque

**Estado:** Resuelto — 2026-04-10.

**Solución aplicada:** Se eliminó la llamada a `runMigrations()` dentro de `runSeed()`. Cuando `seed.ts` se ejecuta directamente (`import.meta.main`), las migraciones se corren antes de invocar `runSeed()`. Cuando se importa desde `index.ts`, `index.ts` ya corrió `runMigrations()` previamente.

---

## Deployment Security Requirements

These requirements are mandatory before any production deployment.

### TLS 1.3

TLS termination is the responsibility of the reverse proxy (nginx or Caddy).
The application server (Bun/Elysia) must never be exposed directly to the internet.

Minimum nginx TLS configuration:

```nginx
ssl_protocols TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_stapling on;
ssl_stapling_verify on;
```

### AES-256 encryption at rest

PostgreSQL data encryption at rest is the responsibility of the hosting provider
or server administrator. For self-hosted deployments, enable filesystem-level
encryption (LUKS on Linux) before initializing the PostgreSQL data directory.
Alternatively, use `pgcrypto` for column-level encryption on high-sensitivity
fields such as `users.password_hash` and `sessions`.

### Compliance note

No production deployment should occur without both TLS 1.3 and encryption at
rest active. Failure to comply violates the IRS data security requirements
applicable to systems storing financial records subject to 7-year retention.


