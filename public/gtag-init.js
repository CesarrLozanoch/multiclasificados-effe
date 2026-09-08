/**
 * Etiqueta de Google (gtag.js) — Google Ads AW-18417687234.
 *
 * ── POR QUÉ NO ESTÁ PEGADA EN index.html ─────────────────────────────────────
 *
 * Google entrega este código como dos <script> en el <head>, y el segundo es
 * EN LÍNEA. Nuestra CSP tiene `script-src` SIN `unsafe-inline`, así que pegado
 * tal cual el navegador lo bloquea entero y sin decir nada visible: la etiqueta
 * parecería instalada y no mediría absolutamente nada.
 *
 * Añadir `unsafe-inline` para que entre sería pagar muy caro: esa directiva es
 * justo la que impide que un texto inyectado en la página se ejecute como
 * código. Así que se hace como ya se hacía con la fuente (`font-boot.js`) y con
 * el vigilante de arranque (`boot-watchdog.js`): un fichero externo servido
 * desde nuestro propio dominio, que cumple `'self'` sin aflojar nada.
 *
 * `www.googletagmanager.com` sí hay que permitirlo en `script-src` (está en
 * vercel.json, junto con los dominios a los que gtag salta después para las
 * conversiones). Si alguien los quita, esto deja de medir en silencio; hay una
 * prueba que lo vigila.
 *
 * ── POR QUÉ SOLO EN EL SITIO DE VERDAD ───────────────────────────────────────
 *
 * El script se inyecta desde aquí en vez de ir fijo en el HTML para poder NO
 * cargarlo fuera de coleffe.com. Si no, mediría también:
 *
 *   · el desarrollo en localhost,
 *   · cada despliegue de vista previa de Vercel,
 *   · y el APK, donde la página se sirve desde el propio dispositivo.
 *
 * Todo eso ensucia las conversiones de una cuenta de Google Ads con la que se
 * paga publicidad de verdad — y las decisiones de gasto se toman con esos
 * números.
 */
(function () {
  var ID = "AW-18417687234";
  var host = location.hostname;

  // Solo el dominio real. `endsWith` cubre coleffe.com y www.coleffe.com sin
  // colar un "coleffe.com.otrositio.net".
  var esElSitio = host === "coleffe.com" || host === "www.coleffe.com";
  if (!esElSitio) return;

  // La cola que lee gtag.js. Se deja lista ANTES de pedir el script: así, si
  // tarda o llega después, encuentra el `config` ya encolado y no se pierde.
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("config", ID);

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ID);
  document.head.appendChild(s);
})();
