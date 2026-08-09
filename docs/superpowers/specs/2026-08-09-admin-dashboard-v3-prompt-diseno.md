# Prompt de diseño — Panel de Administración EDUTIA (v3)

> Para pegar en Claude Design. Cubre todo lo implementado en la rama
> `claude/admin-dashboard-v3-ououe8` + las secciones de visión del HTML de
> propuesta (observatorio, capacitación, exportaciones).

---

Quiero que diseñes **todas las pantallas del Panel de Administración de EDUTIA**, una plataforma educativa para escuelas rurales de Argentina. Leé primero todo el contexto y después diseñá pantalla por pantalla. Todo el texto de la UI va en **español rioplatense** (vos, tené, elegí).

## 1. QUÉ ES ESTO

EDUTIA es una plataforma donde chicos de primaria rural practican con SOL (un copiloto de IA que genera ejercicios) y las maestras tienen a LUNA (copiloto que analiza el aula, escribe boletines y responde consultas 24/7). Hay un tercer copiloto futuro, TERRA (familias), que todavía no existe.

El **Panel de Administración** es el centro de control del OPERADOR de la plataforma (una o dos personas, no las maestras). Vive en una URL aparte (`/admin`), con login propio, sin ningún link desde la app de maestras y alumnos. Desde acá el operador:

1. **Da de alta colegios a mano** (no hay auto-registro; cada colegio tiene estado: prueba / activo / suspendido / archivado — todo el acceso cuelga de ese estado).
2. **Crea las cuentas de las maestras** (con un link de invitación + contraseña temporal que se muestra UNA sola vez), las suspende, les resetea la contraseña, las reasigna de colegio.
3. **Administra períodos de prueba** con corte SUAVE: al vencer, el colegio pasa a solo-lectura (ven todo lo suyo, no generan nada nuevo). Extensión de un click ("+30 días"). Topes mensuales de uso de IA por colegio.
4. **Prende y apaga features por colegio**: SOL / LUNA / TERRA, con sub-features dentro de LUNA (alertas, boletines, chat). Planes preset: Básico (solo SOL), Docente (SOL+LUNA), Completo (todo), o custom. Lo apagado desaparece de la app de la maestra al instante.
5. **Ve métricas**: adopción (colegios/maestras/alumnos activos), uso (ejercicios, boletines generados vs aprobados sin editar, chats), funnel de onboarding por colegio (creado → maestras invitadas → primera actividad → primer boletín aprobado), comparativa entre colegios, feed de actividad en vivo.
6. **Ve costos y salud técnica**: costo de la API de IA por colegio y por feature (tokens y dólares), latencia p50/p95, tasa de errores, rachas de fallos.
7. **Lleva la relación con cada colegio (CRM-lite)**: notas internas (contacto, acuerdos, historial) y alertas del operador (prueba por vencer, colegio inactivo, costo disparado) con botón "Listo ✓" que las archiva para siempre.
8. **Manda anuncios** a las maestras (banner dentro de la app de ellas), globales o por colegio, con vigencia por fechas.
9. **Seguridad**: dos niveles de admin (super y operativo — el operativo no puede archivar colegios ni gestionar admins), log de auditoría de TODA mutación (quién hizo qué y cuándo), y "Ver como maestra": una vista de SOLO LECTURA de lo que ve una maestra, para soporte remoto, que jamás inicia sesión como ella y queda auditada.

Además hay **tres módulos de visión futura** que quiero diseñados como pantallas "próximamente" o de concepto (existen en la propuesta comercial pero no están construidos): un **Observatorio educativo** (mapa de aprendizaje por zona, tendencias por tema, siempre agregado y anónimo, pensado para ministerios), **Capacitación docente** (cursos y recursos para maestras) y **Exportaciones para el ministerio** (reportes agregados descargables).

## 2. IDENTIDAD VISUAL (respetarla al pie de la letra)

El panel comparte el ADN cálido de la app pero con su propio acento **azul petróleo** (la app de los chicos usa naranja, la sección LUNA usa violeta; el admin es petróleo — serio pero no frío ni corporativo oscuro).

