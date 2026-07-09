-- 0015: lockout más blando para el alumno-login. Un nene de 6 en un dispositivo
-- compartido se equivoca el PIN sin querer; 5 fallos → 15 min bloqueado era muy
-- duro (y dejaba que un chico bloquee a un compañero). Subimos el margen a 8 y
-- bajamos el bloqueo a 3 minutos. Server-authoritative (misma RPC, security definer).
create or replace function alumno_login(p_codigo text, p_secreto text, p_perfil uuid, p_pin text)
returns table(status text, auth_email text, auth_password text, dato int)
language plpgsql security definer set search_path = extensions, public as $$
declare
  v_aula uuid;
  v_cred alumno_cred;
  v_intento intento_login;
  v_max constant int := 8;
  v_lock constant interval := interval '3 minutes';
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

-- create or replace conserva los grants, pero los re-afirmamos por prolijidad/seguridad.
revoke all on function alumno_login(text,text,uuid,text) from public, anon, authenticated;
grant execute on function alumno_login(text,text,uuid,text) to service_role;
