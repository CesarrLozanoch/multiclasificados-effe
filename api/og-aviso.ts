// Vista previa del enlace de un aviso (WhatsApp, Facebook, Telegram, X…).
//
// EL PORQUÉ. La app es una SPA: el servidor devuelve siempre el mismo
// `index.html` y es el navegador quien pinta el aviso. Pero los que generan la
// tarjeta de vista previa NO EJECUTAN JAVASCRIPT: solo leen las etiquetas
// <meta> del HTML que reciben. Por eso, compartieras el aviso que compartieras,
// WhatsApp enseñaba siempre lo mismo (y encima era una captura heredada de
// Lovable alojada en un bucket ajeno).
//
// LO QUE HACE. Atiende /aviso/:id, consulta ese aviso y devuelve el MISMO
// index.html pero con las etiquetas og: rellenas con su foto, su título y su
// precio. El navegador de una persona recibe exactamente la app de siempre —no
// se sirve una versión distinta a los buscadores, que además de tramposo es
// frágil—; lo único que cambia son unas etiquetas de la cabecera.
//
// Se cachea en el CDN de Vercel, así que un aviso muy compartido se resuelve
// sin volver a consultar la base de datos.

// Runtime Edge: es el que usa las APIs web estándar (`Request`/`Response`),
// que es como está escrito este manejador. En el runtime de Node por defecto
// Vercel esperaba otra firma y la función reventaba en cada llamada
// (FUNCTION_INVOCATION_FAILED), tumbando TODAS las fichas de aviso.
// Además encaja: esto solo hace un fetch y manipula texto.
export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "";

interface Aviso {
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  location: string | null;
  image_url: string | null;
  status: string | null;
  /** ISO alpha-2. Distingue una oferta de otra cuando el mismo producto se
   *  anuncia en varios países. */
  country: string | null;
}

/** Escapa lo que va dentro de un atributo HTML. El título lo escribe el
 *  anunciante: sin esto, unas comillas romperían la etiqueta. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Recorta a `max` sin cortar una palabra por la mitad. */
function resumir(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max);
  const ultimo = corte.lastIndexOf(" ");
  return `${ultimo > max * 0.6 ? corte.slice(0, ultimo) : corte}…`;
}

function precio(a: Aviso): string {
  // Mismo formato que la app (dos decimales y miles): la vista previa de
  // WhatsApp decía "S/ 24,000" y la ficha "S/ 24,000.00" para el mismo aviso.
  // No se importa `formatPrecioAviso` porque esto corre en el servidor de
  // Vercel, fuera del bundle de la aplicación.
  if (typeof a.price !== "number" || a.price <= 0) return "";
  const n = a.price.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return a.currency === "USD" ? `US$ ${n}` : `S/ ${n}`;
}

/**
 * Sustituye el contenido de una etiqueta <meta> ya existente. Se reemplaza en
 * vez de añadir porque los lectores de vista previa se quedan con la PRIMERA
 * que encuentran: añadirlas al final no serviría de nada.
 */
function ponerMeta(html: string, atributo: "property" | "name", clave: string, valor: string): string {
  const re = new RegExp(`(<meta\\s+${atributo}=["']${clave}["']\\s+content=["'])[^"']*(["'])`, "i");
  if (re.test(html)) return html.replace(re, `$1${escapar(valor)}$2`);
  return html.replace(
    /<\/head>/i,
    `  <meta ${atributo}="${clave}" content="${escapar(valor)}" />\n</head>`,
  );
}

/**
 * Deja puesto el <link rel="canonical"> de la página.
 *
 * Dice cuál es LA dirección buena de este aviso. Hace falta porque la misma
 * ficha se alcanza por muchas direcciones distintas: con `?utm_source=` de una
 * campaña, con el `?fbclid=` que añade Facebook al compartir, con y sin `www`.
 * Para un buscador eso son páginas distintas con el mismo contenido, y el valor
 * se reparte entre todas en vez de acumularse en una.
 */
