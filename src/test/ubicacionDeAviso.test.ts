// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ubicacionDeAviso } from "@/lib/ubicacionDeAviso";

/**
 * De dónde es un aviso, en una línea.
 *
 * Lo pidió el cliente para la tarjeta «en vivo» de la portada: «el país, la
 * provincia y el lugar». Lo que estas pruebas fijan es que NO se concatenen los
 * tres a lo bruto, porque los campos se solapan y salen frases ridículas del
 * tipo «Miraflores, Lima · Lima · Perú».
 */

describe("dentro del Perú", () => {
  it("no repite la provincia que ya viene en el lugar", () => {
    // `location` ya trae "distrito, provincia"; el departamento es el mismo.
    expect(ubicacionDeAviso({ location: "Miraflores, Lima", department: "15", country: "PE" }))
      .toBe("Miraflores, Lima · Perú");
  });

  it("pero sí la añade cuando aporta", () => {
    // Trujillo es de La Libertad, y eso no se deduce del nombre del distrito.
    expect(ubicacionDeAviso({ location: "Trujillo", department: "13", country: "PE" }))
      .toBe("Trujillo, La Libertad · Perú");
  });

  it("«Cusco» y «Cuzco» son el mismo sitio", () => {
    // Google escribe el departamento con zeta y la ciudad con ese. Sin
    // normalizar saldría "Cusco, Cuzco · Perú".
    expect(ubicacionDeAviso({ location: "Cusco", department: "08", country: "PE" }))
      .toBe("Cusco · Perú");
  });

  it("sin país explícito no se inventa ninguno", () => {
    // Chancay está en la provincia de Huaral y en el departamento de Lima: los
    // tres nombres son distintos, así que los tres aportan.
    expect(ubicacionDeAviso({ location: "Chancay, Huaral", department: "15" }))
      .toBe("Chancay, Huaral, Lima y Callao");
  });

  it("un departamento que no existe en el catálogo no ensucia la línea", () => {
    // `nombreDepartamento` devuelve "Sin especificar" para un id desconocido, y
    // eso en una portada queda peor que no poner nada.
    expect(ubicacionDeAviso({ location: "Lima", department: "99", country: "PE" }))
      .toBe("Lima · Perú");
  });
});

describe("fuera del Perú", () => {
  it("enseña el lugar y el país, sin departamento", () => {
    expect(ubicacionDeAviso({ location: "Madrid", department: null, country: "ES" }))
      .toBe("Madrid · España");
  });

  it("🔴 NUNCA mete un departamento del INEI en un aviso extranjero", () => {
    // Aunque la fila arrastre un department viejo de cuando el aviso era
    // peruano: el catálogo del INEI solo describe el Perú, y decir que Madrid
    // está en La Libertad archiva el aviso en el sitio equivocado.
    expect(ubicacionDeAviso({ location: "Madrid", department: "13", country: "ES" }))
      .toBe("Madrid · España");
  });

  it("un país que no está en el catálogo no se anuncia como «Otro país»", () => {
    expect(ubicacionDeAviso({ location: "Bucarest", country: "ZZ" })).toBe("Bucarest");
  });
});

describe("cuando falta información", () => {
  it("sin nada, cadena vacía — para no pintar un hueco", () => {
    expect(ubicacionDeAviso({})).toBe("");
    expect(ubicacionDeAviso({ location: "   " })).toBe("");
  });

  it("solo el país, se dice el país", () => {
    expect(ubicacionDeAviso({ country: "ES" })).toBe("España");
  });

  it("solo el departamento, se dice el departamento", () => {
    expect(ubicacionDeAviso({ department: "13", country: "PE" })).toBe("La Libertad · Perú");
  });
});
