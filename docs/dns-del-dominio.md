# DNS de coleffe.com

Todo lo necesario para **rehacer la zona desde cero** en un proveedor nuevo.

Leído del DNS público el **9 de septiembre de 2026**, con la zona todavía viva.
Registrador: **PublicDomainRegistry (PDR)**. Nameservers: `ns1/ns2.vercel-dns.com`.

> ⚠️ **La zona no se copia sola.** Al mover el dominio de cuenta —o de proveedor— solo se
> recrean los registros de la web. Todo el correo hay que volver a escribirlo, y si falta
> algo, deja de funcionar sin avisar.

---

## Los 15 registros

### 1 · Recepción de correo — hostingcorreo (9 registros)

Sin esto **nadie recibe nada** en `avisos@coleffe.com`. El buzón lo sirve el hosting de
correo, no Vercel.

| Nombre | Tipo | Valor | Prioridad |
|---|---|---|---|
| `@` *(raíz)* | MX | `mx1.hostingcorreo.com` | 10 |
| `@` | MX | `mx2.hostingcorreo.com` | 20 |
| `@` | MX | `mx3.hostingcorreo.com` | 30 |
| `@` | MX | `mx4.hostingcorreo.com` | 40 |
| `@` | TXT | `v=spf1 +mx +ip4:184.107.5.178 include:relay.mailchannels.net ~all` | — |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | — |
| `mail` | CNAME | `lc2.hostingcorreo.com` | — |
| `webmail` | A | `184.107.5.178` | — |
| `cpanel` | A | `184.107.5.178` | — |

> El SPF va **sin** el `+a` que traía del cPanel: ese `a` resuelve a las IPs de Vercel,
> que no envían correo.

### 2 · Envío de correo — Resend (3 registros)

Sin esto **la plataforma deja de mandar** boletas, avisos de vencimiento, recuperación de
contraseña y reclamos. Resend desverifica el dominio y empieza a rechazar los envíos.

| Nombre | Tipo | Valor | Prioridad |
|---|---|---|---|
| `send` | MX | `feedback-smtp.sa-east-1.amazonses.com` | 10 |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` | — |
| `resend._domainkey` | TXT | la clave DKIM ↓ **en una sola línea** | — |

```
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCxfrqBkjGj4S7U/vXfEy3Yfpd114iNLZ55HrBTImu67/q78lWOcJzh3xIh2Sj2BKeFzRMb/9S1uUZ9k7BOl1KqQoH9M3ebjNzd3Gr+RckmkzKNjsmyeJwTupd6t5bNuS4Q4cVNuan4Hjg7Wib61X7JMrHwhJ81/lmWKco5uT20rwIDAQAB
```

> Son **218 caracteres sin espacios ni saltos de línea**. Es el registro que más veces se
> pega mal; si el correo no sale, es lo primero que hay que mirar.
> La región (`sa-east-1`) debe coincidir con la del dominio en Resend.

### 3 · Certificados — CAA (3 registros)

Dicen qué autoridades pueden emitir certificados para el dominio.

| Nombre | Tipo | Valor |
|---|---|---|
| `@` | CAA | `0 issue "letsencrypt.org"` |
| `@` | CAA | `0 issue "pki.goog"` |
| `@` | CAA | `0 issue "sectigo.com"` |

> **O los tres, o ninguno.** Si se crea un CAA incompleto que deje fuera a Let's Encrypt,
> Vercel **no podrá emitir el certificado** y el sitio se queda sin HTTPS. Sin ningún CAA
> el comportamiento es el de siempre: cualquier autoridad puede emitir.

---

## Lo que NO hay que copiar

**Los registros de la web.** Las `A` de la raíz y de `www` apuntan a Vercel
(`64.29.17.x`, `216.198.79.x`) y **las pone Vercel sola** al añadir el dominio al
proyecto. Escribirlas a mano solo sirve para que se queden obsoletas.

**Los subdominios que parecen existir y no existen.** La zona tiene un **comodín `*`**:
cualquier nombre inventado responde con las IPs de Vercel. Comprobado —
`xyzqwerty999.coleffe.com` resuelve. Por eso un barrido de nombres «encuentra» `blog`,
`shop`, `admin`, `api`, `staging`, `test`… que **no están creados**.

> Al rehacer la zona, ese comodín solo se recrea si de verdad se quiere que cualquier
> subdominio apunte a la web. Si no, mejor sin él: un comodín hace imposible notar que un
> subdominio está mal escrito.

La forma de distinguir lo real de lo comodín, si hay que repetir esto: **lo real no
apunta a Vercel** (`mail`, `webmail`, `cpanel`, los MX) **o tiene TTL 60** en vez de 1800.

---

## Comprobar que quedó bien

```bash
# Recepción — si sale vacío, NADIE recibe correo
nslookup -type=MX coleffe.com

# Envío — los tres tienen que responder
nslookup -type=MX  send.coleffe.com
nslookup -type=TXT send.coleffe.com
nslookup -type=TXT resend._domainkey.coleffe.com

# Web
nslookup coleffe.com
```

Y en **Resend → Domains**, que `coleffe.com` siga en **Verified**. Resend revisa el DNS
por su cuenta y lo marca ahí antes de que se note en los envíos.

Prueba de extremo a extremo: recuperar la contraseña de una cuenta de prueba (va por el
**SMTP de Supabase Auth**) y provocar un correo de la plataforma (va por la **API de
Resend**). Son dos vías con credenciales distintas y **una puede funcionar sin la otra**:
ver [`../EMAIL-SETUP.md`](../EMAIL-SETUP.md).

## Cuánto tarda un cambio

| | TTL | Qué significa |
|---|---|---|
| MX | **60 s** | El correo se cae —o se arregla— en **un minuto**. Cero colchón. |
| A | 1800 s | La web tarda ~30 min en reflejar un cambio. |
| NS | 21600 s | **Cambiar de proveedor de DNS tarda hasta 6 horas** en propagar. |

Por eso, al mover el DNS a otro proveedor, el orden es: **crear los 15 registros primero**,
comprobar que responden contra los nameservers nuevos, y **solo entonces** cambiar los
nameservers en el registrador.

## Registros que aparecían en documentación vieja y ya no existen

- `default._domainkey` — el DKIM del cPanel. Innecesario: el envío va por Resend.
- `quicknote` — CNAME a Render, de otro proyecto.
