import { Lock, ShieldCheck, CreditCard, BadgeCheck } from "lucide-react";

/**
 * El sello de «Pago seguro» que se enseña justo donde se va a teclear la
 * tarjeta.
 *
 * POR QUÉ EXISTE. Lo pidió el cliente, y es de las cosas que más miden en una
 * pasarela: el momento de escribir el número de la tarjeta es donde la gente se
 * cae. Antes solo había una línea gris al pie del formulario —«Pago cifrado
 * procesado por Izipay»—, debajo del botón y en el tamaño más pequeño de la
 * pantalla, o sea justo donde no se lee.
 *
 * TODO LO QUE DICE ES VERDAD, Y ESO NO ES UN DETALLE. Un sello de seguridad que
 * exagera es peor que no ponerlo: si un cliente lo comprueba y no cuadra, el
 * daño es a la confianza en todo lo demás.
 *
 *   · «no viajan por nuestros servidores» — cierto: los campos de la tarjeta son
 *     iframes del dominio de Lyra/Izipay (Krypton). El número no pasa por el
 *     JavaScript de eFFe ni llega a la base de datos; lo que vuelve es un token.
 *   · «Izipay» — cierto, es la pasarela real y en producción.
 *   · «cifrado» — cierto, todo va por HTTPS contra los dominios de Izipay.
 *
 * Lo que NO dice, a propósito: nada de «3D Secure» ni de «verificado por tu
 * banco». La autenticación 3DS depende del banco emisor y de la configuración de
 * la tienda, no de nosotros, y prometerla aquí sería afirmar algo que no
 * controlamos.
 *
 * Tampoco se pintan los logos de Visa o Mastercard como imágenes: son marcas
 * registradas con sus propias normas de uso, y el formulario de Izipay ya
 * enseña la marca de la tarjeta en cuanto se teclean los primeros dígitos.
 *
 * `variante`:
 *   · "completo" — la banda entera. Va ARRIBA del formulario de tarjeta.
 *   · "linea"    — una sola línea discreta. Para el pie, o para Yape/Plin, donde
 *                  no se teclea ninguna tarjeta y la banda grande sobraría.
 */
export function SelloPagoSeguro({
  variante = "completo",
  className = "",
}: {
  variante?: "completo" | "linea";
  className?: string;
}) {
  if (variante === "linea") {
    return (
      <p className={`flex items-center gap-1.5 text-[11px] text-muted-foreground ${className}`}>
        <Lock size={12} className="text-success shrink-0" aria-hidden="true" />
        Pago cifrado procesado por Izipay
      </p>
    );
  }

  return (
    <div className={`border border-success/30 bg-success/5 px-4 py-3 space-y-2.5 ${className}`}>
      <div className="flex items-center gap-2.5">
        {/* El candado es el icono que la gente asocia con esto desde hace
            veinte años. No hay que ser original aquí. */}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15">
          <Lock size={16} className="text-success" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground leading-tight">Pago 100 % seguro</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Procesado por <span className="font-semibold text-foreground">Izipay</span>. Los datos de
            tu tarjeta viajan cifrados y no pasan por nuestros servidores.
          </p>
        </div>
      </div>

      {/* Los tres sellos. `flex-wrap` porque en un móvil estrecho se parten, y
          partidos siguen leyéndose; apretados en una línea, no. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-success/20 pt-2">
        {[
          { Icono: ShieldCheck, texto: "Conexión cifrada" },
          { Icono: CreditCard, texto: "Visa, Mastercard, Amex" },
          { Icono: BadgeCheck, texto: "Comprobante electrónico" },
        ].map(({ Icono, texto }) => (
          <li key={texto} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icono size={13} className="text-success shrink-0" aria-hidden="true" />
            {texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