**Paleta:**
- Fondo de página: `#FBF4E6` (crema cálido)
- Tarjetas: `#FFFCF5` con borde 2px `#EFE3CE`, radio 22px, sombra suave `rgba(120,90,40,.06)`
- Acento petróleo: base `#3E7C8A` (botones primarios, texto blanco encima), oscuro `#2F6172` (títulos de sección), claro `#E3EEF4` (chips, ítem activo del sidebar), borde `#C9DEE7`, fondo suave `#EDF4F7`
- Texto: tinta `#3A332A`, secundario `#7A6F5F`
- Semáforo: éxito verde `#7FB069` sobre `#E6F0DC`; aviso naranja `#F4A93B` / fondo `#FBEFD9` / texto `#8A6215`; peligro rojo cálido `#BB4F3F` / borde `#E8C9C2` (solo destructivo y errores reales)
- Pills de estado (fondo/texto/label): Prueba = naranja "Prueba" · Activo = verde "Activo" · Suspendido = rojo "Suspendido" · Archivado = gris cálido "Archivado"

**Tipografías:** Baloo 2 (títulos grandes, redondeada y amable), Quicksand 700 (labels, botones, chips), Nunito (cuerpo). Nada de tipografías corporativas frías.

**Lenguaje visual:** tarjetas grandes redondeadas, chips pill (radio 999), grillas de tiles `minmax(180px, 1fr)`, mucho aire, cero tablas densas estilo ERP. Es un back-office pero con la calidez de una plataforma para escuelas rurales: profesional, no burocrático. Copys cálidos incluso en errores ("Todo tranquilo por acá ✨" cuando no hay alertas).

## 3. ESTRUCTURA DE NAVEGACIÓN

**Layout general:** sidebar fijo a la izquierda (236px, fondo tarjeta, borde derecho cálido) + contenido a la derecha. En el tope del sidebar: logotipo (cuadradito petróleo con "E" + "EDUTIA / ADMINISTRACIÓN" en chiquito). Abajo del todo: "Cerrar sesión".

**Ítems del sidebar (en este orden):**
1. Inicio (`/admin`)
2. Colegios (`/admin/colegios`)
3. Maestras (`/admin/maestras`)
4. Métricas (`/admin/metricas`)
5. Costos y salud (`/admin/costos`)
6. Alertas (`/admin/alertas`)
7. Anuncios (`/admin/anuncios`)
8. Auditoría (`/admin/auditoria`)
9. Administradores (`/admin/config`) — **solo visible para el super-admin**

El ítem activo es un pill con fondo `#E3EEF4` y texto petróleo oscuro; los demás son texto secundario con hover.

**Ficha de colegio** (`/admin/colegios/[id]`): debajo del header, una fila de tabs pill: **Resumen · Maestras · Accesos · Features · Notas · Uso · Costos**. Cada tab es una pantalla propia.

## 4. PANTALLAS (diseñá todas)

### 4.1 Login (`/admin/login`)
Página centrada, tarjeta única (max 392px): logo E petróleo, título "Administración", subtítulo "Panel de operación de EDUTIA", campos Email y Contraseña, botón primario petróleo "Entrar". Error único y genérico: "Credenciales inválidas." (nunca revela si el email existe). Sin registro, sin "olvidé mi contraseña".

### 4.2 Inicio / Home (`/admin`)
La foto del día de la plataforma:
- Saludo + fecha.
- 4 tiles de stat (grilla): **Colegios activos · Maestras activas (7 días) · Alumnos activos (7 días) · Sesiones de hoy**. Cada tile: número grande Baloo, label chiquito, línea de detalle opcional.
- Dos columnas debajo:
  - **Feed de actividad en vivo** (se refresca solo cada 30 s): lista de eventos con fecha relativa ("hace 2 h") — "Mateo practicó Sustantivos en Cerro Azul", "Boletín aprobado", "Colegio nuevo: Escuela 12".
  - **Widget de alertas del operador**: las 3-4 más importantes con link a la pantalla de Alertas. Vacío: "Sin alertas".
- CTA secundaria "Ver métricas".

### 4.3 Colegios (`/admin/colegios`)
- Header: título + botón primario "**+ Nuevo colegio**".
- Filtros: select de estado (Todos/Prueba/Activo/Suspendido/Archivado) + búsqueda por nombre.
- Lista de tarjetas-fila: nombre del colegio, zona, chip de tipo (Rural/Unidocente/Plurigrado), pill de estado, contadores (maestras · aulas · alumnos), y si está en prueba, "vence en N días". Click → ficha.
- Modal "Nuevo colegio": nombre, zona, tipo (select). Al crear nace en **Prueba con 30 días** y navega a la ficha.
- Estado vacío cálido ("Todavía no hay colegios. Creá el primero.").

