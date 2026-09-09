# Base de datos

Postgres en Supabase. El esquema está versionado en `supabase/migrations/` (0001–0149) y
es **la única fuente de verdad**: nada se toca a mano en el panel de Supabase, porque lo
que se hace a mano no está en ningún sitio cuando hay que reconstruirlo.

---

## Cómo se escribe una migración

- **Numeración correlativa** y nombre que diga qué hace (`0149_una_sola_forma_de_pedir_correlativo.sql`).
- **Idempotente** siempre que se pueda (`create ... if not exists`, `create or replace`).
- **Comentada arriba**: qué problema resuelve y por qué así. La mitad de las migraciones
  de este repositorio existen porque algo se rompió; ese porqué es lo que evita repetirlo.
- **Con su prueba** cuando cambia una regla (ver [`pruebas.md`](pruebas.md)).

## Autorización: RLS primero

El navegador habla directamente con Postgres, así que **lo que protege es la política de
la tabla**, no la interfaz. Todo lo que no se puede decidir con una política vive en una
función `security definer`, que corre con permisos elevados y comprueba por su cuenta
quién llama.

Para el personal, el segundo nivel es `has_perm(módulo, acción)`. El superadmin siempre
puede: es quien define los permisos y no puede quedarse fuera.

---

## Las tres trampas

Están aquí porque **las tres ya mordieron**, y las tres son invisibles: nada falla, nada
avisa, y la prueba puede pasar en verde mientras producción está abierta.

### 1. Una función nueva nace ejecutable por todo el mundo

Postgres da `EXECUTE` a `PUBLIC` por defecto en cada función nueva. `security definer`
+ `PUBLIC` = cualquiera con la clave anónima puede llamarla.

Se cerró en la migración `0104`, y tiene un matiz que costó encontrar: hay **dos** niveles
de privilegios por defecto —el global y el del esquema— y el resultado es la **unión** de
los dos. Tocar solo el del esquema no quita nada, porque el global lo vuelve a meter. La
`0103` lo intentó así y no funcionó.

Hoy las funciones nuevas nacen cerradas. Pero si escribes una que **debe** ser pública:

```sql
revoke all     on function public.mi_funcion(...) from public;
grant  execute on function public.mi_funcion(...) to anon, authenticated;
```

Sin el `grant`, error `42501` en producción — y si el código se lo traga con un `catch`,
la funcionalidad simplemente no aparece y nadie sabe por qué.

### 2. Una tabla nueva nace con permisos para `anon`

El proyecto de Supabase concede `ALL` sobre cada tabla nueva del esquema `public` a `anon`
y `authenticated`. Un `grant` explícito **no quita** lo que ya venía dado: se suma.

### 3. Y por eso la prueba puede mentir

**PGlite no reproduce esos privilegios por defecto.** Una prueba que comprueba «`anon` no
puede leer esta tabla» pasa en PGlite y es **falsa en producción**.

Pasó exactamente así con la migración `0135`: la prueba en verde, la tabla abierta. Se
cerró en la `0137`.

> Para cualquier cosa relacionada con **permisos**, la prueba local no basta: hay que
> comprobarlo contra el proyecto real.

---

## Tareas programadas (`pg_cron`)

| Tarea | Cada | Qué hace |
|---|---|---|
| `sweep-pending-orders` | 5 min | Cierra las órdenes que se quedaron colgadas en `pending` |
| `sweep-invoice-emissions` | 10 min | Reintenta los comprobantes que quedaron a medias |
| `notify-expiring-listings` | 15 min | Avisa al dueño cuando a su aviso le queda ≤ 1 h |
| `saved-search-alerts` | 15 min | Alertas de las búsquedas guardadas |
| `expire-listings` | 30 min | Pasa a `expired` lo que ya cumplió |

Cada `cron` se programa en su **propia migración**, separada de la que define la función.
Si `pg_cron` no está disponible, el resto del esquema ya quedó aplicado.

## Aplicar migraciones

Con la Management API de Supabase:

```
POST https://api.supabase.com/v1/projects/{ref}/database/query
```

Ver [`despliegue.md`](despliegue.md).

## Antes de dar por buena una migración

- [ ] ¿Alguna función nueva? ¿Tiene su `revoke` + `grant` explícitos?
- [ ] ¿Alguna tabla nueva? ¿Se han cerrado los privilegios que Supabase concede sola?
- [ ] ¿La prueba comprueba permisos? Entonces **no basta con PGlite**.
- [ ] ¿Cambia una regla de negocio? ¿Hay una prueba que falle si se deshace el cambio?
- [ ] ¿Toca dinero o comprobantes? ¿Es idempotente?
