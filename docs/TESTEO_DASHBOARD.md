# Guía de testeo — Dashboard de administración completo

> Cubre **las tres fases** que viven en la branch `claude/admin-dashboard-v3-ououe8`:
> **Admin v3** (0018–0020) + **Observatorio y avisos** (0021) + **Alumno golondrina** (0022–0027).
> Cada paso dice **qué se testea**, **cómo** y **qué tiene que pasar**.
> Si un paso falla, no sigas: los de abajo dependen de los de arriba.
>
> El detalle fino de la fase golondrina está en `TESTEO_GOLONDRINA.md`; acá va
> integrada en el recorrido general.

---

## Punto de partida

> **Actualizado el 2026-08-12.** Este doc se escribió asumiendo que no había
> nada aplicado, pero **Admin v3 y Observatorio ya se deployaron el 2026-08-10**
> (verificado contra la base real). Lo que falta es solo la fase golondrina.

| | Estado |
|---|---|
| Código (10 migraciones, 29 funciones, ~26 pantallas admin) | ✅ commiteado y pusheado |
| 495 tests unitarios | ✅ verdes |
| Migraciones **0018 → 0021** | ✅ **aplicadas** (2026-08-10) |
| Migraciones **0022 → 0027** (golondrina) | ❌ **sin aplicar** |
| Las 23 Edge Functions de Admin v3 + Observatorio | ✅ **deployadas** (2026-08-10) |
| Las 6 fns de golondrina (`gestion-transferencias`, `transferencia-confirmar`, `gestion-consentimientos`, `admin-arco`, `admin-instituciones`, `institucion-panel`) | ❌ **sin deployar** |
| 27 archivos de tests de integración | ❌ escritos, **nunca corridos** contra la DB real |
| Front en Vercel | ❌ branch sin mergear |
| Secretos del cron en Vault | ❌ sin sembrar |

**Consecuencia práctica:** en el paso 3 saltá a `0022`; las cuatro primeras ya
están en `supabase_migrations.schema_migrations`. Hasta que golondrina se
aplique, `/admin/transferencias`, `/admin/instituciones`, `/admin/licencias`,
`/admin/arco` y todo `/institucion` no pueden funcionar por más que el front
esté terminado.

**Recomendación fuerte:** hacé los pasos 3 a 5 primero en un proyecto Supabase de prueba. El backfill de 0018 y 0022 toca todos los colegios y todos los alumnos existentes.

Envs para todo lo que sigue:
```bash
export SUPABASE_URL=https://<proyecto>.supabase.co
export SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...
```

---

# BLOQUE A — Sin tocar nada (5 minutos)

## Paso 1 — Tests unitarios

**Qué testea:** toda la lógica pura de las tres fases — cálculo de acceso y trials, planes de features, precios y costos, detectores de alertas, k-anonimato del observatorio, paridad de las 24 provincias entre SQL y TS, máquina de estados del alumno, lockout del link público, XOR de licencias, anonimato del resumen ARCO. Varios tests **leen el texto de las migraciones** y congelan las reglas escritas en SQL.

```bash
cd /home/user/Edutiaar && npm test
```

**Esperado:** `# tests 495 · # pass 495 · # fail 0`

**Test estrella:** hay uno que compara la implementación del front (`web/lib/acceso.ts`) contra la del servidor (`_shared/acceso-logica.ts`) y falla si divergen. Ya cazó un bug real: el front y el backend interpretaban distinto el apagado de LUNA.

## Paso 2 — Build del front

```bash
cd web && NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next build
```

**Esperado:** `✓ Compiled successfully` y **34 rutas**, entre ellas las ~26 de `/admin` (incluida la ficha `/admin/instituciones/[id]`), más `/institucion`, `/institucion/login` y `/transferir/[id]`.

---

# BLOQUE B — Instalación (el paso delicado)

## Paso 3 — Migraciones 0018 → 0027, EN ORDEN

