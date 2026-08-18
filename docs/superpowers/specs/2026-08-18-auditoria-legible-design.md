# Auditoría legible — diseño

**Fecha:** 2026-08-18
**Estado:** aprobado, listo para implementar
**Alcance:** `/admin/auditoria` (pantalla) + `admin-auditoria` (Edge Function) + un módulo nuevo de lógica pura.
**No toca:** la tabla `auditoria`, los ~65 `registrarAuditoria` de las 13 Edge Functions que escriben, ni los feeds de Inicio / Uso / Notas.

---

## 1. Problema

La pantalla de auditoría muestra el log crudo: una fila por registro, con el slug técnico de la acción (`nap_revision_fijar`, `set_features`, `cambiar_estado_colegio`) y el `detalle` jsonb sin procesar. Tres consecuencias:

1. **No se lee.** Para saber qué pasó hay que traducir mentalmente el slug y después leer un jsonb con uuids adentro.
2. **Lo importante se ahoga.** `nap_revision_fijar` emite una fila por nodo revisado y `atender_alerta` una por click de "Listo ✓". Un borrado ARCO —el único borrado físico de todo el sistema— aparece con el mismo peso visual que marcar una alerta como vista.
3. **La cadena de un hecho está desarmada.** Un pase deja `transferencia_solicitada`, después `transferencia_confirmada` (o `transferencia_asistida`), y el consentimiento que lo autorizó vive en otra tabla que la auditoría nunca trae. La pregunta "¿quién autorizó este pase?" no se responde desde acá.

## 2. Qué se construye

Un feed de eventos con **titular en castellano**, filtrado por defecto a lo importante, donde **pases y casos ARCO se agrupan en un solo evento** que muestra su cadena completa —incluido quién autorizó— al expandirlo.

## 3. Decisiones

### D1 — El relato se arma al leer, no al escribir

Toda la clasificación y redacción vive en la capa de lectura. Ni columna nueva ni migración.

**Por qué:**

- **Funciona retroactivamente.** Los eventos ya registrados se clasifican y se redactan igual que los nuevos. Una columna `importancia` dejaría todo lo histórico sin clasificar para siempre.
- **Cero riesgo de regresión.** Los ~65 call sites en 13 Edge Functions no se tocan, así que no hay forma de romper una escritura de auditoría al mejorar su lectura.
- **El criterio es reversible.** Cambiar qué cuenta como importante es editar un archivo y correr los tests, no una migración sobre datos históricos.
- Un solo re-deploy: `admin-auditoria`.

**Costo aceptado:** el titular se recalcula en cada lectura. Es texto sobre a lo sumo 100 filas por página; irrelevante.

### D2 — Alumnos sin nombre, adultos con nombre

- **Alumnos: identificador corto** (`alumno a3f2…9c4c`), nunca el nombre. Mantiene intacta la regla vigente de que el admin de plataforma no ve a un chico; Pases y ARCO ya piden el identificador que trae la escuela.
- **Colegios, maestras, instituciones y admins: nombre real.** Son adultos, son parte de la operación y los da de alta el propio admin.
- **El adulto que autoriza un pase: nombre y vínculo completos** (`autorizó María González (madre), por link`). Firmó un consentimiento sabiendo que quedaba registrado —ese es el propósito de la tabla `consentimiento`. Sin el nombre, el registro no prueba nada y la auditoría no sirve para responder un reclamo.

Dos candados, no uno: `alumno_id` queda fuera de las claves de `detalle` que la función escanea para resolver nombres, **y** la consulta de perfiles filtra por `rol = 'docente'`. Aunque un id de chico se colara en el escaneo, no resolvería a un nombre.

Nota factual: el feed de actividad de Inicio ya muestra nombres de pila de alumnos (`EventoFeed`, Regla 5). La auditoría es otra superficie y adopta el criterio más estricto a propósito.

### D3 — Se registra todo; el feed filtra

Ninguna acción deja de auditarse. La pantalla muestra por defecto las **clave** y esconde las **rutina** detrás de un toggle "ver también lo rutinario".

