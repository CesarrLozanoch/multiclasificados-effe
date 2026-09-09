# Pruebas

Unas 2.800 pruebas en ~296 ficheros. Vitest + Testing Library, PGlite para las
migraciones, Playwright para maquetación.

```sh
npm run test         # todo, una pasada (~4 min)
npm run test:watch
npx vitest run src/test/factiliza.test.ts    # un fichero
npm run test:layout  # Playwright
```

> Necesitan un `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, aunque sean
> valores inventados: sin ellos `createClient("")` lanza «supabaseUrl is required» y no
> arranca ni una.

---

## Qué se prueba aquí

Este repositorio no busca cubrir líneas. Busca que **un fallo que ya ocurrió no vuelva a
ocurrir en silencio**. Casi todas las pruebas nacieron de algo que se rompió, y por eso
llevan escrito arriba qué pasó y por qué importa.

Lo que más se cuida es lo que **no se ve fallar**:

- dinero y comprobantes,
- permisos y RLS,
- cosas que dejan de funcionar sin dar error (una etiqueta de medición bloqueada por la
  CSP, un sitemap vacío, un correo que no sale).

Las marcadas con **🔴** son las que no deberían ponerse en verde a la ligera: si una falla,
casi siempre significa que se rompió lo que protege, no que la prueba esté vieja.

## La regla que más vale de todas

> **Una prueba nueva no cuenta hasta que la has visto fallar.**

Escribe la prueba, **rompe el código a propósito**, comprueba que falla, y arréglalo. Una
prueba que nunca ha estado en rojo no está protegiendo nada — y las hay que parecen
comprobar algo y no comprueban nada:

- Una que busca `<script>` en un HTML y encuentra el que está dentro de **su propio
  comentario**.
- Una que mide una longitud **al revés** y pasa siempre.
- Una que llama a una función con **la firma equivocada** y da por bueno el `undefined`.

Las tres son reales, de este repositorio, y las tres pasaban en verde.

## Comprobaciones que NO valen

### `npx tsc --noEmit`

**No comprueba nada aquí.** Sin `-p` coge otro `tsconfig` y sale limpio pase lo que pase.
El único que vale es `npm run typecheck`.

### PGlite para permisos

PGlite **no reproduce** los privilegios por defecto que el proyecto de Supabase concede a
`anon` sobre cada tabla nueva. Una prueba que dice «`anon` no puede leer esto» pasa en
verde y es **falsa en producción**. Ya pasó (ver [`base-de-datos.md`](base-de-datos.md)).

Para permisos: comprobarlo contra el proyecto real.

### Un mock que se inventa la respuesta

Probar contra un mock que devuelve lo que te conviene comprueba el mock. Para las
respuestas de Factiliza y de Izipay se usan **cuerpos reales capturados**, incluidos los
raros: el rechazo que llega con HTTP 200, el «ya declarado» que llega con HTTP 400 y es un
aceptado, el CDR que es un ZIP y no JSON.

## Cómo se escribe una prueba aquí

```ts
// @vitest-environment node       ← si hace falta, la PRIMERA línea del fichero
import { describe, it, expect } from "vitest";

/**
 * Qué protege, y qué pasó para que exista.
 *
 * Sin esto, dentro de seis meses la prueba es una condición sin contexto que
 * alguien borrará porque «ya no aplica».
 */
describe("...", () => {
  it("🔴 lo que no puede volver a pasar", () => { /* ... */ });
});
```

- El comentario **cuenta el caso real**, no repite el nombre de la función.
- Se prueba el **comportamiento**, no la forma de escribirlo: si la prueba se rompe al
  reordenar dos líneas equivalentes, sobra.
- Cuando una regla vive en dos sitios que no pueden compartir módulo —navegador y Deno—,
  la prueba **compara las dos copias caso por caso**. Es lo único que impide que se
  separen. Hay tres así: los precios, los textos de notificación y las observaciones de
  SUNAT.

## Playwright

`npm run test:layout` comprueba maquetación: que un texto no se parta, que las cifras
vayan alineadas, que un modal no quede bajo el notch. Cosas que un test de unidad no ve y
que una captura de pantalla enseña enseguida.
