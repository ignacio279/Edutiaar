# Checklist de deploy — Fase "Observatorio y avisos"

> Continúa el deploy del Dashboard admin v3 (`DEPLOY_ADMIN_V3.md` va primero si
> aún no se corrió). Nada de esto toca producción hasta ejecutar estos pasos,
> **en orden**. Spec: `superpowers/specs/2026-08-09-observatorio-y-avisos-design.md` · ADR-010.

## 1. Migración

Aplicar `supabase/migrations/0021_observatorio_avisos.sql` (vía MCP o CLI):
- Suma `escuela.provincia` (check de 24 jurisdicciones) con backfill de la
  seed a 'Neuquén'.
- Crea `admin_alerta` (server-only).
- Habilita `pg_cron` + `pg_net`, crea el helper `llamar_admin_jobs` y agenda
  `admin-jobs-nocturno` a las 06:00 UTC (03:00 AR).

La migración aplica limpia aunque Vault esté vacío: el cron corre "vacío"
(notice en logs) hasta el paso 3.

## 2. Edge Functions

**Nuevas (2):** `admin-jobs`, `admin-observatorio`.
**Modificadas (4):** `admin-crm`, `admin-maestras`, `admin-metricas`,
`admin-colegios`.

Cualquier deploy sube `_shared/` completo (incluye los nuevos
`alertas-logica.ts`, `provincias.ts`, `auth-users.ts`), pero hay que deployar
**las 6** para que cada una tome su código nuevo. CLI
(`supabase functions deploy <nombre> --use-api`) o MCP. `config.toml` ya
declara `verify_jwt = true` para las dos nuevas.

## 3. Sembrar Vault (SQL editor — NUNCA commitear estos valores)

```sql
select vault.create_secret('https://yqzlekflztbuyuzwmnip.supabase.co', 'project_url');
select vault.create_secret('<service_role key>', 'service_role_key');
```

⚠️ El segundo secreto tiene que ser el **service_role JWT legacy** — el mismo
valor que la plataforma inyecta como `SUPABASE_SERVICE_ROLE_KEY` en las Edge
Functions (empieza con `eyJ…`). Un `sb_secret_…` NO es un JWT y muere en el
gateway con `verify_jwt = true`; además el guard dual de `admin-jobs` compara
contra ese mismo env.

## 4. Probar el cron a mano

```sql
select public.llamar_admin_jobs('nocturno');
-- Debe aparecer una respuesta 200:
select status_code, content from net._http_response order by id desc limit 3;
-- Debe haber alertas (si hay hechos que alertar):
select clave, prioridad, titulo from admin_alerta;
-- El job quedó agendado:
select jobname, schedule, active from cron.job;
```

## 5. Front

Deploy normal de Vercel (push a main → automático). Rutas nuevas:
`/admin/observatorio`, `/admin/capacitacion`, `/admin/exportaciones`.

## 6. Smoke en producción

1. `/admin/alertas`: carga al instante con "Actualizadas hace …"; el botón
   "Recalcular ahora" corre y refresca; atender una alerta y recalcular → no
   vuelve.
2. La home muestra el widget de alertas igual que antes (mismo shape).
3. Asignar provincia a la escuela seed desde la ficha (WP-D) →
   `/admin/observatorio` muestra Neuquén con conteos y "muestra insuficiente"
   donde hay menos de 5 alumnos.
4. Maestras: columna "Último acceso" coherente (entrar como `ana@edutia.ar` y
   refrescar el panel admin).
5. `/admin/capacitacion` y `/admin/exportaciones` renderizan con su
   "Próximamente".
6. `/admin/auditoria` registra `recalcular_alertas` (manual); a la mañana
   siguiente, `job_nocturno` con actor `cron@edutia` y la corrida en
   `select * from cron.job_run_details order by start_time desc limit 5;`.
7. Tarea del operador: cargar la provincia de todos los colegios existentes.

## 7. Tests contra la DB real

```bash
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:db
```

Los nuevos (`admin-jobs`, `admin-observatorio`, y los actualizados de crm /
maestras / metricas / colegios) necesitan la migración aplicada y las fns
deployadas; sin envs skipean limpio.
