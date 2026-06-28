-- 0010: Override docente del estado del nodo (Etapa 3 / SP-4e, spec evaluacion-y-dominio-de-nodos D6).
-- La docente puede FIJAR el estado de un nodo a mano; la regla determinística lo respeta
-- (no lo pisa en el próximo cierre de sesión). Marca cuál alumno_nodo está fijado.

alter table alumno_nodo
  add column if not exists estado_override boolean not null default false;

-- La docente puede escribir el alumno_nodo de SUS alumnos (es_mi_alumno). Se suma (OR) a la
-- policy del alumno-dueño ya existente (0002). No ensancha: solo sus propios alumnos.
create policy alumno_nodo_docente_update on alumno_nodo for update to authenticated
  using (es_mi_alumno(alumno_id)) with check (es_mi_alumno(alumno_id));
create policy alumno_nodo_docente_insert on alumno_nodo for insert to authenticated
  with check (es_mi_alumno(alumno_id));
