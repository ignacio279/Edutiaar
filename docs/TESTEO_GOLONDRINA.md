# Guía de testeo — Fase "Alumno golondrina"

> Detalle fino de la fase golondrina. Para probar **el dashboard completo**
> (Admin v3 + Observatorio + esta fase) empezá por `TESTEO_DASHBOARD.md`, que
> ordena las tres fases juntas y remite acá para los pasos 7 a 9.
>
> Cómo verificar, paso a paso, que todo lo de esta fase funciona.
> Cada paso dice **qué se testea**, **cómo** y **qué tiene que pasar**.
> Si un paso falla, no sigas al siguiente: los de abajo dependen de los de arriba.

## Punto de partida (leer antes de empezar)

Todo esto está **escrito y commiteado en la branch `claude/admin-dashboard-v3-ououe8`, pero NADA está aplicado todavía en Supabase ni deployado**. O sea:

| | Estado |
|---|---|
| Código (migraciones, funciones, front) | ✅ commiteado y pusheado |
| 489 tests unitarios | ✅ corridos y verdes |
| Migraciones 0022–0027 en la base real | ❌ **sin aplicar** |
| 6 Edge Functions nuevas + 3 modificadas | ❌ **sin deployar** |
| 72 tests de integración | ❌ **escritos pero nunca corridos** contra la DB real |
| Front en Vercel | ❌ la branch no está mergeada |

Por eso los pasos 1 y 2 son gratis y locales, y del 3 en adelante hay que aplicar cosas. **Recomendación: hacé el paso 3 (migraciones) en un proyecto de prueba antes que en producción**, o al menos con la certeza de que podés restaurar un backup.

Envs que vas a necesitar (las mismas de siempre):
```bash
export SUPABASE_URL=https://<proyecto>.supabase.co
export SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Paso 1 — Tests unitarios (2 minutos, sin tocar nada)

**Qué testea:** toda la lógica pura — la máquina de estados del alumno, el lockout del link público, el k-anonimato del panel institucional, el XOR de licencias, que el resumen anónimo de ARCO no lleve nombres ni identificadores, y que las reglas duras estén escritas en el SQL (los tests leen el texto de las migraciones y lo verifican).

**Cómo:**
```bash
cd /home/user/Edutiaar
npm test
```

**Qué tiene que pasar:**
```
# tests 489
# pass 489
# fail 0
```

Si da menos de 489 o algún `not ok`, pará acá: hay algo roto en el código, no en la infraestructura.

---

## Paso 2 — Build del front (2 minutos, sin tocar nada)

**Qué testea:** que las 7 pantallas nuevas compilan, que los tipos cierran contra los contratos de las Edge Functions y que no hay imports rotos.

**Cómo:**
```bash
cd web
NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
npx next build
```

**Qué tiene que pasar:** `✓ Compiled successfully` y en el listado de rutas tienen que aparecer:
`/transferir/[id]` · `/docente/transferencias` · `/admin/transferencias` · `/admin/arco` · `/admin/instituciones` · `/admin/licencias` · `/institucion` · `/institucion/login`

---

## Paso 3 — Migraciones 0022 → 0027 (el paso más delicado)

**Qué testea:** que el modelo nuevo se instala sobre los datos que YA existen sin romper nada. El backfill le crea una matrícula a cada alumno actual, y las columnas viejas de `perfil` pasan a ser un caché mantenido por trigger.

**Cómo:** aplicalas **en orden**, una por una (por MCP de Supabase o `supabase db push`):

```
0022_matricula_estado_alumno.sql
0023_consentimiento_transferencia.sql
0024_arco.sql
0025_instituciones.sql
0026_licencias.sql
0027_transferencia_lockout.sql
```

**Qué tiene que pasar:** las seis aplican sin error. Si alguna falla, **no sigas** — anotá el mensaje y frená.

**Verificación obligatoria (las tres consultas tienen que dar 0):**

```sql
-- (a) El caché de perfil coincide EXACTO con la matrícula activa.
select count(*) from perfil p
join matricula m on m.alumno_id = p.id and m.fecha_fin is null
where p.escuela_id is distinct from m.escuela_id
   or p.aula_id    is distinct from m.aula_id
   or p.docente_id is distinct from m.docente_id
   or p.grado      is distinct from m.grado;

