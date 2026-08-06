# Diseño — Dashboard de administración v3 (colegios, maestras, accesos, features, métricas, costos, CRM, anuncios, seguridad)

> Fecha: 2026-08-05 · Etapa: Fase 2 (operación de la plataforma).
> Estado: en construcción (branch `claude/admin-dashboard-v3-ououe8`).

## Problema

EDUTIA tiene dos roles (`docente`, `alumno`) y una sola escuela sembrada a mano.
No existe administrador de plataforma: crear una escuela o una maestra es una
operación manual con service_role; no hay trials, límites por colegio, tracking
de costos de API, auditoría ni anuncios. El operador de la plataforma (Jorge)
no tiene dónde dar de alta colegios y maestras, controlar accesos, prender y
apagar features, ver métricas y costos, llevar notas de la relación con cada
colegio ni comunicarse con las maestras.

## Objetivo

Un panel `/admin` (link aparte, sin ningún acceso desde la app principal) con:
**1) Colegios** — alta manual (nombre, zona, tipo rural/unidocente/plurigrado),
estados `trial/activo/suspendido/archivado` de los que cuelga todo el acceso, y
ficha por colegio (maestras, aulas, alumnos, uso, costos, features, notas).
**2) Maestras** — cuentas creadas solo desde el admin (link de invitación o
contraseña temporal), reset, suspender, reasignar. **3) Accesos y límites** —
trials por colegio o maestra con corte automático SUAVE (al vencer: solo
lectura), extensión con un click, topes de IA por colegio/mes. **4) Features
por colegio** — toggles SOL/LUNA/TERRA con sub-features y planes preset
(Básico/Docente/Completo/custom) que aplican al instante. **5) Métricas** —
adopción, uso, funnel de onboarding, comparativa, feed en vivo. **6) Costos y
salud** — costo de API por colegio y feature, errores/latencia. **7) CRM-lite**
— notas por colegio y alertas para el operador. **8) Anuncios** — banner
in-app a maestras. **9) Seguridad** — roles super-admin/admin operativo, log de
auditoría, "ver como maestra" en solo lectura.

## Decisiones (cerradas — no se re-litigan en los work-packages)

- **D1 — Identidad admin: tabla `plataforma_admin`, NO enum.** Nada de
  `ALTER TYPE rol_usuario ADD VALUE 'admin'`: el valor nuevo no es usable en la
  misma transacción, obligaría a una fila en `perfil` con `escuela_id` null
  (rompe supuestos de `mi_escuela()` y del front) y se necesitan DOS niveles
  (`super`/`operativo`). Tabla server-only `plataforma_admin(perfil_id →
  auth.users, nivel)` con RLS sin policies (patrón `aula_secreto`). El admin es
  un usuario de Auth **sin fila en `perfil`**. Blast radius sobre la RLS
  existente: **cero** — ninguna policy se toca.
- **D2 — Una Edge Function por dominio, no un mega-switch:** `admin-colegios`,
  `admin-maestras`, `admin-accesos`, `admin-features`, `admin-metricas`,
  `admin-costos`, `admin-crm`, `admin-anuncios`, `admin-auditoria`,
  `admin-plataforma`, `admin-impersonar`. Cada work-package es dueño de su
  carpeta → cero conflictos entre agentes paralelos, deploys independientes,
  ninguna se acerca al límite de ~150 s. Todas usan el guard `_shared/admin.ts`
  y el patrón `index.ts` + módulo puro hermano testeable desde Node (calcado de
  `gestion-alumnos`).
- **D3 — Estado/trial de colegio en columnas de `escuela`** (la docente ya la
  lee por RLS → le llega gratis); **estado/trial de maestra en `docente_acceso`
  server-only** — NO en `perfil`, porque `perfil_update` permite self-update y
  una docente podría des-suspenderse por PostgREST.
