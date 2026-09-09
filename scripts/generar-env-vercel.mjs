/**
 * Genera `.env.vercel`: las variables que hay que subir a Vercel, con sus
 * valores tomados del `.env` local y con la explicación de cada una al lado.
 *
 *   node scripts/generar-env-vercel.mjs
 *
 * ── POR QUÉ UN SCRIPT Y NO UN FICHERO ESCRITO A MANO ─────────────────────────
 *
 * El fichero resultante lleva valores reales, así que **no puede estar en git**
 * (`.gitignore` ignora `.env.*`). Lo que sí puede versionarse es esto: la LISTA
 * de qué necesita Vercel y por qué.
 *
 * Y esa lista se desincroniza sola. Cuando alguien añade un `import.meta.env.
 * VITE_LO_QUE_SEA` y funciona en su máquina —porque su `.env` ya lo tiene—, en
 * producción sale vacío y la funcionalidad simplemente no aparece. Teniendo la
 * lista aquí, con `--verificar` se comprueba que no falta ninguna.
 *
 * ── NO PONER AQUÍ NINGÚN SECRETO ─────────────────────────────────────────────
 *
 * Todo lo que empieza por `VITE_` se empaqueta en el JavaScript que descarga el
 * navegador: no hay forma de que una variable de Vercel sea secreta. Las claves
 * de servidor (Izipay, Factiliza, Resend, service_role) van como *secrets* de
 * las Edge Functions de Supabase.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Lo que Vercel necesita.
 *
 *   api    — además de la web, la leen las funciones de `api/`
 *   aviso  — algo que hay que saber antes de darla por buena
 */
const VARS = [
  {
    clave: "VITE_SUPABASE_URL",
    api: true,
    nota: "URL del proyecto de Supabase.",
  },
  {
    clave: "VITE_SUPABASE_ANON_KEY",
    api: true,
    nota:
      "Clave anónima de Supabase. Es pública por diseño: lo que protege los datos\n" +
      "# es la RLS de cada tabla, no el secreto de esta clave.",
  },
  {
    clave: "VITE_PUBLIC_SITE_URL",
    nota: "Dominio público. Es la base de los enlaces de los correos y de la página de pago.",
  },
  {
    clave: "VITE_IZIPAY_PUBLIC_KEY",
    nota: "Clave PÚBLICA de Izipay (Back Office → Configuración › Tienda › Claves de API REST).",
    aviso:
      "Si el valor lleva «testpublickey» es la clave de PRUEBAS, y es la que hay hoy en\n" +
      "# producción (comprobado el 9-sep-2026 leyéndola del bundle de coleffe.com).\n" +
      "#\n" +
      "# Los cobros son REALES de todos modos: quién cobra lo decide la clave del\n" +
      "# SERVIDOR, que vive como secret en Supabase y esa sí es de producción. Esta solo\n" +
      "# inicializa el formulario en el navegador. Conviene cambiarla por la de\n" +
      "# producción del Back Office, pero no está bloqueando nada.",
  },
  {
    clave: "VITE_IZIPAY_STATIC_ENDPOINT",
    nota: "Endpoint del formulario incrustado de Izipay.",
  },
  {
    clave: "VITE_GOOGLE_MAPS_API_KEY",
    nota: "Maps JavaScript API + Places (New).",
    aviso:
      "Tiene que estar restringida por dominio en Google Cloud — y lo está (comprobado:\n" +
      "# el web service de Geocoding la rechaza, que es exactamente lo que hace con las\n" +
      "# llaves restringidas por referer; por eso el geocodificador va por el SDK).\n" +
      "# Si algún día se sustituye por otra, restringirla ANTES de ponerla aquí: sin\n" +
      "# restringir, cualquiera puede usarla y la factura es nuestra.",
  },
  {
    clave: "VITE_GOOGLE_MAPS_MAP_ID",
    nota:
      "Map ID de Google: define el estilo del mapa y hace falta para los marcadores\n" +
      "# nuevos. Sin él se usa un mapa de demostración con marca de agua.",
  },
  {
    clave: "VITE_HCAPTCHA_SITE_KEY",
    nota: "Sitekey de hCaptcha para el login del personal.",
  },
];

/** Opcionales: no hace falta ponerlas, pero conviene saber que existen. */
const OPCIONALES = [
  {
    clave: "VITE_PWA",
    nota:
      "Interruptor de emergencia de la PWA. Con `off` no se registra el service\n" +
      "# worker y además se limpia el que hubiera instalado. Solo si hay que apagarla.",
    ejemplo: "off",
  },
];

