// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * La etiqueta de Google Ads, y las tres formas de romperla sin enterarse.
 *
 * ── LO QUE VIGILA ────────────────────────────────────────────────────────────
 *
 * Una etiqueta de medición rota NO da error: la página funciona igual, nadie ve
 * nada raro, y simplemente deja de contar conversiones. El cliente lo descubre
 * semanas después mirando por qué su campaña no reporta ventas. Por eso vale la
 * pena fijarla con pruebas aunque sean tres líneas de configuración.
 *
 * Las tres formas de romperla:
 *
 *   1. Quitar `googletagmanager.com` de `script-src` (o «endurecer» la CSP sin
 *      mirar qué había). El navegador bloquea el script y no mide nada.
 *   2. Pegar el fragmento de Google tal cual en index.html. Su segundo bloque es
 *      EN LÍNEA, y nuestra CSP no admite `unsafe-inline`: bloqueado.
 *   3. «Arreglar» lo anterior añadiendo `unsafe-inline`, que es cambiar una
 *      etiqueta de medición por un agujero de seguridad en toda la web.
 */

const raiz = path.resolve(__dirname, "../..");
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");

const HTML = leer("index.html");
const INIT = leer("public/gtag-init.js");
const VERCEL = JSON.parse(leer("vercel.json")) as {
  headers?: Array<{ headers?: Array<{ key: string; value: string }> }>;
};

/** Las directivas de una política, indexadas por nombre. */
function directivas(politica: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const trozo of politica.split(";")) {
    const [nombre, ...resto] = trozo.trim().split(/\s+/);
    if (nombre) m.set(nombre.toLowerCase(), resto.join(" "));
  }
  return m;
}

const POLITICAS = (VERCEL.headers ?? [])
  .flatMap((g) => g.headers ?? [])
  .filter((h) => /^content-security-policy/i.test(h.key))
  .map((h) => ({ nombre: h.key, d: directivas(h.value) }));

const ID = "AW-18417687234";

describe("la etiqueta está puesta", () => {
  it("el HTML la carga como fichero externo, no en línea", () => {
    expect(HTML).toContain('src="/gtag-init.js"');
  });

  it("🔴 en index.html NO hay ningún <script> en línea", () => {
    // La regla de la casa, y la que de verdad protege: con `script-src` sin
    // `unsafe-inline`, cualquier <script> sin `src` queda bloqueado. Pegar aquí
    // el fragmento que entrega Google —o cualquier otro— es exactamente el
    // error que esta prueba existe para cazar.
    //
    // Se mira la etiqueta de apertura y no el texto suelto: el identificador de
    // la cuenta aparece en un comentario del HTML, y un comentario es
    // documentación, no código que se ejecute.
    // Fuera los comentarios ANTES de buscar: este mismo archivo documenta el
    // problema escribiendo «<script> en línea», y un comentario no se ejecuta.
    const sinComentarios = HTML.replace(/<!--[\s\S]*?-->/g, "");
    const aperturas = sinComentarios.match(/<script(\s[^>]*)?>/gi) ?? [];
    const enLinea = aperturas.filter((t) => !/\ssrc\s*=/i.test(t));
    expect(enLinea, "hay un <script> en línea: la CSP lo bloqueará").toEqual([]);
  });

  it("el fichero lleva el identificador de la cuenta", () => {
    expect(INIT).toContain(ID);
    expect(INIT).toContain("googletagmanager.com/gtag/js");
  });

  it("prepara `dataLayer` ANTES de pedir el script", () => {
    // Si se pidiera primero y se encolara después, un `config` podría perderse
    // en la carrera. gtag.js lee la cola que ya encuentre.
    const iCola = INIT.indexOf("dataLayer");
    const iScript = INIT.indexOf("createElement");
    expect(iCola).toBeGreaterThan(-1);
    expect(iCola).toBeLessThan(iScript);
  });
});

describe("solo mide el sitio de verdad", () => {
  it("no se carga fuera de coleffe.com", () => {
    // Localhost, las vistas previas de Vercel y el APK no pueden contar como
    // conversiones: con esos números se decide cuánto se gasta en publicidad.
    expect(INIT).toContain("coleffe.com");
    expect(INIT).toMatch(/if\s*\(!esElSitio\)\s*return/);
  });
});

describe("la CSP la deja pasar, sin aflojar lo demás", () => {
  for (const { nombre } of POLITICAS) {
    it(`${nombre}: permite googletagmanager`, () => {
      const d = POLITICAS.find((p) => p.nombre === nombre)!.d;
      expect(d.get("script-src") ?? "").toContain("https://www.googletagmanager.com");
    });

    it(`${nombre}: NO añade unsafe-inline para conseguirlo`, () => {
      // La tentación al ver la etiqueta bloqueada. Sería cambiar una medición
      // por la puerta abierta a cualquier script inyectado en la página.
      const d = POLITICAS.find((p) => p.nombre === nombre)!.d;
      expect(d.get("script-src") ?? "").not.toContain("unsafe-inline");
    });
  }

  it("y los destinos a los que gtag salta para las conversiones", () => {
    // Google Ads no se queda en googletagmanager: redirige a googleadservices y
    // a doubleclick para registrar la conversión. Sin ellos se mide a medias.
    const d = POLITICAS.find((p) => /report-only/i.test(p.nombre))!.d;
    const conecta = d.get("connect-src") ?? "";
    for (const destino of [
      "https://www.googletagmanager.com",
      "https://www.googleadservices.com",
      "https://googleads.g.doubleclick.net",
    ]) {
      expect(conecta, `falta ${destino} en connect-src`).toContain(destino);
    }
  });
});
