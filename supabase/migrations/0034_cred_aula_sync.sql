-- 0034: la credencial del alumno sigue a su matrícula.
--
-- Bug detectado sobre datos reales (2026-08-18): mover un chico de aula desde
-- "Mi clase" le rompía el login EN SILENCIO. editar_alumno escribe el aula en
-- la matrícula y matricula_sync actualiza el caché de perfil, pero nadie tocaba
-- alumno_cred.aula_id — y alumno_login (0015) exige que la CREDENCIAL coincida
-- con el aula del código tipeado. Resultado: el chico aparecía en el listado del
-- aula nueva (aula_students joinea por el caché de perfil) y al entrar recibía
-- 'aula_invalida'; por el aula vieja no aparecía. Sin login por ninguna.
--
-- Se arregla donde vive el contrato (ADR-011: un solo escritor), no en el call
-- site: alumno_cred.aula_id pasa a ser caché de la matrícula igual que las
-- columnas de vínculo de perfil. Así queda cubierto cualquier camino que mueva
-- el aula, presente o futuro, sin que cada uno tenga que acordarse.
--
-- El cierre no se toca: matricula_cerrar ya BORRA la credencial (revoca el
-- login), que es más fuerte que reapuntarla.

create or replace function matricula_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('edutia.matricula_sync', '1', true);
  if new.fecha_fin is null then
    update perfil set docente_id = new.docente_id, aula_id = new.aula_id,
                      escuela_id = new.escuela_id, grado = new.grado
    where id = new.alumno_id;
    -- La credencial es caché de la matrícula, igual que el vínculo de perfil.
    -- En el alta la fila todavía no existe (crear_alumno abre la matrícula y
    -- DESPUÉS llama set_alumno_cred): 0 filas afectadas, no es error.
    update alumno_cred set aula_id = new.aula_id
    where perfil_id = new.alumno_id and aula_id is distinct from new.aula_id;
  elsif tg_op = 'UPDATE' and old.fecha_fin is null then
    -- Se cerró: el colegio pierde el legajo vivo al instante.
    update perfil set docente_id = null, aula_id = null, escuela_id = null
    where id = new.alumno_id;
  end if;
  return new;
end;
$$;

-- Backfill: alinear las credenciales que ya quedaron desfasadas. Idempotente
-- (el where lo vuelve no-op si no hay drift).
update alumno_cred c set aula_id = m.aula_id
from matricula m
where m.alumno_id = c.perfil_id
  and m.fecha_fin is null
  and c.aula_id is distinct from m.aula_id;
