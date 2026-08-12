-- EDUTIA — Alumno golondrina, WP-A: lockout del link público de transferencia.
-- transferencia-confirmar es la única puerta sin JWT del feature: el token
-- opaco ES toda la autenticación, así que un token errado se ratea igual que
-- el PIN del alumno (patrón intento_login, 0003/0015): cada fallo suma; al 5°
-- la transferencia queda bloqueada 15 minutos y el contador vuelve a 0; un
-- token válido también lo resetea. Todo lo escribe la Edge Function con
-- service_role (la tabla sigue server-only, sin policies): acá solo viven las
-- dos columnas que hacen el lockout persistente entre requests.
alter table transferencia
  add column intentos_fallidos int not null default 0,
  add column bloqueada_hasta timestamptz;

comment on column transferencia.intentos_fallidos is
  'Fallos de token consecutivos del link público. Resetea al bloquear o al acertar (patrón intento_login).';
comment on column transferencia.bloqueada_hasta is
  'Hasta cuándo el link no acepta intentos: 5 fallos → now() + 15 minutos.';
