-- EDUTIA — El mapeo NAP se blinda en la base.
-- Sale de la revisión final de la fase (hallazgos 4 y 5).
--
-- Hallazgo 4: la policy nodo_update_autor es agnóstica de columnas, así que
-- cualquier docente autenticada podía PATCHear nap_tema_id/nap_confianza/
-- nap_revisado/nap_intentos de un nodo suyo — pese a que el spec y el
-- encabezado de 0028 afirmaban "la escritura del mapeo pasa solo por
-- service_role". Ver docs/superpowers/specs/2026-08-14-marco-nap-observatorio-design.md
-- (sección Modelo de datos): esa frase era falsa hasta esta migración.
--
-- Hallazgo 5: editar nombre/descripcion de un nodo no tocaba las columnas
-- nap_*, así que un nodo reescrito de punta a punta seguía nap_revisado=true
-- — excluido del backfill (que filtra nap_revisado=false) y de la cola de
-- revisión, clasificado según un texto que ya no existe.
--
-- Dos cosas, un solo trigger, porque interactúan: la invalidación automática
-- TAMBIÉN escribe columnas nap_*, así que tiene que pasar por el mismo lugar
-- que las rechaza. El orden importa: la invalidación va PRIMERO y sale con
-- `return new` sin pasar por el guard — si no, la invalidación que dispara
-- la propia docente al editar texto sería rechazada por su propio guard.
--
-- Patrón: perfil_guard (migración 0022), que protege el vínculo del alumno.
-- Diferencia a propósito: perfil_guard usa una GUC porque su único escritor
-- legítimo (matricula_sync) corre con el mismo rol que quiere bloquear. Acá
-- no hace falta: los escritores legítimos del mapeo (dividir-nodos,
-- admin-jobs, admin-colegios) ya llaman con service_role, así que alcanza con
-- distinguir el rol de la conexión — verificado contra la base real (ver
-- reporte de la Task 10): auth.role() devuelve 'service_role' con la service
-- key, 'authenticated' con un JWT de docente y 'anon' sin auth. Se usa
-- auth.role() y no current_setting('request.jwt.claims', true) porque ya
-- decodifica y valida el rol del JWT — es la fuente que usa PostgREST mismo.

create or replace function nodo_nap_guard()
returns trigger language plpgsql as $$
declare
  v_rol text := coalesce(auth.role(), '');
  v_texto_cambio boolean :=
    new.nombre is distinct from old.nombre
    or new.descripcion is distinct from old.descripcion;
  v_nap_cambio boolean :=
    new.nap_tema_id is distinct from old.nap_tema_id
    or new.nap_confianza is distinct from old.nap_confianza
    or new.nap_revisado is distinct from old.nap_revisado
    or new.nap_intentos is distinct from old.nap_intentos;
begin
  -- (1) INVALIDACIÓN: si cambió el texto del nodo, la clasificación que había
  -- describía otra cosa. Vuelve a la cola: se limpia la marca de revisado, se
  -- reinician los intentos y se borra la confianza (era del texto viejo).
  -- El tema propuesto se conserva a propósito: sirve de punto de partida para
  -- quien revise, y el nodo igual reaparece en la cola por confianza nula.
  if v_texto_cambio then
    new.nap_revisado := false;
    new.nap_intentos := 0;
    new.nap_confianza := null;
    return new;
  end if;

  -- (2) GUARD: fuera de la invalidación, las columnas del mapeo las escribe
  -- SOLO el servidor (Edge Functions con service_role). La policy
  -- nodo_update_autor es agnóstica de columnas y por sí sola dejaría a una
  -- docente marcar sus nodos como revisados.
  if v_nap_cambio and v_rol <> 'service_role' then
    raise exception
      'mapeo_protegido: el mapeo NAP de un nodo se cambia solo desde el servidor';
  end if;

  return new;
end;
$$;

create trigger nodo_nap_guard_trg
  before update on nodo
  for each row execute function nodo_nap_guard();
