// Leer y guardar el documento legal.
//
// Mismo planteamiento que `acercaDe.ts`: vive en `system_settings`, lo expone
// una función `security definer` legible SIN sesión, y ante cualquier fallo se
// devuelve el documento de fábrica en vez de dejar la página en blanco.
//
// Aquí el respaldo pesa más que en «Acerca de Nosotros». `/privacidad` es la
// dirección que la ficha de Google Play tiene registrada como política de
// privacidad, y Play la revisa en cada actualización: si un fallo de red la
// dejara vacía justo ese día, es un rechazo de la publicación.
import { supabase } from "@/lib/supabase";
import { normalizarDocumento, type Documento } from "@/lib/documentoLegal";
import { DOCUMENTO_POR_DEFECTO, FECHA_POR_DEFECTO } from "@/lib/legalPorDefecto";

export interface DocumentoLegalCompleto {
  bloques: Documento;
  /** Texto libre: «14 de septiembre de 2026». */
  actualizado: string;
  /** false = es el de fábrica, porque la base no respondió o no hay nada escrito. */
  deLaBase: boolean;
}

export const CLAVE_DOCUMENTO = "legal_documento";
export const CLAVE_ACTUALIZADO = "legal_actualizado";

export const LEGAL_DE_FABRICA: DocumentoLegalCompleto = {
  bloques: DOCUMENTO_POR_DEFECTO,
  actualizado: FECHA_POR_DEFECTO,
  deLaBase: false,
};

/** Separado de la llamada para poder probarlo sin base de datos. */
export function normalizarLegal(data: unknown): DocumentoLegalCompleto {
  if (!data || typeof data !== "object") return LEGAL_DE_FABRICA;
  const crudo = data as Record<string, unknown>;

  const bloques = normalizarDocumento(crudo.bloques);
  // Si no hay bloques utilizables se vuelve al documento entero de fábrica, no
  // a un documento a medias: media política de privacidad es peor que la
  // anterior completa.
  if (!bloques) return LEGAL_DE_FABRICA;

  const actualizado =
    typeof crudo.actualizado === "string" && crudo.actualizado.trim()
      ? crudo.actualizado.trim()
      : FECHA_POR_DEFECTO;

  return { bloques, actualizado, deLaBase: true };
}

export async function fetchDocumentoLegal(): Promise<DocumentoLegalCompleto> {
  try {
    const { data, error } = await supabase.rpc("documento_legal");
    if (error) throw error;
    return normalizarLegal(data);
  } catch {
    return LEGAL_DE_FABRICA;
  }
}

/**
 * La fecha de «última actualización», tal y como se escribe en el documento.
 *
 * Se calcula al guardar y no la teclea nadie: una fecha de actualización que
 * hay que acordarse de cambiar a mano acaba mintiendo, y en un documento legal
 * eso es justo lo que no puede pasar.
 */
export function fechaDeHoyEnLetras(hoy = new Date()): string {
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;
}
