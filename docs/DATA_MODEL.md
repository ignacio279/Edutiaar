# Modelo de datos — EDUTIA

> Idea central: el **contenido** (materia, programa, nodo, ejercicio) es igual para todos los chicos. El **progreso** (sesion, respuesta, alumno_nodo) es único de cada alumno. La tabla `alumno_nodo` es el cruce entre ambos.

## Diagrama de relaciones

```
CONTENIDO (igual para todos)
  materia ──< programa ──< nodo ──< ejercicio
                            │
                            │ (una fila por alumno × nodo)
                            ▼
PROGRESO (por chico)     alumno_nodo
  perfil(alumno) ──< sesion ──< respuesta >── ejercicio
```

`──<` = uno-a-muchos (FK).

## Tablas

### escuela
La escuela del piloto. Guarda la **zona**, que SOL usa para los ejemplos locales.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| nombre | text | |
| zona | text | ej: "Neuquén, Patagonia" |

### perfil
Cada usuario. Se engancha al login de Supabase Auth (`id` = `auth.users.id`).

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK, = auth.users.id |
| rol | enum | `docente` \| `alumno` |
| nombre | text | |
| avatar | text | para el alumno |
| grado | int | para el alumno |
| escuela_id | uuid | FK → escuela |
| docente_id | uuid | FK → perfil (la maestra del alumno) |

### materia
La materia. En el MVP: una sola (Lengua).

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| nombre | text | "Lengua" |

### programa
Contenido de una materia para un grado. Es lo que SOL divide en nodos.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| materia_id | uuid | FK → materia |
| grado | int | |
| contenido | text | el temario |

### nodo
Cada tema del programa (plantilla, igual para todos los chicos del grado).

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| programa_id | uuid | FK → programa |
| nombre | text | "Vocales" |
| orden | int | posición en el mapa |
| descripcion | text | qué cubre el nodo *(Fase 2, mig. 0006)* |
| actualizado_at | timestamptz | seam de edición *(Fase 2, mig. 0006)* |
| version | int | seam de edición, default 1 *(Fase 2, mig. 0006)* |

### ejercicio
Ejercicios que SOL genera para un nodo (pool, para abaratar la API).

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| nodo_id | uuid | FK → nodo |
| enunciado | text | |
| opciones | jsonb | las alternativas |
| correcta | text | la respuesta buena |
| dificultad | int | nivel |

### alumno_nodo ⭐
El estado de cada nodo, por chico. **Una fila por (alumno × nodo).** Es lo que pinta el mapa de cada alumno.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| alumno_id | uuid | FK → perfil |
| nodo_id | uuid | FK → nodo |
| estado | enum | `no_empezado` \| `en_construccion` \| `a_reforzar` \| `dominado` |
| puntaje | numeric | qué tan dominado |
| actualizado_at | timestamp | |

> Restricción: `UNIQUE (alumno_id, nodo_id)`.

### sesion
Una vuelta de práctica de un chico en un nodo. De acá sale "qué hizo hoy" y el histórico.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| alumno_id | uuid | FK → perfil |
| nodo_id | uuid | FK → nodo |
| fecha | timestamp | |
| duracion_seg | int | |
| aciertos | int | |
| total | int | |

### respuesta
Cada respuesta del chico. Registro fino para detectar patrones.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| sesion_id | uuid | FK → sesion |
| ejercicio_id | uuid | FK → ejercicio |
| dada | text | lo que respondió |
| correcta | bool | |
| tiempo_seg | int | |
| reintentos | int | |
| created_at | timestamp | |

