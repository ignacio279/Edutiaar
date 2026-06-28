-- EDUTIA — Gestión de aulas + alumnos por la docente ("Mi clase").
-- La docente pasa a ser DUEÑA de sus aulas (aula.docente_id) para poder listarlas y
-- gestionarlas. Las escrituras siguen siendo server-only (Edge Function gestion-alumnos
-- con service role); acá solo agregamos la propiedad, la lectura RLS y el reset de PIN.

-- ---------- aula: dueño = docente ----------
alter table aula add column docente_id uuid references perfil(id) on delete set null;

-- Backfill: el aula sembrada (ID.aula del seed) queda a nombre de Ana. Su perfil.id es
-- dinámico (lo crea el seed por email), así que lo resolvemos vía auth.users.
update aula set docente_id = u.id
  from auth.users u
  where aula.id = '44444444-4444-4444-8444-444444444444'
    and u.email = 'ana@edutia.ar';

-- La docente ve SUS aulas. (La policy aula_select de 0003 filtra por perfil.aula_id, que
-- los docentes no tienen → no les sirve. Las policies se combinan con OR.)
create policy aula_select_docente on aula for select to authenticated
  using (docente_id = auth.uid());

-- ---------- RPC: resetear solo el PIN ----------
-- No toca las credenciales opacas (auth_email / auth_password), solo el pin_hash.
create or replace function reset_alumno_pin(p_perfil uuid, p_pin text)
returns void language sql security definer set search_path = extensions, public as $$
  update alumno_cred set pin_hash = crypt(p_pin, gen_salt('bf')) where perfil_id = p_perfil;
$$;

-- Solo service_role (igual que el resto de los RPCs definer de 0003).
revoke all on function reset_alumno_pin(uuid,text) from public, anon, authenticated;
grant execute on function reset_alumno_pin(uuid,text) to service_role;
