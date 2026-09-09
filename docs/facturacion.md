# Facturación electrónica

> ⚠️ **Factiliza está en PRODUCCIÓN. Cada comprobante emitido es un documento fiscal
> real, declarado a SUNAT.** Un comprobante emitido **no se borra**: se anula con una
> nota de crédito. Y un correlativo consumido no se recupera.

---

## El circuito

```
settle_paid_order          crea la fila del comprobante y pide su emisión
        │
        ▼
emit-invoice (Deno)        arma el documento, lo manda a Factiliza,
        │                  interpreta la respuesta, guarda el CDR
        ▼
Factiliza ──▶ SUNAT        firma, envía y devuelve el CDR (la constancia)
        │
        ▼
correo al comprador        con el PDF adjunto
```

`emit-invoice` la llama la propia base de datos al liquidarse un pago, un barrido
periódico para lo que quedó a medias, y el botón **Reintentar** del panel.

> Nada de esto puede costarle créditos a nadie: cuando entra en juego, el pago ya está
> liquidado y el saldo acreditado. Si la emisión falla, se registra y se reintenta; el
> saldo del usuario no se toca.

## Boleta o factura

Lo decide el documento del cliente, y **no es opcional**:

| Documento | Comprobante | Serie |
|---|---|---|
| RUC | factura | `F001` |
| DNI, carné de extranjería, pasaporte | boleta | `B001` |

Con RUC corresponde factura; con DNI, boleta. Mandarlo al revés es rechazo seguro, así
que se comprueba **antes** de gastar un correlativo.

Los datos del cliente los pone la **fuente oficial**: `verify-doc` consulta el DNI o el
RUC en Factiliza y el nombre viene de ahí, no de lo que escriba el usuario.

## Los correlativos

Cada serie lleva su contador, y lo reparte `next_invoice_number(tipo, es_prueba)` —una
función, **una sola**— dentro de la misma transacción que crea el comprobante.

Dos cosas que ya salieron mal, y que explican por qué está así:

- **Hubo una segunda versión de la función, con un solo argumento**, que repartía siempre
  series de producción sin mirar si era una prueba. Se eliminó en la migración `0149`.
  Un correlativo entregado por el camino equivocado **no se puede devolver**.
- **Las pruebas usan sus propias series.** Mezclarlas con las de producción ensucia una
  numeración que SUNAT espera correlativa y sin huecos.

## Cuadrar al céntimo

Es la causa más frecuente de rechazo. Los precios ya incluyen IGV, así que la base
imponible sale de dividir, no de sumar. Si por redondeo `base + IGV ≠ total`, **se ajusta
el IGV**, que es quien absorbe el céntimo suelto. Si aun así no cuadra, el documento **no
se envía**: es mejor un error nuestro que un rechazo de SUNAT con el correlativo gastado.

## Leer la respuesta: cuatro desenlaces

La trampa: **un rechazo llega con HTTP 200**. Hay que leer el cuerpo. Mirar solo el código
HTTP daría por bueno un documento rechazado, se le mandaría al cliente como válido y
nadie se enteraría hasta la multa.

| Desenlace | Qué es | Qué se hace |
|---|---|---|
| `aceptado` | SUNAT lo aceptó | Nada más |
| `observado` | Aceptado, con notas en el CDR | Ver abajo |
| `rechazado` | Los datos están mal | **No se reintenta solo**: reenviarlo daría igual y quemaría correlativos |
| `error` | No se pudo saber (red, 500, respuesta ilegible) | Se reintenta |

Hay además dos casos que parecen errores y no lo son:

- **«Ya se encuentra declarado en SUNAT»** llega como HTTP 400 con `success:false`, y es
  un **aceptado**. En esa respuesta no viene el CDR, así que hay que ir a buscarlo con
  `/invoice/cdr` — que **devuelve un ZIP, no JSON**: leerlo como texto lo corrompe.
- **«En cola»**: Factiliza lo tiene y aún no lo ha mandado. No gasta intento; si esperar
  consumiera reintentos, una cola lenta daría por vencido un comprobante que iba a salir.

## Observaciones (`observado`)

Un CDR con código `0` es una **aceptación**, y aun así puede traer notas. No todas pesan
igual:

- Las marcadas **`INFO:`** suelen hablar de la **configuración del emisor**, no de la
  venta. Se repiten idénticas en todos los comprobantes y **no se arreglan reemitiendo**.
- Cualquier otra —un importe, una fecha, el cliente— apunta a cómo armamos el documento y
  **sí** hay que mirarla.

Por eso solo las segundas levantan `needs_review`. Marcar también las primeras entrena a
ignorar el aviso, y el día que llegue una de verdad nadie la mira.

> **Ante la duda, se revisa.** Una nota sin marcador, una que no sea texto o una lista
> vacía cuentan como «hay que mirarla».

La regla vive **dos veces** —en el navegador decide el color de la etiqueta, en Deno
decide si sale a revisión— porque no pueden compartir módulo. Hay una prueba que las
compara caso por caso.

En el panel, un comprobante así se ve **como aceptado**, con una línea que dice que hay
una nota; el texto completo, traducido y con el original, está en «Ver». Es lo mismo que
muestra el panel de Factiliza, que sencillamente no enseña las notas del CDR.

## Anular

Un comprobante declarado **no se borra**: se emite una **nota de crédito** que lo
referencia, con su propia serie y su propio correlativo. Los importes van en **positivo**
aunque la nota reste — es lo que espera SUNAT; en negativo es rechazo seguro.

Al anular se devuelven los créditos correspondientes.

## Modo pruebas

`app_produccion` decide si se emite de verdad o contra las series de prueba. El salto a
producción tiene su propia receta: **no basta con cambiar la bandera** — hay que validar
el token, el RUC y que los correlativos de producción estén vírgenes **antes** de tocar
nada, porque el primer envío ya es real.

## Configuración

- Los *secrets* (token de Factiliza, RUC emisor, Resend, etc.) en
  `supabase/functions/emit-invoice/DEPLOY.md`.
- Los datos del **emisor** —razón social, dirección, logo, nombre comercial— **no están en
  este código**: son el perfil de la empresa en el panel de Factiliza. Si el PDF sale sin
  logo o sin nombre comercial, se rellena allí; no hay nada que tocar aquí.
