import { Fragment } from "react";
import { esColorValido } from "@/lib/textoConFormato";
import { partirEnlaces, type Bloque, type Documento } from "@/lib/documentoLegal";

/**
 * Pinta el documento legal.
 *
 * Lo ejecuta cualquiera que abra `/terminos`, `/privacidad` o el modal del
 * registro, y su contenido lo escribe una persona desde el panel. Por eso es a
 * propósito la pieza más simple posible: recorre bloques y devuelve elementos.
 *
 * NO HAY `dangerouslySetInnerHTML` NI LO HABRÁ. Es lo que hace que un
 * administrador que pegue aquí algo que le pasaron por WhatsApp no pueda meter
 * una etiqueta en la página legal de la empresa: cada trozo entra como texto de
 * React, que escapa siempre. Mismo criterio que `TextoConFormato` para las
 * descripciones de los avisos.
 *
 * El `href` de los enlaces tampoco sale del contenido: lo construye
 * `partirEnlaces` a partir de algo con forma de correo o de dirección https.
 * Un `javascript:` escrito en el panel se queda en texto, porque nunca llega a
 * ser un href.
 */

/** Un fragmento con su formato, ya con los enlaces reconocidos. */
function Texto({ bloque }: { bloque: Bloque }) {
  return (
    <>
      {bloque.texto.map((f, i) => {
        const estilo = f.c && esColorValido(f.c) ? { color: f.c } : undefined;
        const contenido = partirEnlaces(f.t).map((trozo, j) =>
          trozo.href ? (
            <a
              key={j}
              href={trozo.href}
              className="text-secondary hover:underline break-words"
              // `noopener` en los externos: sin él, la página de destino puede
              // manipular la nuestra a través de `window.opener`.
              {...(trozo.href.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {trozo.texto}
            </a>
          ) : (
            <Fragment key={j}>{trozo.texto}</Fragment>
          ),
        );

        return f.b ? (
          <strong key={i} className="font-semibold text-foreground" style={estilo}>
            {contenido}
          </strong>
        ) : (
          <span key={i} style={estilo}>{contenido}</span>
        );
      })}
    </>
  );
}

/**
 * El identificador al que salta `/privacidad`.
 *
 * Es un valor fijo y no un slug del título: la dirección está registrada en la
 * ficha de Google Play, así que no puede depender de cómo se llame la cláusula
 * el día que alguien la reescriba.
 */
export const ANCLA_DATOS = "datos-personales";

export function DocumentoLegal({ documento }: { documento: Documento }) {
  // Las viñetas seguidas van dentro de una misma lista. Sin agruparlas, cada
  // punto sería un `<ul>` de un solo elemento: se ve casi igual, pero un lector
  // de pantalla anuncia «lista de 1 elemento» ocho veces seguidas.
  const grupos: { vinhetas: boolean; bloques: { b: Bloque; i: number }[] }[] = [];
  documento.forEach((b, i) => {
    const esVinheta = b.tipo === "vinheta";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.vinhetas === esVinheta && esVinheta) ultimo.bloques.push({ b, i });
    else grupos.push({ vinhetas: esVinheta, bloques: [{ b, i }] });
  });

  return (
    <div className="space-y-4">
      {grupos.map((grupo, g) => {
        if (grupo.vinhetas) {
          return (
            <ul key={g} className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              {grupo.bloques.map(({ b, i }) => (
                <li key={i}><Texto bloque={b} /></li>
              ))}
            </ul>
          );
        }

        const { b } = grupo.bloques[0];
        switch (b.tipo) {
          case "epigrafe":
            return (
              <p key={g} className="text-xs uppercase tracking-widest text-secondary font-bold">
                <Texto bloque={b} />
              </p>
            );
          case "titulo":
            return (
              // `scroll-mt` para que al saltar aquí el título no quede pegado al
              // borde de arriba, que es donde el ojo lo pierde.
              <h3
                key={g}
                id={b.ancla === "datos-personales" ? ANCLA_DATOS : undefined}
                className="text-sm font-bold text-foreground pt-2 scroll-mt-6"
              >
                <Texto bloque={b} />
              </h3>
            );
          case "nota":
            return (
              <p key={g} className="text-xs italic text-muted-foreground border-t pt-4">
                <Texto bloque={b} />
              </p>
            );
          default:
            return (
              <p key={g} className="text-sm leading-relaxed text-muted-foreground">
                <Texto bloque={b} />
              </p>
            );
        }
      })}
    </div>
  );
}
