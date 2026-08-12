# Alumno golondrina, consentimiento, ARCO, instituciones y licencias

> Fase implementada el 2026-08-10 sobre la branch del dashboard admin v3.
> ADR: **ADR-011**. Migraciones **0022–0027**.
> Principio rector: **"EDUTIA custodia los datos del chico en nombre de su familia"**.

## El problema

El vínculo alumno↔colegio vivía desnormalizado en tres columnas de `perfil`
(`docente_id`, `aula_id`, `escuela_id`): si la familia migraba (alumno
"golondrina", típico de escuelas rurales), la única operación posible era
**borrar** al alumno — y con él moría todo su recorrido. Además no existía
registro de consentimiento parental, ni derechos ARCO (Ley 25.326), ni forma
de agrupar colegios bajo una provincia/fundación con licencias por pool.

## Decisión central: matrícula fuente de verdad + caché en perfil

- **`matricula`** (0022) es la fuente de verdad del vínculo. `perfil.docente_id/
  aula_id/escuela_id/grado` quedan como **caché desnormalizado de la matrícula
  activa**, mantenido por el trigger `matricula_sync`. Las 7 policies RLS y los
  ~40 archivos que leen el caché siguen andando sin tocarse; cerrar una
  matrícula corta el scoping del colegio al instante en todas las superficies.
- **Triple candado** contra divergencia: (1) toda escritura pasa por las RPCs
  server-only `matricula_abrir`/`matricula_cerrar`; (2) el trigger de sync es
  el único escritor del caché (marcado con el GUC `edutia.matricula_sync`);
  (3) `perfil_guard` (BEFORE UPDATE) rechaza cualquier otro escritor de esas
  columnas — y de paso tapa el self-update de `perfil` vía PostgREST que
  existía desde 0002.
- **Identidad:** `perfil.id` ES el id EDUTIA (UUID). **Prohibido** el DNI o
  cualquier identificador estatal como clave, campo requerido o mecanismo de
  búsqueda (no existe en el esquema; test estructural lo congela).
- **Estados del alumno** (`perfil.estado`, máquina validada en DB):
  `activo` (matrícula vigente) · `en_transito` (migró; el legajo espera
  intacto — el corazón del feature) · `egresado` · `baja` (SOLO vía ARCO,
  **terminal**: baja→activo prohibido). Toda transición se audita.
- **Cierre de matrícula** (`matricula_cerrar` con motivo `migracion|egreso|
  arco_baja|error_carga`): fija estado según motivo, nullea el caché y
  **revoca el login** (`alumno_cred` + `intento_login`). El botón "Borrar" de
  Mi clase pasó a ser **"Dar de baja"** con motivo; no borra nada.
- **Boletines emitidos**: quedan para la docente que los escribió aunque el
  alumno migre (policy `docente_id = auth.uid()` de 0016 = archivo
  institucional). El colegio pierde el legajo VIVO, no lo ya emitido.

## Transferencias = eventos de consentimiento (0023 + 0027)

- **Sin consentimiento registrado no existe transferencia.** En el backend,
  dos veces: `matricula_abrir` exige consentimiento vigente con alcance
  `transferencia` hacia esa escuela para TODA reapertura, y la tabla
  `transferencia` tiene el CHECK `estado <> 'confirmada' or consentimiento_id
  is not null` (imposible ni por SQL directo).
- Dos vías, ambas auditadas: **link** (la docente de origen genera un pase; la
  familia lo confirma sin cuenta en `/transferir/<id>#<token>` — token opaco de
  128 bits, solo su SHA-256 en DB, un solo uso, expiración configurable en
  `plataforma_config` (default 14 días), lockout 5 intentos/15 min con las
  columnas de 0027) y **asistida** (el adulto presente; el admin registra y
  confirma en un paso).
- La autorización de transferencia ES el consentimiento de tratamiento para el
  colegio nuevo. Confirmar = consentimiento → cierre de la matrícula vieja →
  apertura en destino (sin aula: el alumno llega "para activar") → la docente
  destino lo activa (aula + grado + PIN nuevo).
- `admin-jobs` expira pendientes vencidas en la corrida nocturna.

## Consentimiento y ARCO (0023 + 0024)

