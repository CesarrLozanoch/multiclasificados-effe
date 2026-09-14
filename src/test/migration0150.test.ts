// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0150 — el número de «Satisfacción» de la portada.
 *
 * El requisito del cliente tiene una sola frase difícil: «que solo se sume, que
 * no se reste». Casi todo lo que se prueba aquí es esa frase, mirada desde las
 * cuatro formas en que un contador ingenuo bajaría sin que nadie se entere:
 *
 *   1. alguien quita un favorito,
 *   2. se borra el aviso que estaba guardado,
 *   3. se borra la cuenta de quien lo guardó,
 *   4. (la contraria) alguien guarda y quita en bucle para inflarlo.
 *
 * Las tres primeras tienen que dejar el número quieto; la cuarta, también.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0150_favoritos_acumulados.sql"),
  "utf8",
);

const ANA = "00000000-0000-0000-0000-0000000000a1";
const BETO = "00000000-0000-0000-0000-0000000000b2";
const AVISO_1 = "00000000-0000-0000-0000-0000000000c1";
const AVISO_2 = "00000000-0000-0000-0000-0000000000c2";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const num = async (sql: string) =>
  Number((await q<{ v: string }>(`select (${sql})::text as v`))[0].v);

/** El acumulado que se pinta en la portada. */
const acumulado = () =>
  num(`select value from public.platform_counters where key = 'favoritos_acumulados'`);

/** Ejecuta `toggle_favorite` como si la sesión fuera de esa persona. */
const alternar = async (quien: string, aviso: string) => {
  await db.exec(`set local_test.uid = '${quien}'`);
  return (await q<{ r: boolean }>(
    `select public.toggle_favorite('${aviso}') as r`,
  ))[0].r;
};

beforeAll(async () => {
  db = new PGlite();
});

