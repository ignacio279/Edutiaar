-- EDUTIA — Fase 2 / LUNA (copiloto de la docente): boletines por período + chat
-- persistido + contador de uso diario.
-- Principio rector: LUNA propone, la docente decide. El borrador del boletín lo
-- INSERTA la Edge Function luna-boletin (service_role) tras verificar es_mi_alumno;
-- editar / aprobar / corregir es UPDATE directo del cliente vía RLS (patrón
-- sol_materia_update, 0006). Un boletín por (alumno, período mensual 'YYYY-MM').
-- Spec: docs/superpowers/specs/2026-07-28-luna-copiloto-docente-design.md

create table boletin (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references perfil(id) on delete cascade,
  docente_id uuid not null references perfil(id) on delete cascade,
  periodo text not null,                      -- mensual: '2026-07'
  contenido jsonb not null,                   -- { materias:[{materia,texto}], actitud, sugerencia }
  estado text not null default 'borrador' check (estado in ('borrador','aprobado')),
  aprobado_por uuid references perfil(id) on delete set null,
  aprobado_at timestamptz,
  version int not null default 1,             -- sube al regenerar y al corregir
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (alumno_id, periodo)
);
create index on boletin(docente_id, periodo);

alter table boletin enable row level security;

-- Lectura: SOLO la docente dueña. El alumno NO lee boletines (van a la familia
-- vía la seño; la entrega es TERRA, futuro).
create policy boletin_select on boletin for select to authenticated
  using (docente_id = auth.uid());

-- Edición / aprobación / corrección: la dueña. No exigimos estado='borrador'
-- porque "Corregir" tiene que poder volver un aprobado a borrador (decisión
-- validada: la inmutabilidad del aprobado es blanda — es su propio documento).
create policy boletin_update on boletin for update to authenticated
  using (docente_id = auth.uid()) with check (docente_id = auth.uid());
-- Sin INSERT/DELETE para authenticated: inserta la Edge Function (service_role);
-- borrar un boletín no es de esta fase.

-- Chat 24/7 con LUNA: hilo único por docente, persistido para que la conversación
-- siga entre sesiones. Regla 5 cubre datos de menores; esto es el chat de la seño.
create table luna_mensaje (
  id uuid primary key default gen_random_uuid(),
  docente_id uuid not null references perfil(id) on delete cascade,
  role text not null check (role in ('user','luna')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on luna_mensaje(docente_id, created_at);

alter table luna_mensaje enable row level security;

-- El hilo es de la docente: lee y limpia lo suyo. Los INSERTs los hace la Edge
-- Function luna-chat (service_role) — persiste el par pregunta/respuesta junto,
-- así el historial nunca queda a medias si el front se cae.
create policy luna_mensaje_select on luna_mensaje for select to authenticated
  using (docente_id = auth.uid());
create policy luna_mensaje_delete on luna_mensaje for delete to authenticated
  using (docente_id = auth.uid());

-- Tope suave de uso diario (Regla 4): 50 chats y 20 generaciones de boletín por
-- docente por día, contados acá y no desde luna_mensaje (así "Limpiar
-- conversación" no resetea el tope). RLS habilitada SIN policies: solo
-- service_role, patrón aula_secreto (0003).
create table luna_uso (
  docente_id uuid not null references perfil(id) on delete cascade,
  dia date not null,
  chats int not null default 0,
  boletines int not null default 0,
  primary key (docente_id, dia)
);

alter table luna_uso enable row level security;
