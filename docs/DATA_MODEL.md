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