**Qué testea:** que diez migraciones aditivas se instalan sobre datos que ya existen sin romper nada.

| Migración | Qué instala | Backfill |
|---|---|---|
| `0018_admin_dashboard` | Estados/trials/límites en `escuela`, `plataforma_admin`, `auditoria`, `escuela_feature`, `docente_acceso`, `uso_api`, RPCs `mi_acceso`/`acceso_de`, vistas públicas | Colegios existentes → `activo` |
| `0019_crm` | `escuela_nota`, `admin_alerta_atendida` | — |
| `0020_anuncios` | `anuncio` | — |
| `0021_observatorio_avisos` | `escuela.provincia`, `admin_alerta`, **pg_cron + pg_net + helper del job nocturno** | Escuela semilla → Neuquén |
| `0022_matricula_estado_alumno` | `matricula`, `perfil.estado`, RPCs y los dos triggers | Una matrícula por alumno con colegio |
| `0023_consentimiento_transferencia` | `consentimiento`, `transferencia`, `plataforma_config` | Deuda `pendiente_regularizar` por alumno |
| `0024_arco` | `arco_caso`, `perfil.excluido_procesamiento` | — |
| `0025_instituciones` | `institucion`, `institucion_admin`, `escuela.institucion_id` | — |
| `0026_licencias` | `licencia`, `licencia_asignacion`, `acceso_calcular` v2 | Una licencia por colegio |
| `0027_transferencia_lockout` | Lockout del link público | — |

**Esperado:** las diez aplican sin error. `0021` aplica limpia aunque Vault esté vacío (el cron corre "vacío" con un notice hasta el paso 4).

### Verificación obligatoria (las cinco consultas dan 0)

```sql
-- (a) Todo colegio tiene fila de features y de licencia.
select count(*) from escuela e
where not exists (select 1 from escuela_feature f where f.escuela_id = e.id);
select count(*) from escuela e
where not exists (select 1 from licencia l where l.escuela_id = e.id);

-- (b) El caché de perfil coincide EXACTO con la matrícula activa.
select count(*) from perfil p
join matricula m on m.alumno_id = p.id and m.fecha_fin is null
where p.escuela_id is distinct from m.escuela_id
   or p.aula_id    is distinct from m.aula_id
   or p.docente_id is distinct from m.docente_id
   or p.grado      is distinct from m.grado;

-- (c) Ningún alumno con colegio quedó sin matrícula activa.
select count(*) from perfil where rol = 'alumno' and escuela_id is not null
  and not exists (select 1 from matricula m
                  where m.alumno_id = perfil.id and m.fecha_fin is null);

-- (d) La provincia quedó dentro de las 24 jurisdicciones (o null).
select count(*) from escuela where provincia is not null
  and provincia not in (select provincia from escuela);  -- el CHECK ya lo garantiza
```

### Dos pruebas que tienen que **FALLAR**

```sql
-- 1. El vínculo del alumno solo se toca vía matrícula (trigger perfil_guard).
update perfil set grado = 7 where rol = 'alumno' limit 1;
```
**Esperado:** `vinculo_protegido`. Si el update pasa, el trigger no quedó instalado → **frená todo**.

```sql
-- 2. El listado anon de colegios ya no filtra estado ni contacto (fix de 0018).
-- Desde el navegador, sin sesión, contra la API REST:
--   GET /rest/v1/escuela?select=*
```
**Esperado:** vacío o error. Los datos públicos solo salen por las vistas `escuela_publica` / `aula_publica`, que traen `id, nombre, zona` y nada más.

## Paso 4 — Secretos del cron en Vault

**Qué testea:** que el job nocturno pueda llamarse a sí mismo.

```sql
select vault.create_secret('https://<proyecto>.supabase.co', 'project_url');
select vault.create_secret('<service_role JWT legacy>', 'service_role_key');
```

⚠️ **Tiene que ser el service_role JWT legacy**, no una clave `sb_secret_...`: las nuevas no son JWT y el gateway las rechaza.