### sol_materia *(Fase 2, mig. 0006)*
El **especialista de SOL** para un programa: lo crea la autoría docente (la seño sube contenido → SOL divide en nodos + arma este perfil). A diferencia del resto del contenido (compartido), **tiene dueño** (`docente_id`), y la docente lo **revisa y publica**.

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| programa_id | uuid | FK → programa (on delete cascade) |
| docente_id | uuid | FK → perfil (la dueña) |
| escuela_id | uuid | FK → escuela |
| perfil | jsonb | system_prompt + tono + criterios_eval + ejemplos_zona |
| estado | enum | `borrador` \| `publicado` (la seño revisa antes) |
| version | int | versionar regeneraciones, default 1 |
| created_at | timestamptz | |

> RLS: solo la docente dueña ve/edita su `sol_materia` y los `nodo` de su programa. El INSERT lo hace la Edge Function `dividir-nodos` con `service_role`. Desde la migración `0013` la dueña también puede **borrar su `programa`** (cascade: sol_materia, nodos, ejercicios y progreso de alumnos), pero **solo en `borrador`**: eliminar una publicada exige despublicarla primero (guarda de dos pasos en el servidor).

## Notas del MVP

- **El histórico mes a mes no necesita tabla propia:** sale de agrupar `sesion` por mes. Si más adelante hace falta, se agrega una tabla de "fotos" mensuales.
- En el MVP varias tablas tienen **una sola fila** (una escuela, una materia, un grado). Diseñarlas así ahora hace que Fase 2 sea solo agregar filas, sin cambiar la estructura.
- La regla exacta para que un nodo pase a `dominado` está **pendiente de definir** (ver `DECISIONS.md`).
## Plataforma / administración *(Dashboard admin v3, mig. 0018 — ADR-009)*

> El admin de plataforma **no tiene fila en `perfil`**: es un usuario de Auth
> registrado en `plataforma_admin` (server-only). Toda su operación pasa por
> Edge Functions `admin-*`. "Server-only" = RLS habilitada **sin policies**
> (solo service_role), el patrón de `aula_secreto`/`luna_uso`.

### escuela (columnas nuevas)
`tipo` (`rural|unidocente|plurigrado`) · `estado` (`trial|activo|suspendido|archivado` — todo el acceso cuelga de acá) · `trial_inicio`/`trial_fin` (date) · `contacto` (jsonb CRM) · `limites` (jsonb `{sol_mes, boletines_mes, chats_mes}`; null = default) · `created_at`.

### plataforma_admin *(server-only)*
`perfil_id` (PK, → auth.users) · `nivel` (`super|operativo`) · `nombre` · `activo` · `creado_por` · `created_at`.

### auditoria *(server-only)*
`id` · `actor_id` (sin FK: sobrevive al borrado del admin) · `actor_email` · `nivel` · `accion` · `entidad` · `entidad_id` · `detalle` (jsonb) · `created_at`. Índices por fecha y entidad.

### escuela_feature
`escuela_id` (PK → escuela) · `flags` (jsonb `{"sol":…,"luna":{…},"terra":…}`) · `plan` (`basico|docente|completo|custom`) · `updated_at`. SELECT por RLS para la docente de esa escuela (`mi_escuela()`); escribe solo `admin-features`.

### docente_acceso *(server-only)*
`perfil_id` (PK → perfil) · `estado` (`activo|suspendido`) · `trial_inicio` · `trial_fin`. Vive fuera de `perfil` porque `perfil_update` permite self-update. Sin fila = activa sin trial propio.

### uso_api *(server-only, insert-only)*
`id` · `escuela_id` · `perfil_id` · `funcion` · `modelo` · `tokens_entrada` · `tokens_salida` · `costo_usd` · `ok` · `latencia_ms` · `error_codigo` · `created_at`. Un INSERT por llamada a Claude; agregados on-demand; topes mensuales por colegio = `count()` del mes vs. `escuela.limites`.

### RPCs de acceso (0018)
`mi_acceso()` (authenticated) y `acceso_de(uuid)` (solo service_role) devuelven `{estado: activo|solo_lectura|bloqueado, motivo, trial_fin, features}` — única fuente de verdad del corte (suspendido → bloqueado; trial vencido → solo lectura). `admin_nivel()` devuelve el nivel del admin logueado (null si no lo es). Defaults de `flags` en `features_default()` (solo SQL). Vistas `escuela_publica`/`aula_publica` reemplazan el listado anon de 0004.

