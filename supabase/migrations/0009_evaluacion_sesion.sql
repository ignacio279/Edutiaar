-- EDUTIA — Fase 2 / SP-4c: diagnóstico cualitativo de SOL por sesión.
-- SOLO diagnóstico (resumen, errores, a_reforzar) para la seño y el chico. El estado
-- del nodo NO sale de acá: lo calcula la regla determinística (alumno_nodo, SP-4b).
-- La escribe la Edge Function evaluar-sesion con service_role.

create table evaluacion_sesion (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references sesion(id) on delete cascade,
  resumen text,
  errores jsonb,
  a_reforzar jsonb,
  created_at timestamptz not null default now()
);
create index on evaluacion_sesion(sesion_id);

alter table evaluacion_sesion enable row level security;

-- Lectura: el alumno dueño de la sesión y su docente (vía es_mi_alumno).
create policy evaluacion_sesion_select on evaluacion_sesion for select to authenticated
  using (exists (
    select 1 from sesion s
    where s.id = sesion_id and (s.alumno_id = auth.uid() or es_mi_alumno(s.alumno_id))
  ));
