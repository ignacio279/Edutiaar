# Prompt de diseño — Alumno golondrina, consentimiento, ARCO e instituciones

> Para pegar en Claude Design. Cubre TODO lo implementado en la fase
> "Alumno golondrina" (migraciones 0022–0027, ADR-011): 7 pantallas nuevas,
> 2 pantallas modificadas y un área nueva con identidad propia.
> Complementa `2026-08-09-admin-dashboard-v3-prompt-diseno.md` (el panel
> admin ya diseñado): acá van SOLO las pantallas nuevas de esta fase.

---

Quiero que diseñes las pantallas nuevas de **EDUTIA**, una plataforma educativa para escuelas rurales de Argentina. Leé todo el contexto antes de diseñar: el corazón de esta fase es un concepto, no una feature, y si el diseño no lo transmite, falla. Todo el texto de la UI va en **español rioplatense** (vos, tené, elegí, mandá).

## 1. EL CONCEPTO QUE HAY QUE TRANSMITIR

En las escuelas rurales argentinas hay chicos que llaman **"golondrina"**: sus familias se mudan siguiendo el trabajo (cosecha, obra, temporada) y cambian de escuela una o dos veces por año. Hasta ahora, en EDUTIA, cuando un chico se iba la única opción era **borrarlo** — y con él se borraba todo su recorrido de aprendizaje. Llegaba a la escuela nueva como si nunca hubiera aprendido nada.

Esto se terminó. Ahora **el legajo es del chico y viaja con él**. La escuela vieja deja de verlo en vivo; la escuela nueva ve su historia completa; nada se borra nunca.

El principio que ordena todas las decisiones es:

> **EDUTIA custodia los datos del chico en nombre de su familia.**

Eso significa, concretamente:
- **Nadie se borra.** "Borrar alumno" ya no existe: es "dar de baja" con un motivo. El único borrado real de todo el sistema es cuando la familia lo pide formalmente (derecho ARCO), y va en dos pasos.
- **La familia autoriza cada mudanza.** Sin el consentimiento registrado de un adulto responsable, la transferencia entre colegios directamente no existe.
- **Nunca pedimos DNI.** Ningún identificador estatal, en ninguna pantalla. Es una decisión de producto: no queremos ese dato de un menor.

El diseño tiene que hacer sentir todo esto. Cuando la maestra da de baja a un chico, la pantalla tiene que transmitir *"su recorrido queda guardado"*, no *"eliminaste un registro"*. Cuando una madre abre el link en el celular, tiene que entender en cinco segundos que está autorizando que la historia de su hijo lo acompañe.

## 2. LAS TRES AUDIENCIAS (y por qué el diseño cambia entre ellas)

Esta fase toca a tres personas muy distintas. **No es la misma pantalla con otro color: son tres registros de diseño diferentes.**

**a) La maestra rural.** Ya conoce la app. Una sola docente con todos los grados a la vez, poco tiempo, computadora vieja o tablet. Usa la identidad cálida de la app (crema, naranja, redondeado). Nunca se le reprocha nada: si tiene consentimientos pendientes, es un recordatorio amable, no una advertencia roja.

**b) La familia.** **Nunca vio la app, no tiene cuenta, no va a crearse una.** Abre un link que le pasaron por WhatsApp, desde un celular, con señal mala. Puede tener poca alfabetización digital. Esta pantalla es la más importante de toda la fase y la que más cuidado necesita: letra grande, una sola decisión, cero jerga (no decir "transferencia de matrícula" ni "consentimiento": decir "pase de escuela" y "autorizar"). Es la única pantalla pública del sistema.

**c) El operador de plataforma y el coordinador institucional.** Back-office serio, identidad azul petróleo ya definida (ver el prompt del panel admin). Acá el diseño tiene que comunicar **consecuencia**: las acciones de ARCO borran de verdad y para siempre.

## 3. IDENTIDAD VISUAL

**App de maestras (pantallas del docente):**
- Fondo `#FDF6E9`, tarjetas blancas radio 16, sombra `rgba(90,70,50,.08)`
- Verde `#7FB069` (acciones positivas), naranja `#F4A93B` (en curso / aviso), rojo cálido `#BB4F3F` (solo destructivo real), gris cálido `#9A8C7E` (inactivo)
- Aviso suave: fondo `#FBEFD9`, borde `#F4D9A6`, texto `#8A6215`
- Tipografías: **Baloo 2** (títulos), **Quicksand 700** (labels, botones), **Nunito** (cuerpo)