- **D4 — Fuente única de verdad del acceso: RPCs SQL.** `mi_acceso()`
  (SECURITY DEFINER, EXECUTE solo `authenticated`) devuelve jsonb
  `{estado: activo|solo_lectura|bloqueado, motivo, trial_fin, features}`
  combinando estado escuela + trials + `docente_acceso` + `escuela_feature`,
  con defaults resueltos EN SQL (front y Edge no hardcodean defaults).
  `acceso_de(uuid)` = misma lógica para service_role (EXECUTE revocado a `anon`
  y `authenticated` — legal: no se usa en policies; la restricción de 0005 solo
  aplica a funciones usadas en policies). Semántica: `suspendido`/`archivado` →
  **bloqueado**; trial vencido (colegio o maestra) → **solo_lectura** (ven
  todo, no generan nada — el corte suave).
- **D5 — Features: jsonb en `escuela_feature`** con forma
  `{"sol":true,"luna":{"activa":true,"alertas":true,"boletines":true,"chat":true},"terra":false}`
  + columna `plan` (`basico|docente|completo|custom`). Presets = azúcar de UI
  que escribe los mismos flags. SELECT por RLS para la docente de esa escuela;
  escritura solo vía `admin-features`. `terra:false` deja el toggle
  future-proof (TERRA no existe aún).
- **D6 — Costos: tabla `uso_api` insert-only** (un INSERT por llamada a Claude
  con tokens/costo/latencia/ok/error — sin la carrera read-then-upsert de
  `luna_uso`). Topes mensuales por colegio = `count()` del mes vs.
  `escuela.limites` jsonb (tope blando; TOCTOU residual aceptable). Agregados
  on-demand.
- **D7 — Invitación de maestra: link de recuperación**
  (`auth.admin.generateLink({type:'recovery'})`) que el admin **copia** y le
  pasa a la maestra (no hay SMTP). El alta crea auth user + `perfil` (rollback
  estilo `gestion-alumnos`) + `docente_acceso`, devuelve link + contraseña
  temporal una-sola-vez (no se persiste). Reset = regenerar link. Requiere
  allow-listear la redirect URL en Supabase Auth (checklist de deploy).
- **D8 — Fix del leak de enumeración anon (migración 0004):** se dropean
  `escuela_anon_list`/`aula_anon_list` y se reemplazan por vistas
  `escuela_publica` (solo `id,nombre,zona`, solo estados trial/activo — un
  colegio archivado desaparece del setup) y `aula_publica`;
  `web/app/setup/page.tsx` pasa a consultarlas. Sin esto, `estado`/
  `trial_fin`/`contacto` quedarían legibles por anon.
- **D9 — Migraciones pre-asignadas:** `0018` Fase 0 (esquema transversal),
  `0019` WP7-CRM, `0020` WP8-Anuncios. Ningún otro WP crea migraciones.
- **D10 — Tema admin:** `web/lib/admin/tema.ts` exporta `ADMIN` con la misma
  estructura de claves que `VIOLETA` (`web/lib/luna-tema.ts`); acento azul
  petróleo (`base '#3E7C8A'`, `oscuro '#2F6172'`) sobre los neutros cálidos de
  la app. Mismo lenguaje visual: cards radius 22 / borde 2 px, pills
  `[bg,color,label]`, grillas `minmax(180px,1fr)`, Baloo/Quicksand/Nunito,
  estilos inline, cero Tailwind.
- **D11 — CORS:** las fns admin reusan `_shared/cors.ts` (wildcard); el gate
  real es `plataforma_admin`. Hardening de `Allow-Origin` = tarea futura.
- **D12 — Impersonación ("ver como maestra"): NUNCA se emite sesión ni token
  de la docente** (sus contraseñas son reales; no hay creds opacas como
  `alumno_cred`). Solo snapshots read-only vía service_role, auditados en cada
  llamada.
- **D13 — URL:** `/admin` dentro de la misma app Next (login propio, sin links
  desde la app). `admin.edutia.ar` se puede mapear después en Vercel sin
  cambios de código.

## Arquitectura

```
/admin (layout propio + gate admin_nivel())     Edge Functions admin-* (una por dominio)
   │  web/lib/admin/api.ts (Bearer = token          │  _shared/admin.ts (verificarAdmin)
   │  de la sesión del admin)                       │  _shared/auditoria.ts (registrarAuditoria)
   ▼                                                ▼
web/lib/admin/* (lógica pura testeable)         service_role + re-chequeo a mano
                                                    │
                                                    ▼
                              0018: escuela(+estado/tipo/trial/contacto/limites)
                              plataforma_admin · auditoria · escuela_feature
                              docente_acceso · uso_api · RPCs mi_acceso()/acceso_de()
```

