import "@testing-library/jest-dom";

// Los tests que corren en entorno node (p.ej. los de migraciones SQL, que usan
// `// @vitest-environment node`) no tienen `window`.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });

  /**
   * Los enlaces que NO abren una página —`mailto:`, `tel:`, `whatsapp:`— no
   * llegan a intentar navegar.
   *
   * ── EL PROBLEMA, QUE ERA MÁS MOLESTO DE LO QUE PARECÍA ─────────────────────
   *
   * jsdom implementa el clic sobre un `<a>` con un `setTimeout` que navega, y
   * ante un esquema que no entiende suelta:
   *
   *     Error: Not implemented: navigation (except hash changes)
   *       at Timeout._onTimeout (jsdom/.../HTMLHyperlinkElementUtils-impl.js:81)
   *
   * Como sale de un TEMPORIZADOR, el error aparece cuando el test que lo
   * provocó normalmente ya terminó. Eso hacía dos cosas malas: la suite
   * terminaba unas veces con «Errors 1» y otras con ninguno —el mismo código,
   * el mismo commit— y, cuando aparecía, iba atribuido al archivo que estuviera
   * corriendo en ese momento, no al que lo causó. Un error intermitente que
   * además señala al fichero equivocado es justo el que nadie llega a
   * diagnosticar, y mientras esté ahí tapa a los de verdad.
   *
   * ── POR QUÉ ESTO NO ESCONDE NADA ───────────────────────────────────────────
   *
   * En un navegador de verdad, un `mailto:` abre el cliente de correo y la
   * página se queda donde está: no hay navegación. Lo que se corrige aquí es
   * que jsdom no sepa hacer eso, no un comportamiento de la aplicación.
   *
   * Se tocan SOLO los esquemas que no son páginas. Un `<a href="/buscar">`
   * sigue comportándose como siempre, así que una prueba que compruebe una
   * navegación de verdad no se ve afectada.
   *
   * Va en fase de CAPTURA y solo llama a `preventDefault`, nunca a
   * `stopPropagation`: los `onClick` de React siguen ejecutándose y las pruebas
   * que comprueban qué pasa al pulsar «Escribir a soporte» siguen viendo lo
   * mismo. Lo único que no ocurre es la navegación que jsdom no sabe hacer.
   */
  const SIN_PAGINA = /^(mailto|tel|sms|whatsapp|intent|geo|market|maps|itms-apps):/i;

  document.addEventListener(
    "click",
    (e) => {
      const ancla = (e.target as Element | null)?.closest?.("a[href]");
      if (ancla && SIN_PAGINA.test(ancla.getAttribute("href") ?? "")) e.preventDefault();
    },
    true,
  );
}
