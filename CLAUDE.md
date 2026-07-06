# CLAUDE.md — Contexto del proyecto EDUTIA

> Este archivo le da contexto a Claude Code sobre el proyecto. Leelo antes de tocar nada.
> Documentos complementarios en `docs/`.

## Qué es EDUTIA

Plataforma de educación primaria para **escuelas rurales de Argentina**, donde una sola maestra atiende todos los grados a la vez (plurigrado, chicos de 6 a 13 años). Cada alumno practica con **SOL**, un copiloto de IA (Claude) que genera ejercicios adaptados a su nivel y a su zona; la docente ve el recorrido de cada chico.

El núcleo: cada alumno tiene un **programa** por materia → SOL lo divide en **nodos** (temas) → el chico practica → SOL evalúa → el estado de cada nodo se actualiza y la maestra ve la evolución.

## Estado actual

**Etapas 0 y 1 cerradas.** Tablas + RLS en Supabase, datos semilla, login docente y alumno (endurecido: aula+PIN+lockout vía Edge Function), front en Next.js (`web/`) deployado en Vercel.

**Dominio en producción (2026-06-30).** Migrado a **`www.edutia.ar`** (comprado en NIC.ar → nameservers delegados a Vercel; `edutia.ar` redirige a `www`; `edutiaar.vercel.app` sigue activo). Supabase Auth actualizado: Site URL `https://www.edutia.ar` + Redirect URLs (`www.edutia.ar/**`, `edutia.ar/**`, `edutiaar.vercel.app/**`).

**Etapa 3 cerrada (2026-06-28).** Fase 2 SOL — slices SP-1 a SP-4e completos, deployados y commiteados. El loop entero anda de punta a punta **en modo mock** (sin gastar API):
- **SP-1** Edge Function SOL base (Messages API + tool use; `supabase/functions/sol`, `_shared/loop.ts`).
- **SP-2** Autoría docente: la seño sube contenido → `dividir-nodos` genera `sol_materia` + nodos → revisa/publica (`/docente/autoria`). Desde 2026-07-06 acepta **texto pegado o PDF** (base64 → bloque `document` nativo de Claude; lógica pura en `web/lib/autoria.ts`, tope 10 MB; spec `2026-07-06-carga-pdf-autoria-design.md`).
- **SP-3** Multi-materia en el front del alumno: picker → mapa real desde la DB.
- **SP-4** Evaluador: práctica real (pool de ejercicios) → **regla determinística de dominio** mueve `alumno_nodo` → el mapa cambia → **diagnóstico cualitativo de SOL** (`evaluar-sesion`) en el panel docente (`/docente/[alumnoId]`).
- **SP-4d** Selección adaptiva: `elegirEjercicios` usa la historia del chico (escalera de cobertura por tipo + dificultad adaptativa) en `web/lib/practica.ts`.
- **SP-4e** Override docente: la seño fija el estado de un nodo a mano (`alumno_nodo.estado_override`, migración `0010`); `resolverEstado` en `web/lib/dominio.ts` hace que la regla lo respete. RLS verificada en DB real; 63/63 unit tests verdes.
- **Etapa 4 — Panel docente (2026-06-28):** lista "Mis alumnos" con actividad del día + etiqueta "a quién atender" (`web/app/docente/page.tsx`); detalle con "Lo de hoy" (fallback a "última vez") + histórico mes a mes (`web/app/docente/[alumnoId]/page.tsx`). Lógica pura sin migración en `web/lib/panel.ts`; sostenida por la RLS existente (`sesion_select` / `es_mi_alumno`). 77/77 unit verdes. Pendiente no bloqueante: smoke UI manual + `npm run test:db` (`tests/integration/panel-rls.test.mjs`).

