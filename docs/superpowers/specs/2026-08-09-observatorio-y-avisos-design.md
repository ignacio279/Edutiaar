# Diseño — Fase "Observatorio y avisos" (panel admin: observatorio educativo, alertas nocturnas, actividad docente, provincia)

> Fecha: 2026-08-09 · Etapa: Fase 2 (operación de la plataforma, continuación del Dashboard admin v3).
> Estado: en construcción (branch `claude/admin-dashboard-v3-ououe8`).

## Problema

El Dashboard admin v3 cubre gestión, métricas de negocio, CRM y seguridad, pero
la propuesta comercial promete cosas que no existen: (1) un **observatorio
educativo** con agregados de aprendizaje por jurisdicción y por tema — hoy no
hay ninguna agregación pedagógica, y además `escuela.zona` es texto libre (no
agrupa) y `nodo.nombre` lo genera Claude por cada autoría (no es comparable
entre colegios); (2) "el panel avisa antes" — las alertas del operador se
calculan solo cuando alguien abre `/admin/alertas`, no hay job nocturno ni
persistencia; (3) "docentes activos semana a semana" — se aproxima por rastros
de trabajo porque nadie lee `last_sign_in_at` de Auth; (4) Capacitación y
Exportaciones se venden como "espacio reservado" sin pantalla alguna.

## Objetivo

1. **Observatorio funcional** en `/admin/observatorio`: agregados reales,
   **siempre anónimos**, por jurisdicción (provincia) y por materia × grado,
   más un top de "temas que más cuestan" honesto (best-effort). Mostrable a un
   ministerio.
2. **Alertas del operador precalculadas**: un job nocturno (el primer cron del
   repo) las evalúa y persiste en `admin_alerta`; el panel las lee al
   instante; botón "Recalcular ahora" como fallback humano. Sin email.
3. **Actividad docente real**: `last_sign_in_at` entra a la métrica de
   "maestra activa" y aparece como "Último acceso" en Maestras.
4. **Provincia normalizada** en colegios (la necesita el observatorio) y las
   pantallas de visión de Capacitación y Exportaciones.

Fuera de alcance: TERRA, email/push, exportaciones CSV reales, job nocturno de
alertas de LUNA (queda el mecanismo listo).

## Decisiones

- **D-OA1 — Cron: `pg_cron` + `pg_net` → Edge Function `admin-jobs`, secretos
  en Vault.** Todo vive en Supabase; el job de LUNA futuro se agenda con el
  mismo helper `llamar_admin_jobs(accion)` y una acción más. Los secretos
  (`project_url`, `service_role_key`) NUNCA se commitean: se siembran a mano en
  Vault (paso de deploy); si faltan, el helper degrada con `raise notice`.
- **D-OA2 — `escuela.provincia`**: `text` nullable con check de las 24
  jurisdicciones, espejado en `_shared/provincias.ts` y
  `web/lib/admin/provincias.ts` con test de paridad que también congela el SQL
  del check. `zona` queda como detalle libre.
- **D-OA3 — Anonimato: k-anonimato con `K_ANONIMATO = 5`.** Toda métrica de
  DESEMPEÑO de una celda con menos de 5 alumnos distintos se devuelve `null` +
  `muestraInsuficiente: true`; los conteos de volumen (colegios, alumnos,
  sesiones) sí se muestran. Filtro en lógica pura con tests de borde (4 vs 5).
  Banner permanente en la UI: "Datos 100% agregados y anónimos".
- **D-OA4 — Ejes: primario materia × grado × provincia.** `nodo.nombre` no es
  comparable entre colegios → el nivel "tema" va solo como top-N con nombre
  normalizado (lowercase/trim), piso de 20 respuestas y flag
  `aproximado: true` en la API y chip "aproximado" en la UI.
- **D-OA5 — `alerta_atender`** conserva su semántica (upsert en
  `admin_alerta_atendida`, fuente de verdad) y además borra la fila de
  `admin_alerta` best-effort. "Recalcular ahora" llama a `admin-jobs` con la
  sesión del admin: misma ruta de código que el cron.
- **D-OA6 — Nav:** solo se suma Observatorio. Capacitación/Exportaciones se
  linkean desde el observatorio (el nav es operativo, no aspiracional).
- **D-OA7 — `alertas-logica.ts` vive en `_shared/`** (la comparten `admin-crm`
  y `admin-jobs`).
- **Guard dual de `admin-jobs`**: Bearer == service key → caller cron (sin
  ctx); si no, `verificarAdmin`. Auditoría en ambos casos: manual =
  `recalcular_alertas` con el admin; cron = `job_nocturno` con actor sentinel
  `cron@edutia`.

## Arquitectura

```
pg_cron (06:00 UTC) ─► llamar_admin_jobs('nocturno')  [SQL, secretos en Vault]
                          │ net.http_post
                          ▼
/admin/alertas ──────► admin-jobs (guard dual) ─► evaluarAlertas (_shared/alertas-logica)
  "Recalcular ahora"      │                       planSnapshotAlertas (nocturno-logica)
                          ▼
                    admin_alerta (0021, server-only) ◄─ lee admin-crm alertas_listar
                                                          (home + página Alertas)

/admin/observatorio ─► admin-observatorio ─► observatorio-logica.ts (PURO)
                        (agregación server-side)   k-anonimato k=5 · ejes
                                                   materia×grado×provincia ·
                                                   temas top-N "aproximado"
```

Migración `0021`: `escuela.provincia` (+check +índice +backfill seed),
`admin_alerta` (server-only), extensiones pg_cron/pg_net, helper
`llamar_admin_jobs` y el schedule `admin-jobs-nocturno`.

## Seguridad (datos de menores + plataforma)

- **Jamás datos individuales en el observatorio**: la fn solo devuelve
  agregados; ningún nombre ni id de alumno viaja en las respuestas. k=5 sobre
  métricas de desempeño, testeado puro.
- `admin_alerta` es server-only (RLS sin policies); la escriben solo el job y
  el recálculo manual auditado.
- El cron se autentica con el service key desde Vault (nunca en git); el guard
  dual no abre ninguna puerta nueva: sin ese key exacto, pasa por
  `verificarAdmin` como cualquier fn admin.
- `escuela_publica` (setup anon) NO expone `provincia`.

## Tests

- Unit: paridad de provincias (espejos + SQL del check), k-anonimato de borde,
  normalización de temas, `planSnapshotAlertas` (upsert/borrar/idempotencia),
  `resumenAdopcion` con `last_sign_in_at`, validadores de provincia en
  colegios.
- Integración (envs reales, idempotentes): guard dual de `admin-jobs`
  (service_role ok / docente 403 / sin token 401), corrida nocturna que
  persiste y no duplica, atendida que no revive, trial extendido que rota la
  clave, `admin_alerta` invisible por PostgREST, observatorio con k-anon
  verificado sobre datos efímeros, provincia inválida → 400.
