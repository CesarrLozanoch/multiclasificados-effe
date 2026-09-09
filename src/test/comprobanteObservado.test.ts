import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

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

describe("y las enseña", () => {
  const PANEL = fs.readFileSync(
    path.resolve(__dirname, "../pages/admin/AdminCommercial.tsx"),
    "utf8",
  );

  it("🔴 la observación se ve, no solo en el tooltip", () => {
    // En el móvil no hay tooltip. Una etiqueta ámbar que no se puede
    // interpretar acaba ignorándose, que es justo lo que se quiere evitar.
    expect(PANEL).toContain("inv.sunatNotas");
    expect(PANEL).toMatch(/\{observaciones\.join\(" · "\)\}/);
  });

  it("y desplaza al `sunatError`, que ahí dice lo contrario", () => {
    expect(PANEL).toMatch(/observaciones\?\.join\("\\n"\) \?\? inv\.sunatError/);
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
