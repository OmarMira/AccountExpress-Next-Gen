# Architecture Guidelines — Account Express Next Gen

Estas reglas son obligatorias. Antigravity las lee antes de cada sesión de desarrollo.

---

## Regla 1 — Límite de tamaño de módulos

Ningún archivo `.service.ts` puede superar 200 líneas.

Si un servicio supera ese límite, se divide en archivos separados por responsabilidad:

- `[modulo]-draft.service.ts` → creación de borradores
- `[modulo]-math.service.ts` → validación matemática
- `[modulo]-hash.service.ts` → generación de hashes
- `[modulo]-void.service.ts` → anulación / reversión

**Control:** antes de cada commit, ejecutá:
```powershell
Get-ChildItem -Path "src" -Recurse -Filter "*.service.ts" | Where-Object { (Get-Content $_.FullName).Count -gt 200 } | Select-Object Name, @{N="Lines";E={(Get-Content $_.FullName).Count}}
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

1. ¿Algún `.service.ts` supera 200 líneas? → dividir
2. ¿Existe `fix-types.ts`? → eliminar
3. ¿Hay `as any` o `as string` nuevo en el código? → corregir el tipo
4. ¿Hay rutas absolutas o contraseñas en el código fuente? → mover a `.env`
5. ¿Los curls de prueba usan `--data-binary "@archivo.json"`? → si no, corregir
