-- =====================================================================
-- 0150_favoritos_acumulados.sql — el número de «Satisfacción» de la portada
--
-- «Incluir en la pantalla inicial el número de Satisfacción: la suma de las
--  veces que los usuarios le dieron en Guardar en Favoritos en algún producto,
--  y que SOLO SE SUME, QUE NO SE RESTE.»
--
-- El hueco ya existía en la portada: `platform_stats()` devolvía `satisfaction`
-- como el promedio de `reviews` pasado a porcentaje. Las reseñas están ocultas
-- desde el 15-jul-2026 y no se usan, así que ese número salía siempre «—».
--
-- ── LO DIFÍCIL DE ESTO ES EL «QUE NO SE RESTE» ───────────────────────────────
--
-- Un `count(*) from favorites` NO sirve: baja en cuanto alguien quita un
-- favorito, y baja también —en silencio— cuando se borra un aviso o una cuenta,
-- porque `favorites` tiene ON DELETE CASCADE por los dos lados. Un número de
-- portada que un día dice 2.847 y al siguiente 2.610 no es una métrica, es un
-- error a la vista de todos.
--
-- Y el camino corto —«pues sumo uno cada vez que alguien guarda»— tiene el
-- problema opuesto: guardar y quitar el mismo aviso en bucle infla el contador
-- todo lo que uno quiera desde el propio navegador. Una cifra de portada que
-- cualquiera puede inflar con dos clics tampoco vale.
--
-- Lo que se hace aquí resuelve las dos cosas a la vez, y en dos piezas:
--
--   1. `favorites` DEJA DE BORRAR FILAS. Quitar un favorito ahora marca
--      `removed_at`; volver a guardarlo lo pone a null. La clave primaria
--      (user_id, listing_id) impide por construcción que la misma persona
--      cuente dos veces el mismo aviso: al reactivarlo es un UPDATE, no un
--      INSERT.
--
--   2. UN CONTADOR APARTE que solo un INSERT incrementa. Vive en su propia
--      tabla, sin ninguna relación con `listings` ni con `profiles`, así que
--      ningún borrado en cascada puede tocarlo. Es la pieza que garantiza el
--      «no se resta» pase lo que pase aguas arriba.
--
-- ── POR QUÉ UN CONTADOR Y NO CONTAR LAS FILAS ────────────────────────────────
--
-- Es lo contrario del criterio de la 0124 (el límite de tasa), donde se decidió
-- a propósito contar sobre los hechos en vez de llevar un contador paralelo. No
-- es una contradicción: allí lo que se quería era la verdad actual —cuántos
-- avisos lleva esta persona en la última hora— y un contador solo podía
-- desincronizarse de ella. Aquí lo que se quiere es un acumulado HISTÓRICO, que
-- por definición no está en las filas vivas: las filas se borran con el aviso y
-- el histórico no debe hacerlo. Cuando lo que se persigue es la historia y no el
-- estado, el contador ES la fuente.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. Los favoritos dejan de borrarse ----------
alter table public.favorites
  add column if not exists removed_at timestamptz;

comment on column public.favorites.removed_at is
  'Cuándo se quitó de favoritos. NULL = sigue guardado. La fila no se borra '
  'para que el acumulado de la portada no pueda bajar y para que volver a '
  'guardar el mismo aviso no vuelva a contar.';

-- Todas las lecturas piden los favoritos VIVOS de una persona, así que el
-- índice solo cubre esos: es más pequeño y no crece con los retirados.
create index if not exists favorites_activos_idx
  on public.favorites (user_id)
  where removed_at is null;

-- ---------- 2. El contador ----------
create table if not exists public.platform_counters (
  key   text primary key,
  value bigint not null default 0
);

-- Supabase concede ALL a anon/authenticated en cada tabla nueva de `public`
-- por privilegios por defecto, y eso NO se ve en las pruebas con PGlite. Sin
-- estas dos líneas, cualquiera con la clave anónima —que viaja dentro del
-- JavaScript de la web— podría escribir el número que quisiera en la portada.
alter table public.platform_counters enable row level security;
revoke all on table public.platform_counters from anon, authenticated;

comment on table public.platform_counters is
  'Acumulados históricos de la plataforma. Solo suben. Sin claves foráneas a '
  'propósito: ningún borrado en cascada debe poder moverlos. Se leen por '
  'platform_stats() y se escriben solo desde triggers security definer.';

