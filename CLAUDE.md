# CLAUDE.md — Contexto del proyecto EDUTIA

> Este archivo le da contexto a Claude Code sobre el proyecto. Leelo antes de tocar nada.
> Documentos complementarios en `docs/`.

## Qué es EDUTIA

Plataforma de educación primaria para **escuelas rurales de Argentina**, donde una sola maestra atiende todos los grados a la vez (plurigrado, chicos de 6 a 13 años). Cada alumno practica con **SOL**, un copiloto de IA (Claude) que genera ejercicios adaptados a su nivel y a su zona; la docente ve el recorrido de cada chico.

El núcleo: cada alumno tiene un **programa** por materia → SOL lo divide en **nodos** (temas) → el chico practica → SOL evalúa → el estado de cada nodo se actualiza y la maestra ve la evolución.

## Estado actual

**Etapas 0 y 1 cerradas.** Tablas + RLS en Supabase, datos semilla, login docente y alumno (endurecido: aula+PIN+lockout vía Edge Function), front migrado a Next.js (`web/`) y deployado en Vercel. **En curso:** SOL (generación de ejercicios y división del programa en nodos vía Claude desde Edge Functions) y diseño de Fase 2. Ver `docs/ROADMAP.md` y los specs en `docs/superpowers/specs/`.

## Stack

- **Frontend:** **Next.js** (App Router, TypeScript, React) en `web/`, deployado en **Vercel** → <https://edutiaar.vercel.app/> (dominio final previsto `edutia.ar`). (Migrado desde el front estático original; ver `docs/NEXT_MIGRATION.md`.)
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