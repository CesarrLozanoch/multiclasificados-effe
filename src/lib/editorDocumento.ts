import { leerDelDom, escribirEnDom } from "@/lib/editorDom";
import { normalizar } from "@/lib/textoConFormato";
import { MAX_BLOQUES, type Bloque, type Documento, type TipoBloque } from "@/lib/documentoLegal";

/**
 * El puente entre el documento que se edita en pantalla y la estructura que se
 * guarda.
 *
 * ── LO QUE CAMBIA RESPECTO A `editorDom` ─────────────────────────────────────
 *
 * Aquel lee UN bloque de texto con sus marcas. Aquí hace falta leer la
 * ESTRUCTURA: qué es un título, qué un párrafo y qué una viñeta. El editor del
 * documento legal es un solo cuadro con todo el contrato dentro —se pidió así
 * para poder editarlo del tirón— y del DOM que deja el navegador hay que sacar
 * la lista de bloques.
 *
 * ── SIGUE SIN GUARDARSE HTML, Y ESO NO ES UN DETALLE ─────────────────────────
 *
 * Que el editor sea un contenteditable no cambia nada de la decisión de fondo:
 * lo que sale de aquí es una lista de bloques con fragmentos de texto, no
 * marcado. Este archivo es justo el sitio donde se corta: RECONOCE las etiquetas
 * que entiende y DESCARTA todo lo demás. Si alguien pega en el editor un trozo
 * de otra web con un `<script>`, un `<iframe>` o un `onclick`, no sobrevive: no
 * hay ninguna rama que lo convierta en bloque.
 *
 * Es una lista blanca, y por eso es segura. Un saneador de HTML es una lista
 * negra —quita lo malo y deja pasar el resto—, y ahí es donde aparecen los
 * agujeros.
 */

/** Las etiquetas que el editor entiende como bloque de nivel superior. */
const BLOQUES_DOM = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI"]);

/**
 * Elementos cuyo contenido NO es texto del documento, ni aunque lo parezca.
 *
 * Hace falta decirlo explícitamente. Filtrar por «etiquetas que entiendo» no
 * basta: lo que no se reconoce como bloque se recoge igualmente como texto
 * suelto —y eso es correcto, porque es lo que evita perder la línea que alguien
 * está tecleando antes del primer Enter—, pero significa que el contenido de un
 * `<script>` pegado entraría como un párrafo con `alert(1)` dentro.
 *
 * No llegaría a ejecutarse: se guarda como texto y el renderizador lo escapa.
 * Pero acabaría escrito en medio del contrato, y eso ya es motivo suficiente.
 */
const NUNCA_ES_TEXTO = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "NOSCRIPT", "TEMPLATE",
  "LINK", "META", "TITLE", "HEAD", "SVG", "CANVAS", "AUDIO", "VIDEO",
  "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "OPTION",
]);

/**
 * El tipo de bloque que representa un elemento.
 *
 * `data-tipo` lo ponemos nosotros y es lo que manda. La etiqueta se mira
 * después, porque el navegador crea `<div>` y `<p>` por su cuenta al pulsar
 * Enter y esos son párrafos normales.
 */
function tipoDelElemento(el: HTMLElement): TipoBloque {
  const marcado = el.dataset.tipo;
  if (marcado === "epigrafe" || marcado === "nota") return marcado;
  if (el.tagName === "LI") return "vinheta";
  if (/^H[1-6]$/.test(el.tagName)) return "titulo";
  return "parrafo";
}

/** El texto de un bloque, sin los saltos que el navegador mete de más. */
function textoDelBloque(el: HTMLElement) {
  // Se trabaja sobre una COPIA: el original está dentro del editor con el
  // cursor de alguien puesto, y arrancarle nodos mientras escribe se lo
  // movería de sitio.
  const copia = el.cloneNode(true) as HTMLElement;
  for (const basura of Array.from(copia.querySelectorAll("*"))) {
    if (NUNCA_ES_TEXTO.has(basura.tagName)) basura.remove();
  }
  // Los saltos internos se aplanan a un espacio: en un documento por bloques,
  // un salto dentro de un párrafo es un párrafo nuevo, no un `\n` guardado.
  return normalizar(
    leerDelDom(copia).map((f) => ({ ...f, t: f.t.replace(/\n+/g, " ") })),
  );
}

/** ¿Este texto dice algo, o son solo espacios? */
const diceAlgo = (texto: { t: string }[]) => texto.some((f) => f.t.trim() !== "");

/**
 * Lee el editor y devuelve los bloques.
 *
 * Se recorren solo los hijos de primer nivel, bajando dentro de las listas para
 * sacar sus `<li>`. Lo que no encaje en ninguna rama —texto suelto en la raíz,
 * que el navegador deja al escribir la primera línea— se recoge como párrafo,
 * porque perder lo que alguien acaba de teclear es el peor fallo posible.
 */
