-- EDUTIA — Etapa 0, item 2: Row Level Security
-- Activa RLS en las 9 tablas y define policies.
-- Regla (CLAUDE.md #5): datos de menores — cada alumno ve solo lo suyo,
-- cada docente solo a sus alumnos.

-- Helpers security definer (evitan recursión de RLS al consultar perfil)
create or replace function mi_escuela()
returns uuid language sql security definer stable set search_path = public as $$
  select escuela_id from perfil where id = auth.uid();
$$;

create or replace function es_mi_alumno(target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from perfil where id = target and docente_id = auth.uid());
$$;

-- Activar RLS en las 9 tablas
alter table escuela     enable row level security;
alter table perfil      enable row level security;
alter table materia     enable row level security;
alter table programa    enable row level security;
alter table nodo        enable row level security;
alter table ejercicio   enable row level security;
alter table alumno_nodo enable row level security;
alter table sesion      enable row level security;
alter table respuesta   enable row level security;

-- ESCUELA: cada uno ve su escuela
create policy escuela_select on escuela for select to authenticated
  using (id = mi_escuela());

-- PERFIL: el propio + (si docente) sus alumnos. Insert/update solo el propio.
create policy perfil_select on perfil for select to authenticated
  using (id = auth.uid() or docente_id = auth.uid());
create policy perfil_insert on perfil for insert to authenticated
  with check (id = auth.uid());
create policy perfil_update on perfil for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- CONTENIDO compartido: lectura para authenticated, escritura solo service_role
create policy materia_select   on materia   for select to authenticated using (true);
create policy programa_select  on programa  for select to authenticated using (true);
create policy nodo_select      on nodo      for select to authenticated using (true);
create policy ejercicio_select on ejercicio for select to authenticated using (true);

-- ALUMNO_NODO: alumno lee/escribe lo suyo; docente solo lee lo de sus alumnos
create policy alumno_nodo_select on alumno_nodo for select to authenticated
  using (alumno_id = auth.uid() or es_mi_alumno(alumno_id));
create policy alumno_nodo_insert on alumno_nodo for insert to authenticated
  with check (alumno_id = auth.uid());
create policy alumno_nodo_update on alumno_nodo for update to authenticated
  using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());

-- SESION: igual patrón
create policy sesion_select on sesion for select to authenticated
  using (alumno_id = auth.uid() or es_mi_alumno(alumno_id));
create policy sesion_insert on sesion for insert to authenticated
  with check (alumno_id = auth.uid());
create policy sesion_update on sesion for update to authenticated
  using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());

-- RESPUESTA: vía su sesion. Lectura alumno/docente; insert solo el alumno dueño
create policy respuesta_select on respuesta for select to authenticated
  using (exists (select 1 from sesion s where s.id = sesion_id
                 and (s.alumno_id = auth.uid() or es_mi_alumno(s.alumno_id))));
create policy respuesta_insert on respuesta for insert to authenticated
  with check (exists (select 1 from sesion s where s.id = sesion_id
                      and s.alumno_id = auth.uid()));
