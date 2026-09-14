// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  documentoDesdeDom, escribirDocumentoEnDom, bloqueDelCursor,
} from "@/lib/editorDocumento";
import { textoPlano, type Documento } from "@/lib/documentoLegal";
import { DOCUMENTO_POR_DEFECTO } from "@/lib/legalPorDefecto";

/**
 * El puente entre el cuadro de edición y lo que se guarda.
 *
 * Aquí está el riesgo de verdad del editor de una sola pieza: el contenido es
 * un `contenteditable`, o sea un DOM que deja el navegador como le parece, y de
 * ahí hay que sacar una estructura. Lo que se prueba es que solo sobrevive lo
 * que entendemos — que es exactamente lo que impide que el documento legal
 * acabe guardando marcado.
 */
const dom = (html: string) => {
  const el = document.createElement("div");
  // `innerHTML` AQUÍ, en la prueba, es a propósito: simula lo que el navegador
  // deja en el editor. El código de producción nunca lo usa.
  el.innerHTML = html;
  return el;
};

describe("leer la estructura del editor", () => {
  it("reconoce los cinco tipos", () => {
    const d = documentoDesdeDom(dom(`
      <p data-tipo="epigrafe">Rótulo</p>
      <h3>1. Cláusula</h3>
      <p>Un párrafo.</p>
      <ul><li>Uno</li><li>Dos</li></ul>
      <p data-tipo="nota">Letra pequeña</p>
    `));
    expect(d.map((b) => b.tipo)).toEqual([
      "epigrafe", "titulo", "parrafo", "vinheta", "vinheta", "nota",
    ]);
    expect(d.map(textoPlano)).toEqual([
      "Rótulo", "1. Cláusula", "Un párrafo.", "Uno", "Dos", "Letra pequeña",
    ]);
  });

  it("conserva negrita, cursiva y color", () => {
    const d = documentoDesdeDom(dom(
      `<p><strong>Datos:</strong> <em>nombres</em> y <span style="color:#dc2626">apellidos</span></p>`,
    ));
    expect(d[0].texto).toEqual([
      { t: "Datos:", b: true },
      { t: " " },
      { t: "nombres", i: true },
      { t: " y " },
      { t: "apellidos", c: "#dc2626" },
    ]);
  });

  it("el ancla se lee del título y solo de un título", () => {
    const d = documentoDesdeDom(dom(
      `<h3 data-ancla="datos-personales">4. Datos personales</h3>` +
      `<p data-ancla="datos-personales">Un párrafo colado</p>`,
    ));
    expect(d[0].ancla).toBe("datos-personales");
    expect(d[1].ancla).toBeUndefined();
  });

  it("si quedan dos títulos marcados, gana el primero", () => {
    // Pasa al duplicar una cláusula: dos elementos con el mismo id es HTML
    // inválido y el salto de /privacidad se vuelve impredecible.
    const d = documentoDesdeDom(dom(
      `<h3 data-ancla="datos-personales">A</h3><h3 data-ancla="datos-personales">B</h3>`,
    ));
    expect(d.filter((b) => b.ancla)).toHaveLength(1);
    expect(textoPlano(d[0])).toBe("A");
  });

  it("los bloques vacíos no se guardan", () => {
    // El navegador deja uno al pulsar Enter dos veces. Es normal mientras se
    // escribe, así que se descarta en silencio y no como un error.
    const d = documentoDesdeDom(dom(`<p>Algo</p><p></p><p><br></p><p>Más</p>`));
    expect(d.map(textoPlano)).toEqual(["Algo", "Más"]);
  });

  it("no pierde lo que se acaba de teclear en la raíz", () => {
    // Antes del primer Enter, el navegador deja el texto suelto, sin envolver.
    // Descartarlo sería perder lo que la persona está escribiendo.
    const d = documentoDesdeDom(dom(`Escribiendo sin <b>envolver</b> todavía`));
    expect(d).toHaveLength(1);
    expect(textoPlano(d[0])).toBe("Escribiendo sin envolver todavía");
  });

  it("un salto dentro de un bloque no parte el texto en dos líneas guardadas", () => {
    // En un documento por bloques, un salto ES un bloque nuevo. Guardar "\n"
    // dentro de un párrafo dejaría un texto que la página no sabe pintar.
    const d = documentoDesdeDom(dom(`<p>Una<br>línea</p>`));
    expect(d).toHaveLength(1);
    expect(textoPlano(d[0])).toBe("Una línea");
  });
});

