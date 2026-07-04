-- EDUTIA — Fase 2: created_at en ejercicio.
-- created_at en ejercicio: lo usa el tope diario de generación (Regla 4).
alter table ejercicio add column if not exists created_at timestamptz not null default now();