Una auditoría que deja de registrar deja de ser auditoría: el día que haga falta saber quién tocó algo rutinario, el dato tiene que existir. Filtrar la vista cuesta lo mismo que no registrar, y es reversible.

### D4 — Default de una acción desconocida: **clave**

Una acción que no está en la tabla de clasificación se muestra en el feed y se redacta con su slug crudo más la entidad. Falla hacia lo visible, nunca hacia el silencio.

Mismo criterio que el `tipo` sin CHECK de `admin_alerta`: agregar una acción no debe exigir tocar este archivo, y si nadie lo toca, el peor caso es que se vea de más.

### D5 — Se agrupa solo donde hay cadena real

| Entidad | Agrupa | Por qué |
|---|---|---|
| `transferencia` | Sí | solicitada → autorizada → confirmada es una cadena que puede durar días |
| `arco_caso` | Sí | solicitada → ejecutada o rechazada, con revisión humana en el medio |
| Todo lo demás | No | son actos únicos; agruparlos sería inventar estructura que no existe |

**Clave de agrupación:** `entidad + entidad_id`.

**La fila se fecha por el último hecho de la cadena.** El feed responde "qué pasó recién", no "qué empezó recién". El cursor de paginado sigue siendo el `created_at` del registro crudo, así el paginado no cambia.

**Se agrupa sobre lo que está cargado en pantalla.** `armarFeed` corre sobre el acumulado de todas las páginas traídas, así que una cadena partida entre dos páginas se une sola al tocar "Cargar más". Lo que nunca se trajo queda huérfano y se muestra como fila propia con su titular. La alternativa —paginar por cadena— rompería el cursor por un caso de borde.

### D6 — Verrugas de los datos existentes, documentadas y no tocadas

Tres inconsistencias en cómo se escribe la auditoría hoy. Ninguna se corrige acá: arreglarlas exige tocar y re-deployar funciones que ya están en producción, y la capa de lectura las absorbe sin problema.

1. **`alumno_transferido_activado` guarda `entidad: 'transferencia'` pero `entidad_id` = el id de la *matrícula*.** No agrupa con el resto de la cadena del pase. Se muestra como fila propia con titular propio ("activó al alumno … en su aula nueva"), que es información verdadera y útil igual.
2. **`transferencia_confirmada` no tiene actor humano:** `actor_id` es el uuid de ceros, sin `actor_email` ni `nivel` (el adulto que confirma por link no tiene cuenta). Se renderiza como "la familia" y **nunca** como una persona con email.
3. **`detalle` es inconsistente:** `borrar_maestra` guarda `nombre`, casi todo lo demás guarda solo uuids. La resolución de nombres cubre ambos casos; cuando un nombre no se puede resolver (registro ya borrado), se cae al id corto.

### D7 — El filtro clave/rutina se aplica en la query

`admin-auditoria` recibe `solo_clave` y excluye las acciones rutinarias con un `not in`. Si el filtro viviera solo en el cliente, una página de 50 registros llena de `nap_revision_fijar` llegaría entera para mostrarse vacía.

El costo es una **copia espejo** de la lista de rutinarias en `supabase/functions/_shared/auditoria-clasificacion.ts`, congelada por un test de paridad contra `web/lib/admin/auditoria-relato.ts`. Mismo patrón que `planes.ts` y `provincias.ts`. Si las dos copias se despegan, el toggle miente: el front mostraría como "todo" algo que el server ya filtró.

Consecuencia en la pantalla: prender o apagar el toggle **rearranca la lista desde la primera página**, porque cambia la query.

### D8 — Seis acciones que no escribe `registrarAuditoria`

Aparecieron mirando la tabla real, no el código: las escriben **triggers y RPCs de la base**, así que no salen de grepear las Edge Functions. Entre ellas estaba la acción **más frecuente de todas**.

| Acción | Filas | Entidad | Decisión |
|---|---|---|---|
| `matricula_abierta` | 67 | `matricula` | **rutina** |
| `matricula_cerrada` | 5 | `matricula` | **rutina** |
| `alumno_transicion` | 9 | `perfil` (id del ALUMNO) | clave · chicos |
| `arco_oposicion` | 2 | `perfil` (id del ALUMNO) | clave · chicos |
| `docente_creado` | 1 | `perfil` | clave · maestras |
| `reactivar_maestra` | 1 | `perfil` | clave · maestras |

