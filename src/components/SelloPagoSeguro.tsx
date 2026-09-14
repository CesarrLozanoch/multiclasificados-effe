import { Lock, ShieldCheck, CreditCard, BadgeCheck, UserCheck } from "lucide-react";

/**
 * El sello de «Pago seguro» que se enseña justo donde se va a pagar.
 *
 * POR QUÉ EXISTE. Lo pidió el cliente, y es de las cosas que más miden en una
 * pasarela: el momento de pagar es donde la gente se cae. Antes solo había una
 * línea gris al pie del formulario —«Pago cifrado procesado por Izipay»—,
 * debajo del botón y en el tamaño más pequeño de la pantalla, o sea justo donde
 * no se lee.
 *
 * ── TODO LO QUE DICE ES VERDAD, Y ESO NO ES UN DETALLE ───────────────────────
 *
 * Un sello de seguridad que exagera es peor que no ponerlo: si un cliente lo
 * comprueba y no cuadra, el daño es a la confianza en todo lo demás. Por eso
 * hay DOS variantes y no una sola frase para todo — lo que es cierto pagando
 * con tarjeta no lo es pagando por Yape, y al revés.
 *
 *   TARJETA (Izipay)
 *     · «no pasan por nuestros servidores» — cierto: los campos de la tarjeta
 *       son iframes del dominio de Lyra/Izipay (Krypton). El número no pasa por
 *       el JavaScript de eFFe ni llega a la base; lo que vuelve es un token.
 *     · «cifrado» — cierto, todo va por HTTPS contra los dominios de Izipay.
 *
 *   BILLETERA (Yape / Plin)
 *     · Aquí NO interviene Izipay, así que no se le menciona: sería falso, y es
 *       el motivo por el que esta variante existe en vez de reutilizar la otra.
 *     · «transfieres tú desde tu app» — cierto: eFFe no inicia ningún cobro.
 *     · «nunca te pedimos tu clave» — cierto, y hace falta decirlo: la estafa
 *       habitual con billeteras en Perú es justo esa llamada pidiendo la clave
 *       o el código de verificación.
 *     · «lo confirma una persona» — cierto: la orden queda pendiente hasta que
 *       alguien del equipo aprueba el voucher (`settle_paid_order`).
 *
 * Lo que NO dice ninguna de las dos, a propósito: nada de «3D Secure» ni de
 * «verificado por tu banco». Eso depende del banco emisor y de la configuración
 * de la tienda, no de nosotros, y prometerlo sería afirmar algo que no
 * controlamos.
 *
 * Tampoco se pintan los logos de Visa o Mastercard como imágenes: son marcas
 * registradas con sus propias normas de uso, y el formulario de Izipay ya
 * enseña la marca de la tarjeta en cuanto se teclean los primeros dígitos.
 */

interface Props {
  /**
   * Con qué se está pagando. Decide QUÉ se afirma, no solo cómo se ve.
   * `tarjeta` habla de Izipay; `billetera` no puede.
   */
  medio?: "tarjeta" | "billetera";
  /** El nombre que ve el usuario: «Yape», «Plin». Solo para la billetera. */
  nombre?: string;
  /**
   * `completo` — la banda entera. Va ARRIBA, donde se paga.
   * `linea`    — una sola línea discreta, para el pie.
   */
  variante?: "completo" | "linea";
  className?: string;
}

export function SelloPagoSeguro({
  medio = "tarjeta",
  nombre,
  variante = "completo",
  className = "",
}: Props) {
  const esBilletera = medio === "billetera";
  const app = nombre || "tu billetera";

  if (variante === "linea") {
    return (
      <p className={`flex items-center gap-1.5 text-[11px] text-muted-foreground ${className}`}>
        <Lock size={12} className="text-success shrink-0" aria-hidden="true" />
        {esBilletera
          ? `Transferencia desde tu app de ${app} a la cuenta oficial de eFFe`
          : "Pago cifrado procesado por Izipay"}
      </p>
    );
  }

  // Los tres sellos NO repiten lo que ya dice el párrafo de arriba: decir dos
  // veces «nunca te pedimos tu clave» dentro del mismo recuadro es ruido, y
  // gasta el sitio del único dato que ahí falta — que esto no se acredita solo.
  const sellos = esBilletera
    ? [
        { Icono: UserCheck, texto: "Cuenta oficial de eFFe" },
        { Icono: ShieldCheck, texto: "Lo confirma nuestro equipo" },
        { Icono: BadgeCheck, texto: "Comprobante electrónico" },
      ]
    : [
        { Icono: ShieldCheck, texto: "Conexión cifrada" },
        { Icono: CreditCard, texto: "Visa, Mastercard, Amex" },
        { Icono: BadgeCheck, texto: "Comprobante electrónico" },
      ];

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
            {esBilletera ? (
              <>
                La transferencia la haces <span className="font-semibold text-foreground">tú</span>,
                desde tu app de {app}, a una cuenta oficial de eFFe. Nunca te pedimos tu clave ni
                acceso a tu billetera.
              </>
            ) : (
              <>
                Procesado por <span className="font-semibold text-foreground">Izipay</span>. Los
                datos de tu tarjeta viajan cifrados y no pasan por nuestros servidores.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Los tres sellos. `flex-wrap` porque en un móvil estrecho se parten, y
          partidos siguen leyéndose; apretados en una línea, no. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-success/20 pt-2">
        {sellos.map(({ Icono, texto }) => (
          <li key={texto} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icono size={13} className="text-success shrink-0" aria-hidden="true" />
            {texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
