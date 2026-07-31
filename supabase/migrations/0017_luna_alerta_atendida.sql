-- EDUTIA — Fase 2 / LUNA: alertas atendidas. La maestra marca una alerta del
-- dashboard como atendida ("Listo ✓") y no vuelve a aparecer NUNCA para ese
-- chico y ese tipo (decisión del usuario, 2026-07-31). Las alertas se calculan
-- on-demand (web/lib/luna.ts); acá solo se persiste qué claves ocultar.
-- Clave estable: '<tipo>:<alumno_id>' (ej. 'inactividad:uuid...').

create table luna_alerta_atendida (
  docente_id uuid not null references perfil(id) on delete cascade,
  clave text not null,
  atendida_at timestamptz not null default now(),
  primary key (docente_id, clave)
);

alter table luna_alerta_atendida enable row level security;

-- Todo es de la docente: lee, marca y (si quisiera reactivar a futuro) borra lo
-- suyo. Inserta el cliente directo vía RLS — es su propio registro de trabajo,
-- sin datos nuevos del menor (la clave solo referencia un id que ya ve).
create policy alerta_atendida_select on luna_alerta_atendida for select to authenticated
  using (docente_id = auth.uid());
create policy alerta_atendida_insert on luna_alerta_atendida for insert to authenticated
  with check (docente_id = auth.uid());
create policy alerta_atendida_delete on luna_alerta_atendida for delete to authenticated
  using (docente_id = auth.uid());
