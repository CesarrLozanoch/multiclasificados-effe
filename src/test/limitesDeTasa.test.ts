// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  normalizarLimites, avisoDeLimites, LIMITES_POR_DEFECTO, SIN_LIMITE,
} from "@/lib/limitesDeTasa";

/**
 * Los topes antiabuso, ahora editables desde el panel.
 *
 * Lo que de verdad se vigila aquí es que el panel y la base de datos digan lo
 * mismo. Son dos copias de los mismos cuatro números —una en TypeScript, otra
 * escrita dentro del trigger de la 0124 como último recurso— y no pueden
 * compartir módulo: una corre en el navegador y la otra dentro de un INSERT de
 * Postgres. La única forma de que no se separen es una prueba que las compare.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0124_limite_de_tasa.sql"),
  "utf8",
);

describe("los valores por defecto son los mismos en el panel y en la base", () => {
  it("coinciden con la fila que siembra la migración", () => {
    // La 0124 escribe la configuración de partida en system_settings.
    const semilla = MIG.match(/'(\{"aviso".*?\})'::jsonb/s);
    expect(semilla, "la migración ya no siembra `limites_de_tasa`").not.toBeNull();
    expect(JSON.parse(semilla![1])).toEqual(LIMITES_POR_DEFECTO);
  });

  it("coinciden con los que el trigger usa como último recurso", () => {
    // `tope_de_tasa('aviso', 'hora', 30)` — el tercer argumento es el defecto
    // que se aplica si la configuración falta o trae basura. Si alguien sube un
    // tope en el panel y olvida este, el freno real sería otro el día que la
    // configuración no se pueda leer.
    for (const [accion, ventana] of [
      ["aviso", "hora"], ["aviso", "dia"], ["mensaje", "hora"], ["mensaje", "dia"],
    ] as const) {
      const re = new RegExp(`tope_de_tasa\\('${accion}',\\s*'${ventana}',\\s*(\\d+)\\)`);
      const m = MIG.match(re);
      expect(m, `el trigger ya no llama a tope_de_tasa('${accion}','${ventana}')`).not.toBeNull();
      expect(Number(m![1])).toBe(LIMITES_POR_DEFECTO[accion][ventana]);
    }
  });
});

describe("normalizarLimites", () => {
  it("lee lo que hay guardado", () => {
    expect(normalizarLimites({
      aviso: { hora: 5, dia: 12 },
      mensaje: { hora: 7, dia: 20 },
    })).toEqual({ aviso: { hora: 5, dia: 12 }, mensaje: { hora: 7, dia: 20 } });
  });

  it("recupera valor a valor, no todo o nada", () => {
    // Si alguien deja mal un solo número, los otros tres siguen siendo los
    // suyos. Un «o todo o nada» aquí devolvería los topes de fábrica y
    // desharía en silencio una configuración que el cliente sí había hecho.
    const r = normalizarLimites({ aviso: { hora: 5, dia: "ni idea" } });
    expect(r.aviso.hora).toBe(5);
    expect(r.aviso.dia).toBe(LIMITES_POR_DEFECTO.aviso.dia);
    expect(r.mensaje).toEqual(LIMITES_POR_DEFECTO.mensaje);
  });

  it("de la basura total salen los valores de fábrica", () => {
    for (const basura of [null, undefined, 42, "texto", [], {}]) {
      expect(normalizarLimites(basura)).toEqual(LIMITES_POR_DEFECTO);
    }
  });

  it("un negativo es SIN LÍMITE, no un tope durísimo", () => {
    // `tope_de_tasa` limpia el valor borrando todo lo que no sea un dígito, así
    // que a la base un «-5» le llegaría como 5. Plegarlo a 0 aquí es lo que
    // hace que el panel y el freno real coincidan.
    expect(normalizarLimites({ aviso: { hora: -5, dia: 10 } }).aviso.hora).toBe(SIN_LIMITE);
  });

  it("los decimales se recortan: no hay medio aviso", () => {
    expect(normalizarLimites({ mensaje: { hora: 7.9, dia: 20 } }).mensaje.hora).toBe(7);
  });

  it("acepta el número escrito como texto", () => {
    // Es la forma en que sale de un <input type="number">.
    expect(normalizarLimites({ aviso: { hora: "15", dia: "40" } }).aviso).toEqual({ hora: 15, dia: 40 });
  });
});

describe("avisoDeLimites", () => {
  it("calla cuando los números son coherentes", () => {
    expect(avisoDeLimites(LIMITES_POR_DEFECTO)).toBeNull();
  });

  it("avisa si el tope del día es menor que el de la hora", () => {
    const aviso = avisoDeLimites({ aviso: { hora: 30, dia: 10 }, mensaje: { hora: 60, dia: 200 } });
    expect(aviso).toContain("avisos");
    expect(aviso).toContain("10");
  });

  it("no avisa cuando el 0 es intencionado", () => {
    // 0 es «sin límite», no un tope diario bajísimo: comparar 0 < 30 y llamarlo
    // incoherencia dejaría el panel avisando justo cuando el freno está
    // desactivado a propósito.
    expect(avisoDeLimites({ aviso: { hora: 30, dia: 0 }, mensaje: { hora: 0, dia: 0 } })).toBeNull();
  });
});
