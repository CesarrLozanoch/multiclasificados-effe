import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { leerObservacion, resumenDeObservaciones, todasInformativas } from "@/lib/observacionesSunat";
import { soloSonInformativas } from "../../supabase/functions/_shared/factiliza.ts";

/**
 * Un comprobante «observado» y por qué lo está.
 *
 * ── EL CASO REAL ─────────────────────────────────────────────────────────────
 *
 * Las tres primeras facturas de producción (F001-1..3) aparecieron en el panel
 * con la etiqueta ámbar de «Observado» y la marca roja de «revisar». Las tres
 * estaban ACEPTADAS por SUNAT (`code: "0"`). Lo único que SUNAT señalaba era el
 * nombre comercial del emisor, un campo del perfil de la empresa en Factiliza
 * que ni siquiera viaja en nuestra petición.
 *
 * Dos cosas estaban mal, y son las que fija esta prueba:
 *
 *   1. **El aviso.** Esa nota se va a repetir idéntica en cada factura hasta que
 *      alguien rellene el campo, y no se arregla reemitiendo. Si cada una llama
 *      a revisión manual, la lista de pendientes se llena de ruido y el día que
 *      llegue una nota sobre un importe nadie va a mirarla.
 *
 *   2. **El texto.** El panel enseñaba `sunat_last_error`, que en esas filas
 *      dice literalmente «La Factura numero F001-3, ha sido aceptada». Una
 *      etiqueta ámbar cuyo detalle dice «aceptada» no se puede interpretar: hay
 *      que enseñar LA OBSERVACIÓN, que vive en otro sitio (`sunat_cdr.notes`).
 */

const NOTA_INFO =
  '4092 - El nombre comercial del emisor no cumple con el formato establecido' +
  ' - INFO: 4092 (nodo: "cac:PartyName/cbc:Name" valor: "-")';

const filas: unknown[] = [];

const constructor = () => {
  const api: Record<string, unknown> = {};
  for (const m of ["select", "or", "eq", "is", "not", "gte", "lt", "order"]) {
    api[m] = () => api;
  }
  api.range = () => Promise.resolve({ data: filas, count: filas.length, error: null });
  return api;
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => constructor(),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
  },
}));

describe("el panel sabe qué se observó", () => {
  beforeEach(() => {
    filas.length = 0;
  });

  it("🔴 trae las notas del CDR, no solo el estado", async () => {
    filas.push({
      id: "i1", number: "F001-000003", type: "factura", email: "a@b.com",
      advertiser_name: "OPERACIONES Y LOGISTICA K & L S.A.C.",
      doc_type: "ruc", doc_number: "20482725415", factiliza_data: null,
      amount: "1.23", detail: "Saldo", issued_at: "2026-09-05T17:10:49Z",
      sunat_status: "observado", email_status: "enviado", needs_review: false,
      // Justo el texto que confundía: el «error» dice que fue aceptada.
      sunat_last_error: "La Factura numero F001-3, ha sido aceptada",
      sunat_cdr: { id: "F001-3", code: "0", notes: [NOTA_INFO] },
      sunat_attempts: 1, es_prueba: false,
      anulado_at: null, anulado_motivo: null, nota_number: null, nota_sunat_status: null,
      orders: null,
    });

    const { fetchAllInvoices } = await import("@/lib/admin");
    const { data } = await fetchAllInvoices();

    expect(data[0].sunatStatus).toBe("observado");
    expect(data[0].sunatNotas).toEqual([NOTA_INFO]);
  });

  it("y aguanta que ese campo venga de cualquier forma", async () => {
    // `sunat_cdr` es JSON libre que viene de fuera. Si SUNAT o Factiliza le
    // cambian la forma, el panel debe quedarse sin detalle — no reventar la
    // tabla entera de comprobantes.
    const base = {
      id: "i1", number: "B001-1", type: "boleta", email: "a@b.com",
      advertiser_name: "X", doc_type: "dni", doc_number: "12345678",
      factiliza_data: null, amount: "1.00", detail: "", issued_at: "2026-09-05T00:00:00Z",
      sunat_status: "aceptado", email_status: "enviado", needs_review: false,
      sunat_last_error: null, sunat_attempts: 1, es_prueba: false,
      anulado_at: null, anulado_motivo: null, nota_number: null, nota_sunat_status: null,
      orders: null,
    };
    const { fetchAllInvoices } = await import("@/lib/admin");

    for (const cdr of [null, undefined, {}, { notes: null }, { notes: "texto" }, { notes: [1, "", "  "] }]) {
      filas.length = 0;
      filas.push({ ...base, sunat_cdr: cdr });
      const { data } = await fetchAllInvoices();
      expect(data[0].sunatNotas, `con notes = ${JSON.stringify(cdr)}`).toEqual([]);
    }
  });
});