function ponerCanonical(html: string, enlace: string): string {
  const re = /<link\s+rel=["']canonical["'][^>]*>/i;
  const etiqueta = `<link rel="canonical" href="${escapar(enlace)}" />`;
  if (re.test(html)) return html.replace(re, etiqueta);
  return html.replace(/<\/head>/i, `  ${etiqueta}\n</head>`);
}

/**
 * Datos estructurados (JSON-LD) del aviso.
 *
 * ── PARA QUÉ ─────────────────────────────────────────────────────────────────
 *
 * Le dice a un buscador QUÉ es esta página en vez de dejar que lo adivine del
 * texto: que es un producto, a qué precio, en qué moneda y en qué sitio. Es lo
 * que permite que el precio salga directamente en los resultados.
 *
 * Aquí importa más de lo normal. El mismo producto está anunciado en decenas de
 * países con el mismo título, la misma descripción y la misma foto: para Google
 * eso son páginas casi idénticas y se queda con una. Marcando cada una como una
 * OFERTA con su lugar, la diferencia deja de estar solo en una palabra del
 * título.
 *
 * ── POR QUÉ ESTE <script> SÍ PUEDE IR EN LÍNEA ───────────────────────────────
 *
 * Nuestra CSP prohíbe los scripts en línea, y por eso la etiqueta de Google vive
 * en un fichero aparte (public/gtag-init.js). Este es la excepción: con
 * `type="application/ld+json"` el navegador NO lo ejecuta —es un bloque de
 * datos, no código— así que `script-src` no lo bloquea. Comprobado en el sitio
 * ya desplegado: ni una violación en consola.
 */
function ponerJsonLd(html: string, datos: Record<string, unknown>): string {
  // Lo único que puede romper esto es un `</script>` dentro de un texto que
  // escribe el anunciante: cerraría la etiqueta antes de tiempo y el resto del
  // JSON se pintaría como HTML. Escapando `<` deja de ser posible.
  const json = JSON.stringify(datos).replace(/</g, "\\u003c");
  return html.replace(
    /<\/head>/i,
    `  <script type="application/ld+json">${json}</script>\n</head>`,
  );
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";

  // El index.html real del despliegue: así la app servida es SIEMPRE la misma,
  // se toque esto o no.
  const base = await fetch(new URL("/index.html", url.origin));
  let html = await base.text();

  const responder = () =>
    new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // El CDN guarda la respuesta 10 min y sigue sirviendo la vieja mientras
        // refresca: un aviso muy compartido no golpea la base de datos.
        "cache-control": "public, s-maxage=600, stale-while-revalidate=86400",
      },
    });

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id) || !SUPABASE_URL || !SUPABASE_ANON_KEY) return responder();

  let aviso: Aviso | null = null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/listing_cards?id=eq.${id}` +
        `&select=title,description,price,currency,location,image_url,status,country&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    if (r.ok) aviso = ((await r.json()) as Aviso[])[0] ?? null;
  } catch {
    /* Si la consulta falla, se devuelve la app con las etiquetas genéricas: una
       vista previa sosa es mejor que un enlace roto. */
  }

  // Un aviso inexistente, en borrador o vencido no se anuncia con su ficha.
  if (!aviso || aviso.status !== "active") return responder();

  const partes = [precio(aviso), aviso.location ?? ""].filter(Boolean).join(" · ");
  const titulo = aviso.title?.trim()
    ? `${aviso.title.trim()}${partes ? ` — ${partes}` : ""}`
    : "Aviso en eFFe Multiclasificados";
  const descripcion = aviso.description?.trim()
    ? resumir(aviso.description, 200)
    : "Míralo en eFFe Multiclasificados.";
  const enlace = `${url.origin}/aviso/${id}`;

  html = ponerMeta(html, "property", "og:title", titulo);
  html = ponerMeta(html, "property", "og:description", descripcion);
  html = ponerMeta(html, "property", "og:url", enlace);
  html = ponerMeta(html, "property", "og:type", "article");
  html = ponerMeta(html, "name", "twitter:title", titulo);
  html = ponerMeta(html, "name", "twitter:description", descripcion);
  // La descripción NORMAL, distinta de `og:description`. Las `og:` las leen
  // WhatsApp y las redes para pintar su tarjeta; ESTA es la que usa un buscador
  // como resumen en sus resultados. Sin ella el aviso salía en Google descrito
  // con el texto genérico de la plataforma, igual que todos.
  //
  // Y lleva el LUGAR delante, que en las `og:` no hace falta —ahí el título va
  // justo encima—. Aquí sí, por un motivo concreto de este sitio: el mismo
  // producto está anunciado en decenas de países con el mismo texto, y sin el
  // lugar las fichas se leen idénticas en la lista de resultados.
  const lugar = aviso.location?.trim();
  html = ponerMeta(
    html,
    "name",
    "description",
    lugar ? `${lugar}. ${descripcion}` : descripcion,
  );
  html = ponerCanonical(html, enlace);

  // Sin foto se deja la imagen por defecto del sitio: una tarjeta con un hueco
  // roto se ve peor que una con el logo.
  if (aviso.image_url) {
    html = ponerMeta(html, "property", "og:image", aviso.image_url);
    html = ponerMeta(html, "name", "twitter:image", aviso.image_url);
  }
  // Y el <title>, que es lo que se ve en la pestaña y lo que usan algunos
  // lectores cuando no encuentran og:title.
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapar(titulo)}</title>`);

  // Los datos estructurados. Los campos `undefined` se caen solos al
  // serializar, así que lo que no tenemos no aparece — mejor que declararlo
  // vacío, que Google lo señala como error.
  const precioNum = typeof aviso.price === "number" && aviso.price > 0 ? aviso.price : null;
  const sitio = (lugar || aviso.country)
    ? {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: lugar || undefined,
          addressCountry: aviso.country || undefined,
        },
      }
    : undefined;
  html = ponerJsonLd(html, {
    "@context": "https://schema.org",
    "@type": "Product",
    name: aviso.title?.trim() || "Aviso",
    description: descripcion,
    image: aviso.image_url || undefined,
    url: enlace,
    offers: precioNum
      ? {
          "@type": "Offer",
          price: precioNum.toFixed(2),
          priceCurrency: (aviso.currency || "PEN").toUpperCase(),
          // Un clasificado está disponible mientras el aviso siga activo, y
          // aquí ya se ha comprobado que lo está.
          availability: "https://schema.org/InStock",
          url: enlace,
          // El lugar es lo que distingue una oferta de otra cuando el mismo
          // producto se anuncia en decenas de países.
          availableAtOrFrom: sitio,
        }
      : undefined,
  });

  return responder();
}
