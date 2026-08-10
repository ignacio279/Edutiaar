// Lógica PURA del ciclo de vida del alumno golondrina (ADR-011). Espejo TS de
// la máquina de estados que vive en SQL (alumno_transicion_valida, migración
// 0022) — el test de paridad la congela contra el SQL. Sin imports: Node la
// testea directo (tests/unit/matricula-logica.test.mjs).
//
// Estados: activo (matrícula vigente) · en_transito (migró; el legajo espera
// intacto — el corazón del feature) · egresado (terminó el ciclo) · baja
// (SOLO vía ARCO; terminal: el único camino a borrado real).

export const ESTADOS_ALUMNO = ['activo', 'en_transito', 'egresado', 'baja'] as const;
export type EstadoAlumno = (typeof ESTADOS_ALUMNO)[number];

export const MOTIVOS_CIERRE = ['migracion', 'egreso', 'arco_baja', 'error_carga'] as const;
export type MotivoCierre = (typeof MOTIVOS_CIERRE)[number];

// Misma tabla de verdad que el SQL: no-op legal, baja terminal, a baja solo
// la lleva el flujo ARCO, cierre baja a en_transito/egresado, reapertura sube
// a activo.
export function transicionValida(de: EstadoAlumno, a: EstadoAlumno): boolean {
  if (de === a) return true;
  if (de === 'baja') return false;
  if (a === 'baja') return true;
  if (de === 'activo' && (a === 'en_transito' || a === 'egresado')) return true;
  if ((de === 'en_transito' || de === 'egresado') && a === 'activo') return true;
  return false;
}

// A qué estado lleva el cierre de una matrícula según su motivo (espejo de
// matricula_cerrar en 0022).
export function estadoTrasCierre(motivo: MotivoCierre): EstadoAlumno {
  if (motivo === 'egreso') return 'egresado';
  if (motivo === 'arco_baja') return 'baja';
  return 'en_transito'; // migracion y error_carga: el legajo espera reingreso
}

export function esMotivoValido(m: unknown): m is MotivoCierre {
  return typeof m === 'string' && (MOTIVOS_CIERRE as readonly string[]).includes(m);
}

// ¿Abrir una matrícula exige consentimiento de transferencia? Solo el alta
// INICIAL (primera matrícula de la vida del alumno) va sin él: cualquier
// reapertura es un evento de consentimiento (P2).
export function requiereConsentimiento(matriculasPrevias: number): boolean {
  return matriculasPrevias > 0;
}

// Copys rioplatenses de los errores de las RPCs (los mapea el front).
export const ERRS_MATRICULA: Record<string, string> = {
  alumno_inexistente: 'No encontramos a ese alumno.',
  alumno_dado_de_baja: 'Ese alumno fue dado de baja a pedido de su familia: no se puede rematricular.',
  falta_consentimiento: 'Para rematricular hace falta el consentimiento de la familia (transferencia).',
  consentimiento_invalido: 'Ese consentimiento no sirve para esta matrícula: tiene que ser del alumno, hacia este colegio y estar vigente.',
  matricula_inexistente_o_cerrada: 'Esa matrícula no existe o ya está cerrada.',
  motivo_invalido: 'Elegí un motivo de cierre válido.',
  transicion_invalida: 'Ese cambio de estado no está permitido.',
  vinculo_protegido: 'El vínculo del alumno se cambia solo vía matrícula.',
  matricula_activa_existente: 'Ese alumno ya tiene una matrícula activa en otro colegio.',
};
