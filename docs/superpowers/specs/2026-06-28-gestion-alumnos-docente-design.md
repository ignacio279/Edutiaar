# Diseño — Sección "Mi clase" (gestión de aulas + alumnos por la docente)

> Fecha: 2026-06-28 · Etapa: Fase 2 (rol docente; extiende panel docente).
> Estado: aprobado, listo para plan de implementación.

## Problema

Hoy los alumnos se crean **solo por seed** (`scripts/seed.mjs`, con `SUPABASE_SERVICE_ROLE_KEY`):
crea el auth user + la fila `perfil` + las credenciales (`set_alumno_cred`). La docente
no tiene forma de dar de alta a sus chicos desde la app. La RLS de `perfil` solo permite
`insert` con `id = auth.uid()`, así que un docente **no puede** insertar alumnos por cliente.

## Objetivo

Una sección **"Mi clase"** (`/docente/alumnos`) donde la docente gestiona sus **aulas** y sus
**alumnos**: crear, listar, editar, borrar, resetear PIN, cambiar secreto del aula. Datos de
menores → todo el camino de escritura pasa por el servidor con verificación de propiedad (Rule 1, Rule 5).

## Decisiones tomadas (brainstorming)

- **Aulas:** la docente elige/crea aulas y asigna cada alumno a un aula (CRUD de aulas).
- **PIN del alumno:** lo tipea la docente (4 dígitos) y se lo dice al chico.
- **Código + secreto del aula:** los tipea la docente (se valida que el código no exista).
- **Operaciones:** crear + listar + **resetear PIN** + **editar alumno** + **borrar alumno** + **editar/borrar aula**.

## Cómo se loguea hoy el alumno (contexto, no cambia)

Aula (`codigo` + `secreto`) → elige su nombre de la lista (`aula_students`) → PIN
(`alumno_login`, con lockout). El **secreto del aula y el PIN se guardan HASHEADOS** (bcrypt,
`crypt(...)`), por eso **no se pueden volver a mostrar**: se ven al crearlos/resetearlos.
El `codigo` del aula sí es texto plano y siempre visible.

## Arquitectura

Lecturas por cliente bajo RLS; **todas** las escrituras por una Edge Function con service role
y JWT de la docente.

```
/docente/alumnos (page.tsx)
   │  lee aulas + alumnos por cliente (RLS)
   │  escribe → invoke('gestion-alumnos', { accion, ... }, JWT docente)
   ▼
Edge Function gestion-alumnos (service role)
   verifica: caller.rol === 'docente'  +  el aula/alumno es de ESA docente
   crear/editar/borrar aula · crear/editar/borrar alumno · resetear PIN · cambiar secreto
   usa admin API (auth users) + RPCs set_aula_secreto / set_alumno_cred / reset_alumno_pin
```

### 1. Migración `0011_aula_docente_gestion.sql`

- `alter table aula add column docente_id uuid references perfil(id) on delete set null;`
- **Backfill:** asignar el aula sembrada a la docente Ana (por `escuela_id` / id conocido del seed).
- **RLS nueva** (las policies se combinan con OR; la `aula_select` existente filtra por
  `perfil.aula_id` y no sirve para la docente):
  ```sql
  create policy aula_select_docente on aula for select to authenticated
    using (docente_id = auth.uid());
  ```
  (Las escrituras de `aula` siguen sin policy → solo service_role, vía la Edge Function.)
- **RPC nueva** `reset_alumno_pin(p_perfil uuid, p_pin text)` (security definer, solo
  `service_role`): actualiza solo `alumno_cred.pin_hash = crypt(p_pin, gen_salt('bf'))`, sin
  tocar email/password opacos. Mismo patrón de `revoke ... / grant ... to service_role` que 0003.

> Reuso sin cambios: `set_aula_secreto(aula, secreto)` y `set_alumno_cred(perfil, aula, pin, email, password)` de 0003.

### 2. Edge Function `supabase/functions/gestion-alumnos/index.ts` (service role)

Patrón de auth como `evaluar-sesion`: cliente anon con el `Authorization` de la docente →
`getUser()` → buscar `perfil` y exigir `rol === 'docente'`. Después, cliente service role para
escribir. **Toda** acción valida propiedad antes de tocar nada.

Body: `{ accion: string, ...campos }`. Acciones:

- **`crear_aula`** `{ nombre, grado?, codigo, secreto }` → valida código único (la tabla tiene
  `unique`, además pre-chequeo) → `insert aula (escuela_id = perfil.escuela_id, docente_id = caller, nombre, grado, codigo)`
  → `set_aula_secreto(aula_id, secreto)`. Devuelve el aula.