/**
 * Suma uno al acumulado de veces que se guardó un aviso en favoritos.
 *
 * Salta SOLO en INSERT. Reactivar un favorito que ya existía es un UPDATE de
 * `removed_at`, así que no pasa por aquí — que es justo lo que impide inflar el
 * número guardando y quitando en bucle.
 */
create or replace function public.contar_favorito_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.platform_counters (key, value)
  values ('favoritos_acumulados', 1)
  on conflict (key) do update set value = platform_counters.value + 1;
  return new;
end;
$$;

revoke execute on function public.contar_favorito_nuevo() from public;

drop trigger if exists favorites_contar on public.favorites;
create trigger favorites_contar
  after insert on public.favorites
  for each row execute function public.contar_favorito_nuevo();

-- El punto de partida son los favoritos que ya hay. `do nothing`: si la
-- migración se vuelve a aplicar, no se pisa lo que el trigger lleve sumado.
insert into public.platform_counters (key, value)
values ('favoritos_acumulados', (select count(*) from public.favorites))
on conflict (key) do nothing;

-- ---------- 3. Guardar y quitar, sin borrar ----------
create or replace function public.toggle_favorite(p_listing uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_activo boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Un solo viaje: si no había fila se crea (y el trigger suma uno); si la
  -- había, se le da la vuelta al estado sin tocar el contador.
  insert into public.favorites (user_id, listing_id, removed_at)
  values (auth.uid(), p_listing, null)
  on conflict (user_id, listing_id) do update
    set removed_at = case
                       when favorites.removed_at is null then now()
                       else null
                     end
  returning removed_at is null into v_activo;

  return v_activo;  -- true = quedó guardado, false = se quitó
end;
$$;

-- `security invoker`: el RLS de `favorites_own` sigue decidiendo quién puede
-- tocar qué fila. No se toca eso.
--
-- El `revoke` menciona a `anon` APARTE de `public`, y hace falta: quitárselo a
-- `public` no le quita lo que Supabase concede a `anon` por sus privilegios por
-- defecto. Desde la 0011 esta función era ejecutable sin sesión; no era
-- explotable —lo primero que hace es exigir `auth.uid()`— pero dejar una RPC
-- abierta a la clave anónima «porque por dentro ya comprueba» es justo el
-- patrón que hubo que cerrar en 22 funciones en la 0103.
revoke execute on function public.toggle_favorite(uuid) from public, anon;
grant  execute on function public.toggle_favorite(uuid) to authenticated;

-- ---------- 4. Las cifras por aviso siguen contando los VIVOS ----------
-- «Veces guardado» en las estadísticas del anunciante significa lo mismo que
-- antes: cuánta gente lo tiene guardado AHORA. Sin este filtro, al dejar de
-- borrarse las filas, ese número empezaría a incluir a quien ya lo quitó y el
-- anunciante vería crecer un dato que no le sirve para nada.
create or replace view public.listing_stats as
  select
    l.id as listing_id,
    l.owner_id,
    count(*) filter (where e.type = 'view') as unique_views,
    count(*) filter (where e.type in ('contact_click', 'phone_click')) as clicks,
    (select count(*) from public.favorites f
      where f.listing_id = l.id and f.removed_at is null) as favorites
  from public.listings l
  left join public.listing_events e on e.listing_id = l.id
  group by l.id, l.owner_id;

grant select on public.listing_stats to authenticated;

-- ---------- 5. La portada ----------
-- `satisfaction` SE QUEDA aunque ya no lo pinte nadie: el APK publicado sigue
-- en la 2.6 y lo lee. Quitarlo del jsonb dejaría un hueco en la portada de
-- quien todavía no ha actualizado la aplicación.
create or replace function public.platform_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'active_listings', (select count(*) from public.listings where status = 'active'),
    'total_users',     (select count(*) from public.profiles),
    'reviews',         (select count(*) from public.reviews),
    'satisfaction',    (select case when count(*) = 0 then null
                                    else round(avg(rating) / 5.0 * 100) end
                        from public.reviews),
    'saved_total',     coalesce(
                         (select value from public.platform_counters
                           where key = 'favoritos_acumulados'),
                         0)
  );
$$;

revoke execute on function public.platform_stats() from public;
grant  execute on function public.platform_stats() to anon, authenticated;

comment on function public.platform_stats() is
  'Cifras de la portada, legibles sin sesión. `saved_total` es el acumulado '
  'histórico de veces que se guardó un aviso en favoritos: solo sube.';