- **`consentimiento`**: adulto (nombre + vínculo `madre|padre|tutor|otro`),
  alcance `tratamiento|transferencia`, vía `asistida|link|migracion`, estado
  `vigente|revocado|pendiente_regularizar`. El alta de un alumno registra el
  consentimiento asistido; el backfill dejó una **deuda visible**
  (`pendiente_regularizar`) por cada alumno pre-existente, regularizable desde
  Mi clase sin bloquear la operación.
- **ARCO** (`arco_caso`, sin FK a perfil: el caso legal sobrevive al borrado):
  - **Acceso**: export del legajo completo (JSON + vista imprimible del
    navegador — el "PDF" del MVP).
  - **Rectificación**: solo identidad (`nombre`/`avatar`); diff auditado.
  - **Cancelación**: **el ÚNICO borrado físico de todo el sistema.** Dos pasos
    (solicitar con dry-run de conteos → confirmar SOLO nivel super). Ejecución:
    snapshot ANÓNIMO a `arco_caso.agregado` (conteos + grado + provincia +
    rango de fechas; sin nombre ni uuids) → DELETE de los boletines del alumno
    (PII en texto libre: ARCO le gana al archivo institucional) →
    `auth.admin.deleteUser` (la cascada arrastra legajo, matrículas,
    consentimientos, creds, transferencias). Quedan `arco_caso` y `auditoria`.
  - **Oposición**: `perfil.excluido_procesamiento` (solo vía RPC
    `arco_set_exclusion`, protegido por `perfil_guard`); el observatorio y todo
    agregado no esencial lo filtran antes de computar.

## Instituciones y licencias (0025 + 0026)

- **`institucion`** (provincia/fundación/red/municipio) agrupa colegios
  (`escuela.institucion_id`). **`institucion_admin`** es tabla propia
  **fail-closed**: las fns admin de plataforma consultan `plataforma_admin` →
  un admin de institución recibe 403 automático; solo `institucion-panel` lo
  reconoce (`verificarAdminInstitucion`). **Jamás ve alumnos individuales**:
  solo agregados de SUS colegios (k=5 para desempeño), con verificación de
  pertenencia en la capa de datos y tests de cruce que deben fallar.
- **`licencia`**: de UN colegio XOR de UNA institución (pool con `cupos`;
  `licencia_asignacion` = un cupo por colegio, guard transaccional
  `sin_cupos`). `acceso_calcular` v2 (misma firma) resuelve la licencia
  efectiva (directa > pool): suspendida → bloqueado; vencida → **solo lectura**
  (el corte suave del trial, reutilizado tal cual — jamás borrar por falta de
  pago); colegio sin licencia → rama trial de 0018 intacta. `escuela.estado`
  queda como freno de mano manual. El backfill dio una licencia a cada colegio
  (trial→`prueba` con sus fechas, resto→`activa`).
- Alertas del operador: `detectarLicencia` reemplaza a `detectarTrial` (misma
  semántica 7/3 días, clave `licencia:<id>:<fecha_fin>`, fallback legacy para
  colegios sin licencia).

## Reglas que NO se negocian

1. Nada de borrado físico fuera del flujo ARCO.
2. Sin consentimiento registrado no existe transferencia (garantía de DB).
3. El admin de institución jamás accede a un legajo individual.
4. Prohibido el DNI como clave, campo requerido o búsqueda.
5. `baja` es terminal; solo el flujo ARCO lleva ahí.
6. El legajo pertenece al alumno y viaja con él; el colegio ve lo vivo
   mientras dura la matrícula y conserva solo lo que emitió (boletines).

## Verificación

- Unit: matriz de transiciones + paridad TS↔SQL (`matricula-logica.test.mjs`),
  reglas estructurales de 0023–0026 congeladas (`golondrina-ddl.test.mjs`),
  detector de licencias, lógica pura de cada WP.
- Integración: ciclo de vida completo de matrícula + `perfil_guard`
  (`matricula.test.mjs`), transferencias (token, lockout, CHECK), ARCO
  (cancelación end-to-end con conteos), cruce institucional (debe fallar),
  ciclo de licencias.
- Seed demo: `scripts/seed-golondrina.mjs`.
- Deploy: `docs/DEPLOY_GOLONDRINA.md` (migraciones 0022–0027 en orden + fns).
