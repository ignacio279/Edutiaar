# Roadmap — EDUTIA (Fase 1 / MVP)

> Regla: **slices verticales.** Cada etapa termina en algo demostrable. Cada etapa (1–4) coincide con un hito que se le cobra al cliente. No diseñar etapas futuras en detalle: diseñar lo justo para la etapa actual.

## Estado (2026-06-28)

Etapas **0 y 1 cerradas**. **Etapa 3 cerrada** (SP-4d selección adaptiva + SP-4e override docente, 2026-06-28). **Etapa 4 (panel docente) implementada** (2026-06-28): actividad del día + etiqueta "a quién atender" + "Lo de hoy" + histórico mes a mes; pendiente solo el smoke UI manual. La funcionalidad de las Etapas 2–4 (SOL genera, el chico practica, el mapa cambia, la seño ve el recorrido) **se construyó dentro de Fase 2 / SOL (SP-1 a SP-4e)** y anda **de punta a punta en modo mock** (sin API key — único blocker grande restante). Ver "Fase 2 — SOL" al final y `docs/superpowers/specs/`.

## Etapa 0 — Setup (el terreno)
- [ ] Crear las tablas en Supabase (ver `DATA_MODEL.md`).
- [ ] Activar **RLS** en todas las tablas.
- [ ] Crear repo en GitHub y subir el frontend existente.
- [ ] Conectar el repo a **Vercel** y deployar (la web carga online).
- [ ] Guardar claves como **variables de entorno** (Supabase URL/key en el front; **API key de Claude del lado del servidor**).

**Demo:** la web carga en Vercel y se conecta a Supabase.

## Etapa 1 — Fundación: que entren las personas (Hito 1)
- [ ] Conectar el front con Supabase (cliente JS).
- [ ] Login de la **docente** (email + contraseña, Supabase Auth).
- [ ] Login del **alumno** adaptado (elige avatar, sin escribir).
- [ ] Cargar **datos semilla**: escuela (con zona), materia Lengua, programa, alumnos de prueba.
- [ ] Cada rol entra y ve su pantalla inicial (aunque esté vacía).

**Demo:** la maestra y un alumno se loguean y ven su pantalla.

## Etapa 2 — SOL: generar y practicar (Hito 2)
- [ ] Edge Function que llama a Claude (key en el server). Test: devuelve un ejercicio.
- [ ] Función "dividir el programa en nodos": pasa el programa a Claude, guarda los `nodo`.
- [ ] Generar **pool de ejercicios** por nodo y guardar en `ejercicio`.
- [ ] Pantalla **Mi mapa** del alumno (nodos desde la base).
- [ ] Pantalla **Practicar** (SOL presenta un ejercicio con opciones).

**Demo:** el chico ve su mapa y SOL le da un ejercicio real de Lengua.

## Etapa 3 — Evaluación y estado (Hito 3)
- [x] Al responder: la app corrige sola, mide tiempo y reintentos, guarda `respuesta`.
- [x] Crear `sesion` por cada práctica.
- [x] **Regla del nodo:** definir cuándo pasa a `dominado` y actualizar `alumno_nodo` (ver `DECISIONS.md`).
- [x] Dificultad adaptativa (sube si acierta, baja si falla).
- [x] El mapa se pinta solo según `alumno_nodo`.

**Demo:** el chico practica y su mapa cambia de color solo.

## Etapa 4 — Panel de la docente (Hito 4)
- [x] **Mis alumnos**: lista con la actividad del día (sesiones de hoy).
- [x] Etiqueta de estado por alumno (a quién atender).
- [x] **Detalle del alumno**: su mapa + lo de hoy + sugerencia de SOL.
- [x] **Histórico mes a mes** (sesiones agrupadas por mes).

**Demo:** la maestra ve el recorrido completo de cada chico.

**Implementada (2026-06-28).** Lógica pura en `web/lib/panel.ts` (etiqueta "a quién atender" = peor estado de nodo + actividad de hoy; actividad con fallback a "última vez"; histórico agrupado por mes), `web/app/docente/page.tsx` (lista) y `web/app/docente/[alumnoId]/page.tsx` (Lo de hoy + Mes a mes). 77/77 unit verdes (14 nuevos en `tests/unit/panel.test.mjs`). Pendiente no bloqueante: smoke UI manual + `npm run test:db` (`tests/integration/panel-rls.test.mjs`) con envs reales.

## Cierre — Pulido y piloto
- [ ] Manejo de errores (SOL no responde / sin conexión).
- [ ] Tope de uso de la API.
- [ ] Flujo mínimo de privacidad de menores.
- [ ] Probar con un chico real.
- [ ] Pasar Supabase a **Pro** al ir a producción (con tope de gasto).

