// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Que los buscadores puedan DESCUBRIR los avisos.
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
 *
 * La app es una SPA: todas las direcciones devuelven el mismo `index.html` y las
 * rutas de verdad solo existen dentro del JavaScript. Un buscador que llega a la
 * portada ve unos pocos enlaces y no tiene forma de llegar a los avisos, que son
 * justamente el contenido que vale. El sitemap es la lista explícita de lo que
 * hay, y el `Sitemap:` de robots.txt es lo que le dice dónde está esa lista.
 *
 * Nada de esto se ve en pantalla, y por eso puede romperse durante meses sin que
 * nadie lo note: el sitio funciona igual, simplemente deja de aparecer.
 */

const raiz = path.resolve(__dirname, "../..");
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");

const ROBOTS = leer("public/robots.txt");
const SITEMAP = leer("api/sitemap.ts");
const VERCEL = JSON.parse(leer("vercel.json")) as {
  rewrites?: Array<{ source: string; destination: string }>;
};
const RUTAS = leer("src/App.tsx");

describe("robots.txt", () => {
  it("🔴 apunta al sitemap", () => {
    // Sin esta línea, el sitemap existe pero nadie lo pide: hay que darlo de
    // alta a mano en cada buscador.
    expect(ROBOTS).toMatch(/^Sitemap:\s*https:\/\/www\.coleffe\.com\/sitemap\.xml$/m);
  });

  it("no manda a rastrear lo que está detrás de una sesión", () => {
    // Un buscador ahí solo encontraría el login, y gasta en eso el tiempo que
    // debería dedicar a los avisos.
    for (const zona of ["/dashboard/", "/admin", "/auth", "/pay"]) {
      expect(ROBOTS, `falta Disallow para ${zona}`).toContain(`Disallow: ${zona}`);
    }
  });

  it("pero SÍ deja pasar a los que pintan las vistas previas", () => {
    // WhatsApp, Facebook y X no indexan: leen las <meta> para la tarjeta del
    // enlace compartido. Bloquearlos dejaría los enlaces sin foto ni título.
    for (const bot of ["Twitterbot", "facebookexternalhit", "WhatsApp"]) {
      expect(ROBOTS).toContain(`User-agent: ${bot}`);
    }
  });

  it("y la portada y el buscador siguen abiertos", () => {
    expect(ROBOTS).toMatch(/User-agent: \*/);
    expect(ROBOTS).not.toMatch(/^Disallow:\s*\/$/m); // bloquear el sitio entero
  });
});

describe("el sitemap se sirve de verdad", () => {
  it("🔴 /sitemap.xml llega a la función, no al index.html", () => {
    const rw = VERCEL.rewrites ?? [];
    const suyo = rw.find((r) => r.source === "/sitemap.xml");
    expect(suyo, "falta la reescritura de /sitemap.xml").toBeTruthy();
    expect(suyo!.destination).toBe("/api/sitemap");

    // Y va ANTES del comodín, que si no se lo traga.
    const iSuyo = rw.indexOf(suyo!);
    const iComodin = rw.findIndex((r) => r.destination.includes("index.html"));
    expect(iSuyo).toBeLessThan(iComodin);

    // El comodín además tiene que excluirlo explícitamente.
    expect(rw[iComodin].source).toContain("sitemap");
  });
});

describe("qué lleva el sitemap", () => {
  it("solo avisos ACTIVOS", () => {
    // Mandar a un buscador a avisos vencidos gasta su presupuesto de rastreo y
    // le enseña páginas vacías.
    expect(SITEMAP).toContain("status=eq.active");
  });

  it("no lista ninguna zona privada", () => {
    for (const zona of ["/dashboard", "/admin", "/auth", "/pay", "/reset-password"]) {
      // Se busca como ruta entre comillas, para no chocar con los comentarios.
      expect(SITEMAP, `${zona} no debería estar en el sitemap`).not.toContain(`ruta: "${zona}"`);
    }
  });

  it("las páginas fijas que lista existen de verdad en la app", () => {
    // Un sitemap que apunta a una ruta inventada manda al buscador a la pantalla
    // de "no encontrado". Se comprueba contra las rutas declaradas.
    const fijas = [...SITEMAP.matchAll(/ruta:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(fijas.length).toBeGreaterThan(3);
    for (const ruta of fijas) {
      if (ruta === "/") continue;
      expect(RUTAS, `el sitemap lista ${ruta} y esa ruta no existe`).toContain(`path="${ruta}"`);
    }
  });

  it("si la base no contesta, devuelve las fijas en vez de un error", () => {
    // Un 500 hace que el buscador marque el sitemap como roto y deje de pedirlo
    // durante días. Media lista es mejor que ninguna.
    expect(SITEMAP).toMatch(/catch\s*\{/);
    expect(SITEMAP).not.toContain("status: 500");
  });

  it("se declara como XML y se cachea en el CDN", () => {
    expect(SITEMAP).toContain("application/xml");
    expect(SITEMAP).toContain("s-maxage=");
  });
});

describe("la ficha de un aviso se presenta bien en un buscador", () => {
  const OG = leer("api/og-aviso.ts");

  it("🔴 pone `description`, no solo las `og:`", () => {
    // Las `og:` las leen WhatsApp y las redes; el resumen de Google sale de
    // `<meta name="description">`. Sin ella todos los avisos salían descritos
    // con el texto genérico de la plataforma.
    // Sin atarse al formato: la llamada está repartida en varias líneas.
    expect(OG).toMatch(/"name",\s*"description"/);
  });

  it("la descripción de resultados lleva el LUGAR delante", () => {
    // El mismo producto está anunciado en decenas de países con el mismo texto.
    // Sin el lugar, las fichas se leen idénticas en la lista de resultados y
    // Google se queda con una.
    expect(OG).toMatch(/lugar \? `\$\{lugar\}\. \$\{descripcion\}`/);
  });

  it("🔴 marca el aviso como Product con su Offer, precio y lugar", () => {
    // Es lo que permite que el precio salga en los resultados, y lo que
    // distingue una oferta de otra cuando el producto es el mismo.
    expect(OG).toContain("application/ld+json");
    expect(OG).toContain('"@type": "Product"');
    expect(OG).toContain('"@type": "Offer"');
    expect(OG).toContain("priceCurrency");
    expect(OG).toContain("availableAtOrFrom");
    expect(OG).toContain("addressCountry");
  });

  it("y el JSON no se puede escapar de su etiqueta", () => {
    // Un `</script>` dentro de un texto que escribe el anunciante cerraría la
    // etiqueta antes de tiempo y el resto del JSON se pintaría como HTML.
    expect(OG).toContain("JSON.stringify(datos).replace");
    expect(OG).toContain("u003c");
  });

  it("y un canonical, para que las variantes de la URL no se repartan el valor", () => {
    // El mismo aviso se alcanza con ?utm_source=, con el ?fbclid= que añade
    // Facebook, con y sin www. Para un buscador son páginas distintas.
    expect(OG).toContain("ponerCanonical");
    expect(OG).toContain('rel="canonical"');
  });
});