**Esperado:** dos secretos creados. Verificalo:
```sql
select name from vault.decrypted_secrets where name in ('project_url','service_role_key');
```

## Paso 5 — Deploy de las Edge Functions

**Qué testea:** que todo el backend está arriba.

Son **29** y conviene deployarlas todas (cualquier deploy sube `_shared/` completo, pero cada función necesita el suyo para tomar su código):

- **15 admin-\***: `admin-colegios`, `admin-maestras`, `admin-accesos`, `admin-features`, `admin-metricas`, `admin-costos`, `admin-crm`, `admin-anuncios`, `admin-auditoria`, `admin-plataforma`, `admin-impersonar`, `admin-observatorio`, `admin-jobs`, `admin-arco`, `admin-instituciones`
- **4 de golondrina**: `gestion-transferencias`, `transferencia-confirmar`, `gestion-consentimientos`, `institucion-panel`
- **10 preexistentes modificadas** (todas llaman ahora a `verificarAcceso`, y las de Claude registran en `uso_api`): `sol`, `sol-chat`, `dividir-nodos`, `evaluar-sesion`, `generador-ejercicios`, `luna-boletin`, `luna-chat`, `gestion-alumnos`, `alumno-login`, `aula-students`

```bash
supabase functions deploy <nombre> --use-api
```

**Ojo:** `transferencia-confirmar` es la única pública (`verify_jwt = false`). Si queda con JWT obligatorio, la familia nunca puede abrir el link.

**Verificación rápida:**
```bash
# La función pública responde y NO revela si la transferencia existe:
curl -s -X POST "$SUPABASE_URL/functions/v1/transferencia-confirmar" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"accion":"ver","transferencia_id":"00000000-0000-0000-0000-000000000000","token":"x"}'
# Esperado: {"error":"token_invalido"}  (403)

# Una función admin sin sesión rebota:
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SUPABASE_URL/functions/v1/admin-colegios" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"accion":"listar"}'
# Esperado: 401
```

## Paso 6 — Crear el super-admin y sembrar datos

```bash
# El super-admin (NO tiene fila en perfil: no es docente ni alumno)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
ADMIN_EMAIL=jorge@edutia.ar ADMIN_PASSWORD=<algo fuerte> ADMIN_NOMBRE=Jorge \
node scripts/seed-admin.mjs

# Datos de demo (opcional pero recomendado)
node scripts/seed.mjs             # aula Cerro Azul + seño Ana + 5 alumnos
node scripts/seed-actividad.mjs   # ~3 semanas de actividad que dispara alertas de LUNA
node scripts/seed-golondrina.mjs  # institución con 2 colegios, alumno con historial, ARCO
```

**Esperado:** `seed-golondrina` imprime al final un **link de transferencia de demo** — anotalo, se usa en el paso 12.

---

# BLOQUE C — Verificación automática

## Paso 7 — Los 27 archivos de tests de integración

**Qué testea:** el sistema entero contra la base y las funciones reales. **Es el paso que más valor da de toda la guía.**

```bash
cd /home/user/Edutiaar
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:db
```

**Esperado:** `# fail 0`. Son idempotentes: crean y borran sus propios datos efímeros.

| Archivo | Qué prueba |
|---|---|
| `admin-colegios` | Guard `no_admin` con token de docente · suspender → acceso bloqueado · archivado invisible en la vista pública |
| `admin-maestras` | Alta con contraseña temporal · suspender → bloqueado · reasignar |
| `admin-accesos` | Trial vencido → **solo lectura** · extensión · topes mensuales |
| `admin-features` | Apagar una feature corta la función correspondiente · presets |
| `admin-metricas` / `admin-costos` | Agregados y `uso_api` |
| `admin-crm` / `admin-anuncios` | Notas, alertas atendidas, vigencia de anuncios |
| `admin-seguridad` | Auditoría, niveles super/operativo, "ver como" read-only |
| `admin-observatorio` | **k-anonimato k=5** y anonimato estructural (ninguna respuesta con nombres ni ids) |
| `admin-jobs` | Guard dual cron/admin · snapshot de alertas |
| `admin-fundaciones` | Vistas públicas |
| `matricula` / `golondrina` / `matriz-permisos` | La fase golondrina (ver `TESTEO_GOLONDRINA.md`) |
| `security`, `luna-rls`, `panel-rls`, `materias-rls`, `override-docente`, `alumno-materias` | **Que la RLS de siempre sigue intacta** — el gate real |
| `sol`, `dividir-nodos`, `evaluar-sesion`, `generador-ejercicios` | ⚠️ **Queman API real de Claude** (~4–6 min el del generador). Corrélos aparte si querés ahorrar. |

