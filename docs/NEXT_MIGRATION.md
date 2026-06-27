# Plan de migración a Next.js

> Migración del front estático (HTML/CSS/JS vanilla en `frontend/`) a Next.js + React.
> Decidido el 2026-06-27. Branch: `feat/next-migration`.

## Decisiones tomadas

1. **Cuándo:** migrar ANTES de construir SOL. El código pesado (generación de
   ejercicios, evaluación) todavía no existe → menos reescritura.
2. **Front actual:** reescribir cada pantalla como componentes React (no incremental).
3. **Backend:** Supabase (DB, RLS, Edge Functions) **no se toca**. Next solo
   reemplaza el front; sigue llamando a las mismas Edge Functions.

## Lo que se gana

- Adiós al hack de `config.js` + build command en Vercel. Next usa
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` nativo.
- Vercel auto-detecta Next (sin Root Directory raro, sin build command a mano).
- Routing real con URLs (`/alumno/mapa`) en vez de `state.screen`.

## Stack a sumar

- `create-next-app` (TypeScript, App Router)
- `@supabase/supabase-js` + `@supabase/ssr` (auth por cookies, middleware protege rutas)
- Estilos: inline `style={{}}` 1:1 primero (migración rápida), refactor después.

## Mapeo del front actual

SPA vanilla: `state.screen` + `render()` que inyecta strings HTML. 9 pantallas:

| Pantalla actual (`app/app.js`) | Ruta Next |
|---|---|
| `scInicio`        | `/` |
| `scAulaSetup`     | `/setup` |
| `scAlumnoLogin`   | `/login/alumno` |
| `scAlumnoPin`     | `/login/alumno` (paso PIN) |
| `scDocenteLogin`  | `/login/docente` |
| `scHomeAlumno`    | `/alumno` |
| `scHomeDocente`   | `/docente` |
| `scMapa`          | `/alumno/mapa` |
| `scPracticar`     | `/alumno/practicar` |

Data layer a reusar casi 1:1: `supabase.from(...)`, `callFn(name, body)` →
Edge Functions `alumno-login` + `aula-students`, `supabase.auth` (docente).

## Fases (slices verticales, cada una demostrable)

- **Fase 0 — Scaffold.** App Next en `web/` (dejo `frontend/` de referencia).
  Clients Supabase (browser/server/middleware). Env vars local + Vercel.
  *Demo:* corre en localhost, hace un `select` de prueba.
- **Fase 1 — Entrada + auth.** Rutas `/`, `/setup`, `/login/alumno`, `/login/docente`.
  Reusa Edge Functions. Sesión vía `@supabase/ssr`.
  *Demo:* entrás como alumno (avatar+PIN) y docente (email+pass).
- **Fase 2 — Homes.** `/alumno`, `/docente`. Middleware redirige si no hay sesión.
  *Demo:* navegás post-login a cada home.
- **Fase 3 — Mapa + Practicar (shell).** `/alumno/mapa`, `/alumno/practicar`.
  *Demo:* paridad total con el HTML actual.
- **Fase 4 — Cleanup + deploy.** Borrar `frontend/`. Vercel: Root Directory →
  carpeta Next, fuera build-command hack y `config.js`. Deploy verde.

→ Después, SOL se construye ya en Next (fuera de este plan).

## Fricción conocida

- SVGs inline → JSX: atributos camelCase (`stroke-width` → `strokeWidth`).
- Sin `innerHTML` → JSX real. Keypad PIN, shake, toast → state React + CSS.
