# Despliegue

Cuatro piezas que salen a producción por caminos distintos. **Ninguna arrastra a las
otras**: desplegar la web no actualiza las Edge Functions, y aplicar una migración no
despliega nada.

---

## Antes de cada despliegue

```sh
npm run typecheck   # el de verdad — `npx tsc --noEmit` no comprueba nada aquí
npm run lint
npm run test
```

Y **subir la versión** en `src/lib/version.ts`:

```ts
export const APP_VERSION = "19.1";
export const APP_VERSION_DATE = "2026-09-09";
```

> No es cosmético. Ese número es lo único que permite decir «estás viendo la 19.1» cuando
> alguien reporta algo. Se ve en Ajustes y en el pie del panel de administración. Sin
> subirlo, un fallo ya corregido y otro que sigue vivo son indistinguibles.

## 1. Web (Vercel)

`git push` a `main`. Vercel construye y publica.

### Variables de entorno

```sh
node scripts/generar-env-vercel.mjs
```

Escribe `.env.vercel` —con los valores de tu `.env` local y la explicación de cada
variable— para subirlo en **Settings → Environment Variables → Import .env**. No entra en
git: `.gitignore` ignora `.env.*`.

Dos cosas que se olvidan:

- **Marcar los tres entornos** (Production, Preview y Development).
- **Redesplegar después.** Estas variables se resuelven al CONSTRUIR, no al servir:
  cambiarlas no toca el sitio ya publicado hasta la siguiente construccion.

`--verificar` compara la lista del script con las `VITE_*` que el código lee de verdad.
Sirve para lo que se rompe callado: alguien añade una variable, le funciona porque su
`.env` ya la tiene, y en producción sale vacía sin dar ningún error.

`vercel.json` lleva:

- las **cabeceras de seguridad**, con la CSP;
- las **reescrituras**: `/sitemap.xml` → `/api/sitemap`, la ficha de un aviso →
  `/api/og-aviso`, y el comodín que manda todo lo demás al `index.html` de la SPA.

> **El orden importa.** El comodín se traga cualquier ruta que vaya después de él, y
> además tiene que excluir explícitamente lo que se sirve aparte.

### Al tocar la CSP

`script-src` **no lleva `unsafe-inline`**, y no debe llevarlo: es la directiva que impide
que un texto inyectado en la página se ejecute como código.

Por eso todo script va en un fichero externo servido desde nuestro dominio
(`gtag-init.js`, `font-boot.js`, `boot-watchdog.js`). Cuando un proveedor entrega un
fragmento «para pegar en el `<head>`» —Google Ads, por ejemplo—, se saca a un fichero.

Un script bloqueado por la CSP **no da error visible**: la página funciona y la
funcionalidad simplemente no existe. Hay pruebas que vigilan esto.

## 2. Edge Functions (Supabase)

```bash
SUPABASE_ACCESS_TOKEN=<PAT> ./node_modules/.bin/supabase functions deploy <nombre> \
  --project-ref <ref> --no-verify-jwt
```

`--no-verify-jwt` en las que llama la base de datos o un proveedor externo, que no traen
sesión de usuario: esas se identifican con un secreto compartido o con la firma del
proveedor.

**Una función que importa de `_shared/` hay que redesplegarla cuando cambie lo
compartido.** No se actualiza sola. Si tocas `_shared/factiliza.ts`, redespliega
`emit-invoice`.

Los *secrets* de cada una, en su `DEPLOY.md`.

## 3. Migraciones

Con la Management API:

```bash
curl -X POST "https://api.supabase.com/v1/projects/<ref>/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query":"..."}'
```

Antes de aplicar, la lista de [`base-de-datos.md`](base-de-datos.md#antes-de-dar-por-buena-una-migración).
Después, **comprobar el efecto contra el proyecto real** si tocó permisos: la prueba local
no vale para eso.

## 4. Móvil

- **Android:** `npm run build && npx cap sync android`, y abrir `android/` en Android Studio.
- **iOS:** lo compila `codemagic.yaml` → TestFlight. Regenera `ios/` en cada build.

### ⚠️ La actualización por aire (OTA)

**La app publicada va por detrás de la web.** Una OTA activada sin cuidado le sirve a un
teléfono con un APK nuevo una versión web más antigua que la que trae empaquetada: el
usuario actualiza y **retrocede**.

Antes de tocar la OTA hay que comprobar qué versión tiene el APK publicado.

---

## Secretos

- Nunca en el repositorio. Nunca en un `VITE_*` — todo `VITE_*` acaba dentro del
  JavaScript que descarga el navegador.
- Los de servidor, como *secrets* de las Edge Functions.
- La Management API **no devuelve** el valor de un secret, solo su huella SHA-256. Para
  saber si el configurado es el que crees, se compara la huella; no hace falta leerlo.
- Si se rotan, hay que rotarlos **en todos los sitios**: Supabase, Vercel y donde se
  guarden localmente.

## Verificar que salió bien

No basta con que el despliegue termine. Según lo que se haya tocado:

- **Web:** cargar el sitio real y mirar la consola. Un script bloqueado por la CSP no
  avisa de ninguna otra forma.
- **Edge Function:** provocar el camino que cambió y mirar sus registros.
- **Migración:** consultar el estado resultante contra el proyecto real.
- **Comprobantes:** comprobar el estado en SUNAT, no solo que la función respondió.