Si algún test da **404**, esa función no está deployada (volvé al paso 5).

---

# BLOQUE D — El dashboard a mano, sección por sección

Entrá a `/admin/login` con el super-admin del paso 6.

**Esperado del login:** entra. Con una cuenta de docente o inexistente: **"Credenciales inválidas."** siempre igual, sin revelar si el email existe.

### 8.1 Inicio (`/admin`)
**Esperado:** la foto del día — colegios activos, maestras, alumnos, actividad reciente. Sin errores en consola.

### 8.2 Colegios (`/admin/colegios`)
- **Crear un colegio** de prueba (nombre, tipo, provincia).
- **Esperado:** nace en estado **Prueba**, aparece en la lista con su pill, y recibe fila de features y licencia automáticamente.
- Abrí su **ficha** y recorré los seis tabs: **Resumen · Maestras · Accesos · Features · Notas · Uso · Costos**. Todos tienen que cargar (vacíos está bien).

### 8.3 Maestras (`/admin/maestras`)
- **Crear una maestra** en el colegio de prueba.
- **Esperado:** aparece **una sola vez** la contraseña temporal + link de invitación, con el aviso de que no se vuelve a mostrar. Recargá la página: **ya no está**.
- Probá **suspender** y **reactivar**; mirá **"Último acceso"** (viene de Auth real).

### 8.4 Accesos y trials (`/admin/colegios/[id]/accesos`) ⭐
Esta es **la prueba más importante del dashboard**, porque verifica que el corte es real y no cosmético.

1. Poné el trial del colegio de la seño Ana con **fecha de fin de ayer**.
2. Entrá a la app **como Ana**.

**Esperado:** banner *"Terminó el período de prueba"*, puede **ver todo** (sus alumnos, el panel, los boletines viejos) pero **no generar nada nuevo**: publicar una materia, generar ejercicios o pedirle un boletín a LUNA tienen que rebotar con el mensaje del corte.

3. Extendé el trial **+30 días** desde el panel y recargá como Ana.

**Esperado:** vuelve a funcionar todo, sin tocar ningún dato.

4. Ahora poné el colegio en **Suspendido**.

**Esperado:** Ana queda **bloqueada** (no solo lectura), y **el alumno no puede ni entrar** con su código de aula.

### 8.5 Features por colegio (`/admin/colegios/[id]/features`) ⭐
1. Apagá **LUNA** entera en el colegio de Ana.

**Esperado:** al recargar la app de Ana, **el ítem LUNA desaparece del menú**, y entrar a `/docente/luna` a mano también rebota (el servidor corta, no solo el menú).

2. Prendé LUNA pero apagá solo **Boletines**.

**Esperado:** el chat de LUNA anda, los boletines no.

3. Probá los presets **Básico / Docente / Completo** y verificá que los toggles se acomodan.

### 8.6 Métricas (`/admin/metricas`)
**Esperado:** adopción, uso, **funnel de onboarding** por colegio (creado → maestras → primera actividad → primer boletín), comparativa y feed de actividad. Con el seed de actividad corrido tiene que haber números reales, no ceros.