const CABECERA = `# ═══════════════════════════════════════════════════════════════════════════
#  Variables de entorno para Vercel — eFFe Multiclasificados
#
#  Generado por scripts/generar-env-vercel.mjs — no lo edites a mano.
#
#  CÓMO SE SUBEN
#    Vercel → el proyecto → Settings → Environment Variables → Import .env
#    Se sube este fichero y se marcan los tres entornos:
#    Production, Preview y Development.
#
#    Después hay que REDESPLEGAR. Vercel no reconstruye solo, y estas variables
#    se resuelven al construir: cambiarlas no afecta al sitio ya publicado hasta
#    que se vuelve a construir.
#
#  ESTE FICHERO NO VA A GIT (\`.gitignore\` ignora \`.env.*\`)
#    Todas estas variables acaban dentro del JavaScript que descarga el
#    navegador, así que no son secretas. Pero la llave de Google Maps se puede
#    usar desde otro sitio y la factura la paga este proyecto, así que tampoco
#    conviene repartirlo por ahí.
#
#  LO QUE NO ESTÁ AQUÍ, Y NO DEBE ESTARLO
#    La contraseña de Izipay, su clave HMAC, el token de Factiliza, la API key
#    de Resend y la \`service_role\` de Supabase. Esas van como *secrets* de las
#    Edge Functions de Supabase, NUNCA en Vercel: cualquier variable que empiece
#    por VITE_ se empaqueta en el bundle y queda a la vista de cualquiera.
# ═══════════════════════════════════════════════════════════════════════════
`;

/** Lee un `.env` sencillo: `CLAVE=valor`, sin comillas y sin comentarios. */
function leerEnv(fichero) {
  if (!fs.existsSync(fichero)) return {};
  const out = {};
  for (const linea of fs.readFileSync(fichero, "utf8").split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * Todas las `VITE_*` que el código pide de verdad.
 *
 * Se busca en `src/` y en `api/` porque son los dos sitios donde se leen: el
 * bundle con `import.meta.env` y las funciones de Vercel con `process.env`.
 */
function usadasEnElCodigo() {
  const encontradas = new Set();
  const mira = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) mira(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
        const txt = fs.readFileSync(p, "utf8");
        for (const m of txt.matchAll(/(?:import\.meta\.env|process\.env)\??\.(VITE_[A-Z0-9_]+)/g)) {
          encontradas.add(m[1]);
        }
      }
    }
  };
  mira(path.join(RAIZ, "src"));
  mira(path.join(RAIZ, "api"));
  return encontradas;
}

// ── Comprobación: ¿la lista de arriba sigue completa? ────────────────────────
const declaradas = new Set([...VARS, ...OPCIONALES].map((v) => v.clave));
const sinDeclarar = [...usadasEnElCodigo()].filter((v) => !declaradas.has(v)).sort();

if (sinDeclarar.length > 0) {
  console.error("\n⚠️  El código usa variables que esta lista no contempla:\n");
  for (const v of sinDeclarar) console.error("      " + v);
  console.error(
    "\n   Si hacen falta en producción, añádelas a VARS en este script. Si no se\n" +
    "   añaden, en Vercel saldrán vacías y la funcionalidad que dependa de ellas\n" +
    "   no aparecerá — sin dar ningún error.\n",
  );
  if (process.argv.includes("--verificar")) process.exit(1);
}

if (process.argv.includes("--verificar")) {
  console.log(`✓ Las ${declaradas.size} variables declaradas cubren lo que usa el código.`);
  process.exit(0);
}

// ── Generar ─────────────────────────────────────────────────────────────────
const valores = leerEnv(path.join(RAIZ, ".env"));
const lineas = [CABECERA];

for (const { clave, api, nota, aviso } of VARS) {
  lineas.push("# " + nota);
  if (api) lineas.push("# La leen la web Y las funciones de api/ (og-aviso, sitemap, pais).");
  if (aviso) lineas.push("#", "# ⚠️  " + aviso);
  lineas.push(`${clave}=${valores[clave] ?? ""}`, "");
}

lineas.push("# ── Opcionales: no hace falta ponerlas ─────────────────────────────────────");
for (const { clave, nota, ejemplo } of OPCIONALES) {
  lineas.push("# " + nota, `# ${clave}=${ejemplo}`, "");
}

const destino = path.join(RAIZ, ".env.vercel");
fs.writeFileSync(destino, lineas.join("\n"), "utf8");

const faltan = VARS.filter((v) => !valores[v.clave]).map((v) => v.clave);
console.log(`✓ Escrito .env.vercel con ${VARS.length} variables.`);
if (faltan.length) {
  console.log(`⚠️  Sin valor en tu .env local: ${faltan.join(", ")}`);
  console.log("   Están en el fichero, pero vacías: rellénalas antes de importarlas.");
}