beforeEach(async () => {
  // Cada prueba parte de cero: el contador es global y acumulativo, así que
  // compartirlo entre casos haría que el orden de ejecución cambiara los
  // números — y esa es justo la clase de prueba que engaña.
  await db.exec(`
    drop schema if exists public cascade;
    create schema public;
    drop schema if exists auth cascade;
    create schema auth;
  `);
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated')
        then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'anon')
        then create role anon; end if;
    end $$;

    -- En Supabase esto lo da el JWT. Aquí, una variable de sesión.
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('local_test.uid', true), '')::uuid
    $$;

    create table public.profiles (id uuid primary key, full_name text);
    create table public.listings (
      id uuid primary key, owner_id uuid references public.profiles (id) on delete cascade,
      title text, status text default 'active', views int default 0
    );
    create table public.reviews (id serial primary key, rating int);
    create table public.listing_events (
      id serial primary key,
      listing_id uuid references public.listings (id) on delete cascade,
      type text, visitor_key text
    );
    -- Tal cual está en la 0003: el CASCADE por los dos lados es el motivo de
    -- que un count(*) sobre esta tabla no pueda ser el número de la portada.
    create table public.favorites (
      user_id    uuid not null references public.profiles (id) on delete cascade,
      listing_id uuid not null references public.listings (id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (user_id, listing_id)
    );

    insert into public.profiles (id, full_name) values
      ('${ANA}', 'Ana'), ('${BETO}', 'Beto');
    insert into public.listings (id, owner_id, title) values
      ('${AVISO_1}', '${BETO}', 'Depa en Miraflores'),
      ('${AVISO_2}', '${BETO}', 'Auto seminuevo');
  `);
  await db.exec(MIG);
});

describe("0150 · el acumulado solo sube", () => {
  it("arranca con los favoritos que ya existían", async () => {
    // La migración se aplica sobre una base con datos: el punto de partida no
    // puede ser cero o la portada perdería de golpe todo lo acumulado.
    expect(await acumulado()).toBe(0);

    await alternar(ANA, AVISO_1);
    expect(await acumulado()).toBe(1);
  });

  it("quitar un favorito NO lo baja", async () => {
    expect(await alternar(ANA, AVISO_1)).toBe(true);
    expect(await acumulado()).toBe(1);

    expect(await alternar(ANA, AVISO_1)).toBe(false);
    expect(await acumulado()).toBe(1);

    // Y el favorito deja de estar activo, que es lo que ve el usuario.
    expect(await num(
      `select count(*) from public.favorites
        where user_id = '${ANA}' and removed_at is null`,
    )).toBe(0);
  });

  it("guardar y quitar en bucle no lo infla", async () => {
    for (let i = 0; i < 10; i++) await alternar(ANA, AVISO_1);
    // Diez vueltas, un solo aviso, una sola persona: cuenta una vez.
    expect(await acumulado()).toBe(1);
  });

  it("dos personas distintas sobre el mismo aviso cuentan dos veces", async () => {
    await alternar(ANA, AVISO_1);
    await alternar(BETO, AVISO_1);
    expect(await acumulado()).toBe(2);
  });

  it("borrar el aviso guardado NO lo baja", async () => {
    await alternar(ANA, AVISO_1);
    await alternar(ANA, AVISO_2);
    expect(await acumulado()).toBe(2);

    await db.exec(`delete from public.listings where id = '${AVISO_1}'`);

    // La fila de `favorites` se fue en cascada…
    expect(await num(`select count(*) from public.favorites`)).toBe(1);
    // …y el contador ni se enteró, que es justo el motivo de que viva aparte.
    expect(await acumulado()).toBe(2);
  });

  it("borrar la cuenta de quien guardó NO lo baja", async () => {
    await alternar(ANA, AVISO_1);
    await db.exec(`delete from public.profiles where id = '${ANA}'`);
    expect(await num(`select count(*) from public.favorites`)).toBe(0);
    expect(await acumulado()).toBe(1);
  });
});

describe("0150 · lo que ve cada uno", () => {
  it("platform_stats devuelve el acumulado en saved_total", async () => {
    await alternar(ANA, AVISO_1);
    await alternar(ANA, AVISO_2);
    await alternar(ANA, AVISO_2); // lo quita: no resta

    const stats = (await q<{ s: { saved_total: number } }>(
      `select public.platform_stats() as s`,
    ))[0].s;
    expect(stats.saved_total).toBe(2);
  });

  it("sigue devolviendo `satisfaction` para el APK 2.6, que todavía lo pinta", async () => {
    const stats = (await q<{ s: Record<string, unknown> }>(
      `select public.platform_stats() as s`,
    ))[0].s;
    expect(Object.keys(stats)).toContain("satisfaction");
  });

  it("«veces guardado» del anunciante cuenta solo los vivos", async () => {
    await alternar(ANA, AVISO_1);
    await alternar(BETO, AVISO_1);
    expect(await num(
      `select favorites from public.listing_stats where listing_id = '${AVISO_1}'`,
    )).toBe(2);

    await alternar(ANA, AVISO_1); // Ana lo quita
    // Para el anunciante el número baja —le interesa quién lo tiene guardado
    // AHORA—, aunque el acumulado de la portada no se mueva.
    expect(await num(
      `select favorites from public.listing_stats where listing_id = '${AVISO_1}'`,
    )).toBe(1);
    expect(await acumulado()).toBe(2);
  });
});

describe("0150 · nadie puede escribir el número de la portada", () => {
  it("anon y authenticated no tienen ningún permiso sobre la tabla", async () => {
    // Supabase concede ALL a estos dos roles en cada tabla nueva de `public`, y
    // PGlite no reproduce esos privilegios por defecto — así que esta prueba
    // NO demuestra que en producción esté cerrado, solo que la migración hace
    // el revoke. Lo que lo cierra de verdad es el revoke explícito del fichero.
    for (const rol of ["anon", "authenticated"]) {
      for (const priv of ["select", "insert", "update", "delete"]) {
        expect(await num(
          `select has_table_privilege('${rol}', 'public.platform_counters', '${priv}')::int`,
        )).toBe(0);
      }
    }
  });

  it("platform_stats sí la puede leer cualquiera, con sesión o sin ella", async () => {
    for (const rol of ["anon", "authenticated"]) {
      expect(await num(
        `select has_function_privilege('${rol}', 'public.platform_stats()', 'execute')::int`,
      )).toBe(1);
    }
  });

  it("toggle_favorite exige sesión", async () => {
    await db.exec(`set local_test.uid = ''`);
    await expect(
      db.query(`select public.toggle_favorite('${AVISO_1}')`),
    ).rejects.toThrow(/No autenticado/);
  });
});