### 8.7 Costos y salud (`/admin/costos`)
**Esperado:** costo por colegio y **por feature**, tokens, latencia p50/p95 y tasa de errores. Se llena con `uso_api`, así que **hacé una llamada real** primero (que Ana genere ejercicios) y volvé: tiene que aparecer esa llamada con su costo en dólares.

### 8.8 Alertas y notas (`/admin/alertas`, tab Notas)
- **Esperado:** con el seed de actividad hay alertas (trial por vencer, colegio inactivo, costo disparado) priorizadas alta/media.
- Tocá **"Listo ✓"** en una. **Esperado:** desaparece **y no vuelve nunca** — recargá y probá "Recalcular ahora": sigue sin aparecer.
- En Notas: creá una nota de contacto y editá el contacto del colegio.

### 8.9 Anuncios (`/admin/anuncios`)
- Publicá un anuncio **global** con vigencia desde hoy.
- **Esperado:** Ana lo ve como **banner dentro de su app**. Desactivalo → desaparece. Probá uno con fecha futura: **no** se muestra todavía.

### 8.10 Observatorio (`/admin/observatorio`) ⭐
**Esperado:**
- Agregados **por jurisdicción** y **por materia × grado**, siempre anónimos.
- Las celdas con **menos de 5 alumnos** dicen **"muestra insuficiente"** en vez del número de desempeño (los conteos de volumen sí se muestran).
- Los temas top-N están marcados como **"aproximado"** (los nombres los escribe cada maestra, no son comparables entre colegios).
- **Prueba clave:** abrí las herramientas del navegador y mirá la respuesta de red. **No tiene que haber ni un nombre ni un id de alumno en ningún lado.**

### 8.11 Auditoría (`/admin/auditoria`)
**Esperado:** todo lo que hiciste en los pasos anteriores está registrado: quién, qué, sobre qué y cuándo. Buscá tu propia suspensión de maestra y el cambio de features.

### 8.12 Administradores (`/admin/config`) — solo super
- **Esperado:** el ítem del menú **solo aparece para el super**.
- Creá un **admin operativo**, cerrá sesión y entrá con él.
- **Esperado:** no ve "Administradores", y si intenta **archivar un colegio** recibe `requiere_super`.

### 8.13 Ver como maestra (`/admin/ver-como/[docenteId]`) ⭐
**Esperado:** ves lo que ve Ana, **en solo lectura**. Lo importante: **no se inicia sesión como ella** — seguís siendo vos. Verificalo en Auditoría: quedó registrado que la miraste.

### 8.14 Pantallas de visión
`/admin/capacitacion` y `/admin/exportaciones`: **"Próximamente"**, fuera del menú, linkeadas desde el Observatorio.

### 8.15 Job nocturno
Desde Alertas, tocá **"Recalcular ahora"**.
**Esperado:** recalcula el snapshot. Después verificá que el cron quedó agendado:
```sql
select jobname, schedule from cron.job;   -- admin-jobs-nocturno · 0 6 * * *
```

---

# BLOQUE E — Las secciones de golondrina

## Paso 9 — Transferencias, Instituciones, Licencias, ARCO y `/institucion`

El recorrido completo (generar pase → autorizar como familia desde el celular → recibir en la escuela nueva → el chico practica con su historia intacta → ARCO) está paso a paso en **`TESTEO_GOLONDRINA.md`, pasos 7 a 9**. Hacelo entero: es la parte con más superficie nueva.

Los cuatro momentos que no te podés saltear:
1. **El link de la familia en un celular real** (es la única pantalla pública del sistema).
2. **El corte inmediato**: la escuela vieja pierde el legajo vivo pero conserva sus boletines.
3. **La escuela nueva ve el recorrido completo** — el corazón de la fase.
4. **La cancelación ARCO** con un alumno descartable: dry-run → `BORRAR` → solo queda el resumen anónimo.

---

# BLOQUE F — Lo que tiene que fallar

Estas pruebas **pasan si el sistema te dice que no**.

