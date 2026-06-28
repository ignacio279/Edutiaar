-- EDUTIA — Fase 2 / SP-2: autoría docente.
-- La docente sube contenido → se crea un programa propio + sol_materia (perfil de
-- especialista de SOL) + nodos (borrador) que ella revisa y publica.
-- Primera vez que hay CONTENIDO con dueño (programa era semilla compartida).

create type estado_sol_materia as enum ('borrador','publicado');

-- sol_materia: el especialista de SOL para un programa, propiedad de una docente.
create table sol_materia (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid not null references programa(id) on delete cascade,
  docente_id uuid not null references perfil(id) on delete cascade,
  escuela_id uuid not null references escuela(id) on delete cascade,
  perfil jsonb,
  estado estado_sol_materia not null default 'borrador',
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index on sol_materia(docente_id);
create index on sol_materia(programa_id);

-- nodo: seam para revisión/edición (D7 del spec de Fase 2).
alter table nodo add column descripcion text;
alter table nodo add column actualizado_at timestamptz not null default now();
alter table nodo add column version int not null default 1;

-- RLS ---------------------------------------------------------------------------
alter table sol_materia enable row level security;

-- sol_materia: solo la docente dueña ve y edita lo suyo (publicar = update estado).
-- El INSERT lo hace la Edge Function dividir-nodos con service_role (bypassa RLS).
create policy sol_materia_select on sol_materia for select to authenticated
  using (docente_id = auth.uid());
create policy sol_materia_update on sol_materia for update to authenticated
  using (docente_id = auth.uid()) with check (docente_id = auth.uid());

-- nodo: la lectura compartida ya existe (nodo_select using(true)). Se agrega
-- escritura SOLO para la docente dueña del programa (vía sol_materia), para que
-- revise/edite/borre los nodos generados antes de publicar.
create policy nodo_insert_autor on nodo for insert to authenticated
  with check (exists (
    select 1 from sol_materia sm
    where sm.programa_id = nodo.programa_id and sm.docente_id = auth.uid()
  ));
create policy nodo_update_autor on nodo for update to authenticated
  using (exists (
    select 1 from sol_materia sm
    where sm.programa_id = nodo.programa_id and sm.docente_id = auth.uid()
  ))
  with check (exists (
    select 1 from sol_materia sm
    where sm.programa_id = nodo.programa_id and sm.docente_id = auth.uid()
  ));
create policy nodo_delete_autor on nodo for delete to authenticated
  using (exists (
    select 1 from sol_materia sm
    where sm.programa_id = nodo.programa_id and sm.docente_id = auth.uid()
  ));
