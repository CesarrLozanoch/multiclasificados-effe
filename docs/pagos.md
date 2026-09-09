# Pagos y saldo

> ⚠️ **Izipay está en PRODUCCIÓN. Los cobros son reales.** Una prueba con tarjeta
> cobra de verdad. Para probar sin cobrar hay una sonda de la API descrita más abajo.

---

## El modelo: saldo prepagado

**1 crédito = 1 sol.** El anunciante compra saldo y lo gasta publicando. No se cobra por
aviso: se cobra por recarga.

El precio de una publicación sale de `_shared/pricing.ts`:

- un **precio base** por aviso,
- **descuento por cantidad** (a más avisos en la misma compra, menos por unidad),
- **descuento por duración** (7 / 15 / 30 / 60 / 90 días),
- **extras** opcionales: destacado, urgente, más imágenes, PDF, vídeo.

Los precios **ya incluyen IGV** (18%). El desglose subtotal/IGV se calcula al revés, al
crear la orden y el comprobante — nunca sumando encima.

### La misma fórmula, dos veces

`src/lib/pricing.ts` (navegador) y `supabase/functions/_shared/pricing.ts` (Deno) son
copias. No pueden compartir módulo: una va en el bundle de Vite y la otra corre en Deno.

Lo que impide que se separen es `src/test/pricingParity.test.ts`, que las compara.
**Si tocas la fórmula en un sitio, tócala en el otro.**

## Por qué el importe se recalcula en el servidor

El navegador manda *qué* quiere comprar —cuántos avisos, cuántos días, qué extras—, no
*cuánto cuesta*. `create-payment` vuelve a calcular el importe con la misma fórmula y con
los precios que hay en la base **en ese momento**, y cobra ese.

Si se confiara en el precio que envía el cliente, cualquiera podría comprar mil créditos
por un sol cambiando un número antes de enviarlo. No es una hipótesis: es el fallo más
común de las integraciones de pago.

## El circuito

```
1. create-payment    recalcula el importe, crea la orden en `pending`,
                     pide a Izipay un formToken
2. el usuario paga   formulario incrustado de Izipay
3. payment-webhook   Izipay avisa al servidor (IPN). Verifica la firma HMAC
                     y llama a settle_paid_order con service role
4. verify-payment    red de seguridad: si el IPN no llegó, se consulta el pago
                     y se liquida igual
```

**Quien acredita es el servidor, nunca el navegador.** El retorno del usuario a la página
de «pago correcto» no acredita nada: solo enseña el resultado. Si acreditase el cliente,
bastaría con volver a cargar esa URL.

`settle_paid_order` es **idempotente**: si el IPN llega dos veces —y llega—, la segunda no
acredita nada. El truco está en la primera línea: pasa la orden a `paid` **solo si no lo
estaba ya**, y si no afectó a ninguna fila, sale sin hacer nada. Sin ese cerrojo, un
reintento de Izipay duplicaría el saldo.

Por eso el webhook devuelve **500 cuando algo falla**: es lo que hace que Izipay
reintente. Devolver 200 para «no molestar» perdería el pago en silencio.

### Qué hace `settle_paid_order`

Todo lo que ocurre cuando entra dinero, en una sola función y en una sola transacción:

1. acredita el saldo,
2. crea el comprobante (boleta o factura) y dispara su emisión,
3. si la compra era «pagar y publicar», **publica el aviso**.

Es el único sitio donde pasa esto. Da igual si el pago vino por tarjeta, por Yape, por
Plin o de una aprobación manual en el panel: todos los caminos acaban aquí.

## Dos formas de comprar

| | Qué hace |
|---|---|
| **Comprar saldo** | Recarga la cuenta. El aviso se publica después, cuando el anunciante quiera. |
| **Pagar y publicar** | Paga y el aviso queda publicado en el mismo acto. Lo publica el webhook, no el navegador: si el usuario cierra la pestaña tras pagar, el aviso sale igual. |

## Yape y Plin

Cobro **manual** por billetera, para quien no quiere poner la tarjeta:

1. el usuario transfiere y sube su comprobante,
2. queda una orden `pending` esperando,
3. una persona del panel la aprueba,
4. `admin_aprobar_pago_manual` llama a **la misma `settle_paid_order`**.

O sea: acredita, factura y publica exactamente igual que una tarjeta. Manual es solo la
comprobación de que el dinero llegó.

> **Por qué es manual y no automático.** Yape y Plin existen dentro de Izipay, pero en
> una plataforma distinta de la que usa eFFe: la nuestra es la heredada (Lyra /
> micuentaweb, tecnología PayZen), cuyo formulario incrustado solo admite tarjetas y
> pagoEfectivo. Cobrarlos de forma automática no es activar una casilla — es integrar un
> segundo medio de pago, con su afiliación, sus credenciales y su propio aviso de pago.
> Se optó por la aprobación manual, que resuelve el caso sin duplicar el circuito.

## Probar sin cobrar

Con Izipay en producción, **no se prueba pagando**. Lo que hay:

- una **sonda** que valida contra la API de Izipay que los datos de una compra serían
  aceptados, sin llegar a cobrar (útil sobre todo con empresas: Izipay rechaza el
  `identityType` `"RUC"`, y hay que mandarlas de otra forma);
- las **pruebas automáticas**, que cubren la fórmula, la firma del webhook, la
  idempotencia y los estados de la orden.

Las llaves de prueba están guardadas fuera del repositorio.

## Configuración

Los *secrets* de cada función están en su `DEPLOY.md`:

- `supabase/functions/create-payment/DEPLOY.md`
- `supabase/functions/payment-webhook/DEPLOY.md`
- `supabase/functions/verify-payment/DEPLOY.md`

En el `.env` del frontend solo va lo **público**: `VITE_IZIPAY_PUBLIC_KEY` y
`VITE_IZIPAY_STATIC_ENDPOINT`. La contraseña de la tienda y la clave HMAC **jamás** en un
`VITE_*`: todo `VITE_*` se empaqueta en el JavaScript que descarga el navegador.