**Por qué `matricula_*` es rutina:** dispara en el mismo instante que un `alumno_transicion` que cuenta el mismo hecho mejor (con `de`, `a` y `motivo`). Mostrar las dos duplicaría cada inscripción. El resultado sobre los datos reales: el filtro saca 92 de 175 filas.

**`reactivar_maestra`, no `activar_maestra`.** El slug se había inferido de `accion: \`${accion}_maestra\`` en `admin-maestras`; el valor real de `accion` es `reactivar`. Quedan clasificados los dos.

**Refuerza D2:** `alumno_transicion` y `arco_oposicion` guardan el id del alumno en `entidad_id` con `entidad = 'perfil'`. Sin el filtro `rol = 'docente'` al resolver perfiles, esos ids habrían resuelto al nombre del chico. El segundo candado no era redundante.

**Y corrige el actor:** el uuid de ceros aparece en cuatro acciones, no solo en el pase por link — es el centinela genérico de "sin actor humano". Solo en `transferencia_confirmada` significa "la familia"; en el resto, "el sistema". Los eventos de trigger sí traen un `actor_id` real sin email, así que `admin-auditoria` también lo resuelve: eso es lo que contesta "quién hizo el cambio" en esas filas.

## 4. Arquitectura

Dos piezas con una frontera clara: **la función trae datos, el módulo puro cuenta la historia.**

### `admin-auditoria` (Edge Function) — solo datos

No redacta ni clasifica nada. Sobre lo que ya hace hoy (query + filtros + cursor) agrega:

- **Resolución de nombres.** Junta los uuids que aparecen en `entidad_id` y en los campos conocidos de `detalle`, y devuelve un diccionario aparte: `{ escuelas: {id: nombre}, perfiles: {id: nombre}, instituciones: {id: nombre} }`. Un id que no resuelve simplemente no entra al diccionario.
- **Consentimiento de los pases.** Para los eventos con `entidad = 'transferencia'`, trae la `transferencia` y su `consentimiento` vinculado, y devuelve `{ transferencia_id: { adulto_nombre, adulto_vinculo, via, otorgado_at } }`.

Respuesta: `{ eventos, nombres, consentimientos, siguiente_cursor }`. Los `eventos` salen tal cual de la tabla —el jsonb crudo viaja intacto.

El guard no cambia: `verificarAdmin` sin exigir super, porque sigue siendo solo lectura.

### `web/lib/admin/auditoria-relato.ts` — puro, testeado

Sin imports de React ni de Supabase; se testea con `node --test` como el resto de la lógica del proyecto.

```
IMPORTANCIA: Record<accion, 'clave' | 'rutina'>   // la tabla del §5
CATEGORIA:   Record<accion, Categoria>            // para los chips
agruparCadenas(eventos) → ItemAuditoria[]         // colapsa transferencia y arco_caso
redactar(evento, nombres, consentimientos) → string   // el titular
```

Un `ItemAuditoria` es una fila del feed: o un evento suelto, o una cadena con sus pasos adentro y la fecha del último.

### Pantalla

**Se conserva:** filtros por entidad / acción / actor / rango de fechas, paginado por cursor con "Cargar más", y el `detalle` jsonb crudo siempre visible al fondo del evento expandido.

**Se agrega:** chips de categoría (Chicos · Maestras · Colegios · Acceso · Instituciones · Poder · Sistema) y el toggle "ver también lo rutinario".

- **Fila colapsada:** fecha relativa · pill de nivel · titular · pill de categoría.
- **Expandida:** actor (email y nivel), fecha absoluta, entidad + id, los pasos de la cadena si los hay, y el jsonb original al final.

## 5. Clasificación

**Clave** — se ve por defecto:

