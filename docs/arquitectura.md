# Arquitectura

Qué pieza hace qué, y —lo que más cuesta reconstruir después— **por qué está donde está**.

---

## Las cuatro piezas

```
   NAVEGADOR / APP                    VERCEL                    SUPABASE
┌────────────────────┐        ┌──────────────────┐      ┌──────────────────────┐
│  React + Vite      │        │  api/            │      │  Postgres + RLS      │
│  (Capacitor la     │───────▶│  og-aviso        │      │  Auth · Realtime     │
│   empaqueta igual  │        │  sitemap         │      │  Storage             │
│   para móvil)      │        │  pais            │      │  Edge Functions      │
└────────────────────┘        └──────────────────┘      └──────────────────────┘
         │                                                        ▲
         └────────────────────────────────────────────────────────┘
                        supabase-js (con la sesión del usuario)
```

**El navegador habla directamente con Postgres.** No hay una API propia en medio: la
autorización la hace la base de datos con RLS, y todo lo que no puede decidirse con una
política vive en una función `security definer`. Eso tiene una consecuencia que conviene
tener presente siempre:

> Cualquier cosa que el navegador pueda pedir, un usuario puede pedirla también con
> `curl`. Lo que protege no es la interfaz: es la política de la tabla.

**Las Edge Functions existen para lo que no puede pasar por el cliente:** hablar con
Izipay, con Factiliza o con Resend usando credenciales secretas, y recalcular importes.

**Las funciones de Vercel (`api/`) existen para lo que tiene que verse sin ejecutar
JavaScript:** un buscador o WhatsApp piden la URL de un aviso y reciben HTML plano. La
app es una SPA, así que sin esto la ficha compartida no tendría ni título ni foto.

## Roles y permisos

Cuatro roles (`app_role`): `buscador`, `anunciante`, `admin`, `superadmin`.

Sobre eso hay un segundo nivel para el personal: `has_perm(módulo, acción)`, con módulos
como *Gestión de avisos*, *Gestión de usuarios* y *Pagos y planes*, y acciones `view` /
`edit`. El **superadmin siempre puede** —él define los permisos, no puede quedarse fuera—
y los perfiles `moderador` y `soporte` son combinaciones de esos módulos.

La regla, en `supabase/migrations/0046_roles_permissions_enforced.sql`.

## El camino del dinero

```
  Compra saldo ──▶ create-payment ──▶ Izipay ──▶ payment-webhook ──▶ settle_paid_order
                   (recalcula el                  (service role)      · acredita saldo
                    importe)                                          · emite comprobante
                                                                      · publica el aviso
```

`settle_paid_order` es **el único sitio** donde se acredita saldo y se crea un
comprobante. Da igual por dónde entre el dinero —tarjeta, Yape, Plin o una aprobación
manual del panel—: todo desemboca ahí. Es a propósito, y es lo que hace que no existan
dos caminos que puedan discrepar.

Detalles en [`pagos.md`](pagos.md) y [`facturacion.md`](facturacion.md).

## El camino de un aviso

`draft` → `pending` → `active` → `expired`
(y además `paused`, `rejected`, `sold`)

1. **Borrador.** Se guarda sin gastar nada. Se puede retomar.
2. **Publicación.** Descuenta saldo. Si la categoría lo exige, pasa por moderación.
3. **Activo.** Sale en el buscador y en el mapa. Tiene fecha de vencimiento.
4. **Aviso previo.** Un `cron` cada 15 minutos avisa al dueño cuando falta una hora o
   menos: en la práctica, entre 45 y 60 minutos antes.
5. **Vencido.** Deja de mostrarse. Se puede renovar sin volver a escribirlo.

## Búsqueda y cercanía

El buscador es una función de Postgres (`search_listings`), no una consulta armada en el
cliente: así el filtro, el conteo y el orden son los mismos para todos y no hay forma de
pedir algo que la interfaz no ofrezca.

El «cerca de mí» se apoya en un catálogo de zonas del Perú y en las coordenadas del
aviso. Las direcciones y el mapa son de Google Maps Platform.

> **Una lección que costó:** la Geocoding API por web service **rechaza las llaves
> restringidas por dominio**, siempre. Con una llave restringida —que es lo que hay que
> tener— solo funciona el geocodificador del SDK. Está en `src/lib/googleMaps.ts`.

## Notificaciones

Campana, correo y push comparten **un solo módulo de textos**. Hay una copia para Deno en
`supabase/functions/_shared/` y una prueba que compara las dos: si alguien cambia una
frase en un sitio y no en el otro, salta.

Es el mismo patrón que se usa para la regla de las observaciones de SUNAT, y por la misma
razón: cuando la misma decisión vive en el navegador y en Deno, no pueden compartir
módulo, así que lo que las mantiene juntas es una prueba.

## Móvil

Capacitor empaqueta exactamente la misma web. Lo que cambia:

- **Zonas seguras.** Las variables `--nav-top` / `--nav-bottom` reservan el notch y la
  barra inferior. Los modales y el pie de página tienen que respetarlas.
- **Teclado.** Ningún campo por debajo de 16px, o iOS hace zoom solo al enfocarlo. Los
  buscadores llaman a `cerrarTeclado()`.
- **Login con Google en iOS.** La directriz 4.8 de Apple exige ofrecer también Sign in
  with Apple si hay login social de terceros. Sign in with Apple se descartó, así que en
  iOS ese botón va oculto.
- **La app publicada va por detrás de la web.** Antes de tocar la actualización por aire
  (OTA), leer [`despliegue.md`](despliegue.md): mal usada, degrada un APK recién
  instalado.