> Tablas de otras etapas no detalladas acá: `aula`, `aula_secreto`, `alumno_cred`, `intento_login` (login endurecido, 0003/0011/0015), `evaluacion_sesion` (0009), `boletin`, `luna_mensaje`, `luna_uso` (LUNA, 0016), `luna_alerta_atendida` (0017). Ver las migraciones y los specs correspondientes.

## Fase "Observatorio y avisos" *(mig. 0021 — ADR-010)*

### escuela (columna nueva)
`provincia` text nullable con check de las 24 jurisdicciones argentinas (espejo en `_shared/provincias.ts` / `web/lib/admin/provincias.ts` + test de paridad). Es el eje normalizado del observatorio; `zona` sigue como detalle libre. Índice por provincia. **No** se expone en `escuela_publica`.

### admin_alerta *(server-only)*
Snapshot nocturno de las alertas del operador. `clave` (PK — la clave determinística de `_shared/alertas-logica.ts`, upsert natural) · `tipo` (sin check: detector nuevo ≠ migración) · `prioridad` check (`alta|media`) · `escuela_id` (FK cascade) · `escuela_nombre` · `titulo` · `detalle` · `generada_at`. La escribe `admin-jobs` (cron nocturno o "Recalcular ahora"); la lee `admin-crm alertas_listar`; `alerta_atender` la borra best-effort (la fuente de verdad de "atendida" sigue siendo `admin_alerta_atendida`).

### Cron (primer job del repo)
Extensiones `pg_cron` + `pg_net`. Helper `llamar_admin_jobs(accion)` (SECURITY DEFINER, EXECUTE revocado): lee `project_url`/`service_role_key` de **Vault** (se siembran a mano en el deploy; si faltan degrada con notice) y hace `net.http_post` a la Edge Function `admin-jobs`. Schedule `admin-jobs-nocturno` a las 06:00 UTC (03:00 AR). El futuro job de LUNA se cuelga del mismo helper con otra acción.

## Fase "Alumno golondrina" *(mig. 0022–0027 — ADR-011)*

> `perfil.id` **es** el id EDUTIA del alumno (UUID, independiente del colegio).
> **Prohibido** el DNI o cualquier identificador estatal como clave, campo
> requerido o mecanismo de búsqueda. Las columnas de vínculo de `perfil`
> (`docente_id/aula_id/escuela_id/grado`) pasan a ser **caché de la matrícula
> activa** mantenido por el trigger `matricula_sync`; `perfil_guard` (BEFORE
> UPDATE) rechaza cualquier otro escritor de esas columnas, de `estado` y de
> `excluido_procesamiento`.

### perfil (columnas nuevas)
`estado` (`activo|en_transito|egresado|baja` — máquina de estados en DB, `baja` terminal y solo vía ARCO) · `excluido_procesamiento` (boolean, oposición ARCO; solo lo escribe la RPC `arco_set_exclusion`).

### matricula ⭐ *(0022)*
La fuente de verdad del vínculo alumno↔colegio; el legajo (keyed por `alumno_id`) viaja con el chico.
`id` · `alumno_id` (FK → perfil, cascade) · `escuela_id` · `aula_id` · `docente_id` · `grado` · `fecha_inicio` · `fecha_fin` (null = activa) · `estado` (`activa|cerrada`) · `motivo_cierre` (`migracion|egreso|arco_baja|error_carga`) · `abierta_por`/`cerrada_por` (sin FK) · `consentimiento_id` (FK → consentimiento) · `created_at`.
**Constraint del feature:** índice único parcial `matricula_una_activa` (una activa por alumno). SELECT por RLS: el alumno la suya, la docente vía `es_mi_alumno` (al cerrar pierde también el historial). Escritura SOLO vía RPCs `matricula_abrir`/`matricula_cerrar` (cerrar revoca `alumno_cred`+`intento_login` y transiciona el estado según motivo; ambas auditan).

