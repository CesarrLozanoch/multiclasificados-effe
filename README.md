# eFFe Multiclasificados

Marketplace de avisos clasificados para Perú. Un anunciante compra **saldo**, publica
avisos con ese saldo y recibe su **comprobante electrónico declarado a SUNAT**; un
comprador busca, filtra por cercanía y contacta por chat o WhatsApp.

Web en producción: **[coleffe.com](https://www.coleffe.com)** · Android e iOS con Capacitor.

> **Ojo antes de tocar nada:** el sistema mueve **dinero real** (Izipay) y emite
> **documentos fiscales reales** (Factiliza → SUNAT). Una boleta emitida no se borra:
> se anula con una nota de crédito. Ver [`docs/facturacion.md`](docs/facturacion.md).

---

## Índice

| Documento | De qué va |
|---|---|
| [`docs/arquitectura.md`](docs/arquitectura.md) | Cómo encajan las piezas y por dónde pasa cada cosa |
| [`docs/pagos.md`](docs/pagos.md) | Saldo, precios, Izipay, Yape/Plin y por qué el importe se recalcula en el servidor |
| [`docs/facturacion.md`](docs/facturacion.md) | Boletas y facturas: Factiliza, SUNAT, correlativos y anulaciones |
| [`docs/base-de-datos.md`](docs/base-de-datos.md) | Migraciones, RLS y **las tres trampas que ya han mordido** |
| [`docs/despliegue.md`](docs/despliegue.md) | Cómo sale a producción cada pieza, y qué hay que subir en cada deploy |
| [`docs/pruebas.md`](docs/pruebas.md) | Qué se prueba aquí, cómo, y qué comprobación **no** vale |
| [`COMPILAR-APPS.txt`](COMPILAR-APPS.txt) | Compilar y publicar Android e iOS, incluidas las notificaciones push |
| [`EMAIL-SETUP.md`](EMAIL-SETUP.md) | Cómo está montado el correo y cómo se diagnostica cuando no llega |
| [`GENERAR-APK.md`](GENERAR-APK.md) | Compilar el APK **a mano en Windows**. Camino secundario: lo normal es el CI |

Cada Edge Function con configuración propia lleva su `DEPLOY.md` al lado
(`supabase/functions/<nombre>/DEPLOY.md`): ahí están los *secrets* que necesita.

---

## Stack

- **Frontend:** React 18 + TypeScript + Vite, Tailwind, shadcn/ui (Radix).
- **Backend:** Supabase — Postgres con RLS, Auth, Realtime, Storage y Edge Functions (Deno).
- **Funciones de servidor propias:** Vercel (`api/`), para lo que un buscador o WhatsApp
  tienen que ver sin ejecutar JavaScript.
- **Móvil:** Capacitor 8. Android por Android Studio; iOS por `codemagic.yaml` → TestFlight.
- **Mapas:** Google Maps Platform — Maps JavaScript API y Places (New).
- **Pruebas:** Vitest + Testing Library + PGlite (Postgres en WASM) + Playwright.

## Puesta en marcha

```sh
npm install
cp .env.example .env    # y completa los valores
npm run dev             # http://localhost:8080
```

### Variables de entorno (`.env`)

| Variable | Uso |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Conexión a Supabase. **Obligatorias** — sin ellas ni siquiera arrancan las pruebas. |
| `VITE_PUBLIC_SITE_URL` | Dominio público. Es la base de los enlaces de los correos y de la página de pago. |
| `VITE_IZIPAY_PUBLIC_KEY` | Clave **pública** de Izipay (Back Office → Claves de API REST). |
| `VITE_IZIPAY_STATIC_ENDPOINT` | Endpoint del formulario incrustado de Izipay. |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps JavaScript API + Places. Restringida por dominio. |
| `VITE_GOOGLE_MAPS_MAP_ID` | Map ID de Google, necesario para los marcadores nuevos. |
| `VITE_HCAPTCHA_SITE_KEY` | Sitekey de hCaptcha para el login de staff. Sin ella se usa la de prueba. |

Para **subirlas a Vercel** hay un generador que las junta con su explicación:

```sh
node scripts/generar-env-vercel.mjs             # escribe .env.vercel (no va a git)
node scripts/generar-env-vercel.mjs --verificar # avisa si el código usa alguna que falte
```

Todo lo **secreto** —Izipay (shop, password, HMAC), Factiliza, Resend, `service_role`—
vive como *secret* de las Edge Functions y **nunca** en el repositorio ni en un `VITE_*`
(cualquier `VITE_*` acaba dentro del JavaScript que descarga el navegador).

### Comandos

```sh
npm run dev         # desarrollo
npm run build       # build de producción → dist/
npm run typecheck   # TypeScript  ← el de verdad; ver la nota de abajo
npm run lint        # ESLint
npm run test        # Vitest, una pasada (~2800 pruebas, unos 4 min)
npm run test:watch  # Vitest en watch
npm run test:layout # Playwright: comprobaciones de maquetación
```

> ⚠️ **`npx tsc --noEmit` no comprueba nada en este repositorio.** Sin `-p` coge otro
> `tsconfig` y sale limpio pase lo que pase. El único que vale es `npm run typecheck`.

## Estructura

```
src/
  pages/           rutas por rol: público, buscador, anunciante, admin, superadmin
  components/      UI y componentes de dominio (Navbar, layouts, modales…)
  lib/             datos y lógica: auth, publish, credits, payments, pricing, geocode…
  hooks/           useSession, useUnreadMessages, useKeyboardInset, useFilaSenalada…
  data/            catálogos estáticos (países, departamentos, zonas)
  test/            ~296 ficheros de pruebas
supabase/
  migrations/      esquema versionado (0001–0149): tablas, RLS, RPCs, triggers, cron
  functions/       Edge Functions en Deno, con su DEPLOY.md
    _shared/       lo que comparten (factiliza, pricing, plantillas de correo…)
api/               funciones de Vercel: og-aviso, sitemap, pais
android/           proyecto Capacitor Android
codemagic.yaml     CI de iOS → TestFlight
```

## Cómo funciona, en corto

1. **Registro y verificación.** El anunciante da su DNI/RUC y `verify-doc` lo consulta
   en Factiliza; el nombre lo pone la fuente oficial, no el usuario.
2. **Compra de saldo.** Elige un paquete y paga. El importe **se recalcula en el
   servidor** antes de cobrar, y el webhook de Izipay es quien acredita: nunca el
   navegador. Ver [`docs/pagos.md`](docs/pagos.md).
3. **Comprobante.** Al liquidarse el pago se emite boleta o factura, se declara a SUNAT
   y se envía por correo con su PDF. Ver [`docs/facturacion.md`](docs/facturacion.md).
4. **Publicación.** El aviso descuenta saldo, pasa por moderación si toca, se publica y
   vence solo. Se avisa antes de que venza y se puede renovar.
5. **Contacto.** Chat en tiempo real o WhatsApp. Cualquiera puede denunciar un aviso.

Los detalles, en [`docs/arquitectura.md`](docs/arquitectura.md).

## Documentación que **no** está aquí

`CHECKLIST.md` —el inventario «hecho / falta» del proyecto— **no está en el
repositorio**: dice qué credenciales existen y qué sigue sin cerrar. Desde el
31-ago-2026 vive en `~/.claude/projects/C--Claude-MulticlasificadosEffe/CHECKLIST.md`.

Ahí es donde se sigue lo que queda pendiente. En el repositorio no se guardan planes ni
listas de tareas: envejecen sin que nadie los actualice y acaban afirmando cosas falsas
sobre el estado del proyecto.