**Panel admin (pantallas de operación):** azul petróleo. Base `#3E7C8A`, oscuro `#2F6172`, claro `#E3EEF4`, borde `#C9DEE7`, fondo página `#FBF4E6`, tarjetas `#FFFCF5` borde `#EFE3CE`. Tinta `#3A332A`, secundario `#7A6F5F`.

**Pantalla pública de la familia:** usa la calidez de la app (crema `#FDF6E9`, verde `#7FB069`) pero **todo escalado hacia arriba**: cuerpo de 18–19px mínimo, botones de 48px+ de alto, una sola columna, máximo 520px de ancho. Diseñala **mobile-first de verdad**: el 90% la va a abrir en un teléfono.

**Área institucional (`/institucion`) — DECISIÓN ABIERTA PARA VOS:** es un panel nuevo para fundaciones, provincias y redes de escuelas. Hoy usa la paleta petróleo del admin. **Proponeme si conviene diferenciarla** (¿un acento propio? ¿la misma petróleo con otra densidad?) y justificá: son usuarios externos a EDUTIA, no operadores nuestros, y tienen mucho menos poder que un admin de plataforma.

## 4. LAS PANTALLAS

### 4.1 ⭐ Autorización de pase — PÚBLICA, para la familia (`/transferir/[id]`)

**La pantalla más importante de la fase.** Sin login, sin cuenta, desde el celular.

Estados a diseñar (son cinco pantallas distintas):

1. **Cargando** — un momento, breve y tranquilo.
2. **Pedido de autorización (la principal):**
   - Título: "Pase de escuela"
   - El hecho, grande y claro: **"Wanda pasa de Escuela 21 'El Chañar' a Escuela 8 'Los Álamos'"**
   - La promesa, en lenguaje de madre: *"Si autorizás, todo lo que aprendió hasta ahora viaja con ella y la maestra nueva la va a poder acompañar desde donde quedó. Nada se borra."*
   - Formulario mínimo: **"Tu nombre"** (texto) y **"¿Qué sos del chico o la chica?"** (madre / padre / tutor-a / otro adulto responsable)
   - Botón único grande: **"Sí, autorizo el pase"**
   - Al pie, chiquito: cuándo vence el link y qué guardamos ("Guardamos tu nombre y el vínculo solo como constancia de esta autorización")
   - **Importante:** acá NO se muestra nada del legajo del chico. Solo su nombre de pila y los nombres de las dos escuelas.
3. **Éxito** — celebratorio y tranquilizador: "¡Listo! Gracias 💛", y qué pasa ahora ("La maestra de la escuela nueva la va a sumar a su clase y le va a dar un código nuevo para entrar").
4. **Link vencido o inválido** — sin culpar a la persona, con la salida clara: "Pedile uno nuevo a la escuela".
5. **Demasiados intentos** — el link se bloquea 15 minutos tras 5 intentos fallidos. Explicalo sin asustar.

Diseñá también cómo se ve **en un celular de 360px de ancho**, que es el caso real.

### 4.2 Pases — la maestra (`/docente/transferencias`)

Sección nueva en el sidebar del docente (ítem "Pases"). Tres bloques:

- **Generar un pase.** Dos selects ("¿Quién se muda?" / "¿A qué colegio va?") y un botón. Al generar aparece **el link una sola vez** con botón "Copiar" y la advertencia de que no se vuelve a ver. Diseñá bien ese momento: es un secreto que se muestra una vez (mismo patrón que la contraseña temporal de las maestras).
- **Llegadas.** Chicos que llegaron de otra escuela y **esperan que la maestra los sume a un aula**. Es un estado que antes no existía: el chico está en el colegio pero todavía no puede entrar a practicar. Al tocar "Sumar a mi clase" se despliega aula + grado + PIN nuevo (4 dígitos), con la explicación de por qué hace falta un PIN nuevo ("el código del aula vieja ya no sirve").
- **Mis pases.** Los generados, con chip de estado: *Esperando a la familia* (naranja) · *Autorizada* (verde) · *Cancelada* (rojo) · *Vencida* (gris), más "Vence en N días".

### 4.3 Mi clase — modificada (`/docente/alumnos`)

Dos cambios sobre una pantalla que ya existe:

