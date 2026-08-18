-- EDUTIA — Métricas de valor del panel admin.
-- Spec: docs/superpowers/specs/2026-08-17-metricas-de-valor-design.md
--
-- POR QUÉ UN LOG DE HITOS Y NO UN SNAPSHOT:
-- `alumno_nodo.actualizado_at` NO dice cuándo se dominó un tema. El cierre de
-- cada sesión hace upsert con actualizado_at = now() incluso sobre un nodo ya
-- dominado (el estado es pegajoso, pero el puntaje se sigue replayeando) —
-- ver web/app/alumno/[programaId]/practicar/page.tsx:295. Ese timestamp es
-- "última práctica", no "fecha del hito".
--
-- POR QUÉ UN TRIGGER Y NO EL FRONT:
-- `alumno_nodo` lo escribe el CLIENTE por RLS: el chico al practicar
-- (practicar/page.tsx:295) y la seño al fijar un override
-- (docente/[alumnoId]/page.tsx:123). Un trigger SECURITY DEFINER es el único
-- escritor confiable del log: no lo puede falsear el cliente, cubre los dos
-- caminos sin tocar el front y sigue vivo si mañana aparece un tercero.
-- Patrón del proyecto: matricula_sync (0022), perfil_guard (0022),
-- nodo_nap_guard (0031).

-- ── 1. Log de hitos de aprendizaje ─────────────────────────────────────────
-- Server-only (RLS activa, SIN policies para authenticated), como uso_api: lo
-- lee admin-metricas con service_role y nadie más.

create type hito_tipo as enum ('dominado', 'destrabado', 'trabado', 'override');

create table hito_aprendizaje (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references perfil(id) on delete cascade,
  nodo_id uuid not null references nodo(id) on delete cascade,
  -- Desnormalizados desde `perfil` para agregar por colegio y grado sin joins
  -- caros. `perfil` es caché que mantiene matricula_sync (0022); si el chico se
  -- transfiere, el hito conserva DÓNDE pasó, que es lo correcto para la serie
  -- histórica.
  escuela_id uuid references escuela(id) on delete set null,
  grado int,
  tipo hito_tipo not null,
  -- Cuántos ejercicios le costó llegar hasta acá. Se cuenta EN el momento del
  -- hito: es la única oportunidad de saberlo sin reconstruir la historia.
  ejercicios_hasta int not null default 0,
  puntaje numeric not null default 0,
  -- 'backfill' = sembrado desde el estado actual al aplicar esta migración, con
  -- fecha APROXIMADA (actualizado_at). El front no lo mezcla en las series.
  origen text not null default 'vivo' check (origen in ('vivo', 'backfill')),
  created_at timestamptz not null default now()
);

create index hito_created_idx on hito_aprendizaje (created_at);
create index hito_escuela_idx on hito_aprendizaje (escuela_id, created_at);
create index hito_tipo_idx on hito_aprendizaje (tipo, created_at);
create index hito_alumno_idx on hito_aprendizaje (alumno_id);

alter table hito_aprendizaje enable row level security;
-- Sin policies a propósito: server-only.

-- Contar los ejercicios de un (alumno, nodo) es la consulta que corre el
-- trigger. Los índices de 0001 son por columna suelta; este es el compuesto.
create index if not exists sesion_alumno_nodo_idx on sesion (alumno_id, nodo_id);

create or replace function hito_registrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado_viejo estado_nodo := case when tg_op = 'INSERT' then 'no_empezado'::estado_nodo else old.estado end;
  v_override_viejo boolean := case when tg_op = 'INSERT' then false else coalesce(old.estado_override, false) end;
  v_escuela uuid;
  v_grado int;
  v_ejercicios int;
begin
  -- Nada cambió de lo que miramos → ni siquiera contamos ejercicios.
  if tg_op = 'UPDATE'
     and new.estado is not distinct from old.estado
     and coalesce(new.estado_override, false) is not distinct from coalesce(old.estado_override, false) then
    return null;
  end if;

  select p.escuela_id, p.grado into v_escuela, v_grado
  from perfil p where p.id = new.alumno_id;

  select count(*) into v_ejercicios
  from respuesta r
  join sesion s on s.id = r.sesion_id
  where s.alumno_id = new.alumno_id and s.nodo_id = new.nodo_id;

  -- Una transición puede emitir DOS hitos (a_reforzar → dominado = destrabado
  -- + dominado). Es correcto y es información: se registran los dos.

  -- Destrabado: salió de 'a_reforzar'. El caso más lindo del producto.
  if v_estado_viejo = 'a_reforzar' and new.estado <> 'a_reforzar' then
    insert into hito_aprendizaje (alumno_id, nodo_id, escuela_id, grado, tipo, ejercicios_hasta, puntaje)
    values (new.alumno_id, new.nodo_id, v_escuela, v_grado, 'destrabado', v_ejercicios, new.puntaje);
  end if;

  -- Trabado: entró en 'a_reforzar'.
  if new.estado = 'a_reforzar' and v_estado_viejo <> 'a_reforzar' then
    insert into hito_aprendizaje (alumno_id, nodo_id, escuela_id, grado, tipo, ejercicios_hasta, puntaje)
    values (new.alumno_id, new.nodo_id, v_escuela, v_grado, 'trabado', v_ejercicios, new.puntaje);
  end if;

  -- Dominado: el hito caro. Pegajoso, así que en la práctica ocurre una vez
  -- por (alumno, nodo) salvo que un override docente lo baje y se recupere.
  if new.estado = 'dominado' and v_estado_viejo <> 'dominado' then
    insert into hito_aprendizaje (alumno_id, nodo_id, escuela_id, grado, tipo, ejercicios_hasta, puntaje)
    values (new.alumno_id, new.nodo_id, v_escuela, v_grado, 'dominado', v_ejercicios, new.puntaje);
  end if;

  -- Override: la seño le lleva la contra al motor. Alto = el modelo no matchea
  -- el aula; bajo = confía. Interesante en los dos sentidos.
  if coalesce(new.estado_override, false) and not v_override_viejo then
    insert into hito_aprendizaje (alumno_id, nodo_id, escuela_id, grado, tipo, ejercicios_hasta, puntaje)
    values (new.alumno_id, new.nodo_id, v_escuela, v_grado, 'override', v_ejercicios, new.puntaje);
  end if;

  return null; -- AFTER trigger: el valor de retorno se ignora.
