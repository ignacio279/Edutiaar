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

## Notas del MVP

- **El histórico mes a mes no necesita tabla propia:** sale de agrupar `sesion` por mes. Si más adelante hace falta, se agrega una tabla de "fotos" mensuales.
- En el MVP varias tablas tienen **una sola fila** (una escuela, una materia, un grado). Diseñarlas así ahora hace que Fase 2 sea solo agregar filas, sin cambiar la estructura.
- La regla exacta para que un nodo pase a `dominado` está **pendiente de definir** (ver `DECISIONS.md`).