- **Adulto responsable en el alta.** El formulario de alumno nuevo suma "Adulto responsable" (nombre) y "Vínculo" (select). Integralo sin que el form se sienta más pesado: hoy ya pide nombre, grado, PIN, aula y avatar.
- **Aviso de deuda de consentimientos.** Arriba de la lista, un banner ámbar cuando faltan consentimientos de chicos cargados antes de esta fase: *"Faltan los consentimientos de 4 familias."* + *"Son de chicos que ya estaban cargados. Cuando puedas, anotá quién es el adulto responsable de cada uno: se hace en dos clicks y no corre ningún apuro."* Con chips por alumno que abren un mini-formulario inline. **El tono es clave: es un pendiente administrativo, jamás un reto.**
- **"Dar de baja" (ya implementado, rediseñalo si podés mejorarlo).** Donde antes decía "Borrar", ahora pregunta *"Su recorrido no se borra. ¿Por qué se va?"* con tres opciones: **Se mudó** (naranja) · **Egresó** (verde) · **Fue un error de carga** (rojo).

### 4.4 Ficha del alumno — sección nueva (`/docente/[alumnoId]`)

**"Su recorrido":** una línea de tiempo de las matrículas del chico. Cada fila: nombre del colegio, grado, fechas (`inicio → fin` o "hoy"), y un chip con el motivo de cierre en lenguaje humano ("Se mudó", "Egresó", "Baja a pedido de la familia"). La matrícula activa se distingue de las cerradas (hoy: un punto verde vs. gris).

Cuando el chico no está activo, un chip de estado arriba: **En tránsito** (naranja) · **Egresó** (azul) · **Baja** (gris).

Esta sección es donde la maestra *ve* que el legajo viajó. Vale la pena que sea linda: proponé algo mejor que una lista de filas si se te ocurre (¿una línea temporal real?).

### 4.5 Transferencias — operación (`/admin/transferencias`)

Panel petróleo. Listado de todos los pases con filtro por estado, acción "Cancelar" sobre los pendientes, y un bloque **"Transferencia asistida"**: para cuando el adulto está presente en la escuela y se registra el consentimiento en el acto (nombre del adulto + vínculo + colegio destino). **El token del link nunca se muestra acá.**

### 4.6 ⭐ Derechos ARCO (`/admin/arco`)

Ley 25.326 de datos personales. Cuatro derechos en una pantalla, con un campo de alumno arriba que aplica a todos:

1. **Acceso** — exportar el legajo completo. Botones: "Exportar", "Bajar JSON", "Versión imprimible".
2. **Rectificación** — corregir SOLO identidad (nombre y avatar). El resto del legajo son hechos que pasaron: no se rectifican. El cambio queda con su diff registrado.
3. **Oposición** — excluir al chico de los agregados no esenciales (el observatorio). No afecta su práctica ni lo que ve su maestra.
4. **Cancelación** — **el único borrado real de todo el sistema.** Va en dos pasos:
   - **Paso 1:** el operador pide ver qué se borraría → aparece el **dry-run**: *"Se van a borrar para siempre: 41 sesiones de práctica, 512 respuestas registradas, 2 boletines."*
   - **Paso 2:** confirmación **tipeando la palabra BORRAR**. Solo el super-admin puede confirmar.
   - Después queda únicamente un resumen anónimo (cantidades, grado, provincia, rango de fechas — sin nombre ni identificadores) y el registro de auditoría.

**El desafío de diseño acá:** que la irreversibilidad sea *legible* sin que la pantalla parezca una bomba a punto de estallar. Es una acción legítima y respetuosa (la familia está ejerciendo un derecho), pero definitiva. Buscá el tono entre "botón rojo de peligro" y "trámite banal".

También: la **vista imprimible del legajo** (es el "PDF" que se le entrega a la familia). Se ve en pantalla como previa y al imprimir queda ella sola. Diseñá cómo se ve en papel A4: encabezado con "Legajo del alumno · EDUTIA", fecha de emisión, mención de la ley, y secciones (Identidad, Recorrido escolar, Consentimientos, Actividad de aprendizaje, Boletines).

Y el **listado de casos**: tipo, estado (Solicitado / Confirmado / Ejecutado / Rechazado), fecha. Los casos de chicos ya borrados siguen apareciendo — mostralos de forma que se entienda que del chico ya no queda nada, solo el registro del pedido.

### 4.7 Instituciones (`/admin/instituciones`)

Una institución (provincia, fundación, red de escuelas, municipio) agrupa colegios. Listado con contadores (colegios / admins / licencias), alta, suspender/reactivar, y una **ficha** con tres bloques: colegios (asignar y quitar), administradores de la institución (alta que muestra contraseña temporal una sola vez), y sus licencias.