Enforcement transversal (Fase final): las fns existentes llaman
`_shared/acceso.ts` → `bloqueado` = 403; `solo_lectura` = 403 solo en acciones
que GENERAN (las lecturas siguen por RLS); tope mensual = 429. El front docente
gatea con `mi_acceso()` (sidebar sin LUNA si está apagada, banners de trial y
solo-lectura, anuncios). La instrumentación de costos captura `usage` de la
Messages API en las 7 fns Claude → `uso_api`.

## Plan de ejecución (fases y work-packages)

- **Fase 0 (secuencial):** migración 0018 completa, seed-admin, guards
  compartidos, front /admin base (tema/api/nav CONGELADA/layout/login/context/
  componentes congelados/stubs de todas las rutas), proxy.ts, setup con vistas
  públicas, docs (esta spec, ADR-009, DATA_MODEL, CLAUDE.md), tests.
- **WP1..WP9 (paralelos, cero intersección de archivos):** Colegios, Maestras,
  Accesos y límites, Features, Métricas y home, Costos y salud, CRM-lite y
  alertas, Anuncios, Seguridad (auditoría + admins + ver-como). Regla de oro:
  cada WP solo toca sus archivos; cruces solo por strings de ruta o
  `llamarAdmin` con try/catch, nunca por imports. Toda mutación audita.
- **Fase final (secuencial):** F1 enforcement en las 10 fns existentes; F2
  instrumentación `uso_api` (+ campo `usage` en `_shared/loop.ts`); F3 gating
  del front docente (DocenteSidebar filtra por features, páginas LUNA respetan
  sub-flags, AccesoBanner + AnuncioBanner, `mi_acceso()` vía me-context); F4
  tests completos + checklist de deploy (migraciones 0018–0020, seed-admin,
  deploy de 11 fns nuevas + 10 modificadas, redirect URL del recovery link,
  smoke en prod, opcional dominio admin.edutia.ar).

El detalle de acciones, archivos y criterios de aceptación por WP vive en el
plan aprobado (sesión de Claude Code del 2026-08-06).

## Seguridad (datos de menores + plataforma)

- Ninguna policy RLS existente se modifica; el admin no tiene fila en `perfil`
  y solo opera vía Edge Functions con guard `plataforma_admin` (niveles
  `super`/`operativo`; acciones destructivas y gestión de admins = solo super).
- Tablas nuevas sensibles (plataforma_admin, auditoria, docente_acceso,
  uso_api, escuela_nota, admin_alerta_atendida) = server-only (RLS sin
  policies). `escuela_feature` y `anuncio` con SELECT acotado por
  `mi_escuela()`/rol.
- "Ver como maestra" devuelve snapshots con datos mínimos (nombre de pila,
  grado, desempeño — Regla 5) y JAMÁS una sesión; cada vista queda auditada.
- El leak de enumeración anon de 0004 se cierra con vistas públicas mínimas.
- API key y service_role siguen solo server-side (Regla 1); topes por colegio
  suman una capa a los topes diarios existentes (Regla 4).

## Tests

- Unit (`npm test`): tema admin, validadores de cada fn, `decidirAcceso`
  (matriz estados × topes × features con `now` inyectado), paridad de
  `planes.ts` Deno/web, métricas puras, `evaluarAlertas`, snapshot de
  impersonación.
- Integración (`npm run test:db`, envs reales): `admin-fundaciones` (anon no
  lee nada nuevo; vistas públicas; `mi_acceso()`/`admin_nivel()`), y un archivo
  por WP (403 `no_admin` con token docente, RLS de `escuela_feature`/`anuncio`,
  auditoría escrita, suspensión → `acceso_de` bloqueado, etc.). Idempotentes,
  con cleanup en `finally` (boilerplate `luna-rls.test.mjs`).