### consentimiento *(0023)*
`id` · `alumno_id` (FK cascade) · `escuela_id` (hacia qué colegio) · `adulto_nombre` · `adulto_vinculo` (`madre|padre|tutor|otro`) · `alcance` (`tratamiento|transferencia`) · `via` (`asistida|link|migracion`) · `estado` (`vigente|revocado|pendiente_regularizar`) · `registrado_por` (sin FK) · `otorgado_at` · `revocado_at` · `created_at`. SELECT por `es_mi_alumno`; escritura server-only. El backfill dejó deuda `pendiente_regularizar` por alumno pre-existente.

### transferencia *(0023 + lockout 0027, server-only)*
`id` · `alumno_id` · `escuela_origen`/`escuela_destino` · `solicitada_por` · `estado` (`pendiente|confirmada|denegada|expirada`) · `token_hash` (SHA-256 del token opaco de 128 bits; el claro solo viaja en el link) · `expira_at` · `consentimiento_id` · `confirmada_via` (`link|asistida`) · `resuelta_at` · `intentos_fallidos`/`bloqueada_hasta` (lockout 5 intentos/15 min). **CHECK duro:** `estado <> 'confirmada' or consentimiento_id is not null` — sin consentimiento no existe transferencia, ni por SQL directo. Única pendiente por alumno (índice parcial).

### plataforma_config *(0023, server-only)*
`clave` (PK) · `valor` (jsonb) · `updated_at`. Sembrada: `transferencia_dias_expiracion` = 14.

### arco_caso *(0024, server-only)*
`id` · `alumno_id` (**sin FK**: el caso legal sobrevive a la cancelación) · `tipo` (`acceso|rectificacion|cancelacion|oposicion`) · `estado` (`solicitado|confirmado|ejecutado|rechazado`) · `solicitado_por` · `detalle` (jsonb; en rectificación guarda el diff) · `agregado` (jsonb: snapshot ANÓNIMO pre-borrado — conteos, grado, provincia, rango de fechas; sin nombre ni uuids) · `ejecutado_por` · `ejecutado_at` · `created_at`. La cancelación (2 pasos, confirma solo `super`) es **el único borrado físico del sistema**.

### institucion / institucion_admin *(0025)*
`institucion`: `id` · `nombre` · `tipo` (`provincia|fundacion|red|municipio`) · `contacto` (jsonb) · `estado` (`activa|suspendida|archivada`). `escuela.institucion_id` FK nullable.
`institucion_admin` *(server-only, tabla propia — NO un nivel de `plataforma_admin`, diseño fail-closed)*: `perfil_id` (PK → auth.users) · `institucion_id` (FK cascade) · `nombre` · `activo` · `creado_por`. **Jamás ve alumnos individuales**: solo agregados de sus colegios vía `institucion-panel`.

### licencia / licencia_asignacion *(0026, server-only)*
`licencia`: `id` · `escuela_id` **XOR** `institucion_id` (check `num_nonnulls = 1`) · `plan` (`basico|docente|completo|custom`) · `cupos` (solo pools) · `fecha_inicio`/`fecha_fin` · `estado` (`prueba|activa|vencida|suspendida`) · `condiciones`. `licencia_asignacion`: `escuela_id` (PK — un colegio consume a lo sumo un cupo) · `licencia_id`; trigger `licencia_cupos_guard` (error `sin_cupos`). `acceso_calcular` v2 (misma firma): licencia efectiva = directa > pool; suspendida → bloqueado; vencida → **solo lectura**; sin licencia → rama trial 0018. Backfill: una licencia por colegio existente.
