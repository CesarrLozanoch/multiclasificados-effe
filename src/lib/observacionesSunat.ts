/**
 * Las observaciones de SUNAT, dichas en cristiano.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 *
 * Cuando SUNAT acepta un comprobante puede dejar una nota en el CDR. Llega así:
 *
 *   4092 - El nombre comercial del emisor no cumple con el formato establecido
 *   - INFO: 4092 (nodo: "cac:PartyName/cbc:Name" valor: "-")
 *
 * Eso es una traza para quien depura XML, no algo que se pueda poner delante de
 * nadie. Pegado tal cual en el panel ocupa cinco líneas, no se entiende y —lo
 * peor— parece un error cuando en realidad **el comprobante fue aceptado**.
 *
 * Aquí se parte en tres: el código, una frase que se lee, y qué significa. El
 * texto original NO se tira: se guarda en `crudo` para enseñarlo en el detalle,
 * que es donde alguien que sepa de esto va a querer verlo.
 */

/** Una observación de SUNAT, ya masticada. */
export interface ObservacionSunat {
  /** El código del catálogo de SUNAT, si venía delante (p. ej. "4092"). */
  codigo: string | null;
  /** Una línea corta, legible, sin jerga de XML. */
  resumen: string;
  /**
   * Qué significa y a quién le toca arreglarlo. Solo para las que conocemos:
   * inventar una explicación para un código que no hemos visto sería peor que
   * no dar ninguna.
   */
  explicacion: string | null;
  /** El texto tal cual lo devolvió SUNAT. Nunca se pierde. */
  crudo: string;
  /**
   * SUNAT la marcó como meramente informativa (el literal `INFO:` en el texto).
   *
   * OJO — ESTA REGLA ESTÁ DOS VECES. La otra copia es `soloSonInformativas` en
   * `supabase/functions/_shared/factiliza.ts`, que decide si el comprobante sale
   * a revisión manual. No pueden compartir módulo porque una vive en el bundle
   * del navegador y la otra en Deno, así que hay una prueba que las compara con
   * los mismos casos: si alguien cambia una, salta.
   */
  informativa: boolean;
}

/**
 * Las que hemos visto de verdad, con lo que hay que hacer con ellas.
 *
 * Se añaden de una en una, según aparezcan. Un diccionario adivinado a partir
 * del catálogo de SUNAT diría cosas que no hemos comprobado.
 */
const CONOCIDAS: Record<string, { resumen: string; explicacion: string }> = {
  "4092": {
    resumen: "Falta el nombre comercial de la empresa emisora",
    explicacion:
      "Es un dato del perfil de la empresa en Factiliza, no del comprobante: " +
      "no viaja en la venta ni depende del cliente. Se corrige rellenándolo en " +
      "el panel de Factiliza, y a partir de ahí las facturas salen sin este " +
      "aviso. Las ya emitidas no hay que rehacerlas.",
  },
};

/** `4092 - Texto de SUNAT - INFO: 4092 (nodo: "…" valor: "…")` */
const CON_CODIGO = /^\s*(\d{3,5})\s*[-–:]\s*/;
/** La cola técnica: a partir de `- INFO:` empieza la traza del XML. */
const COLA_TECNICA = /\s*[-–]\s*INFO:.*$/is;

/** Primera letra en mayúscula, sin tocar el resto (hay siglas y nodos). */
function enMayuscula(t: string): string {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * Interpreta una nota del CDR.
 *
 * Nunca lanza y nunca devuelve un resumen vacío: si el texto no encaja con nada
 * de lo previsto, el resumen es el propio texto. Perder la observación por no
 * saber formatearla sería el peor de los desenlaces.
 */
export function leerObservacion(nota: string): ObservacionSunat {
  const crudo = (nota ?? "").trim();
  const m = crudo.match(CON_CODIGO);
  const codigo = m ? m[1] : null;

  const informativa = /\bINFO:/.test(crudo);

  const conocida = codigo ? CONOCIDAS[codigo] : undefined;
  if (conocida) {
    return { codigo, resumen: conocida.resumen, explicacion: conocida.explicacion, crudo, informativa };
  }

  // Sin diccionario: al menos se le quita la cola de XML y el código repetido,
  // que es lo que hace el texto ilegible.
  const limpio = enMayuscula(crudo.replace(CON_CODIGO, "").replace(COLA_TECNICA, "").trim());
  return { codigo, resumen: limpio || crudo, explicacion: null, crudo, informativa };
}

/**
 * Si NINGUNA de las notas dice nada sobre este comprobante.
 *
 * Es lo que separa «aceptado, y aquí va un apunte sobre la configuración del
 * emisor» de «aceptado, pero mira esto». Lo primero no debe pintarse como si
 * algo hubiera ido mal: SUNAT lo aceptó y el panel de Factiliza lo muestra
 * simplemente como aceptado.
 *
 * Ante la duda, `false`: una nota sin el marcador puede estar hablando de la
 * venta, y esa sí hay que mirarla.
 */
export function todasInformativas(notas: string[]): boolean {
  if (notas.length === 0) return false;
  return leerObservaciones(notas).every((o) => o.informativa);
}

/** Todas las notas de un comprobante, en el mismo orden. */
export function leerObservaciones(notas: string[]): ObservacionSunat[] {
  return notas.map(leerObservacion);
}

/**
 * La línea que resume el estado para un vistazo rápido (la celda de la tabla,
 * el `title` de la etiqueta).
 *
 * Dice primero LO IMPORTANTE —que se emitió— porque la etiqueta ámbar por sí
 * sola se lee como un fallo, y no lo es.
 */
export function resumenDeObservaciones(notas: string[]): string | null {
  if (notas.length === 0) return null;
  const partes = leerObservaciones(notas).map((o) => o.resumen);
  return `Emitida y aceptada por SUNAT, con ${
    partes.length === 1 ? "una observación" : `${partes.length} observaciones`
  }: ${partes.join(" · ")}`;
}
