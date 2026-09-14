import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Italic, Ban, Palette, Undo2, Redo2, Anchor } from "lucide-react";
import {
  COLORES, COLOR_NORMAL, normalizarColor, hexDeColor,
} from "@/lib/textoConFormato";
import { seleccionDentro, guardarSeleccion, restaurarSeleccion } from "@/lib/editorDom";
import {
  documentoDesdeDom, escribirDocumentoEnDom, bloqueDelCursor,
} from "@/lib/editorDocumento";
import { TIPOS_DE_BLOQUE, type Documento, type TipoBloque } from "@/lib/documentoLegal";

/**
 * El documento legal entero en un solo cuadro, con la barra de formato fija
 * arriba.
 *
 * ── POR QUÉ ASÍ, Y NO POR BLOQUES ────────────────────────────────────────────
 *
 * La primera versión daba una caja por bloque: sesenta y ocho cajas para este
 * contrato. Era más fácil de construir y peor de usar — para mover una frase de
 * una cláusula a otra había que cortar de una caja y pegar en otra, y no se
 * podía leer el documento del tirón mientras se edita. Se cambió a petición del
 * cliente, que es quien lo va a usar.
 *
 * La barra va `sticky` DENTRO del marco que hace scroll, no fuera: así al bajar
 * por el contrato los botones siguen ahí, que es justo lo que se pidió.
 *
 * ── LO QUE NO CAMBIA: AQUÍ NO SE GUARDA HTML ─────────────────────────────────
 *
 * Que se edite en un `contenteditable` no significa que se guarde su HTML. Al
 * leer, `documentoDesdeDom` reconoce las etiquetas que entiende y descarta el
 * resto: lo que sale es la misma lista de bloques de antes. Pegar aquí un trozo
 * de otra web no puede meter una etiqueta en la página legal, y además el
 * pegado entra como texto plano.
 *
 * ── CÓMO ESTÁ HECHO ──────────────────────────────────────────────────────────
 *
 * Escribir lo maneja el navegador; este componente no toca el contenido
 * mientras se teclea, solo lo LEE. Es lo que conserva el cursor, la
 * autocorrección y el deshacer nativos —y lo que hunde a los editores caseros
 * en iOS cuando se ponen a reescribir el DOM en cada tecla.
 */

interface Props {
  valor: Documento;
  onChange: (d: Documento) => void;
  disabled?: boolean;
  /** Alto del marco que hace scroll. */
  alto?: string;
}

