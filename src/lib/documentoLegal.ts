// El documento legal (Términos y Condiciones + Política de Privacidad), ahora
// editable desde el panel.
//
// ── POR QUÉ NO SE GUARDA HTML, QUE ES LA PREGUNTA OBVIA ──────────────────────
//
// Un editor de texto enriquecido que guarda HTML es el camino corto, y aquí es
// el equivocado. Esta página la abre CUALQUIERA sin sesión —incluido el revisor
// de Google Play, que la pide en cada actualización de la ficha—, y guardar
// HTML de un formulario obliga a sanearlo antes de pintarlo. Un solo hueco en
// ese saneado es un `<script>` almacenado en la página legal de la empresa,
// servido a todo el que entre.
//
// Así que se guarda una ESTRUCTURA, no marcado: una lista de bloques, y cada
// bloque con su texto partido en fragmentos. El que pinta construye elementos
// de React y no usa `dangerouslySetInnerHTML` en ningún punto, de modo que
// nadie puede producir una etiqueta ni queriendo. Es exactamente el criterio
// que ya se tomó para las descripciones de los avisos (`textoConFormato.ts`),
// y esto reutiliza sus fragmentos en vez de inventar otros.
//
// Lo que se pierde: no se pueden pegar tablas ni imágenes. Para un contrato de
// dieciséis cláusulas eso no es una limitación, es lo que hay que querer.
//
// ── LA NOTACIÓN DE TEXTO ─────────────────────────────────────────────────────
//
// `parsearDocumento` convierte un texto con marcas sencillas en bloques. NO es
// el formato de guardado —en la base va la estructura ya resuelta— y el panel
// tampoco la usa: sirve para escribir el documento de fábrica de una vez, en
// algo que se lee, en lugar de sesenta objetos literales a mano.
import type { Fragmento, TextoConFormato } from "@/lib/textoConFormato";

/**
 * Los cinco tipos de bloque que tiene el documento. Deliberadamente pocos: cada
 * tipo nuevo es una decisión más que tomar al escribir una cláusula, y un
 * contrato no necesita más que esto.
 *
 *   epigrafe — el rótulo pequeño de arriba del todo
 *   titulo   — encabezado de cláusula («1. Objeto y alcance del servicio»)
 *   parrafo  — texto corrido
 *   vinheta  — un punto de una lista
 *   nota     — la letra pequeña del final, en cursiva
 */
export type TipoBloque = "epigrafe" | "titulo" | "parrafo" | "vinheta" | "nota";

export const TIPOS_DE_BLOQUE: { tipo: TipoBloque; nombre: string }[] = [
  { tipo: "titulo", nombre: "Título de cláusula" },
  { tipo: "parrafo", nombre: "Párrafo" },
  { tipo: "vinheta", nombre: "Viñeta" },
  { tipo: "epigrafe", nombre: "Epígrafe" },
  { tipo: "nota", nombre: "Nota al pie" },
];

export interface Bloque {
  tipo: TipoBloque;
  texto: TextoConFormato;
  /**
   * Solo en los títulos, y solo en uno: marca la cláusula de datos personales,
   * que es a la que baja `/privacidad`.
   *
   * Existe porque esa dirección es la que se le entrega a Google Play como
   * política de privacidad, y tiene que caer en la cláusula correcta. Buscarla
   * por el texto del título —«la que diga datos personales»— parecía más
   * cómodo, pero hay dos cláusulas que lo dicen y el cliente puede reescribir
   * cualquiera de las dos: una marca explícita no se rompe al editar.
   */
  ancla?: "datos-personales";
}

export type Documento = Bloque[];

/** Tope de bloques. Un contrato de esta clase anda por los sesenta. */
export const MAX_BLOQUES = 400;

/** Tope de caracteres por bloque. */
export const MAX_TEXTO = 4000;

// ─────────────────────────────────────────────────────────────────────────────
//  Normalizar lo que venga de la base
// ─────────────────────────────────────────────────────────────────────────────

const ES_TIPO = (v: unknown): v is TipoBloque =>
  typeof v === "string" && TIPOS_DE_BLOQUE.some((t) => t.tipo === v);

/** Seis dígitos hexadecimales, como en `textoConFormato`. */
const RE_COLOR = /^#[0-9a-f]{6}$/;

function normalizarFragmentos(v: unknown): TextoConFormato {
  if (!Array.isArray(v)) return [];
  const out: Fragmento[] = [];
  for (const f of v) {
    if (!f || typeof f !== "object") continue;
    const crudo = f as Record<string, unknown>;
    const t = typeof crudo.t === "string" ? crudo.t : "";
    if (!t) continue;
    const frag: Fragmento = { t: t.slice(0, MAX_TEXTO) };
    if (crudo.b === true) frag.b = true;
    if (typeof crudo.c === "string" && RE_COLOR.test(crudo.c)) frag.c = crudo.c;
    out.push(frag);
  }
  return out;
}

/**
 * Deja utilizable lo que haya guardado, o devuelve null si no hay nada que
 * salvar.
 *
 * Devuelve null —y no un documento vacío— a propósito: quien llama tiene que
 * poder distinguir «el cliente no ha escrito nada todavía» de «la base no
 * respondió», porque en los dos casos hay que enseñar el documento de fábrica.
 * Una página legal en blanco es peor que una desactualizada.
 */