export function documentoDesdeDom(raiz: HTMLElement): Documento {
  const bloques: Documento = [];
  let sueltos: Node[] = [];

  /** El texto suelto de la raíz, junto, como un párrafo. */
  const volcarSueltos = () => {
    if (!sueltos.length) return;
    const caja = document.createElement("div");
    for (const n of sueltos) caja.appendChild(n.cloneNode(true));
    const texto = textoDelBloque(caja);
    if (diceAlgo(texto)) bloques.push({ tipo: "parrafo", texto });
    sueltos = [];
  };

  const meter = (el: HTMLElement) => {
    const texto = textoDelBloque(el);
    // Un bloque vacío no se guarda, pero tampoco se marca como error: al pulsar
    // Enter dos veces el navegador deja uno, y es lo normal mientras se escribe.
    // `diceAlgo` y no `length`: un `<p><br></p>` llega aquí como un espacio.
    if (!diceAlgo(texto)) return;
    const bloque: Bloque = { tipo: tipoDelElemento(el), texto };
    if (bloque.tipo === "titulo" && el.dataset.ancla === "datos-personales") {
      bloque.ancla = "datos-personales";
    }
    bloques.push(bloque);
  };

  for (const nodo of Array.from(raiz.childNodes)) {
    if (nodo.nodeType !== Node.ELEMENT_NODE) {
      if ((nodo.textContent ?? "").trim()) sueltos.push(nodo);
      continue;
    }
    const el = nodo as HTMLElement;
    // Lo que nunca es texto ni siquiera se recoge como suelto.
    if (NUNCA_ES_TEXTO.has(el.tagName)) continue;
    if (!BLOQUES_DOM.has(el.tagName)) {
      // Un `<span>`, un `<b>` o un `<br>` sueltos en la raíz son parte de la
      // línea que se está escribiendo, no un bloque.
      sueltos.push(el);
      continue;
    }
    volcarSueltos();

    if (el.tagName === "UL" || el.tagName === "OL") {
      for (const li of Array.from(el.children)) meter(li as HTMLElement);
    } else {
      meter(el);
    }
    if (bloques.length >= MAX_BLOQUES) break;
  }
  volcarSueltos();

  // El ancla es única. Si al reordenar quedaran dos títulos marcados, manda el
  // primero: dos elementos con el mismo id es HTML inválido y el salto de
  // `/privacidad` se vuelve impredecible.
  let vista = false;
  for (const b of bloques) {
    if (b.ancla !== "datos-personales") continue;
    if (vista) delete b.ancla;
    vista = true;
  }

  return bloques.slice(0, MAX_BLOQUES);
}

/**
 * Construye el contenido del editor a partir de los bloques.
 *
 * Solo al ABRIR, nunca mientras se escribe: rehacer el DOM con el cursor dentro
 * lo movería de sitio y borraría el deshacer del navegador.
 *
 * Con `createElement`, nunca con `innerHTML`. Por aquí pasa texto que escribió
 * una persona, y `innerHTML` convertiría en etiquetas lo que tiene que seguir
 * siendo texto.
 */
export function escribirDocumentoEnDom(raiz: HTMLElement, doc: Documento): void {
  raiz.textContent = "";
  let lista: HTMLUListElement | null = null;

  for (const b of doc) {
    if (b.tipo === "vinheta") {
      // Las viñetas seguidas van dentro de la MISMA lista, como en la página
      // publicada: si cada una fuera su propia `<ul>`, al editarlas el
      // navegador las trataría como listas distintas y no se podría pasar de
      // una a la siguiente con las flechas.
      if (!lista) {
        lista = document.createElement("ul");
        raiz.appendChild(lista);
      }
      const li = document.createElement("li");
      escribirEnDom(li, b.texto);
      lista.appendChild(li);
      continue;
    }
    lista = null;

    const el = document.createElement(b.tipo === "titulo" ? "h3" : "p");
    if (b.tipo === "epigrafe" || b.tipo === "nota") el.dataset.tipo = b.tipo;
    if (b.tipo === "titulo" && b.ancla === "datos-personales") {
      el.dataset.ancla = "datos-personales";
    }
    escribirEnDom(el, b.texto);
    raiz.appendChild(el);
  }

  // Un editor vacío sin ningún bloque deja el cursor en la raíz, y entonces lo
  // primero que se teclea no pertenece a ningún párrafo.
  if (!raiz.childNodes.length) raiz.appendChild(document.createElement("p"));
}

/** El elemento de bloque donde está el cursor, si está dentro del editor. */
export function bloqueDelCursor(raiz: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let n: Node | null = sel.getRangeAt(0).startContainer;
  if (!raiz.contains(n)) return null;

  while (n && n !== raiz) {
    if (n.nodeType === Node.ELEMENT_NODE && BLOQUES_DOM.has((n as HTMLElement).tagName)) {
      return n as HTMLElement;
    }
    n = n.parentNode;
  }
  return null;
}
