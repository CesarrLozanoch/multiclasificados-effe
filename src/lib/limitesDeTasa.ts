// Los topes de publicación y de mensajes por usuario, que frenan las ráfagas.
//
// El freno en sí NO está aquí ni en ninguna Edge Function: vive en dos triggers
// de la base de datos (migración 0124), que es el único sitio por el que pasan
// sí o sí todas las publicaciones y todos los mensajes. Este módulo es solo la
// parte del panel: leer los números que hay puestos y escribir los nuevos.
//
// El valor vive en `system_settings.limites_de_tasa` con esta forma:
//
//     {"aviso": {"hora": 30, "dia": 100}, "mensaje": {"hora": 60, "dia": 200}}
//
// DE DÓNDE SALEN LOS NÚMEROS POR DEFECTO. No son a ojo: medido sobre los datos
// reales del 26-ago-2026, lo máximo que hizo una sola persona fueron 10 avisos
// en una hora y 28 en un día, y 20 mensajes en una hora y 28 en un día. Los
// topes están unas tres veces por encima de ese máximo observado.
//
// ESTÁN REPETIDOS EN LA MIGRACIÓN, A PROPÓSITO. El trigger tiene los mismos
// valores escritos en su cuerpo como último recurso, porque se ejecuta dentro
// de un INSERT: si la configuración desapareciera o alguien escribiera basura,
// lo que NO puede pasar es que nadie pueda publicar. Una prueba compara las dos
// copias para que no se separen.
export interface Limites {
  aviso: { hora: number; dia: number };
  mensaje: { hora: number; dia: number };
}

/** La clave de `system_settings` donde vive todo esto. */
export const CLAVE_LIMITES = "limites_de_tasa";

/** Cómo se llama la fila en el panel de variables del sistema. */
export const ETIQUETA_LIMITES = "Límites de seguridad (antiabuso)";

export const LIMITES_POR_DEFECTO: Limites = {
  aviso: { hora: 30, dia: 100 },
  mensaje: { hora: 60, dia: 200 },
};

/**
 * Un tope en 0 significa SIN LÍMITE, y es la válvula de escape: si un cliente
 * real se topa con el freno un sábado por la tarde, el superadministrador lo
 * desactiva desde el panel sin esperar a un despliegue.
 */
export const SIN_LIMITE = 0;

/**
 * Convierte lo que haya guardado en cuatro números utilizables.
 *
 * Deliberadamente a prueba de basura, y valor por valor: si alguien deja mal
 * uno solo, se recupera ESE y los otros tres se respetan. Es el mismo criterio
 * que `normalizarAcercaDe`, y el mismo que aplica el trigger en la base.
 *
 * Los negativos se tratan como 0 (sin límite) en vez de rechazarse. No es un
 * capricho: la función `tope_de_tasa` de la 0124 limpia el valor con una
 * expresión que borra todo lo que no sea un dígito, así que un «-5» guardado le
 * llegaría como 5 —un tope durísimo— en lugar de como «sin límite». Plegando
 * aquí los negativos a 0, lo que se ve en el panel y lo que hace la base
 * coinciden.
 */
export function normalizarLimites(data: unknown): Limites {
  const crudo = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;

  const tope = (accion: keyof Limites, ventana: "hora" | "dia"): number => {
    const rama = crudo[accion];
    const v = rama && typeof rama === "object"
      ? (rama as Record<string, unknown>)[ventana]
      : undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return LIMITES_POR_DEFECTO[accion][ventana];
    return Math.max(0, Math.floor(n));
  };

  return {
    aviso: { hora: tope("aviso", "hora"), dia: tope("aviso", "dia") },
    mensaje: { hora: tope("mensaje", "hora"), dia: tope("mensaje", "dia") },
  };
}

/**
 * Avisa de las combinaciones que no tienen sentido, para poder decirlo antes de
 * guardar en vez de dejar que el cliente lo descubra cuando alguien se queda
 * sin poder publicar.
 *
 * Un tope diario por debajo del de una hora no es un error de sintaxis —la base
 * lo acepta— pero convierte el tope horario en decorativo: nunca llega a saltar
 * porque el diario corta antes. Lo que ve el usuario entonces es el mensaje
 * equivocado («máximo por día» a los diez minutos de empezar).
 */
export function avisoDeLimites(l: Limites): string | null {
  const problemas: string[] = [];
  for (const [accion, nombre] of [["aviso", "avisos"], ["mensaje", "mensajes"]] as const) {
    const { hora, dia } = l[accion];
    if (hora > SIN_LIMITE && dia > SIN_LIMITE && dia < hora) {
      problemas.push(
        `el tope diario de ${nombre} (${dia}) es menor que el de una hora (${hora})`,
      );
    }
  }
  return problemas.length ? `Revisa esto: ${problemas.join("; ")}.` : null;
}
