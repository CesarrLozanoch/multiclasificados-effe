// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parsearTexto, parsearDocumento, normalizarDocumento, partirEnlaces, textoPlano,
  MAX_TEXTO,
} from "@/lib/documentoLegal";
import { DOCUMENTO_POR_DEFECTO } from "@/lib/legalPorDefecto";

describe("el texto con negrita", () => {
  it("parte por los asteriscos dobles", () => {
    expect(parsearTexto("Hola **mundo** cruel")).toEqual([
      { t: "Hola " }, { t: "mundo", b: true }, { t: " cruel" },
    ]);
  });

  it("un asterisco sin cerrar no rompe el párrafo", () => {
    // Lo escribe una persona, no un compilador: perder una cláusula entera por
    // un asterisco descolocado sería mucho peor que enseñarla en redonda.
    const r = parsearTexto("Hola **mundo cruel");
    expect(textoPlano({ tipo: "parrafo", texto: r })).toBe("Hola mundo cruel");
    expect(r.every((f) => !f.b)).toBe(true);
  });

  it("un texto sin marcas es un solo fragmento", () => {
    expect(parsearTexto("Sin nada")).toEqual([{ t: "Sin nada" }]);
  });
});

describe("la notación de texto", () => {
  it("reconoce los cinco tipos de bloque", () => {
    const d = parsearDocumento([
      "## Rótulo",
      "# 1. Cláusula",
      "Un párrafo.",
      "- Un punto",
      "> Letra pequeña",
    ].join("\n"));
    expect(d.map((b) => b.tipo)).toEqual(["epigrafe", "titulo", "parrafo", "vinheta", "nota"]);
  });

  it("las líneas en blanco no producen bloques", () => {
    expect(parsearDocumento("Uno\n\n\nDos")).toHaveLength(2);
  });

  it("la marca {datos-personales} sale del título y queda como ancla", () => {
    const [b] = parsearDocumento("# 4. Datos personales recopilados {datos-personales}");
    expect(b.ancla).toBe("datos-personales");
    expect(textoPlano(b)).toBe("4. Datos personales recopilados");
  });
});

describe("normalizarDocumento", () => {
  it("devuelve null ante basura, no un documento vacío", () => {
    // Quien llama tiene que poder distinguir «no hay nada» de «no respondió»:
    // en los dos casos hay que enseñar el de fábrica, y media política de
    // privacidad es peor que la anterior completa.
    for (const basura of [null, undefined, 42, "texto", {}, [], [{ tipo: "raro" }]]) {
      expect(normalizarDocumento(basura)).toBeNull();
    }
  });

  it("descarta los bloques de tipo desconocido y los vacíos", () => {
    const d = normalizarDocumento([
      { tipo: "parrafo", texto: [{ t: "vale" }] },
      { tipo: "inventado", texto: [{ t: "no vale" }] },
      { tipo: "parrafo", texto: [] },
      { tipo: "parrafo", texto: "ni de lejos" },
    ]);
    expect(d).toEqual([{ tipo: "parrafo", texto: [{ t: "vale" }] }]);
  });

  it("solo un bloque se queda con el ancla", () => {
    // Dos elementos con el mismo id es HTML inválido, y el salto de
    // /privacidad se vuelve impredecible según el navegador.
    const d = normalizarDocumento([
      { tipo: "titulo", texto: [{ t: "A" }], ancla: "datos-personales" },
      { tipo: "titulo", texto: [{ t: "B" }], ancla: "datos-personales" },
    ]);
    expect(d!.filter((b) => b.ancla)).toHaveLength(1);
    expect(textoPlano(d![0])).toBe("A");
  });

  it("el ancla en algo que no es un título se descarta", () => {
    const d = normalizarDocumento([
      { tipo: "parrafo", texto: [{ t: "A" }], ancla: "datos-personales" },
    ]);
    expect(d![0].ancla).toBeUndefined();
  });

  it("un color que no es #rrggbb se tira", () => {
    // El color acaba en un `style` de una página pública: solo pasa la forma
    // exacta, nunca lo que venga.
    const d = normalizarDocumento([
      { tipo: "parrafo", texto: [{ t: "x", c: "red; background:url(x)" }, { t: "y", c: "#dc2626" }] },
    ]);
    expect(d![0].texto[0].c).toBeUndefined();
    expect(d![0].texto[1].c).toBe("#dc2626");
  });

  it("recorta los textos desmesurados en vez de rechazarlos", () => {
    const d = normalizarDocumento([{ tipo: "parrafo", texto: [{ t: "x".repeat(MAX_TEXTO + 500) }] }]);
    expect(d![0].texto[0].t).toHaveLength(MAX_TEXTO);
  });
});