export function EditorDeDocumento({ valor, onChange, disabled, alto = "60vh" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [marcas, setMarcas] = useState<{
    b: boolean; i: boolean; c: string | null; tipo: TipoBloque; ancla: boolean;
  }>({ b: false, i: false, c: null, tipo: "parrafo", ancla: false });

  // Lo que este componente escribió por última vez, para distinguir un cambio
  // propio de uno que viene de fuera (cargar el documento, restaurar el de
  // fábrica). Sin esto, cada tecla provocaría un volcado y el cursor saltaría
  // al principio.
  const ultimo = useRef<string>("");
  const seleccion = useRef<Range | null>(null);

  const publicar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const leido = documentoDesdeDom(el);
    ultimo.current = JSON.stringify(leido);
    onChange(leido);
  }, [onChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const entrante = JSON.stringify(valor ?? []);
    if (entrante === ultimo.current) return;
    ultimo.current = entrante;
    escribirDocumentoEnDom(el, valor ?? []);
  }, [valor]);

  /** Refresca la barra según dónde esté el cursor. */
  const mirarMarcas = useCallback(() => {
    const el = ref.current;
    if (!el || !seleccionDentro(el)) return;
    const bloque = bloqueDelCursor(el);
    let tipo: TipoBloque = "parrafo";
    let ancla = false;
    if (bloque) {
      const marcado = bloque.dataset.tipo;
      if (marcado === "epigrafe" || marcado === "nota") tipo = marcado;
      else if (bloque.tagName === "LI") tipo = "vinheta";
      else if (/^H[1-6]$/.test(bloque.tagName)) tipo = "titulo";
      ancla = bloque.dataset.ancla === "datos-personales";
    }
    try {
      const bruto = normalizarColor(document.queryCommandValue("foreColor"));
      setMarcas({
        b: document.queryCommandState("bold"),
        i: document.queryCommandState("italic"),
        c: bruto && bruto !== COLOR_NORMAL ? bruto : null,
        tipo, ancla,
      });
    } catch {
      // Un navegador que no responda a la consulta no puede dejar el editor
      // inservible: los botones simplemente no se ven pulsados.
      setMarcas((m) => ({ ...m, tipo, ancla }));
    }
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", mirarMarcas);
    return () => document.removeEventListener("selectionchange", mirarMarcas);
  }, [mirarMarcas]);

  /** Ejecuta una orden conservando la selección y avisando del cambio. */
  const mandar = (orden: () => void) => {
    const el = ref.current;
    if (!el || disabled) return;
    if (!seleccionDentro(el)) el.focus();
    orden();
    publicar();
    mirarMarcas();
  };

  const ponerColor = (hex: string) => mandar(() => {
    // `styleWithCSS` pide un `style="color:"` en vez de un `<font>`. Safari
    // puede ignorarlo, y por eso `editorDom` entiende las dos formas.
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* da igual */ }
    document.execCommand("foreColor", false, hex);
  });

  const ponerColorSuelto = (hex: string) => {
    const el = ref.current;
    if (!el) return;
    if (!seleccionDentro(el) && !restaurarSeleccion(el, seleccion.current)) return;
    ponerColor(hex);
  };

  /** Cambia el tipo del bloque donde está el cursor. */
  const cambiarTipo = (tipo: TipoBloque) => mandar(() => {
    const el = ref.current;
    if (!el) return;
    const enLista = bloqueDelCursor(el)?.tagName === "LI";

    if (tipo === "vinheta") {
      if (!enLista) document.execCommand("insertUnorderedList");
      return;
    }
    // Salir de la lista es el MISMO comando: alterna. Hay que hacerlo antes de
    // `formatBlock`, o el `<li>` se quedaría envolviendo al párrafo nuevo.
    if (enLista) document.execCommand("insertUnorderedList");
    document.execCommand("formatBlock", false, tipo === "titulo" ? "h3" : "p");

    const nuevo = bloqueDelCursor(el);
    if (!nuevo) return;
    delete nuevo.dataset.tipo;
    if (tipo === "epigrafe" || tipo === "nota") nuevo.dataset.tipo = tipo;
    // El ancla solo vive en un título: si deja de serlo, se va con él. Si no,
    // quedaría escondida en un párrafo y `/privacidad` aterrizaría en mitad de
    // un texto sin encabezado.
    if (tipo !== "titulo") delete nuevo.dataset.ancla;
  });

  /**
   * Marca (o desmarca) la cláusula a la que baja `/privacidad`.
   *
   * Es exclusiva: marcar una desmarca la anterior. Dos elementos con el mismo
   * id es HTML inválido, y esa dirección es la que Google Play tiene registrada
   * como política de privacidad de la ficha.
   */
  const alternarAncla = () => mandar(() => {
    const el = ref.current;
    if (!el) return;
    const bloque = bloqueDelCursor(el);
    if (!bloque || !/^H[1-6]$/.test(bloque.tagName)) return;
    const yaEstaba = bloque.dataset.ancla === "datos-personales";
    for (const otro of Array.from(el.querySelectorAll<HTMLElement>("[data-ancla]"))) {
      delete otro.dataset.ancla;
    }
    if (!yaEstaba) bloque.dataset.ancla = "datos-personales";
  });

  /**
   * Pegar entra siempre como TEXTO PLANO.
   *
   * Sin esto, pegar de Word o de otra web mete su HTML entero: tipografías,
   * tamaños, tablas y colores ajenos. Se pierde el formato del origen —que es
   * lo correcto— pero sobre todo el editor no se llena de cosas que al guardar
   * habría que descartar igualmente.
   *
   * Cada línea del texto pegado entra como su propio bloque, porque en un
   * documento por bloques un salto de línea ES un párrafo nuevo.
   */
  const alPegar = (e: React.ClipboardEvent) => {
    e.preventDefault();
    if (disabled) return;
    const texto = e.clipboardData.getData("text/plain");
    if (!texto) return;
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
    lineas.forEach((linea, i) => {
      if (i > 0) document.execCommand("insertParagraph");
      document.execCommand("insertText", false, linea);
    });
    publicar();
  };

  const boton =
    "flex h-9 min-w-9 items-center justify-center rounded-md px-2.5 text-sm transition-colors " +
    "hover:bg-muted disabled:opacity-40";
  const activo = (on: boolean) => (on ? " bg-background shadow-sm ring-1 ring-border" : "");
  const circulo = (on: boolean) =>
    "flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-muted" + activo(on);
  const muestra = (on: boolean) =>
    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border " +
    (on ? "border-foreground/70 ring-2 ring-foreground/25" : "border-black/20");

  const esPersonalizado = marcas.c !== null && !COLORES.some((c) => c.hex === marcas.c);
  const enTitulo = marcas.tipo === "titulo";

  return (
    <div className="rounded-md border bg-background">
      {/* El marco que hace scroll. La barra va DENTRO, pegada arriba. */}
      <div className="overflow-y-auto" style={{ maxHeight: alto }}>
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b bg-muted/95 px-2 py-1.5 backdrop-blur">
          {/* Estilo del bloque. Un `<select>` nativo y no el del sistema de
              diseño: este va dentro de una barra que no puede perder el foco
              del editor, y el nativo se comporta igual en móvil y escritorio. */}
          <select
            className="h-9 rounded-md border bg-background px-2 text-xs"
            value={marcas.tipo}
            disabled={disabled}
            onChange={(e) => cambiarTipo(e.target.value as TipoBloque)}
            aria-label="Estilo del bloque"
          >
            {TIPOS_DE_BLOQUE.map((t) => (
              <option key={t.tipo} value={t.tipo}>{t.nombre}</option>
            ))}
          </select>

          <span className="mx-0.5 h-6 w-px bg-border" />

          {/* `onPointerDown` con `preventDefault`: sin esto el botón se lleva el
              foco, el editor pierde la selección y el comando se aplica a nada. */}
          <button
            type="button" disabled={disabled} title="Negrita (Ctrl+B)"
            className={boton + " font-bold" + activo(marcas.b)}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => mandar(() => document.execCommand("bold"))}
          >
            <Bold size={15} />
          </button>
          <button
            type="button" disabled={disabled} title="Cursiva (Ctrl+I)"
            className={boton + activo(marcas.i)}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => mandar(() => document.execCommand("italic"))}
          >
            <Italic size={15} />
          </button>

          <span className="mx-0.5 h-6 w-px bg-border" />

          {/* Color: los cuatro de la casa, el selector libre y «sin color». */}
          {COLORES.map((c) => (
            <button
              key={c.hex} type="button" disabled={disabled} title={c.nombre}
              className={circulo(marcas.c === c.hex)}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => ponerColor(c.hex)}
            >
              <span className={muestra(marcas.c === c.hex)} style={{ backgroundColor: c.hex }} />
            </button>
          ))}
          <label className={circulo(esPersonalizado)} title="Otro color">
            <span
              className={muestra(esPersonalizado)}
              style={{ backgroundColor: esPersonalizado ? hexDeColor(marcas.c) : "transparent" }}
            >
              {!esPersonalizado && <Palette size={12} className="text-muted-foreground" />}
            </span>
            <input
              type="color" className="sr-only" disabled={disabled}
              value={esPersonalizado ? hexDeColor(marcas.c) : COLOR_NORMAL}
              // Al `<input type=color>` no se le puede impedir el gesto sin
              // impedir que se abra la rueda, así que se le deja llevarse la
              // selección y se guarda para devolverla.
              onFocus={() => { seleccion.current = guardarSeleccion(ref.current!); }}
              onChange={(e) => ponerColorSuelto(e.target.value)}
            />
          </label>
          <button
            type="button" disabled={disabled} title="Quitar el color"
            className={circulo(marcas.c === null)}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => ponerColor(COLOR_NORMAL)}
          >
            <Ban size={14} className="text-muted-foreground" />
          </button>

          <span className="mx-0.5 h-6 w-px bg-border" />

          <button
            type="button" disabled={disabled} title="Deshacer (Ctrl+Z)"
            className={boton}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => mandar(() => document.execCommand("undo"))}
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button" disabled={disabled} title="Rehacer (Ctrl+Y)"
            className={boton}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => mandar(() => document.execCommand("redo"))}
          >
            <Redo2 size={15} />
          </button>

          {/* Solo tiene sentido sobre un título, así que solo aparece ahí: un
              botón permanentemente inerte es peor que uno que no está. */}
          {enTitulo && (
            <button
              type="button" disabled={disabled}
              title="Marcar como la cláusula de datos personales (a la que baja /privacidad)"
              className={boton + " gap-1.5 text-xs" + activo(marcas.ancla)}
              onPointerDown={(e) => e.preventDefault()}
              onClick={alternarAncla}
            >
              <Anchor size={13} /> Datos personales
            </button>
          )}
        </div>

        {/* El documento. Los estilos imitan la página publicada para que lo que
            se ve aquí sea lo que se va a ver allí. */}
        <div
          ref={ref}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Documento legal"
          spellCheck
          onInput={publicar}
          onBlur={publicar}
          onPaste={alPegar}
          onKeyUp={mirarMarcas}
          onMouseUp={mirarMarcas}
          className={
            "px-4 py-3 outline-none text-sm leading-relaxed text-muted-foreground " +
            "[&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-foreground [&_h3]:mt-4 [&_h3]:mb-1 " +
            "[&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_li]:mb-1 " +
            "[&_[data-tipo=epigrafe]]:text-xs [&_[data-tipo=epigrafe]]:uppercase " +
            "[&_[data-tipo=epigrafe]]:tracking-widest [&_[data-tipo=epigrafe]]:font-bold " +
            "[&_[data-tipo=epigrafe]]:text-secondary " +
            "[&_[data-tipo=nota]]:text-xs [&_[data-tipo=nota]]:italic " +
            "[&_[data-ancla]]:border-l-2 [&_[data-ancla]]:border-secondary [&_[data-ancla]]:pl-2 " +
            (disabled ? "opacity-70" : "")
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>
          {valor.length} bloque{valor.length === 1 ? "" : "s"} ·{" "}
          {valor.reduce((n, b) => n + b.texto.reduce((m, f) => m + f.t.length, 0), 0).toLocaleString()} caracteres
        </span>
        <span>Enter crea un bloque nuevo. El estilo se elige arriba.</span>
      </div>
    </div>
  );
}
