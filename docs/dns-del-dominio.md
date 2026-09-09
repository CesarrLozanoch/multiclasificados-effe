# DNS de coleffe.com

**Los nameservers son de Vercel** (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`), así que la
zona entera vive en el panel de Vercel del proyecto.

> ⚠️ **Al mover el dominio a otra cuenta de Vercel, la zona nueva empieza VACÍA.** Solo se
> recrean solos los registros de la web. Todo lo demás —el correo— hay que volver a
> escribirlo a mano, y si no se hace, deja de funcionar. Esta página existe para eso.

Verificado contra el DNS público el **9 de septiembre de 2026**.

---

## Lo que hay que copiar a mano

### Envío de correo (Resend) — sin esto la plataforma deja de mandar correos

Boletas, avisos de vencimiento, recuperación de contraseña, reclamos: todo sale por aquí.
Si faltan, Resend **desverifica el dominio** y los envíos empiezan a rechazarse.

| Nombre | Tipo | Valor | Prioridad |
|---|---|---|---|
| `send` | MX | `feedback-smtp.sa-east-1.amazonses.com` | 10 |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` | — |
| `resend._domainkey` | TXT | la clave DKIM (abajo, **en una sola línea**) | — |

```
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCxfrqBkjGj4S7U/vXfEy3Yfpd114iNLZ55HrBTImu67/q78lWOcJzh3xIh2Sj2BKeFzRMb/9S1uUZ9k7BOl1KqQoH9M3ebjNzd3Gr+RckmkzKNjsmyeJwTupd6t5bNuS4Q4cVNuan4Hjg7Wib61X7JMrHwhJ81/lmWKco5uT20rwIDAQAB
```

> El DKIM son 218 caracteres y **no admite saltos de línea ni espacios**. Es el registro
> que más veces se pega mal; si el correo no sale, es el primero que hay que mirar.
>
> La región (`sa-east-1`) tiene que ser la misma que la del dominio en Resend.

### Recepción de correo (hostingcorreo) — sin esto nadie recibe nada

El buzón real —`avisos@coleffe.com`— **no está en Vercel**: lo sirve el hosting de correo.
Vercel solo tiene el DNS.

| Nombre | Tipo | Valor | Prioridad |
|---|---|---|---|
| *(raíz)* | MX | `mx1.hostingcorreo.com` | 10 |
| *(raíz)* | MX | `mx2.hostingcorreo.com` | 20 |
| *(raíz)* | MX | `mx3.hostingcorreo.com` | 30 |
| *(raíz)* | MX | `mx4.hostingcorreo.com` | 40 |
| *(raíz)* | TXT | `v=spf1 +mx +ip4:184.107.5.178 include:relay.mailchannels.net ~all` | — |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | — |
| `mail` | CNAME | `lc2.hostingcorreo.com` | — |

> **Esto ya se perdió una vez.** Al mover el dominio a Vercel la zona llegó vacía, se
> fueron los cuatro MX y con ellos toda la recepción. **Enviar siguió funcionando**
> —usa DKIM y `send.coleffe.com`, que son registros aparte—, así que desde dentro no se
> notaba nada: los correos salían con normalidad mientras los que entraban se perdían.
>
> El SPF de la raíz va **sin** el `+a` que tenía en el cPanel: ese `a` ahora resuelve a
> las IPs de Vercel, que no envían correo.

## Lo que NO hay que copiar

Los registros de la web (`A` en la raíz y en `www`, y la verificación del dominio) **los
pone Vercel solo** al añadir el dominio al proyecto. No se escriben a mano.

## Comprobar que quedó bien

```bash
# Envío — los tres tienen que responder
nslookup -type=MX  send.coleffe.com
nslookup -type=TXT send.coleffe.com
nslookup -type=TXT resend._domainkey.coleffe.com

# Recepción — vacío significa que NADIE recibe correo
nslookup -type=MX coleffe.com
```

Y después, en el panel de **Resend → Domains**, que `coleffe.com` siga en **Verified**.
Resend revisa el DNS por su cuenta: si algo falta, lo marca ahí antes de que se note en
los envíos.

Prueba de extremo a extremo: recuperar la contraseña de una cuenta de prueba (usa el SMTP
de Supabase Auth) y provocar un correo de la plataforma (usa la API de Resend) — son
**dos vías distintas con credenciales distintas**, y una puede funcionar sin la otra. Ver
[`../EMAIL-SETUP.md`](../EMAIL-SETUP.md).

## Cambios ya aplicados a esta zona

- `default._domainkey` (el DKIM del cPanel) **ya no existe** y no hace falta: el envío va
  por Resend.
- `quicknote` (CNAME a Render) **ya no existe**: era otro proyecto.
