import { nombreDepartamento, departamentoPorId } from "@/lib/departamentos";
import { nombrePais, esPeru } from "@/lib/paises";

/**
 * De dónde es un aviso, en una línea y sin repetirse.
 *
 * Lo pidió el cliente para la tarjeta «en vivo» de la portada: «colocar el país,
 * provincia y lugar que se está colocando el aviso». Suena a concatenar tres
 * campos, pero hacerlo tal cual sale mal, porque **se solapan**:
 *
 *   location   "Miraflores, Lima"      ← distrito y provincia, ya juntos
 *   department "15" → "Lima"           ← el departamento del INEI
 *   country    "PE" → "Perú"
 *
 * Concatenando saldría «Miraflores, Lima · Lima · Perú». Por eso cada trozo se
 * añade solo si aporta algo que no esté dicho ya, comparando sin tildes ni
 * mayúsculas —«Cusco» y «Cuzco» son el mismo sitio, y Google usa las dos—.
 *
 * Fuera del Perú no hay departamento que valga: el catálogo del INEI solo
 * describe el Perú, y meter ahí una provincia española archivaría el aviso en el
 * sitio equivocado. Se enseña el lugar y el país, y ya.
 */

/** Comparar nombres de sitio sin que la ortografía moleste. */
const clave = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/z/g, "s").trim();

export interface AvisoUbicable {
  location?: string | null;
  department?: string | null;
  country?: string | null;
}

/**
 * Devuelve algo como «Miraflores, Lima · Perú» o «Madrid · España».
 * Cadena vacía si no se sabe nada, para que quien lo pinte no enseñe un hueco.
 */
export function ubicacionDeAviso(aviso: AvisoUbicable): string {
  const partes: string[] = [];

  /**
   * Añade un trozo si no está ya dicho, comparando POR PARTES.
   *
   * No basta con mirar el texto entero: el departamento 15 se llama
   * «Lima y Callao», y el lugar suele venir como «Miraflores, Lima». Son
   * distintos como cadena, pero «Lima» ya está dicho — y «Miraflores, Lima,
   * Lima y Callao» es exactamente lo que no queremos.
   */
  const trozos = (t: string) => t.split(/\s*,\s*|\s+y\s+/i).map(clave).filter(Boolean);
  const anadir = (texto: string | null | undefined) => {
    const t = (texto ?? "").trim();
    if (!t) return;
    const nuevos = trozos(t);
    const dichos = new Set(partes.flatMap(trozos));
    if (nuevos.some((x) => dichos.has(x))) return;
    partes.push(t);
  };

  anadir(aviso.location);

  // El departamento solo dentro del Perú, y solo si existe de verdad en el
  // catálogo: `nombreDepartamento` devuelve «Sin especificar» cuando no lo
  // encuentra, y eso en una portada queda peor que no poner nada.
  if (esPeru(aviso.country) && departamentoPorId(aviso.department)) {
    anadir(nombreDepartamento(aviso.department));
  }

  const pais = aviso.country ? nombrePais(aviso.country) : null;
  // «Otro país» es el respaldo de `nombrePais` para un código que no está en el
  // catálogo. Decirlo en la portada no informa de nada.
  if (pais && pais !== "Otro país") anadir(pais);

  // Lugar y provincia van con coma, y el país detrás separado: es como se lee de
  // corrido, «Miraflores, Lima · Perú».
  if (partes.length <= 1) return partes.join("");
  const paisFinal = pais && clave(partes[partes.length - 1]) === clave(pais) ? partes.pop() : null;
  const local = partes.join(", ");
  return paisFinal ? `${local} · ${paisFinal}` : local;
}