## Fase 2 — SOL (en curso)

Diseño en `docs/superpowers/specs/`. Roto en slices verticales (cada uno spec → plan → build, con sus tests).

- [x] **SP-1 — Edge Function SOL base.** Messages API + tool use (`supabase/functions/sol`, loop reusable en `_shared/loop.ts`).
- [x] **SP-2 — Autoría docente.** La seño sube contenido → `dividir-nodos` genera `sol_materia` + nodos → revisa/publica (`/docente/autoria`). Migración `0006`.
- [x] **SP-3 — Multi-materia (alumno).** Picker de materias publicadas → mapa real desde la DB. Migración `0007`.
- [x] **SP-4 — Evaluador por sesión.** Práctica real + pool (`0008`) → **regla determinística de dominio** (`web/lib/dominio.ts`) mueve `alumno_nodo` → el mapa cambia → **diagnóstico cualitativo de SOL** (`evaluar-sesion` → `evaluacion_sesion`, `0009`) en el panel docente (`/docente/[alumnoId]`).
- [x] **SP-4d — Selección adaptiva.** `elegirEjercicios` personaliza la práctica usando la historia del chico: escalera de cobertura por tipo (`nivelAdaptativo`, `tiposPendientes`) + dificultad adaptativa (`web/lib/practica.ts`). Cierra el último checkbox de Etapa 3.
- [x] **SP-4e — Override docente.** La seño fija el estado de un nodo a mano (`alumno_nodo.estado_override`, migración `0010`); helper `resolverEstado` (`web/lib/dominio.ts`) hace que la regla determinística lo respete. UI en `/docente/[alumnoId]`. RLS verificada en DB real (policies `alumno_nodo_docente_update`/`_insert` con scope `es_mi_alumno`).
- [x] **Puntaje progresivo (ELO-lite) y generación por banda (2026-07-04).** Spec `docs/superpowers/specs/2026-07-03-puntaje-progresivo-y-generacion-por-banda.md` (ver también `ADR-008`). Reemplaza la regla de ventana: puntaje 0→100 acumulado por nodo, determinístico y asimétrico (`web/lib/dominio.ts`); estados derivados con `dominado` como hito pegajoso (puntaje ≥ 70 + cobertura + mínimo 50 ejercicios); nunca repetir ejercicios (`filtrarNoVistos`, `web/lib/practica.ts`); Edge Function `generador-ejercicios` (deployada, v2 ACTIVE) siembra pool inicial de 36/nodo al publicar y repone 12 al quedar < 16 sin ver, con tope diario estricto de 240 (migración `0012`); prompt ajustado por banda de grado (1°-2°/3°-4°/5°-7°). Mapa del alumno con gradiente por puntaje. Corre en mock por defecto (mismo blocker de la API key). 130/130 unit; 21 de integración (skipean sin envs).
- [ ] **SP-5 — Nodos editables por IA** (con OK de la seño). Solo el seam dejado, sin construir.
- [x] **LUNA — copiloto de la docente (2026-07-28).** Spec `2026-07-28-luna-copiloto-docente-design.md`. Dashboard `/docente/luna` (métricas + alertas priorizadas + resumen; análisis puro en `web/lib/luna.ts`, listo para job nocturno), boletines mensuales anclados en evidencia (`luna-boletin`, tabla `boletin`, borrador → aprobado → corregible con versión) y chat 24/7 con contexto del aula (`luna-chat`, hilo persistido en `luna_mensaje`, plurigrado multi-nivel). Migración `0016`; tope diario propio (`luna_uso`); seed plurigrado `scripts/seed-actividad.mjs`.

**Modo mock vs real — único blocker grande restante:** generación y diagnóstico corren con flag `mock` porque falta la **API key de Anthropic** (Messages API necesita key con billing; la suscripción de Claude no sirve para el backend). Con la key (+ quitar el flag) pasan a Claude real. Pool de ejercicios de Lengua sembrado a mano (`scripts/seed-demo-lengua.mjs`) para el contenido semilla original; los pools nuevos por nodo los siembra `generador-ejercicios` al publicar. Migraciones hasta `0012`.

**Otros pendientes de Fase 2:** decaimiento temporal / repaso espaciado (spec escrita), roles director/familia, copiloto TERRA (entrega de boletines a familias), job nocturno de alertas de LUNA, offline/satelital/multilingüe.

**Demo del loop completo:** seño (`ana@edutia.ar` / `edutia123`) autora+publica un plan → alumno (aula `CERRO-3A`, PIN de seed) practica → el mapa cambia solo → la seño ve el análisis en el detalle del alumno.