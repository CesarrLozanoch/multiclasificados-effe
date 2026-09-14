// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { normalizarDocumento, textoPlano } from "@/lib/documentoLegal";
import { DOCUMENTO_POR_DEFECTO } from "@/lib/legalPorDefecto";
import { normalizarLegal, LEGAL_DE_FABRICA, fechaDeHoyEnLetras } from "@/lib/legal";

const RAIZ = path.resolve(__dirname, "../..");
const RUTA = path.join(RAIZ, "supabase/migrations/0151_terminos_editables.sql");
const MIG = fs.readFileSync(RUTA, "utf8");

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const num = async (sql: string) =>
  Number((await q<{ v: string }>(`select (${sql})::text as v`))[0].v);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create table public.system_settings (
      key text primary key, value jsonb, label text,
      updated_at timestamptz not null default now()
    );
    insert into public.system_settings (key, value, label)
      values ('payment_worker_secret', '"no-se-debe-ver"'::jsonb, 'Secreto');
  `);
  await db.exec(MIG);
});

describe("0151 · la semilla no se escribe dos veces a mano", () => {
  it("la migración coincide con src/lib/legalPorDefecto.ts", () => {
    // Si esto falla, alguien tocó el documento de fábrica y no regeneró la
    // migración (o al revés). Quedarían dos versiones distintas del mismo
    // contrato: la que ve quien entra hoy y la que se sembraría en una base
    // nueva. Se arregla con `node scripts/generar-semilla-legal.mjs`.
    expect(() =>
      execFileSync("node", ["scripts/generar-semilla-legal.mjs", "--verificar"], {
        cwd: RAIZ, encoding: "utf8",
      }),
    ).not.toThrow();
  });

  it("el JSON sembrado es exactamente el documento de fábrica", () => {
    // El generador tiene su propia copia del parseo, porque no puede importar
    // TypeScript con alias desde Node. Esta comprobación es la que impide que
    // las dos copias se separen: compara el resultado FINAL, no el código.
    const m = MIG.match(/\('legal_documento', '([\s\S]*?)'::jsonb/);
    expect(m, "la migración ya no siembra `legal_documento`").not.toBeNull();
    const sembrado = JSON.parse(m![1].split("''").join("'"));
    expect(sembrado).toEqual(DOCUMENTO_POR_DEFECTO);
  });

  it("lo sembrado sobrevive a la normalización del front", () => {
    const m = MIG.match(/\('legal_documento', '([\s\S]*?)'::jsonb/);
    const sembrado = JSON.parse(m![1].split("''").join("'"));
    expect(normalizarDocumento(sembrado)).toEqual(DOCUMENTO_POR_DEFECTO);
  });
});

describe("0151 · la función que lee el documento", () => {
  it("devuelve los bloques y la fecha", async () => {
    const d = (await q<{ d: { bloques: unknown[]; actualizado: string } }>(
      `select public.documento_legal() as d`,
    ))[0].d;
    expect(Array.isArray(d.bloques)).toBe(true);
    expect(d.bloques).toHaveLength(DOCUMENTO_POR_DEFECTO.length);
    // La fecha llega como texto plano, no entrecomillada: con `->>` en vez de
    // `#>> '{}'` saldrían las comillas impresas al pie del documento.
    expect(d.actualizado).toBe("16 de junio de 2026");
  });

  it("la lee cualquiera, con sesión y sin ella", async () => {
    // Por la 0104 una función nueva nace sin execute. Sin el grant, la página
    // legal saldría vacía y sin decir por qué — y esa página vacía es el
    // rechazo de la ficha en Google Play.
    for (const rol of ["anon", "authenticated"]) {
      expect(await num(
        `select has_function_privilege('${rol}', 'public.documento_legal()', 'execute')::int`,
      )).toBe(1);
    }
  });

  it("NO deja al alcance ningún otro ajuste", async () => {
    // En `system_settings` hay secretos. La función expone solo las dos claves
    // escritas a mano en su cuerpo; generalizarla a get_public_setting(key)
    // pondría `payment_worker_secret` al alcance de la clave anónima, que viaja
    // dentro del JavaScript de la web.
    const d = (await q<{ d: Record<string, unknown> }>(
      `select public.documento_legal() as d`,
    ))[0].d;
    expect(Object.keys(d).sort()).toEqual(["actualizado", "bloques"]);
    expect(JSON.stringify(d)).not.toContain("no-se-debe-ver");
  });

  it("aplicarla otra vez no pisa un texto ya editado", async () => {
    await db.exec(`
      update public.system_settings
         set value = '[{"tipo":"parrafo","texto":[{"t":"Lo que escribió el abogado"}]}]'::jsonb
       where key = 'legal_documento';
    `);
    await db.exec(MIG);   // el `on conflict do nothing` tiene que respetarlo
    const d = (await q<{ d: { bloques: unknown[] } }>(`select public.documento_legal() as d`))[0].d;
    expect(d.bloques).toHaveLength(1);
    expect(textoPlano(normalizarDocumento(d.bloques)![0])).toBe("Lo que escribió el abogado");
  });
});

describe("0151 · el front ante una respuesta rota", () => {
  it("sin bloques utilizables vuelve al documento entero de fábrica", () => {
    for (const roto of [
      null, {}, { bloques: null }, { bloques: [] }, { bloques: "texto" },
      { bloques: [{ tipo: "inventado", texto: [{ t: "x" }] }] },
    ]) {
      expect(normalizarLegal(roto)).toBe(LEGAL_DE_FABRICA);
    }
  });

  it("con bloques buenos y fecha vacía conserva el texto y repone la fecha", () => {
    const r = normalizarLegal({
      bloques: [{ tipo: "parrafo", texto: [{ t: "Algo" }] }],
      actualizado: "   ",
    });
    expect(r.deLaBase).toBe(true);
    expect(r.bloques).toHaveLength(1);
    expect(r.actualizado).toBe(LEGAL_DE_FABRICA.actualizado);
  });
});

describe("la fecha del documento", () => {
  it("se escribe en letras y en español", () => {
    expect(fechaDeHoyEnLetras(new Date(2026, 8, 14))).toBe("14 de septiembre de 2026");
    expect(fechaDeHoyEnLetras(new Date(2026, 0, 1))).toBe("1 de enero de 2026");
  });
});