-- (b) Ningún alumno con colegio quedó sin matrícula activa.
select count(*) from perfil
where rol = 'alumno' and escuela_id is not null
  and not exists (select 1 from matricula m
                  where m.alumno_id = perfil.id and m.fecha_fin is null);

-- (c) Todo colegio existente recibió su licencia.
select count(*) from escuela e
where not exists (select 1 from licencia l where l.escuela_id = e.id);
```

**Si (a) o (b) dan distinto de 0:** el backfill no cubrió algún caso. No sigas; hay que revisar esos alumnos a mano.

**Prueba rápida de que el candado funciona** (esto tiene que **FALLAR**):
```sql
update perfil set grado = 7 where rol = 'alumno' limit 1;
```
**Esperado:** error `vinculo_protegido: el vínculo y el estado del alumno se cambian solo vía matrícula`. Si el update pasa, el trigger `perfil_guard` no quedó instalado y **hay que frenar todo**.

---

## Paso 4 — Deploy de las Edge Functions

**Qué testea:** que las funciones suben y arrancan.

**Cómo:** deployá las **9** (las 6 nuevas y las 3 modificadas; cualquier deploy sube `_shared/` completo, pero cada función necesita su propio deploy para tomar su código):

Nuevas: `gestion-transferencias`, `transferencia-confirmar`, `gestion-consentimientos`, `admin-arco`, `admin-instituciones`, `institucion-panel`
Modificadas: `gestion-alumnos`, `admin-jobs`, `admin-observatorio`

```bash
supabase functions deploy <nombre> --use-api
```

**Ojo con `transferencia-confirmar`:** es la única pública (`verify_jwt = false`, ya declarado en `config.toml`). Si queda con JWT obligatorio, la familia nunca va a poder abrir el link.

**Verificación rápida:**
```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/transferencia-confirmar" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"accion":"ver","transferencia_id":"00000000-0000-0000-0000-000000000000","token":"x"}'
```
**Esperado:** `{"error":"token_invalido"}` con status 403. Que responda *eso* prueba dos cosas: que la función está viva y que **no filtra** si la transferencia existe o no.

---

## Paso 5 — Tests de integración contra la base real (~3 minutos)

**Qué testea:** todo el sistema de punta a punta contra la DB y las funciones reales. Es el paso que más valor da: 72 tests que verifican lo que ninguna prueba manual cubre bien.

**Cómo:**
```bash
cd /home/user/Edutiaar
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:db
```

**Qué tiene que pasar:** `# fail 0`. Los tests son idempotentes: crean y borran sus propios datos, no tocan la data semilla.

**Los cuatro archivos nuevos y qué prueban:**

| Archivo | Verifica |
|---|---|
| `matricula.test.mjs` | Ciclo de vida completo: abrir → cerrar → el colegio pierde el legajo vivo pero conserva sus boletines → reabrir con consentimiento → el colegio nuevo ve la historia completa → baja ARCO es terminal. Más `perfil_guard`. |
| `golondrina.test.mjs` | Transferencia por link (hash en la DB, un solo uso, mismo error para token malo e id inexistente), lockout de 5 intentos, el CHECK que impide confirmar sin consentimiento, `expirar_transferencias`, cancelación ARCO completa, cruce entre instituciones, ciclo de licencias. |
| `matriz-permisos.test.mjs` | La matriz rol × endpoint: quién puede qué, en un solo assert legible. |
| Los 20 archivos ya existentes | **Que nada de lo viejo se rompió.** Este es el gate real de la fase. |

**Si falla algo:** el mensaje incluye el body de la respuesta. Un `404` en un test que pega a una función significa que esa función no está deployada (volvé al paso 4).

---

## Paso 6 — Seed de demo (opcional pero muy recomendado)