end;
$$;

create trigger hito_registrar_trg
  after insert or update on alumno_nodo
  for each row execute function hito_registrar();

-- ── 2. Snapshot diario del puntaje (histograma mes a mes) ──────────────────
-- Lo único genuinamente poblacional: el estado de TODOS los nodos en un
-- momento. No se puede reconstruir hacia atrás, por eso se fotografía.
-- PK compuesta → la corrida del cron es idempotente (upsert por día).

create table snapshot_aprendizaje (
  fecha date not null,
  escuela_id uuid not null references escuela(id) on delete cascade,
  bucket int not null check (bucket between 0 and 9), -- decil de puntaje
  nodos int not null default 0,
  primary key (fecha, escuela_id, bucket)
);

alter table snapshot_aprendizaje enable row level security;
-- Sin policies: server-only, lo escribe admin-jobs y lo lee admin-metricas.

-- ── 3. Alertas de LUNA emitidas ────────────────────────────────────────────
-- El denominador de "atendidas / emitidas". Las alertas se calculan on-demand
-- (web/lib/luna.ts) y nunca se guardaban: luna_alerta_atendida (0017) tenía
-- numerador sin denominador.
--
-- La escribe el DASHBOARD de la seño con lo que efectivamente le mostró, no un
-- job nocturno: evita espejar ~120 líneas de detectores a _shared/ con su test
-- de paridad, y el denominador queda más honesto ("lo que LUNA le mostró", no
-- "lo que existiría si abriera la pantalla"). Mismo modelo de amenaza que
-- luna_alerta_atendida, ya aceptado en 0017: analítica interna, sin efecto
-- sobre acceso ni datos de menores.

create table luna_alerta (
  docente_id uuid not null references perfil(id) on delete cascade,
  clave text not null, -- '<tipo>:<alumno_id>', la misma de claveAlerta()
  tipo text not null,
  prioridad text not null,
  primera_vez_at timestamptz not null default now(),
  primary key (docente_id, clave)
);

alter table luna_alerta enable row level security;

-- Inserta y lee lo suyo. SIN policy de UPDATE a propósito: primera_vez_at no se
-- puede empujar hacia adelante, así el "tiempo hasta atender" no se falsea.
create policy luna_alerta_select on luna_alerta for select to authenticated
  using (docente_id = auth.uid());
create policy luna_alerta_insert on luna_alerta for insert to authenticated
  with check (docente_id = auth.uid());

-- ── 4. Backfill de hitos ───────────────────────────────────────────────────
-- Sin esto las series arrancan vacías y la pantalla parece rota el primer mes.
-- created_at = actualizado_at es APROXIMADO (ver arriba); por eso origen =
-- 'backfill' y el front no lo mezcla en las series temporales.
-- ejercicios_hasta sí es exacto (aunque cuenta también lo practicado DESPUÉS
-- del hito, que es el mismo sesgo para todos).

insert into hito_aprendizaje (alumno_id, nodo_id, escuela_id, grado, tipo, ejercicios_hasta, puntaje, origen, created_at)
select an.alumno_id, an.nodo_id, p.escuela_id, p.grado,
       (case when an.estado = 'dominado' then 'dominado' else 'trabado' end)::hito_tipo,
       coalesce(c.n, 0), an.puntaje, 'backfill', an.actualizado_at
from alumno_nodo an
join perfil p on p.id = an.alumno_id
left join lateral (
  select count(*) as n from respuesta r
  join sesion s on s.id = r.sesion_id
  where s.alumno_id = an.alumno_id and s.nodo_id = an.nodo_id
) c on true
where an.estado in ('dominado', 'a_reforzar');

insert into hito_aprendizaje (alumno_id, nodo_id, escuela_id, grado, tipo, ejercicios_hasta, puntaje, origen, created_at)
select an.alumno_id, an.nodo_id, p.escuela_id, p.grado, 'override',
       coalesce(c.n, 0), an.puntaje, 'backfill', an.actualizado_at
from alumno_nodo an
join perfil p on p.id = an.alumno_id
left join lateral (
  select count(*) as n from respuesta r
  join sesion s on s.id = r.sesion_id
  where s.alumno_id = an.alumno_id and s.nodo_id = an.nodo_id
) c on true
where an.estado_override = true;
