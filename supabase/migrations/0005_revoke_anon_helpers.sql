-- EDUTIA — endurecer helpers de RLS (cierra lint 0028: anon ejecuta SECURITY DEFINER).
-- mi_escuela() y es_mi_alumno() son SECURITY DEFINER usados DENTRO de las policies
-- (rol authenticated). No deben ser invocables por `anon` vía /rest/v1/rpc/.
--
-- Probado empíricamente: revocar de `authenticated` ROMPE las policies — Postgres
-- exige EXECUTE en funciones referenciadas por RLS contra el rol que consulta.
-- Por eso se mantiene el grant a `authenticated` (lint 0029 es intencional acá).

revoke execute on function public.mi_escuela() from public, anon;
revoke execute on function public.es_mi_alumno(uuid) from public, anon;