describe("los enlaces se reconocen, nunca se guardan", () => {
  it("un correo se convierte en mailto", () => {
    const t = partirEnlaces("Escribe a avisos@coleffe.com y listo");
    expect(t[1]).toEqual({ texto: "avisos@coleffe.com", href: "mailto:avisos@coleffe.com" });
    expect(t.map((x) => x.texto).join("")).toBe("Escribe a avisos@coleffe.com y listo");
  });

  it("no se come el punto final de la frase", () => {
    const t = partirEnlaces("Visita https://coleffe.com.");
    expect(t.find((x) => x.href)?.href).toBe("https://coleffe.com");
    expect(t.map((x) => x.texto).join("")).toBe("Visita https://coleffe.com.");
  });

  it("un `javascript:` NO produce ningún enlace", () => {
    // Esta es la prueba que justifica que el modelo no guarde hrefs. Si algún
    // día alguien añadiera un campo `href` al fragmento, esto seguiría pasando
    // y el agujero entraría sin que nadie lo notara — de ahí el comentario en
    // `documentoLegal.ts` diciendo que no se haga.
    for (const veneno of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "http://sin-cifrar.example.com",
    ]) {
      expect(partirEnlaces(veneno).every((t) => !t.href)).toBe(true);
    }
  });

  it("un texto sin enlaces vuelve entero y en un solo trozo", () => {
    expect(partirEnlaces("Nada que enlazar")).toEqual([{ texto: "Nada que enlazar" }]);
  });
});

describe("el documento de fábrica", () => {
  it("tiene las dieciséis cláusulas", () => {
    const titulos = DOCUMENTO_POR_DEFECTO.filter((b) => b.tipo === "titulo");
    expect(titulos).toHaveLength(16);
    expect(textoPlano(titulos[0])).toContain("Objeto y alcance");
    expect(textoPlano(titulos[15])).toContain("Canales de contacto");
  });

  it("marca la cláusula de datos personales, y solo una", () => {
    // Es la que Google Play tiene registrada como política de privacidad.
    const marcados = DOCUMENTO_POR_DEFECTO.filter((b) => b.ancla === "datos-personales");
    expect(marcados).toHaveLength(1);
    expect(textoPlano(marcados[0])).toBe("4. Datos personales recopilados");
  });

  it("lleva el correo de soporte que existe de verdad", () => {
    // `soporte@coleffe.com` y `privacidad@coleffe.com` NO existen en cPanel. Una
    // política que remite a un buzón que rebota para ejercer derechos sobre
    // datos personales es justo lo que mira un revisor.
    const entero = DOCUMENTO_POR_DEFECTO.map(textoPlano).join(" ");
    expect(entero).toContain("avisos@coleffe.com");
    expect(entero).not.toContain("privacidad@coleffe.com");
    expect(entero).not.toContain("soporte@coleffe.com");
  });

  it("sobrevive a una vuelta completa por la normalización", () => {
    // Es el viaje real: se guarda como jsonb y se vuelve a leer. Si algo del
    // documento de fábrica no pasara el filtro, el respaldo se quedaría corto
    // justo el día que hace falta.
    const vuelta = normalizarDocumento(JSON.parse(JSON.stringify(DOCUMENTO_POR_DEFECTO)));
    expect(vuelta).toEqual(DOCUMENTO_POR_DEFECTO);
  });
});