**Qué testea:** que el modelo aguanta un caso realista, y te deja datos para probar a mano.

**Cómo:**
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-golondrina.mjs
```

**Qué tiene que pasar:** crea la Fundación Semillas con dos colegios y un pool de 3 cupos, a **Wanda** (con historial en los dos colegios), a **Simón** (en tránsito, con un pase pendiente) y un caso ARCO ya ejecutado. **Anotá el link de demo que imprime al final** — lo vas a usar en el paso 7.

Credenciales que deja: `irma@edutia.ar` / `edutia123` (colegio origen), `nora@edutia.ar` / `edutia123` (destino), `coordinacion@semillas.org.ar` / `semillas123` (panel institucional).

---

## Paso 7 — El ciclo completo, a mano (lo que hay que ver con los ojos)

Esta es la historia real del feature. Hacela entera, en este orden.

### 7.1 La maestra genera el pase
Entrá como **Irma** → **Pases** → "Generar un pase" → elegí un alumno suyo y un colegio destino → **Generar**.

**Esperado:** aparece un link con botón "Copiar" y el aviso de que no se vuelve a ver. En "Mis pases" queda una fila con el chip naranja **"Esperando a la familia"** y "Vence en 14 días".

### 7.2 La familia autoriza (abrilo en el celular)
Pegá el link en un teléfono, **sin sesión iniciada** (o en ventana incógnito).

**Esperado:** una pantalla simple que dice *"Wanda pasa de El Chañar a Los Álamos"*, con la promesa de que nada se borra, y pide solo tu nombre y el vínculo. **No tiene que mostrar nada del legajo del chico.** Al autorizar: pantalla de agradecimiento explicando que la maestra nueva le va a dar un código nuevo.

### 7.3 El corte es inmediato
Volvé a entrar como **Irma**.

**Esperado:**
- El chico **ya no aparece** en Mi clase.
- En su ficha ya no ve el legajo vivo.
- **Pero sus boletines emitidos siguen ahí** (LUNA → Boletines). Eso es a propósito: es el archivo institucional de la maestra que los escribió.

### 7.4 La escuela nueva lo recibe
Entrá como **Nora** → **Pases** → **Llegadas**.

**Esperado:** el chico aparece esperando. Al "Sumar a mi clase" pide aula, grado y PIN nuevo. Después de activarlo:
- Aparece en Mi clase.
- En su ficha, la sección **"Su recorrido"** muestra **las dos escuelas** con sus fechas y el motivo de cierre de la primera ("Se mudó").
- **Lo más importante:** el mapa de nodos del chico conserva su progreso anterior. Ese es el corazón de la fase.

### 7.5 El chico entra con su código nuevo
Login de alumno con el código del aula nueva y el PIN que le puso Nora.

**Esperado:** entra normal. **El código del aula vieja ya NO le funciona** (el cierre de matrícula le revocó la credencial). Probá los dos.

### 7.6 El link no se reusa
Abrí de nuevo el mismo link del paso 7.2.

**Esperado:** *"Este pase ya se resolvió."* Un solo uso.

### 7.7 El link se bancó el ataque
Con un pase pendiente (podés generar otro), tocá el link cambiándole el token del final por cualquier cosa, **cinco veces**.

**Esperado:** las cinco dicen "Este link no sirve". A la sexta —**incluso con el token correcto**— dice que esperes quince minutos.

---

## Paso 8 — Las cosas que TIENEN que fallar (seguridad)

Estas pruebas pasan si el sistema **te dice que no**.

| Prueba | Cómo | Esperado |
|---|---|---|
| Un colegio no ve chicos de otro | Como Irma, buscá al chico ya transferido | No aparece en ningún lado |
| El admin de institución no ve chicos | Entrá a `/institucion` con `coordinacion@semillas.org.ar` | Solo números. **Ningún nombre de alumno en ninguna pantalla** |
| No puede espiar otra institución | Desde ese panel, forzá un colegio ajeno | `fuera_de_tu_institucion` (403) |
| No es admin de plataforma | Con esa misma sesión, entrá a `/admin` | Rebotado: `no_admin` |
| Muestra chica no revela desempeño | Mirá un colegio con menos de 5 chicos | **"Muestra chica: no se muestra"** |
| El operativo no borra | Como admin **operativo**, intentá confirmar una cancelación ARCO | `requiere_super` (403) |
| No hay transferencia sin consentimiento | En SQL: `update transferencia set estado='confirmada' where ...` | La base lo rechaza por CHECK |

---

## Paso 9 — ARCO: el único borrado real (hacelo con un alumno de prueba)

**Creá un alumno descartable, dale un poco de actividad, y recién ahí probá esto.**

En `/admin/arco`, con el identificador de ese alumno:

1. **Exportar** → tiene que traer el legajo completo. Probá "Bajar JSON" y "Versión imprimible" (`Ctrl+P` para ver cómo queda en papel).
2. **Oposición** → "Excluir de los agregados". Verificá después en el Observatorio que ese chico ya no suma.
3. **Cancelación paso 1** → "Ver qué se borraría". **Esperado:** el listado con las cantidades reales (*"41 sesiones de práctica, 2 boletines…"*) y que **todavía no se borró nada** (comprobalo en la base).
4. **Cancelación paso 2** → escribí `BORRAR` y confirmá **como super-admin**.

**Esperado al final:**
- El alumno no existe más: ni perfil, ni sesiones, ni respuestas, ni matrículas, ni boletines.
- **Sobrevive el caso ARCO** con su resumen anónimo (cantidades, grado, provincia, rango de fechas — **sin nombre ni identificadores**) y la auditoría completa.

Verificalo en SQL:
```sql
select agregado from arco_caso where estado = 'ejecutado' order by ejecutado_at desc limit 1;
```
**Esperado:** un JSON con números y provincia, **sin un solo nombre ni UUID**.

---

## Paso 10 — Que lo viejo siga andando (regresión)

Lo más importante de todo: esta fase tocó la tabla que usan las 7 policies de seguridad. Probá que la app de siempre sigue igual:

- Un alumno entra y **practica** → se le guarda el progreso.
- La maestra ve **Mis alumnos** y la ficha de cada uno.
- **LUNA** responde en el chat y genera un boletín.
- El **panel admin** muestra métricas, costos y observatorio como antes.
- Un colegio en **solo lectura** (licencia vencida) sigue viendo todo pero no genera contenido nuevo.

**Esperado:** cero diferencias con antes de la fase. Si algo cambió acá, es un bug de esta fase.

---

## Si algo sale mal

- **Falla una migración:** frená. No apliques la siguiente. Las seis son aditivas y no dropean ninguna columna existente, así que revertir 0023–0027 es dropear lo que crearon; para 0022 el `down` está documentado en ADR-011 (al sacar los triggers y la tabla, el caché de `perfil` queda con los valores vigentes = estado idéntico al de antes).
- **Falla un test de integración:** el mensaje trae el body de la respuesta. Un 404 = función sin deployar.
- **Un chico quedó sin poder entrar:** revisá que tenga matrícula activa (`select * from matricula where alumno_id = ... and fecha_fin is null`) y que la maestra le haya puesto PIN nuevo.
- **Nada por falta de pago se borra jamás.** Si un colegio quedó bloqueado, es estado de licencia: se arregla desde `/admin/licencias`, sin tocar datos.

---

## Resumen: el orden corto

```bash
npm test                      # 1 · 489 verdes
cd web && npx next build      # 2 · compila
# 3 · aplicar 0022→0027 + las 3 consultas de verificación (tienen que dar 0)
# 4 · deployar las 9 funciones
npm run test:db               # 5 · 72 tests, fail 0
node scripts/seed-golondrina.mjs   # 6 · datos de demo
# 7 · el ciclo a mano: generar → autorizar → recibir → practicar
# 8 · las que tienen que fallar
# 9 · ARCO con un alumno descartable
# 10 · regresión de lo viejo
```
