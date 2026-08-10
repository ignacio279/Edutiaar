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

**Puntaje progresivo y generación por banda (2026-07-04).** Spec `docs/superpowers/specs/2026-07-03-puntaje-progresivo-y-generacion-por-banda.md`. La regla de ventana (`calcularEstado`/`puntajeNodo`) fue **retirada**; en su lugar, un **motor ELO-lite** (`web/lib/dominio.ts`) acumula un **puntaje 0→100 por nodo**, determinístico y asimétrico (bajar resta la mitad de lo que sube). Los estados se **derivan** (`calcularEstadoProgresivo`): `dominado` exige puntaje ≥ 70 + cobertura histórica (≥2 `producir`, ≥1 difícil al primer intento) + **mínimo 50 ejercicios respondidos**, y es **hito pegajoso** (no se pierde por fallar; solo lo tocan el override docente y el decaimiento futuro); `a_reforzar` sigue siendo señal de conducta "ahora". **Nunca repetir (DP5):** `filtrarNoVistos` (`web/lib/practica.ts`) saca del pool lo que el chico ya respondió; Practicar filtra por su historial completo. **Pool con reposición automática:** Edge Function `generador-ejercicios` (deployada, v2 ACTIVE) siembra un pool inicial estratificado de 36 ejercicios por nodo al publicar (idempotente) y repone 12 más cuando a un chico le quedan menos de 16 sin ver, con **tope diario estricto de 240** ejercicios (Regla 4); migración `0012` (`ejercicio.created_at`, aplicada) sostiene ese tope. La generación banda por grado (1°-2° / 3°-4° / 5°-7°, sobre `programa.grado`, sin datos nuevos del menor) ajusta el prompt. Front: publicar dispara el pool inicial, Practicar dispara la reposición fire-and-forget con copy de "pool agotado", y el mapa del alumno pinta el nodo con un gradiente según el puntaje (`web/lib/mapa-layout.ts`; el panel docente sigue sin gradiente). **Mergeado a main el 2026-07-06** (PR #5). Replay de puntajes corrido contra la DB real ese mismo día (vía MCP, con el motor real); a los nodos con práctica real y <50 respuestas también se les recalculó el `estado` (los dominados de datos semilla con 0 respuestas se dejaron como fixtures de demo). 131/131 unit tests verdes. `npm run test:db` corrido por fin el 2026-07-29 (envs vía Management API): **18/23 verdes — toda la RLS/seguridad pasa** (incluida `luna-rls`); los 5 rojos eran tests viejos desactualizados (era mock / regla de ventana / lockout pre-0015) y se actualizaron a la conducta vigente el 2026-07-30: **23/23 verdes contra la DB real**. Ojo con los del generador: queman API real (~4-6 min la corrida del archivo) y usan `dejarUnNodo` porque el pool inicial de un programa multi-nodo con Claude real excede los límites de la plataforma (504 IDLE_TIMEOUT 150 s / 546 WORKER_RESOURCE_LIMIT — en producción la siembra idempotente por nodo se completa con el retry); `esperarStatus` muestra el body del error en el assert.

**Mis materias (2026-07-06).** Sección `/docente/materias`: la docente ve sus materias (borrador/publicadas) con sus nodos, agrega (→ autoría), **reabre una materia en autoría** (`/docente/autoria?sol=<id>` — arregla el bug del borrador perdido), **despublica** (vuelve a borrador, el progreso queda) y **elimina definitivo** con confirmación tipeando el nombre (solo en borrador — policy `programa_delete_autor`, migración `0013` aplicada; el cascade borra nodos, ejercicios y progreso). Lógica pura en `web/lib/materias.ts`; sidebar docente extraído a `web/components/DocenteSidebar.tsx`. Spec `2026-07-06-mis-materias-design.md`. 152/152 unit verdes; integración en `tests/integration/materias-rls.test.mjs` (necesita envs) + policy verificada en DB real vía simulación de roles.

**SOL con Claude real, mock RETIRADO (2026-07-06).** Secret `ANTHROPIC_API_KEY` en Supabase + tope de gasto en console.anthropic.com (regla 4). El modo mock fue **eliminado por completo** (funciones, helpers y sus tests): sin key, las funciones devuelven `falta_anthropic_api_key` (500) — error explícito, nunca una respuesta enlatada. Ojo: el secret se había cargado con un typo (`ANTHROPIC_API_KEY.` con punto final) y todo cayó al mock silenciosamente durante horas — esa clase de fallo ahora es visible. Modelos: `claude-haiku-4-5` (`sol`, `sol-chat`, `evaluar-sesion`) y `claude-sonnet-4-6` (`dividir-nodos`, `generador-ejercicios`). Edge Functions desplegadas (todas vía MCP; el CLI da 403): `sol`, `dividir-nodos` v6, `evaluar-sesion` v5, `sol-chat` v5, `generador-ejercicios` v7 (+ login). Migraciones hasta `0013`.

**LUNA — copiloto de la docente (2026-07-28).** Spec `2026-07-28-luna-copiloto-docente-design.md`. Sección `/docente/luna`: **dashboard** con métricas del aula, alertas de rendimiento priorizadas (inactividad, caída de precisión, evitación de tipo, adelantado — calculadas on-demand, lógica pura en `web/lib/luna.ts`, listas para mover a un job nocturno) y resumen; **boletines mensuales** (wizard grado → alumno → generación → revisión; Edge Function `luna-boletin` anclada en evidencia; la seño edita inline, aprueba, regenera o corrige — todo nace `borrador`, principio "LUNA propone, la maestra decide"; tabla `boletin`, un boletín por alumno y mes con versión); **chat 24/7** (`luna-chat`, hilo único persistido en `luna_mensaje`, contexto real del aula en el system, instrucción plurigrado de eje común multi-nivel). Modelos: `claude-sonnet-4-6` en ambas. Tope diario propio (50 chats / 20 boletines por docente, tabla `luna_uso` solo service_role). Migración `0016`; seed `scripts/seed-actividad.mjs` (vuelve el aula plurigrado 1°/3°/5° y siembra ~3 semanas de actividad que dispara cada alerta). Desde 2026-07-31: **alertas atendidas** — botón "Listo ✓" por alerta; la clave `tipo:alumnoId` se persiste en `luna_alerta_atendida` (migración `0017`, aplicada; RLS solo la dueña, insert directo del cliente) y esa alerta **no vuelve nunca** (decisión del usuario); el chat también las excluye del contexto. **Boletín sin paso de grados**: el aula ya acota — directo a los alumnos con chip de grado. RLS: la docente solo ve lo suyo; a la API van solo nombre de pila, grado y desempeño. Unit tests de LUNA en `luna.test.mjs`, `luna-boletin.test.mjs`, `luna-chat.test.mjs`; integración `tests/integration/luna-rls.test.mjs` (necesita envs). **Deployado (2026-07-28):** migración `0016` aplicada, `luna-boletin`/`luna-chat` deployadas (CLI `--use-api` — el 403 histórico era el CLI logueado en otra cuenta, ya resuelto) y `seed-actividad.mjs` corrido. **Prompts v2 (2026-07-31):** system fijo del usuario + bloques `<contexto_del_aula>`/`<datos_del_alumno>` con datos ya procesados por el backend; el boletín salió de la tool forzada a **JSON crudo validado con un retry** (shape `{secciones, actitud, sugerencia_proximo_periodo}`, con lectura tolerante del shape viejo en el front); temperaturas 0.7 (chat) / 0.3 (boletín). **Pendiente: RE-deploy de `luna-boletin`/`luna-chat`** con los prompts v2 (CLI `--use-api` o MCP).

**Dashboard admin v3 (2026-08-08).** Spec `2026-08-05-admin-dashboard-v3-design.md` + ADR-009. Panel de operación de la plataforma en **`/admin`** (login propio, SIN links desde la app; `admin.edutia.ar` se puede mapear después en Vercel sin tocar código). El admin no tiene fila en `perfil`: vive en `plataforma_admin` (server-only, niveles super/operativo) y opera solo vía Edge Functions `admin-*` (**una por dominio**, guard `_shared/admin.ts`, auditoría en toda mutación). Migraciones: `0018` (estados/trials/límites en `escuela`, `escuela_feature` con flags SOL/LUNA/TERRA + planes, `docente_acceso`, `uso_api`, `auditoria`, RPCs `mi_acceso()`/`acceso_de()` y vistas públicas que reemplazan el listado anon de 0004 — era un leak de enumeración), `0019` (CRM: `escuela_nota`, `admin_alerta_atendida`) y `0020` (`anuncio`). Seed: `scripts/seed-admin.mjs`.

Secciones: **Colegios** (alta manual, estados trial/activo/suspendido/archivado, ficha con tabs), **Maestras** (alta con link de invitación + contraseña temporal de una sola vez, reset, suspender, reasignar), **Accesos** (trials con corte **suave** — vencido = solo lectura —, extensión de un click, topes mensuales de IA por colegio), **Features** (presets Básico/Docente/Completo + toggles con sub-features de LUNA), **Métricas** (adopción, uso, funnel, comparativa, feed), **Costos y salud** (por colegio y por feature, latencia p50/p95, errores), **Alertas y notas** (CRM-lite), **Anuncios** (banner in-app a maestras), **Auditoría / Administradores / Ver como maestra** (impersonación **read-only que jamás emite sesión**, auditada).

**Enforcement transversal:** las 10 Edge Functions existentes llaman `verificarAcceso` (`_shared/acceso.ts` + `acceso-logica.ts` puro) antes de operar — bloqueado corta todo, trial vencido corta solo lo que GENERA, más toggles y tope mensual; `alumno-login`/`aula-students` cortan por código de aula. Las 7 fns de Claude registran cada llamada en `uso_api` (tokens, costo con `_shared/precios.ts`, latencia, ok/error). En el front docente: `web/app/docente/layout.tsx` monta `AccesoBanner` + `AnuncioBanner`, `DocenteSidebar` esconde LUNA si está apagada y las pantallas de LUNA pasan por `GateFeature`. `web/lib/acceso.ts` espeja la semántica del server y hay un test que **compara ambas implementaciones**.

**Fase "Observatorio y avisos" (2026-08-09).** Spec `2026-08-09-observatorio-y-avisos-design.md` + ADR-010, migración `0021`. **Observatorio** en `/admin/observatorio`: agregados SIEMPRE anónimos por jurisdicción (`escuela.provincia`, check de 24 espejado en `_shared/provincias.ts`/`web/lib/admin/provincias.ts` con test de paridad) y por materia×grado, con **k-anonimato k=5** (desempeño de celdas chicas → "muestra insuficiente"; test de anonimato estructural: ninguna respuesta lleva nombres/ids) y temas top-N marcados "aproximado" (`nodo.nombre` no es comparable entre colegios). **Alertas persistidas**: `admin_alerta` + **primer cron del repo** (pg_cron+pg_net→`admin-jobs`, guard dual service-key/admin, secretos en **Vault** — sembrarlos es paso de deploy, `docs/DEPLOY_OBSERVATORIO_AVISOS.md`); `alertas_listar` lee el snapshot y hay "Recalcular ahora". **Actividad docente real**: `_shared/auth-users.ts` pagina `listUsers`; "maestra activa 7d" cuenta login + rastros; "Último acceso" en Maestras. **Visión**: `/admin/capacitacion` y `/admin/exportaciones` ("Próximamente", fuera del nav). El job nocturno de LUNA quedó a una acción de distancia (`luna_nocturno` en `admin-jobs`).

**Restyle del panel admin al diseño de Claude Design (2026-08-10).** Fuente: proyecto `cbd00fd9-c728-43b4-b631-a991cdc54003` de claude.ai/design, archivo `Admin.dc.html` (single-file con inline styles + los objetos de estilo exactos en el script del final). **Puro front**: no se tocó ninguna Edge Function, migración ni la capa de datos (`web/lib/admin/api.ts|metricas.ts|costos.ts|planes.ts`). Regla que se siguió: el diseño manda en estilo, el código manda en conducta — se conservaron los datos reales, los gates de rol operativo, "Recalcular ahora" en alertas y los filtros + cursor de auditoría; los artefactos demo del mock (toggle de rol, datos fake) no se implementaron. `web/lib/admin/tema.ts` sumó tokens (`hover`, `divisor`, `dangerFondo`, `neutro*`, `sol`, `luna`, `barra2/3`, `switch*`, `sombraCTA`, `velo`) y las pills suspendido/archivado/operativo cambiaron de valores; `globals.css` sumó las clases `.ad-*` de hover (React no tiene el `style-hover` del mock) y `@keyframes adPop`. **Sidebar sin íconos** con grupo **VISIÓN** (Observatorio/Capacitación/Exportaciones con chip "Pronto", `vision: true` en `nav.ts` — supersede la regla vieja de no listarlas) y rol como label estático. **Observatorio conserva sus datos reales** pero en tarjetas: "Aprendizaje por zona" con chips Fuerte/Cuesta (derivados con un fetch acotado de `materias` por provincia, fallback silencioso) y "Tendencias por tema" con una barra por grado que abre el drill-down real. Tablas densas → filas con divisores en costos, métricas y ficha. 447/447 unit verdes, `tsc --noEmit` limpio y `npm run build` OK; **pendiente: smoke visual del panel logueado** (el login ya se verificó y calca el mock).

**Pendiente de Fase 2:** decaimiento temporal / repaso espaciado (spec escrita), roles director/familia, copiloto TERRA (incluida la entrega de boletines a familias), job nocturno de alertas de LUNA (mecanismo listo — ver arriba), offline. Ver `docs/ROADMAP.md` y los specs en `docs/superpowers/specs/`.

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
- El copiloto TERRA (entrega a familias). LUNA ya está construida (2026-07-28).
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