describe("y las dice en cristiano", () => {
  it("🔴 no se enseña la traza de XML: se dice qué pasó", () => {
    const o = leerObservacion(NOTA_INFO);
    expect(o.codigo).toBe("4092");
    // Ni «cac:PartyName», ni «cbc:Name», ni «INFO:». Nada de eso significa algo
    // para quien mira el panel.
    expect(o.resumen).not.toMatch(/cac:|cbc:|INFO:|nodo/);
    expect(o.resumen).toBe("Falta el nombre comercial de la empresa emisora");
    // Y se dice de quién es el problema, que es lo que decide qué hacer.
    expect(o.explicacion).toMatch(/Factiliza/);
  });

  it("pero el texto original NO se pierde", () => {
    // Hace falta para reclamar a Factiliza o buscar el código en el catálogo
    // de SUNAT. Se guarda entero; solo deja de ser lo primero que se ve.
    expect(leerObservacion(NOTA_INFO).crudo).toBe(NOTA_INFO);
  });

  it("una nota que no conocemos se limpia, no se inventa", () => {
    const o = leerObservacion(
      '4267 - El dato ingresado no cumple con el formato - INFO: 4267 (nodo: "cbc:Note")',
    );
    expect(o.codigo).toBe("4267");
    expect(o.resumen).toBe("El dato ingresado no cumple con el formato");
    // No hay explicación inventada para un código que no hemos visto: decir
    // algo falso sobre un documento fiscal es peor que no decir nada.
    expect(o.explicacion).toBeNull();
  });

  it("y ante un texto raro, se enseña tal cual antes que perderlo", () => {
    for (const [raro, esperado] of [
      ["", ""],
      ["   ", ""],
      // Sí se le pone la mayúscula inicial: es una frase, no un identificador.
      ["algo sin código ni cola", "Algo sin código ni cola"],
    ]) {
      const o = leerObservacion(raro);
      expect(o.resumen).toBe(esperado);
      expect(o.crudo).toBe(raro.trim());
      expect(o.codigo).toBeNull();
    }
  });

  it("el resumen dice PRIMERO que sí se emitió", () => {
    // La etiqueta ámbar, sola, se lee como un fallo. Y no lo es: está aceptada.
    const r = resumenDeObservaciones([NOTA_INFO])!;
    expect(r).toMatch(/^Emitida y aceptada por SUNAT/);
    expect(r).toContain("una observación");
    expect(resumenDeObservaciones([NOTA_INFO, "4267 - Otra cosa"])).toContain("2 observaciones");
    expect(resumenDeObservaciones([])).toBeNull();
  });
});