| Prueba | Cómo | Esperado |
|---|---|---|
| Docente entrando al panel | Token de maestra contra `admin-colegios` | `no_admin` (403) |
| Operativo con poderes de super | Archivar colegio / gestionar admins | `requiere_super` (403) |
| Admin de institución en el panel de plataforma | Su sesión contra `/admin` | `no_admin` (403) — fail-closed |
| Institución espiando a otra | Forzar un colegio ajeno en `/institucion` | `fuera_de_tu_institucion` (403) |
| Desempeño de muestra chica | Colegio con menos de 5 chicos | "muestra insuficiente" |
| Feature apagada por URL directa | `/docente/luna` con LUNA off | El servidor corta |
| Trial vencido generando contenido | Publicar materia en solo lectura | Rebota con el mensaje del corte |
| Colegio suspendido | Login de alumno | No entra |
| Tope mensual excedido | Superar el límite de IA | `tope_excedido` (429) |
| Operativo borrando por ARCO | Confirmar cancelación | `requiere_super` (403) |
| Transferencia sin consentimiento | `update transferencia set estado='confirmada'` en SQL | La base lo rechaza (CHECK) |
| Cambiar el vínculo de un alumno a mano | `update perfil set escuela_id=...` | `vinculo_protegido` |
| Enumerar colegios sin sesión | `GET /rest/v1/escuela` anónimo | Sin datos |

---

# BLOQUE G — Que la app de siempre siga igual

**El gate más importante de todos.** Las tres fases tocaron las tablas de las que dependen las 7 policies que protegen datos de menores. Con todo aplicado, probá la app de siempre:

- Un **alumno entra** con código de aula + PIN, **practica**, y se le guarda el progreso en el mapa.
- La maestra ve **Mis alumnos**, "Lo de hoy" y la ficha de cada chico con su histórico.
- **Mis materias**: subir contenido, dividir en nodos, publicar (dispara el pool de ejercicios).
- **LUNA**: dashboard con alertas, chat, y un boletín generado y aprobado.
- Un alumno **no ve** datos de otro; una maestra **no ve** alumnos ajenos.

**Esperado:** cero diferencias con antes. Cualquier cambio acá es un bug introducido por estas fases.

---

## Si algo sale mal

- **Falla una migración:** frená, no apliques la siguiente. Las diez son aditivas y no dropean columnas existentes. `0018`–`0021` y `0023`–`0027` se revierten dropeando lo que crearon; para `0022`, sacar los triggers y la tabla deja el caché de `perfil` con los valores vigentes = estado idéntico al previo (documentado en ADR-011).
- **Un test de integración da 404:** esa función no está deployada.
- **El cron no corre:** faltan los secretos de Vault (paso 4), o se cargó una clave `sb_secret_` en vez del JWT legacy.
- **Una maestra quedó bloqueada sin razón:** mirá `select acceso_de('<id de la maestra>')` — te dice el veredicto y el motivo exacto (`colegio_suspendido`, `trial_vencido`, `licencia_vencida`, `cuenta_suspendida`).
- **Nunca se borra nada por falta de pago ni por vencimiento.** El peor estado posible es solo lectura.

---

## Resumen: el orden corto

```bash
npm test                            # 1 · 489 verdes
cd web && npx next build            # 2 · 33 rutas
# 3 · migraciones 0018→0027 + 5 consultas de verificación + 2 que deben fallar
# 4 · secretos del cron en Vault
# 5 · deploy de las 29 funciones
node scripts/seed-admin.mjs         # 6 · super-admin
node scripts/seed.mjs && node scripts/seed-actividad.mjs && node scripts/seed-golondrina.mjs
npm run test:db                     # 7 · 27 archivos, fail 0
# 8 · las 15 secciones del panel a mano (⭐ accesos, features, observatorio, ver-como)
# 9 · el ciclo golondrina (TESTEO_GOLONDRINA.md pasos 7–9)
# 10 · las que tienen que fallar
# 11 · regresión: la app de siempre, igual que antes
```