### 4.4 Ficha de colegio — Resumen (`/admin/colegios/[id]`)
- Header: nombre grande + pills (estado, plan) + acciones de estado según el caso: **Activar** (primario), **Suspender** y **Archivar** (peligro). Suspender y Archivar abren un modal de confirmación donde hay que **tipear el nombre exacto del colegio** para habilitar el botón rojo. Archivar solo lo ve el super-admin.
- Tabs (Resumen activa).
- Grilla de stats: maestras, aulas, alumnos, sesiones últimos 30 días.
- Tarjeta de datos editables: nombre, zona, tipo.
- Tarjeta de prueba: fechas, countdown, acceso rápido a la tab Accesos.

### 4.5 Ficha — Maestras (`/admin/colegios/[id]/maestras`) y Maestras global (`/admin/maestras`)
Mismo diseño; la global suma columna de colegio y búsqueda por nombre/email.
- Filas: nombre, email, pill de estado (Activa/Suspendida), chip de prueba propia si tiene, aulas y alumnos.
- Acciones por fila: **Reset contraseña** (abre modal con el link nuevo + botón Copiar), **Suspender/Reactivar**, **Ver como** (→ pantalla Ver como maestra), **Eliminar** (solo super, solo si no tiene alumnos, confirmación tipeando el nombre).
- Botón "**+ Nueva maestra**": modal con email, nombre y colegio (en la ficha, el colegio ya viene fijo). Al crear: **modal de éxito** con dos campos copiables — link de invitación y contraseña temporal — con botones "Copiar" y el aviso destacado "**Guardá estos datos ahora: no se vuelven a mostrar**".

### 4.6 Ficha — Accesos (`/admin/colegios/[id]/accesos`)
Tres tarjetas:
1. **Período de prueba**: fechas inicio/fin editables, countdown grande ("Vence en 12 días" / "Venció hace 3 días" en aviso), botones "**+30 días**" (primario, un click) y "Finalizar prueba (activar)".
2. **Topes mensuales de IA**: tres inputs numéricos (Generaciones de SOL / Boletines / Chats) con placeholder = valor por defecto; vacío = volver al default. Botón Guardar.
3. **Consumo del mes**: barras horizontales por feature (usado / tope), petróleo normal, rojas al pasar el 90%.

### 4.7 Ficha — Features (`/admin/colegios/[id]/features`)
- Tres tarjetas de plan seleccionables: **Básico** (solo SOL) · **Docente** (SOL + LUNA) · **Completo** (todo). La activa se marca con fondo claro + chip "Activo". Elegir una aplica el preset (confirmación simple).
- Tarjeta "Personalizado": switches tipo pill con bolita — **SOL**, **LUNA** (switch maestro) con 3 sub-switches indentados (Alertas / Boletines / Chat, que se ven deshabilitados si LUNA está apagada), y **TERRA** con chip "próximamente" (el switch existe pero el copiloto aún no).
- Nota chica: "Los cambios aplican al instante en la app de la maestra."

### 4.8 Ficha — Notas (`/admin/colegios/[id]/notas`)
- Tarjeta **Contacto**: director/a, teléfono, email, notas de contacto (form editable).
- **Timeline de notas**: selector de tipo con chips (Nota / Contacto / Acuerdo), textarea, botón Agregar; lista descendente con fecha, chip de tipo, autor y borrar.

### 4.9 Ficha — Uso (`/admin/colegios/[id]/uso`)
Tiles del colegio (alumnos activos, sesiones, boletines del mes, chats) + barras de sesiones por semana + mini feed de actividad propio.

### 4.10 Ficha — Costos (`/admin/colegios/[id]/costos`)
Tiles (costo del mes en USD, llamadas, tokens) + desglose por función/feature. Estado vacío honesto: "Sin datos de uso todavía".

### 4.11 Métricas (`/admin/metricas`)
- Selector de rango: 7 / 30 / 90 días (chips).
- Tiles de uso: ejercicios respondidos, ejercicios generados, boletines generados vs **aprobados sin editar** (el termómetro de calidad de la IA), chats.
- **Funnel de onboarding**: una fila por colegio con 4 checkpoints (creado → maestras invitadas → primera actividad → primer boletín aprobado), ✓ verde con fecha o ○ pendiente.
- **Comparativa**: tabla amable (colegio, alumnos activos, sesiones, precisión %, boletines) con filas clickeables → ficha.
- Barras de adopción semanal.

### 4.12 Costos y salud (`/admin/costos`)
- Selector de rango 7/30/90.
- Tiles: costo total del mes (USD), llamadas, tasa de error global, latencia p95.
- Tabla por colegio (costo, llamadas, errores) y tabla por función/feature.
- Sección **Salud técnica**: por función, barra de tasa de error con semáforo (verde <2%, naranja <10%, rojo), p50/p95, y badge rojo "N fallos seguidos" si hay racha.