describe("y las coloca donde caben", () => {
  const PANEL = fs.readFileSync(
    path.resolve(__dirname, "../pages/admin/AdminCommercial.tsx"),
    "utf8",
  );
  const MODAL = fs.readFileSync(
    path.resolve(__dirname, "../components/InvoiceDetailDialog.tsx"),
    "utf8",
  );

  it("🔴 una nota que no habla del comprobante NO se pinta como alarma", () => {
    // SUNAT devolvio codigo 0 y el panel de Factiliza lo muestra simplemente
    // como aceptada. Pintarlo en ambar era inventarse una alarma que no existe
    // en ninguna de las dos fuentes, y obligaba a abrir dos paneles para
    // descubrir que no pasaba nada.
    expect(PANEL).toContain("todasInformativas");
    expect(PANEL).toMatch(/soloAviso[\s\S]{0,120}ESTADO_SUNAT\.aceptado/);
  });

  it("pero se dice que la nota existe", () => {
    // Alinear el color no es esconder el dato: se avisa, y el detalle completo
    // esta en «Ver».
    expect(PANEL).toContain("con una nota");
  });

  it("🔴 en la celda NO se vuelca el texto de SUNAT", () => {
    // Cabía una línea y se metieron cinco de jerga de XML: la fila se deformó y
    // encima no se entendía. En la celda va lo esencial; el detalle, en «Ver».
    expect(PANEL).not.toMatch(/sunatNotas\.join/);
    expect(PANEL).not.toMatch(/observaciones\.join/);
  });

  it("y el `title` ya no dice lo contrario que la etiqueta", () => {
    // `sunatError` en estas filas dice «ha sido aceptada» junto a una etiqueta
    // ámbar. El resumen manda; el `sunatError` queda de reserva.
    expect(PANEL).toMatch(/title=\{resumen \?\? inv\.sunatError/);
  });

  it("🔴 el detalle vive en el modal «Ver»", () => {
    expect(MODAL).toContain("leerObservaciones");
    expect(MODAL).toContain("sunatNotas");
    // Con las tres capas: qué pasó, qué significa y el texto original.
    expect(MODAL).toContain("o.resumen");
    expect(MODAL).toContain("o.explicacion");
    expect(MODAL).toContain("o.crudo");
  });

  it("y al anunciante no se le enseña: es un asunto interno", () => {
    // La observación habla de la configuración del emisor, no de su compra.
    // «Observado» le haría pensar que su comprobante tiene un problema.
    expect(MODAL).toMatch(/sunatNotas\?: string\[\] \| null;/);
  });

  it("un observado NO cuenta como comprobante con problema", () => {
    // `observado` es una aceptación. El contador del panel es para lo que se
    // quedó a medias: rechazado, error, vencido o marcado a mano.
    const ADMIN = fs.readFileSync(path.resolve(__dirname, "../lib/admin.ts"), "utf8");
    const m = ADMIN.match(/const ATENCION_SUNAT = \[([^\]]*)\]/);
    expect(m, "no se encontró ATENCION_SUNAT").toBeTruthy();
    expect(m![1]).not.toContain("observado");
  });
});

/**
 * La misma regla, en dos sitios, comparada.
 *
 * `todasInformativas` (navegador) decide de que COLOR se pinta el estado.
 * `soloSonInformativas` (Deno) decide si el comprobante sale a REVISION manual.
 * No pueden compartir modulo —una va en el bundle de Vite y la otra corre en la
 * Edge Function—, y dos copias de una regla es exactamente como empiezan los
 * fallos que nadie ve: el panel diria «aceptado» mientras la lista de pendientes
 * grita, o al reves.
 */
describe("las dos copias de la regla no se separan", () => {
  const CASOS: string[][] = [
    [NOTA_INFO],
    ['INFO: 4092 (nodo: "cac:PartyName")'],
    ["4267 - El dato ingresado no cumple con el formato"],
    [NOTA_INFO, "4267 - El dato ingresado no cumple con el formato"],
    [NOTA_INFO, NOTA_INFO],
    ["4092 - informativo, sin marcador"],
    [],
  ];

  it("🔴 coinciden caso por caso", () => {
    for (const notas of CASOS) {
      expect(
        todasInformativas(notas),
        `discrepan para ${JSON.stringify(notas)}`,
      ).toBe(soloSonInformativas(notas));
    }
  });
});