- **`editar_aula`** `{ aula_id, nombre?, grado? }` → valida `aula.docente_id === caller` → update.
- **`cambiar_secreto`** `{ aula_id, secreto }` → valida propiedad → `set_aula_secreto`.
- **`borrar_aula`** `{ aula_id }` → valida propiedad → **bloquea** si hay alumnos en el aula
  (`count perfil where aula_id`) con error `aula_con_alumnos`; si no, `delete aula`.
- **`crear_alumno`** `{ aula_id, nombre, avatar, grado, pin }` → valida aula de la docente →
  genera email opaco (`alu-<rand>@students.edutia.local`) + password aleatorio → crea **auth user**
  (admin API `/auth/v1/admin/users`) → `insert perfil (id, rol 'alumno', nombre, avatar, grado, escuela_id, docente_id = caller, aula_id)`
  → `set_alumno_cred(perfil, aula, pin, email, password)`. (Igual que `seed.mjs`.)
- **`editar_alumno`** `{ alumno_id, nombre?, grado?, avatar?, aula_id? }` → valida que el alumno
  sea de la docente (`perfil.docente_id === caller`) y que el aula destino también → update perfil.
- **`resetear_pin`** `{ alumno_id, pin }` → valida propiedad → `reset_alumno_pin`.
- **`borrar_alumno`** `{ alumno_id }` → valida propiedad → borra el **auth user** (admin API) →
  cascada FK limpia `perfil` / `alumno_cred` / `alumno_nodo` / `sesion` / `respuesta`.

Errores con `json({ error }, code)` (`no_autenticado` 401, `no_docente` 403, `no_es_tuyo` 403,
`codigo_duplicado` 409, `aula_con_alumnos` 409, validaciones 400). CORS + `json` compartidos.

### 3. Front `web/app/docente/alumnos/page.tsx`

Matchea el sidebar/header de `web/app/docente/page.tsx` (agregar item "Mi clase" al nav; también
en `/docente/autoria`). Verifica `rol === 'docente'`.

- **Lecturas (cliente, RLS):** aulas (`select * from aula where docente_id = uid` cubierto por la
  policy nueva) + alumnos (`perfil` rol alumno, `docente_id = uid`, ya cubierto por `perfil_select`).
- **UI:** lista de aulas (card: nombre, grado, `codigo` visible, conteo de alumnos) con
  editar / borrar / cambiar secreto; dentro de cada aula, lista de alumnos (avatar `animal()`,
  nombre, grado) con resetear PIN / editar / borrar (con confirmación).
- **Formularios:** "Crear aula" (nombre, grado, código, secreto) y "Agregar alumno" (elegí aula,
  nombre, avatar de un set de animales de `web/lib/art.ts`, grado, PIN 4 dígitos).
- **Escrituras:** `supabase.functions.invoke('gestion-alumnos', { body: { accion, ... } })` (la
  invoke adjunta el JWT). Errores → `toast()`; éxito → refrescar la lista.
- Tono cálido, español rioplatense, nunca "pa'".

### 4. Tests

- **Unit** `tests/unit/gestion.test.mjs` → validadores puros en
  `supabase/functions/gestion-alumnos/validar.ts` (importables desde Node, como `diagnostico.ts`):
  - `pinValido` (exactamente 4 dígitos numéricos).
  - `codigoNormalizado` (trim, mayúsculas, no vacío).
  - `validarCrearAlumno` / `validarCrearAula` (campos requeridos, devuelven error legible).
- **Integración** `tests/integration/gestion-rls.test.mjs` (idempotente; **pendiente** sin envs
  locales, como `panel-rls`): docente A no ve ni edita aulas/alumnos de docente B; la función
  rechaza a un caller no-docente; crear→login del alumno funciona; borrar limpia en cascada.

## Seguridad (datos de menores)

- API/admin keys **solo server-side** (Rule 1). El front nunca ve service role.
- Cada acción re-verifica propiedad en el servidor (no confiar en el front).
- PIN y secreto **hasheados** (reuso de los RPCs definer); nunca vuelven al cliente.
- Email/password del alumno **opacos** y nunca expuestos (igual que hoy).
- Sin recolección de datos personales extra (Rule 5): solo nombre de pila, avatar, grado.

## Fuera de alcance (YAGNI)

Auto-signup de docentes, importar alumnos por CSV, mover alumnos en masa, foto real de avatar,
recuperar el secreto hasheado, multi-escuela por docente.