export function normalizarDocumento(data: unknown): Documento | null {
  if (!Array.isArray(data)) return null;
  const bloques: Documento = [];
  let anclaPuesta = false;

  for (const b of data.slice(0, MAX_BLOQUES)) {
    if (!b || typeof b !== "object") continue;
    const crudo = b as Record<string, unknown>;
    if (!ES_TIPO(crudo.tipo)) continue;
    const texto = normalizarFragmentos(crudo.texto);
    if (texto.length === 0) continue;

    const bloque: Bloque = { tipo: crudo.tipo, texto };
    // El ancla es única: si por lo que sea vinieran dos, manda la primera. Dos
    // elementos con el mismo id en una página es HTML inválido y el salto de
    // `/privacidad` se vuelve impredecible.
    if (crudo.ancla === "datos-personales" && crudo.tipo === "titulo" && !anclaPuesta) {
      bloque.ancla = "datos-personales";
      anclaPuesta = true;
    }
    bloques.push(bloque);
  }

  return bloques.length ? bloques : null;
}

/** El texto plano de un bloque, sin marcas. Para buscar, medir o previsualizar. */
export function textoPlano(b: Bloque): string {
  return b.texto.map((f) => f.t).join("");
}

// ─────────────────────────────────────────────────────────────────────────────
//  La notación de texto → bloques
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parte un texto en fragmentos, poniendo en negrita lo que va entre `**`.
 *
 * Sin anidamiento y sin más marcas. Un `**` suelto se queda como texto: es un
 * documento legal escrito por una persona, no un lenguaje, y fallar de forma
 * ruidosa ante un asterisco descolocado solo serviría para perder el párrafo.
 */
export function parsearTexto(linea: string): TextoConFormato {
  const out: Fragmento[] = [];
  const partes = linea.split("**");

  partes.forEach((parte, i) => {
    if (!parte) return;
    // Los índices impares son lo que quedó ENTRE dos asteriscos dobles. Si el
    // número de marcas es impar —una sin cerrar—, la última parte cae en un
    // índice impar sin pareja: se deja en redonda, que es lo menos sorprendente.
    const enNegrita = i % 2 === 1 && i < partes.length - 1;
    out.push(enNegrita ? { t: parte, b: true } : { t: parte });
  });

  return out.length ? out : [{ t: linea }];
}

/**
 * Convierte la notación de texto en bloques.
 *
 *     ## Rótulo de arriba              → epígrafe
 *     # 4 · Datos personales {ancla}   → título (con la marca de /privacidad)
 *     - Un punto de la lista           → viñeta
 *     > Letra pequeña del final        → nota
 *     Cualquier otra línea             → párrafo
 *
 * Las líneas en blanco separan bloques y no producen ninguno.
 */
export function parsearDocumento(fuente: string): Documento {
  const bloques: Documento = [];

  for (const cruda of fuente.split("\n")) {
    const linea = cruda.trim();
    if (!linea) continue;

    if (linea.startsWith("## ")) {
      bloques.push({ tipo: "epigrafe", texto: parsearTexto(linea.slice(3).trim()) });
    } else if (linea.startsWith("# ")) {
      let resto = linea.slice(2).trim();
      let ancla: Bloque["ancla"];
      const marca = resto.match(/\s*\{datos-personales\}$/);
      if (marca) {
        ancla = "datos-personales";
        resto = resto.slice(0, marca.index).trim();
      }
      const bloque: Bloque = { tipo: "titulo", texto: parsearTexto(resto) };
      if (ancla) bloque.ancla = ancla;
      bloques.push(bloque);
    } else if (linea.startsWith("- ")) {
      bloques.push({ tipo: "vinheta", texto: parsearTexto(linea.slice(2).trim()) });
    } else if (linea.startsWith("> ")) {
      bloques.push({ tipo: "nota", texto: parsearTexto(linea.slice(2).trim()) });
    } else {
      bloques.push({ tipo: "parrafo", texto: parsearTexto(linea) });
    }
  }

  return bloques;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Enlaces, sin dejar que nadie escriba un href
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EL MODELO NO GUARDA ENLACES, Y ESE ES EL PUNTO. El documento necesita dos —el
 * correo al que se ejercen los derechos ARCO y el de contacto— y la forma obvia
 * de darlos sería un fragmento con su `href`. No se hace: un href que sale de
 * un formulario admite `javascript:`, y entonces el enlace de la política de
 * privacidad ejecuta lo que le pusieron.
 *
 * Aquí el enlace no se guarda: se RECONOCE al pintar. Quien edita escribe el
 * correo como texto y el destino lo construye este código, así que lo único que
 * puede salir es un `mailto:` de algo con forma de correo o un `https://` de
 * algo con forma de dirección. No hay ninguna vía por la que el esquema del
 * enlace dependa de lo que alguien escribió.
 *
 * `http://` a secas NO se reconoce, a propósito: enlazar en claro desde un
 * documento legal manda al lector a una página sin cifrar, y un sitio que
 * existe casi siempre responde también por https. Se queda como texto.
 */
export interface Trozo {
  texto: string;
  href?: string;
}

const RE_ENLACE = /([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})|(https:\/\/[^\s<>"')\]]+)/g;

export function partirEnlaces(texto: string): Trozo[] {
  const trozos: Trozo[] = [];
  let ultimo = 0;

  for (const m of texto.matchAll(RE_ENLACE)) {
    const i = m.index ?? 0;
    if (i > ultimo) trozos.push({ texto: texto.slice(ultimo, i) });

    if (m[1]) {
      trozos.push({ texto: m[1], href: `mailto:${m[1]}` });
    } else {
      // Un punto o una coma pegados al final casi siempre son la puntuación de
      // la frase, no parte de la dirección. Se devuelven al texto para que el
      // enlace no se coma el punto final del párrafo.
      const limpio = m[2].replace(/[.,;:)]+$/, "");
      trozos.push({ texto: limpio, href: limpio });
      if (limpio.length < m[2].length) trozos.push({ texto: m[2].slice(limpio.length) });
    }
    ultimo = i + m[0].length;
  }

  if (ultimo < texto.length) trozos.push({ texto: texto.slice(ultimo) });
  return trozos;
}
