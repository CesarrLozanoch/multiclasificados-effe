/**
 * Escribe dentro de la migración 0151 el documento legal de fábrica, tomándolo
 * de `src/lib/legalPorDefecto.ts`.
 *
 *   node scripts/generar-semilla-legal.mjs
 *   node scripts/generar-semilla-legal.mjs --verificar   (no escribe; falla si difiere)
 *
 * ── POR QUÉ UN GENERADOR Y NO PEGARLO A MANO ─────────────────────────────────
 *
 * El mismo documento tiene que estar en dos sitios: en el front, como respaldo
 * si la base no responde —`/privacidad` es la dirección registrada en Google
 * Play y no puede salir en blanco—, y en la migración, como punto de partida de
 * lo que el cliente va a editar. Son sesenta bloques de texto legal: copiarlos
 * a mano es garantizar que un día digan cosas distintas, y que nadie lo note
 * hasta que un abogado compare las dos versiones.
 *
 * Así la migración es una DERIVADA del fichero de TypeScript, no una copia. Y
 * `--verificar` lo comprueba desde las pruebas, que es lo que impide que alguien
 * toque el texto y se olvide de regenerar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRACION = path.join(RAIZ, "supabase/migrations/0151_terminos_editables.sql");

const INICIO = "-- <<< SEMILLA GENERADA: no editar a mano (scripts/generar-semilla-legal.mjs)";
const FIN = "-- >>> FIN DE LA SEMILLA GENERADA";

/**
 * El documento, resuelto sin arrancar Vite.
 *
 * `legalPorDefecto.ts` es TypeScript con alias `@/`, así que no se puede
 * importar desde Node a secas. En vez de montar un compilador para esto, se lee
 * el texto fuente del módulo y se aplica el mismo parseo, que es una función
 * corta y sin dependencias. La prueba compara el resultado con el que produce
 * el módulo de verdad, así que si las dos rutas se separaran, se vería.
 */
function documentoDeFabrica() {
  const ts = fs.readFileSync(path.join(RAIZ, "src/lib/legalPorDefecto.ts"), "utf8");

  const fuente = ts.match(/const FUENTE = `([\s\S]*?)`;/);
  if (!fuente) throw new Error("No se encontró la plantilla FUENTE en legalPorDefecto.ts");

  const correo = fs
    .readFileSync(path.join(RAIZ, "src/lib/soporte.ts"), "utf8")
    .match(/CORREO_SOPORTE\s*=\s*"([^"]+)"/);
  if (!correo) throw new Error("No se encontró CORREO_SOPORTE en soporte.ts");

  const fecha = ts.match(/FECHA_POR_DEFECTO = "([^"]+)"/);
  if (!fecha) throw new Error("No se encontró FECHA_POR_DEFECTO en legalPorDefecto.ts");

  return {
    bloques: parsearDocumento(fuente[1].replaceAll("${CORREO_SOPORTE}", correo[1])),
    actualizado: fecha[1],
  };
}

// Copia literal de `parsearTexto` / `parsearDocumento` de
// src/lib/documentoLegal.ts. Una prueba compara las dos.
function parsearTexto(linea) {
  const out = [];
  const partes = linea.split("**");
  partes.forEach((parte, i) => {
    if (!parte) return;
    const enNegrita = i % 2 === 1 && i < partes.length - 1;
    out.push(enNegrita ? { t: parte, b: true } : { t: parte });
  });
  return out.length ? out : [{ t: linea }];
}

function parsearDocumento(fuente) {
  const bloques = [];
  for (const cruda of fuente.split("\n")) {
    const linea = cruda.trim();
    if (!linea) continue;
    if (linea.startsWith("## ")) {
      bloques.push({ tipo: "epigrafe", texto: parsearTexto(linea.slice(3).trim()) });
    } else if (linea.startsWith("# ")) {
      let resto = linea.slice(2).trim();
      let ancla;
      const marca = resto.match(/\s*\{datos-personales\}$/);
      if (marca) {
        ancla = "datos-personales";
        resto = resto.slice(0, marca.index).trim();
      }
      const bloque = { tipo: "titulo", texto: parsearTexto(resto) };
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

/** Literal de Postgres: las comillas simples se duplican. */
const comillar = (s) => `'${s.replaceAll("'", "''")}'`;

function bloqueSql() {
  const { bloques, actualizado } = documentoDeFabrica();
  return [
    INICIO,
    `-- ${bloques.length} bloques. Para cambiar el texto se edita`,
    "-- src/lib/legalPorDefecto.ts y se vuelve a ejecutar el generador.",
    "insert into public.system_settings (key, value, label) values",
    `  ('legal_documento', ${comillar(JSON.stringify(bloques))}::jsonb,`,
    "   'Términos y Condiciones · Documento'),",
    `  ('legal_actualizado', to_jsonb(${comillar(actualizado)}::text),`,
    "   'Términos y Condiciones · Última actualización')",
    "on conflict (key) do nothing;",
    FIN,
  ].join("\n");
}

const sql = fs.readFileSync(MIGRACION, "utf8");
const i = sql.indexOf(INICIO);
const j = sql.indexOf(FIN);
if (i < 0 || j < 0) {
  console.error(`La migración no tiene los marcadores de la semilla:\n  ${MIGRACION}`);
  process.exit(1);
}

const actual = sql.slice(i, j + FIN.length);
const nuevo = bloqueSql();

if (process.argv.includes("--verificar")) {
  if (actual.replaceAll("\r\n", "\n") !== nuevo) {
    console.error(
      "\n⚠️  La semilla de la 0151 no coincide con src/lib/legalPorDefecto.ts.\n\n" +
      "   Alguien cambió el documento de fábrica y no regeneró la migración, o al\n" +
      "   revés. Quedarían dos versiones distintas del mismo contrato: la que ve\n" +
      "   quien entra hoy y la que se sembraría en una base nueva.\n\n" +
      "   Se arregla con:  node scripts/generar-semilla-legal.mjs\n",
    );
    process.exit(1);
  }
  console.log("✓ La semilla de la 0151 coincide con el documento de fábrica.");
  process.exit(0);
}

fs.writeFileSync(MIGRACION, sql.slice(0, i) + nuevo + sql.slice(j + FIN.length), "utf8");
console.log(`✓ Semilla regenerada en ${path.relative(RAIZ, MIGRACION)}.`);
