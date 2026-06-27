-- EDUTIA — listado público (no secreto) de colegios y aulas.
-- Para la pantalla de setup del alumno: elegir colegio → aula antes del código.
-- Solo columnas no sensibles; el secreto del aula vive en aula_secreto (server-only).

create policy escuela_anon_list on escuela for select to anon using (true);
create policy aula_anon_list    on aula    for select to anon using (true);