### 4.13 Alertas (`/admin/alertas`)
Lista priorizada de tarjetas: borde según prioridad (alta = rojo suave, media = naranja suave), título ("La prueba de Escuela 12 vence en 3 días"), detalle, link al colegio y botón "**Listo ✓**" que la archiva para siempre (desaparece con animación). Tipos: prueba por vencer, colegio inactivo (14 días sin sesiones), costo disparado (>2× el mes anterior o sobre umbral). Vacío: "Todo tranquilo por acá ✨".

### 4.14 Anuncios (`/admin/anuncios`)
- Form de creación: título, cuerpo (contador 0/500), alcance (Todos los colegios / select de colegio), fechas desde/hasta opcionales. Botón Publicar.
- Lista: pill Activo/Inactivo, chip de alcance, vigencia ("Hoy no se muestra" si está fuera de ventana), acciones Activar/Desactivar, Editar inline, Borrar.
- Preview chiquito de cómo lo ve la maestra (banner crema con borde naranja).

### 4.15 Auditoría (`/admin/auditoria`)
Filtros (entidad, acción, actor, rango de fechas) + timeline: fecha y hora, email del actor, pill de nivel (Super admin / Operativo), acción en lenguaje claro ("creó el colegio…", "suspendió a…", "vio como…"), entidad, y detalle plegable. Botón "Cargar más" (paginado). Solo lectura total.

### 4.16 Administradores (`/admin/config`) — solo super
- Si entra un operativo: tarjeta única "Solo el super-admin gestiona administradores".
- Lista: nombre, email, pill de nivel, pill Activo/Inactivo. Por fila: select de nivel y botón Desactivar/Reactivar. **La fila propia va deshabilitada** con chip "Sos vos".
- "**+ Nuevo admin**": modal (email, nombre, nivel con explicación de qué NO puede el operativo) → modal de invitación con link + contraseña temporal copiables, aviso "no se vuelven a mostrar".

### 4.17 Ver como maestra (`/admin/ver-como/[id]`)
- **Banner fijo arriba** (fondo naranja suave): "Estás viendo como Ana — solo lectura" + aclaración "No es su sesión; esta consulta queda auditada" + botón "Salir".
- Debajo, una réplica de solo lectura del panel de la maestra con la estética cálida: tarjetas de aulas, grilla de alumnos (nombre de pila, grado, última práctica relativa, precisión con semáforo), materias con pill borrador/publicado, contadores de boletines del mes, actividad reciente. **Ni un solo botón de acción en toda la pantalla.**

### 4.18 VISIÓN FUTURA (diseñar como concepto/próximamente)
1. **Observatorio educativo** (`/admin/observatorio`): mapa/heat de la Argentina o listado por zona con fortalezas y dificultades de aprendizaje agregadas y anónimas; tendencias por tema en el tiempo; selector de jurisdicción; badge permanente "Datos agregados y anónimos — jamás datos individuales". Diseñalo completo pero con un banner "Próximamente" elegante.
2. **Capacitación docente**: grilla de cursos/recursos para maestras con estado de avance por colegio. Placeholder con visión.
3. **Exportaciones para el ministerio**: lista de reportes agregados descargables (PDF/CSV) con período y jurisdicción. Placeholder con visión.

## 5. REGLAS TRANSVERSALES DE DISEÑO

- **Estados siempre**: cada pantalla necesita su estado de carga ("Cargando…" cálido), vacío (copy amable, nunca un cuadro gris mudo) y error (toast o inline en español, con "Reintentar" cuando aplique).
- **Lo destructivo siempre confirma tipeando el nombre** (archivar colegio, suspender, borrar maestra).
- **Los secretos se muestran una sola vez** (contraseñas temporales, links de invitación) con botones Copiar y aviso destacado.
- **El nivel operativo ve todo pero no puede**: archivar colegios, gestionar admins ni borrar maestras — esas acciones se ocultan o deshabilitan con tooltip.
- **Nunca datos sensibles de menores en el panel**: de los alumnos solo nombre de pila, grado y desempeño. Nada de PINs, emails ni credenciales en ninguna pantalla.
- Responsive razonable: el sidebar puede colapsar en mobile, las grillas de tiles ya son fluidas; las tablas se vuelven cards apiladas.
- Tono de todos los copys: rioplatense, cálido, directo. Errores sin culpa, vacíos con ánimo.