describe("lo que se pega de fuera no se cuela", () => {
  it("un script pegado no produce ningún bloque con código", () => {
    // Esta es la prueba que sostiene toda la decisión de no guardar HTML. El
    // lector es una LISTA BLANCA: reconoce lo que entiende y lo demás no tiene
    // ninguna rama que lo convierta en bloque.
    const d = documentoDesdeDom(dom(
      `<p>Texto bueno</p>` +
      `<script>alert(1)</script>` +
      `<iframe src="https://malo.example"></iframe>` +
      `<p onclick="alert(2)">Un parrafo normal</p>` +
      `<img src=x onerror="alert(3)">`,
    ));
    const entero = JSON.stringify(d);
    expect(entero).not.toContain("alert");
    expect(entero).not.toContain("onclick");
    expect(entero).not.toContain("iframe");
    // Del párrafo con `onclick` sobrevive SU TEXTO, que es lo correcto: el
    // atributo se queda fuera porque el modelo no tiene dónde guardarlo.
    expect(d.map(textoPlano)).toEqual(["Texto bueno", "Un parrafo normal"]);
  });

  it("los estilos ajenos se descartan menos los que el modelo entiende", () => {
    const d = documentoDesdeDom(dom(
      `<p style="font-size:72px;background:url(x)">` +
      `<span style="font-family:Comic Sans;color:#059669">Verde</span></p>`,
    ));
    // Del pegote solo sobrevive el color, que es lo que el modelo guarda.
    expect(d[0].texto).toEqual([{ t: "Verde", c: "#059669" }]);
  });
});

describe("escribir y volver a leer", () => {
  it("el documento entero sobrevive a la ida y vuelta", () => {
    // Es el viaje real de cada sesión de edición: se carga en el editor y se
    // vuelve a leer al guardar. Si algo se perdiera aquí, el contrato se
    // degradaría un poco cada vez que alguien lo abre y guarda.
    const el = document.createElement("div");
    escribirDocumentoEnDom(el, DOCUMENTO_POR_DEFECTO);
    expect(documentoDesdeDom(el)).toEqual(DOCUMENTO_POR_DEFECTO);
  });

  it("las viñetas seguidas van en una sola lista", () => {
    const el = document.createElement("div");
    escribirDocumentoEnDom(el, [
      { tipo: "parrafo", texto: [{ t: "Antes" }] },
      { tipo: "vinheta", texto: [{ t: "Uno" }] },
      { tipo: "vinheta", texto: [{ t: "Dos" }] },
      { tipo: "parrafo", texto: [{ t: "Entre medias" }] },
      { tipo: "vinheta", texto: [{ t: "Tres" }] },
    ]);
    const listas = el.querySelectorAll("ul");
    expect(listas).toHaveLength(2);
    expect(listas[0].children).toHaveLength(2);
    expect(listas[1].children).toHaveLength(1);
  });

  it("un documento vacío deja un párrafo donde escribir", () => {
    // Sin él, el cursor se queda en la raíz y lo primero que se teclea no
    // pertenece a ningún bloque.
    const el = document.createElement("div");
    escribirDocumentoEnDom(el, []);
    expect(el.children).toHaveLength(1);
    expect(el.children[0].tagName).toBe("P");
  });

  it("no usa innerHTML para construir el contenido", () => {
    // Por aquí pasa texto que escribió una persona: con `innerHTML`, un `<b>`
    // tecleado como texto se convertiría en una etiqueta de verdad.
    const el = document.createElement("div");
    const doc: Documento = [{ tipo: "parrafo", texto: [{ t: "<script>alert(1)</script>" }] }];
    escribirDocumentoEnDom(el, doc);
    expect(el.querySelector("script")).toBeNull();
    expect(el.textContent).toBe("<script>alert(1)</script>");
  });
});

describe("saber en qué bloque está el cursor", () => {
  it("lo encuentra subiendo desde el texto", () => {
    const el = dom(`<h3>Un título</h3>`);
    document.body.appendChild(el);
    const rango = document.createRange();
    rango.setStart(el.querySelector("h3")!.firstChild!, 2);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(rango);

    expect(bloqueDelCursor(el)?.tagName).toBe("H3");
    document.body.removeChild(el);
  });

  it("devuelve null si el cursor está fuera del editor", () => {
    const el = dom(`<p>Dentro</p>`);
    const fuera = dom(`<p>Fuera</p>`);
    document.body.append(el, fuera);
    const rango = document.createRange();
    rango.setStart(fuera.querySelector("p")!.firstChild!, 1);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(rango);

    expect(bloqueDelCursor(el)).toBeNull();
    document.body.append();
    el.remove(); fuera.remove();
  });
});