### 4.8 Licencias (`/admin/licencias`)

Reemplazan a los períodos de prueba. Una licencia es **de un colegio O de una institución** (nunca las dos): si es de una institución, es un **pool con cupos** que se van asignando a colegios.

- Formulario que cambia según el destino elegido (colegio → sin cupos; institución → con cupos).
- Listado con: destino, plan (Básico / Docente / Completo / A medida), cupos usados y libres, vencimiento (destacado si vence en ≤7 días), y estado.
- Estados y su consecuencia, que el diseño debería dejar clara: **En prueba** (naranja) · **Activa** (verde) · **Vencida** (rojo — *el colegio queda en solo lectura: ve todo, no genera contenido nuevo*) · **Suspendida** (gris — *bloqueado*).
- Acciones: extender vencimiento, suspender/reactivar, asignar cupo.

**Idea a transmitir:** nunca se borra nada por falta de pago. El peor caso es solo lectura.

### 4.9 ⭐ Panel institucional — área nueva (`/institucion` + `/institucion/login`)

Para una fundación o un ministerio provincial que tiene varias escuelas en EDUTIA. Login propio (sin link desde ningún lado).

**La restricción es la feature:** este panel **jamás muestra un alumno individual** — ni nombres, ni identificadores, ni legajos. Solo números agregados. Y el desempeño de un colegio con menos de 5 chicos **no se muestra** (se suprime por anonimato). Eso no es una limitación a esconder: **es una promesa de privacidad que el diseño tiene que mostrar con orgullo.** Encontrá la forma visual de decir "acá no vas a ver chicos, y eso es a propósito".

Contenido:
- **Totales:** colegios, sesiones (30 días), chicos activos (7 días), costo del mes.
- **Tarjeta por colegio:** maestras, chicos con matrícula activa, sesiones, desempeño (o **"Muestra chica: no se muestra"**), y deuda de consentimientos.
- **Licencias/pools** con cupos usados y libres.
- **Altas:** sumar un colegio (nace dentro de la institución, con 30 días de prueba) y sumar una maestra (con contraseña temporal de una sola vez).

## 5. ESTADOS Y AVISOS TRANSVERSALES

- **Banner de licencia vencida** (lo ve la maestra): distinguí *"Terminó el período de prueba"* de *"La licencia del colegio venció"*. Mismo corte (solo lectura), distinto mensaje.
- **Chip de estado del alumno:** En el aula (verde) · En tránsito (naranja) · Egresó (azul) · Baja (gris).
- **Chip de estado del pase:** Esperando a la familia · Autorizada · Cancelada · Vencida.
- **Vacíos:** cada listado nuevo necesita su estado vacío con copy cálido ("Por ahora no hay nadie esperando", "Todavía no generaste ninguno").

## 6. REGLAS DE COPY (no negociables)

1. Español rioplatense, siempre voseo.
2. **Nunca "eliminar", "borrar" ni "dar de baja el registro"** para hablar de un chico que se muda. Se dice "se muda", "pase", "dar de baja" (con motivo), y siempre aparece que el recorrido queda.
3. **Nunca pedir DNI** ni ningún documento. Si el diseño sugiere un campo así, está mal.
4. A la familia no se le habla en jerga: nada de "matrícula", "transferencia", "consentimiento", "tratamiento de datos". Se le habla de "pase de escuela" y "autorizar".
5. Los errores no culpan al usuario y siempre ofrecen la salida.
6. La maestra nunca es retada por tener trabajo administrativo pendiente.

## 7. QUÉ QUIERO QUE ENTREGUES

1. Las **9 pantallas** (con sus estados: vacío, con datos, error, y los 5 estados de la pantalla pública).
2. La pantalla pública **en mobile 360px**, que es su caso real de uso.
3. La **vista imprimible del legajo** en formato A4.
4. Tu **propuesta de identidad para el área institucional** (punto 3), con el razonamiento.
5. Los **componentes nuevos** que aparezcan: chip de estado del alumno, chip de estado del pase, línea de tiempo del recorrido, bloque de secreto-que-se-muestra-una-vez, bloque de confirmación destructiva con dry-run, tarjeta de colegio agregado.

Si en algún punto te parece que hay una decisión de diseño mejor que la que describí, proponela y explicá por qué — sobre todo en la pantalla de la familia y en la de cancelación ARCO, que son las dos donde el diseño hace la diferencia entre que se entienda o no lo que está pasando.
