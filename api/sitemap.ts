// Mapa del sitio (sitemap.xml) para los buscadores.
//
// EL PORQUÉ. La app es una SPA: todas las direcciones devuelven el mismo
// `index.html` y las rutas de verdad solo existen dentro del JavaScript. Un
// buscador que llega a la portada ve un puñado de enlaces y poco más — no tiene
// forma de descubrir los avisos, que es justamente el contenido que vale.
//
// El sitemap es la respuesta a eso: una lista explícita de lo que hay y de
// cuándo cambió. No garantiza que se indexe (eso lo decide Google), pero sin él
// el descubrimiento depende de que alguien enlace cada aviso desde fuera.
//
// Se genera al vuelo y NO se guarda un fichero: los avisos se publican y vencen
// todos los días, y un sitemap estático estaría mintiendo desde el día
// siguiente. Enviar a un buscador a avisos vencidos (404 o página vacía) es peor
// que no enviarlo, porque gasta el presupuesto de rastreo del sitio.
//
// Runtime Edge, por lo mismo que `og-aviso`: solo hace un fetch y arma texto.
export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "";
const SITIO = "https://www.coleffe.com";

/** Tope del formato: 50.000 direcciones por fichero. Muy lejos, pero acotado. */
const MAX_AVISOS = 20000;

/**
 * Páginas fijas, con la importancia relativa que tienen entre ellas.
 *
 * `priority` solo compara páginas DE ESTE sitio: no sirve para competir con
 * nadie. La portada y el buscador son la puerta de entrada; lo legal existe
 * porque tiene que existir, no para atraer visitas.
 *
 * NO se listan: /dashboard/*, /admin, /auth, /pay ni /reset-password. Son
 * privadas o no tienen contenido que indexar, y además están bloqueadas en
 * robots.txt.
 */
const FIJAS: Array<{ ruta: string; cambia: string; prioridad: string }> = [
  { ruta: "/", cambia: "daily", prioridad: "1.0" },
  { ruta: "/buscar", cambia: "daily", prioridad: "0.9" },
  { ruta: "/acerca-de", cambia: "monthly", prioridad: "0.5" },
  { ruta: "/trabaje-con-nosotros", cambia: "weekly", prioridad: "0.5" },
  { ruta: "/terminos", cambia: "yearly", prioridad: "0.3" },
  { ruta: "/privacidad", cambia: "yearly", prioridad: "0.3" },
];

interface Fila {
  id: string;
  published_at: string | null;
  created_at: string | null;
}

/** Un `<loc>` va dentro de XML: los `&` de una URL romperían el documento. */
function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** `lastmod` en el formato que pide el estándar (W3C Datetime). */
function fecha(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function entrada(ruta: string, cambia: string, prioridad: string, lastmod?: string | null): string {
  return [
    "  <url>",
    `    <loc>${escaparXml(SITIO + ruta)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    `    <changefreq>${cambia}</changefreq>`,
    `    <priority>${prioridad}</priority>`,
    "  </url>",
  ].filter(Boolean).join("\n");
}

export default async function handler(): Promise<Response> {
  let avisos: Fila[] = [];

  // Si la base no contesta, se devuelve el sitemap con las páginas fijas en vez
  // de un error: un 500 aquí hace que el buscador marque el sitemap como roto y
  // deje de pedirlo durante días. Media lista es mejor que ninguna.
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const url =
        `${SUPABASE_URL}/rest/v1/listing_cards` +
        `?select=id,published_at,created_at` +
        `&status=eq.active` +
        `&order=published_at.desc` +
        `&limit=${MAX_AVISOS}`;
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (res.ok) avisos = (await res.json()) as Fila[];
    } catch {
      /* se queda con las fijas */
    }
  }

  const cuerpo = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...FIJAS.map((f) => entrada(f.ruta, f.cambia, f.prioridad)),
    // Un aviso cambia poco una vez publicado, pero vence: `weekly` invita a
    // volver a mirarlo sin pedir que lo rastreen a diario.
    ...avisos.map((a) =>
      entrada(`/aviso/${a.id}`, "weekly", "0.8", fecha(a.published_at ?? a.created_at)),
    ),
    "</urlset>",
  ].join("\n");

  return new Response(cuerpo, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Una hora en el CDN, y hasta un día sirviendo el anterior mientras se
      // regenera: un buscador no necesita el minuto exacto, y así una ráfaga de
      // peticiones no se convierte en una ráfaga de consultas a la base.
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