| Categoría | Acciones |
|---|---|
| Chicos | `transferencia_solicitada`, `transferencia_confirmada`, `transferencia_asistida`, `transferencia_denegada`, `alumno_transferido_activado`, `arco_acceso_exportado`, `arco_rectificacion`, `arco_cancelacion_solicitada`, `arco_cancelacion_ejecutada`, `arco_cancelacion_rechazada` |
| Maestras | `crear_maestra`, `borrar_maestra`, `reset_password_maestra`, `suspender_maestra`, `activar_maestra`, `reasignar_maestra` |
| Colegios | `crear_colegio`, `cambiar_estado_colegio` |
| Acceso | `crear_licencia`, `editar_licencia`, `asignar_cupo`, `quitar_cupo`, `set_trial`, `extender_trial`, `finalizar_trial`, `set_limites`, `set_features`, `aplicar_preset` |
| Instituciones | `crear_institucion`, `estado_institucion`, `crear_admin_institucion`, `suspender_admin_institucion`, `reactivar_admin_institucion`, `asignar_colegio_institucion`, `quitar_colegio_institucion` |
| Poder | `crear_admin`, `cambiar_nivel_admin`, `desactivar_admin`, `reactivar_admin`, `ver_como`, `crear_anuncio` |

**Rutina** — detrás del toggle:

`nap_revision_fijar`, `nap_backfill`, `recalcular_alertas`, `job_nocturno`, `atender_alerta`, `crear_nota`, `borrar_nota`, `editar_contacto`, `editar_colegio`, `editar_institucion`, `editar_anuncio`, `activar_anuncio`, `desactivar_anuncio`, `borrar_anuncio`.

`crear_anuncio` es clave porque le habla a todas las maestras de la plataforma; editarlo o borrarlo, no.

## 6. Titulares

```
Confirmó el pase del alumno a3f2…9c4c de Cerro Azul a San Martín
Ejecutó la cancelación ARCO del alumno 9b71…66e0 — borrado físico
Exportó el legajo del alumno 9b71…66e0
Suspendió el colegio Cerro Azul
Reseteó la contraseña de Marta Suárez (Cerro Azul)
Entró a ver como Marta Suárez (Cerro Azul)
Extendió la licencia de Cerro Azul 30 días — hasta el 15/09
Apagó LUNA en Cerro Azul
Publicó el anuncio "Mantenimiento el martes" para todos los colegios
```

Cadena de un pase, expandida:

```
Pase del alumno a3f2…9c4c · Cerro Azul → San Martín        autorizado · 14/08
   12/08 14:20   Marta Suárez (docente) solicitó el pase
   14/08 09:05   Autorizó María González (madre), por link
   14/08 09:05   La familia confirmó el pase
```

**Fallback:** una acción sin redactor muestra `<slug> · <entidad>`. Nunca se rompe la pantalla y nunca se oculta un evento por no saber cómo escribirlo.

## 7. Tests

**Unitarios** (`tests/unit/admin-auditoria-relato.test.mjs`), sobre el módulo puro:

- clasificación clave / rutina de cada acción de la tabla del §5
- **paridad** entre la lista de rutinarias del front y la del server (D7)
- acción desconocida → clave, y titular con el slug crudo
- un titular por familia de acción, con nombres resueltos y sin resolver
- que ningún titular contenga el nombre de un alumno (test estructural, espeja el de anonimato del observatorio)
- agrupación: cadena completa de pase, cadena de ARCO, cadena partida entre páginas, `alumno_transferido_activado` queda suelto
- la cadena se fecha por su último hecho
- `transferencia_confirmada` se redacta como "la familia", nunca como persona

**Integración** (`tests/integration/admin-auditoria.test.mjs`):

- `admin-auditoria` devuelve `nombres` y `consentimientos` poblados
- nivel operativo puede leer
- `auditoria` sigue sin ser accesible por PostgREST con anon ni con el token de un admin

## 8. Fuera de alcance

- Corregir las verrugas de D6 (exige re-deployar funciones en producción por un problema cosmético).
- Tocar los feeds de Inicio, Uso y Notas: no duplican la auditoría, son actividad del producto y notas CRM.
- Exportar la auditoría a CSV.
- Retención o archivado de eventos viejos.