**Puntaje progresivo y generación por banda (2026-07-04).** Spec `docs/superpowers/specs/2026-07-03-puntaje-progresivo-y-generacion-por-banda.md`. La regla de ventana (`calcularEstado`/`puntajeNodo`) fue **retirada**; en su lugar, un **motor ELO-lite** (`web/lib/dominio.ts`) acumula un **puntaje 0→100 por nodo**, determinístico y asimétrico (bajar resta la mitad de lo que sube). Los estados se **derivan** (`calcularEstadoProgresivo`): `dominado` exige puntaje ≥ 70 + cobertura histórica (≥2 `producir`, ≥1 difícil al primer intento) + **mínimo 50 ejercicios respondidos**, y es **hito pegajoso** (no se pierde por fallar; solo lo tocan el override docente y el decaimiento futuro); `a_reforzar` sigue siendo señal de conducta "ahora". **Nunca repetir (DP5):** `filtrarNoVistos` (`web/lib/practica.ts`) saca del pool lo que el chico ya respondió; Practicar filtra por su historial completo. **Pool con reposición automática:** Edge Function `generador-ejercicios` (deployada, v2 ACTIVE) siembra un pool inicial estratificado de 36 ejercicios por nodo al publicar (idempotente) y repone 12 más cuando a un chico le quedan menos de 16 sin ver, con **tope diario estricto de 240** ejercicios (Regla 4); migración `0012` (`ejercicio.created_at`, aplicada) sostiene ese tope. La generación banda por grado (1°-2° / 3°-4° / 5°-7°, sobre `programa.grado`, sin datos nuevos del menor) ajusta el prompt. Front: publicar dispara el pool inicial, Practicar dispara la reposición fire-and-forget con copy de "pool agotado", y el mapa del alumno pinta el nodo con un gradiente según el puntaje (`web/lib/mapa-layout.ts`; el panel docente sigue sin gradiente). **Mergeado a main el 2026-07-06** (PR #5). Replay de puntajes corrido contra la DB real ese mismo día (vía MCP, con el motor real); a los nodos con práctica real y <50 respuestas también se les recalculó el `estado` (los dominados de datos semilla con 0 respuestas se dejaron como fixtures de demo). 131/131 unit tests verdes; **pendiente: `npm run test:db`** (21 de integración, necesitan envs).

**SOL con Claude real (2026-07-06).** Secret `ANTHROPIC_API_KEY` cargado en Supabase + tope de gasto en console.anthropic.com (regla 4) + `mock: true` retirado del front. Las funciones conservan el patrón `if (mock || !key)` como fallback: sin key (o pasando `mock: true` a mano) vuelven al mock. Modelos: `claude-haiku-4-5` (`sol`, `sol-chat`, `evaluar-sesion`) y `claude-sonnet-4-6` (`dividir-nodos`, `generador-ejercicios`). Edge Functions desplegadas: `sol`, `dividir-nodos`, `evaluar-sesion`, `generador-ejercicios` (+ login). Migraciones hasta `0012`.

**Pendiente de Fase 2:** decaimiento temporal / repaso espaciado (spec escrita), roles director/familia, copilotos LUNA/TERRA, offline. Ver `docs/ROADMAP.md` y los specs en `docs/superpowers/specs/`.

## Stack

- **Frontend:** **Next.js** (App Router, TypeScript, React) en `web/`, deployado en **Vercel**. Dominio de producción **`www.edutia.ar`** (comprado en NIC.ar, nameservers delegados a Vercel; `edutia.ar` redirige a `www`); `https://edutiaar.vercel.app/` sigue activo. (Migrado desde el front estático original; ver `docs/NEXT_MIGRATION.md`.)
- **Backend / base / auth:** **Supabase** (Postgres + Auth + Edge Functions). Plan Free para desarrollo; Pro ($25/mes) en producción.
- **IA (SOL):** **API de Claude** (Anthropic), llamada desde una **Edge Function de Supabase**.

Ver detalle en `docs/ARCHITECTURE.md`.

## Reglas importantes (NO romper)

1. **La API key de Claude va SIEMPRE del lado del servidor** (en la Edge Function de Supabase), NUNCA en el frontend ni expuesta al navegador.
2. **SOL no corrige; SOL genera.** La corrección de respuestas (correcta/incorrecta, tiempo, reintentos) la hace la app comparando contra `ejercicio.correcta`. La API de Claude se usa solo para **generar ejercicios** y **dividir el programa en nodos**. Esto abarata el costo y lo mantiene controlable.
3. **Pool de ejercicios.** Generar ejercicios en lotes y guardarlos en la tabla `ejercicio`; no pedir uno nuevo a la API por cada click.
4. **Tope de uso de la API** configurado, para que el costo no se dispare.
5. **Datos de menores.** Activar **Row Level Security (RLS)** en Supabase: cada alumno ve solo lo suyo, cada docente solo a sus alumnos. No recolectar datos personales innecesarios.
6. **No salir del alcance del MVP.** Construir solo lo que está en "MVP". NO construir lo que es Fase 2 (ver más abajo). Si algo parece requerir una feature de Fase 2, frená y preguntá.

## Alcance del MVP (qué construir)

- SOL conversacional vía API de Claude.
- **Una materia (Lengua), un grado.**
- Ejercicios de **opción múltiple** con ejemplos de la zona del alumno.
- Evaluación automática (corrige, mide tiempo y reintentos, detecta patrones) y dificultad adaptativa.
- Nodos permanentes con seguimiento mes a mes.
- Registro de respuestas por sesión.
- **Dos roles: docente y alumno.**
- Panel de la docente con el recorrido de cada chico.

## Fuera del MVP (NO construir todavía — es Fase 2)

- Que la docente cargue materias/programas ella misma (herramienta de autoría).
- Varias materias o varios grados a la vez.
- Roles de **director** y **familia**.
- Los copilotos LUNA y TERRA.
- Modo offline, conectividad satelital, multilingüe.

## Cómo trabajar

- **Slices verticales, no por capas.** Cada etapa termina en algo demostrable (que se pueda ver y mostrar), no en "terminé toda la base de datos". Ver `docs/ROADMAP.md`.
- **Diseñar lo justo para la etapa actual.** No sobrediseñar etapas futuras.
- Antes de cambios grandes (estructura de tablas, dependencias nuevas, decisiones de arquitectura), **proponer y confirmar** en vez de avanzar de una.
- Mantener este `CLAUDE.md` y los docs actualizados cuando algo cambie.
- **Tests por feature (obligatorio).** Cada cosa nueva que agregamos lleva sus tests, y se corren antes de commitear. No commitear con tests en rojo.
  - Lógica pura del front (arte SVG, helpers) → **tests unitarios** en `tests/unit` (`npm test`; Node nativo `node --test`, sin dependencias). Para que sea testeable, la lógica pura va en módulos sin DOM (ej. `web/lib/art.ts`), no inline en los componentes.
  - DB / RLS / RPCs / Edge Functions / seguridad → **tests de integración** en `tests/integration` (`npm run test:db`; necesitan envs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Deben ser idempotentes: crear y borrar sus propios datos efímeros, sin tocar la data semilla.

## Convenciones

- UI y textos en **español rioplatense**, cálido y simple (es para chicos). Tono de SOL: alentador, festeja aciertos, nunca castiga errores.
- Nombres de tablas/columnas en español, en `snake_case` (ver `docs/DATA_MODEL.md`).
- Claves y secretos en **variables de entorno**, nunca hardcodeadas.

## Documentos del proyecto

- `docs/PRD.md` — qué construimos y por qué (producto).
- `docs/ARCHITECTURE.md` — cómo está armado técnicamente, incluido cómo funciona SOL.
- `docs/DATA_MODEL.md` — las tablas y sus relaciones.
- `docs/ROADMAP.md` — las etapas del desarrollo.
- `docs/DECISIONS.md` — decisiones técnicas (ADRs) y preguntas abiertas.