-- EDUTIA — Login del alumno endurecido (aula + creds opacas + lockout).
-- Tablas server-only (sin policies → solo service_role) + RPCs security definer.
-- pgcrypto vive en schema "extensions".

-- ---------- tablas ----------
create table aula (
  id uuid primary key default gen_random_uuid(),
  escuela_id uuid not null references escuela(id) on delete cascade,
  nombre text not null,
  grado int,
  codigo text unique not null
);

create table aula_secreto (
  aula_id uuid primary key references aula(id) on delete cascade,
  secreto_hash text not null
);

alter table perfil add column aula_id uuid references aula(id) on delete set null;

create table alumno_cred (
  perfil_id uuid primary key references perfil(id) on delete cascade,
  aula_id uuid not null references aula(id) on delete cascade,
  pin_hash text not null,
  auth_email text not null,
  auth_password text not null
);

create table intento_login (
  perfil_id uuid primary key references perfil(id) on delete cascade,
  fallos int not null default 0,
  bloqueado_hasta timestamptz
);

alter table aula          enable row level security;
alter table aula_secreto  enable row level security;
alter table alumno_cred   enable row level security;
alter table intento_login enable row level security;

-- aula: datos no secretos, lectura para authenticated de SU aula
create policy aula_select on aula for select to authenticated
  using (id in (select aula_id from perfil where id = auth.uid()));
-- aula_secreto / alumno_cred / intento_login: SIN policies → solo service_role / RPCs definer

-- ---------- RPCs (security definer) ----------
create or replace function aula_students(p_codigo text, p_secreto text)
returns table(perfil_id uuid, nombre text, avatar text)
language sql security definer set search_path = extensions, public as $$
  select p.id, p.nombre, p.avatar
  from aula a
  join aula_secreto s on s.aula_id = a.id
  join perfil p on p.aula_id = a.id and p.rol = 'alumno'
  where a.codigo = p_codigo
    and s.secreto_hash = crypt(p_secreto, s.secreto_hash)
  order by p.nombre;
$$;

create or replace function alumno_login(p_codigo text, p_secreto text, p_perfil uuid, p_pin text)
returns table(status text, auth_email text, auth_password text, dato int)
language plpgsql security definer set search_path = extensions, public as $$
declare
  v_aula uuid;
  v_cred alumno_cred;
  v_intento intento_login;
  v_max constant int := 5;
  v_lock constant interval := interval '15 minutes';
begin
  select a.id into v_aula
  from aula a join aula_secreto s on s.aula_id = a.id
  where a.codigo = p_codigo and s.secreto_hash = crypt(p_secreto, s.secreto_hash);
  if v_aula is null then
    return query select 'aula_invalida'::text, null::text, null::text, 0; return;
  end if;

  select * into v_cred from alumno_cred where perfil_id = p_perfil and aula_id = v_aula;
  if not found then
    return query select 'aula_invalida'::text, null::text, null::text, 0; return;
  end if;

  select * into v_intento from intento_login where perfil_id = p_perfil;
  if found and v_intento.bloqueado_hasta is not null and v_intento.bloqueado_hasta > now() then
    return query select 'bloqueado'::text, null::text, null::text,
      ceil(extract(epoch from (v_intento.bloqueado_hasta - now())))::int; return;
  end if;

  if v_cred.pin_hash = crypt(p_pin, v_cred.pin_hash) then
    update intento_login set fallos = 0, bloqueado_hasta = null where perfil_id = p_perfil;
    return query select 'ok'::text, v_cred.auth_email, v_cred.auth_password, 0; return;
  end if;

  insert into intento_login(perfil_id, fallos) values (p_perfil, 1)
    on conflict (perfil_id) do update set fallos = intento_login.fallos + 1;
  select * into v_intento from intento_login where perfil_id = p_perfil;
  if v_intento.fallos >= v_max then
    update intento_login set bloqueado_hasta = now() + v_lock, fallos = 0 where perfil_id = p_perfil;
    return query select 'bloqueado'::text, null::text, null::text, ceil(extract(epoch from v_lock))::int; return;
  end if;
  return query select 'pin_invalido'::text, null::text, null::text, (v_max - v_intento.fallos); return;
end;
$$;

-- helpers de seed (hash server-side)
create or replace function set_aula_secreto(p_aula uuid, p_secreto text)
returns void language sql security definer set search_path = extensions, public as $$
  insert into aula_secreto(aula_id, secreto_hash) values (p_aula, crypt(p_secreto, gen_salt('bf')))
  on conflict (aula_id) do update set secreto_hash = crypt(p_secreto, gen_salt('bf'));
$$;

create or replace function set_alumno_cred(p_perfil uuid, p_aula uuid, p_pin text, p_email text, p_password text)
returns void language plpgsql security definer set search_path = extensions, public as $$
begin
  insert into alumno_cred(perfil_id, aula_id, pin_hash, auth_email, auth_password)
  values (p_perfil, p_aula, crypt(p_pin, gen_salt('bf')), p_email, p_password)
  on conflict (perfil_id) do update set
    aula_id = excluded.aula_id, pin_hash = excluded.pin_hash,
    auth_email = excluded.auth_email, auth_password = excluded.auth_password;
  insert into intento_login(perfil_id) values (p_perfil) on conflict (perfil_id) do nothing;
end;
$$;

-- ---------- permisos: NO llamables por anon/authenticated ----------
-- Supabase otorga EXECUTE a anon/authenticated por default privileges:
-- hay que revocarlo EXPLÍCITO además de a public.
revoke all on function aula_students(text,text) from public, anon, authenticated;
revoke all on function alumno_login(text,text,uuid,text) from public, anon, authenticated;
revoke all on function set_aula_secreto(uuid,text) from public, anon, authenticated;
revoke all on function set_alumno_cred(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function aula_students(text,text) to service_role;
grant execute on function alumno_login(text,text,uuid,text) to service_role;
grant execute on function set_aula_secreto(uuid,text) to service_role;
grant execute on function set_alumno_cred(uuid,uuid,text,text,text) to service_role;
