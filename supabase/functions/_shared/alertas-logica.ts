// Lógica PURA de las alertas del operador (Dashboard admin v3; desde la fase
// Observatorio y avisos vive en _shared: la comparten admin-crm y admin-jobs).
// Sin imports de Deno ni supabase: la testea Node directo
// (tests/unit/admin-alertas.test.mjs). Toma `now: Date` por parámetro (nada de
// new Date() adentro) — mismo patrón de detectores que web/lib/luna.ts.
//
// Claves DETERMINÍSTICAS: mismo hecho puntual → misma clave, así "Listo ✓"
// (tabla admin_alerta_atendida, migración 0019) lo oculta PARA SIEMPRE.
// Cuando el hecho cambia, cambia la clave y la alerta puede volver — y eso es
// correcto:
//   · trial:<escuelaId>:<trial_fin>  — extender el trial cambia la fecha →
//     clave nueva → vuelve a avisar cerca del nuevo vencimiento.
//   · inactivo:<escuelaId>:<yyyy-mm> — mensual: si sigue inactivo el mes que
//     viene, vuelve.
//   · costo:<escuelaId>:<yyyy-mm>    — mensual: cada mes disparado es un hecho
//     nuevo.

export type AlertaAdmin = {
  clave: string;
  tipo: 'trial_por_vencer' | 'colegio_inactivo' | 'costo_disparado';
  prioridad: 'alta' | 'media';
  escuelaId: string;
  escuelaNombre: string;
  titulo: string;
  detalle: string;
};

export type EscuelaAlerta = {
  id: string;
  nombre: string;
  estado: string;
  trial_fin: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limites?: any;
};

// Umbrales documentados (días de calendario / USD).
const TRIAL_DIAS_AVISO = 7; // trial que vence en ≤7 días → alerta
const TRIAL_DIAS_URGENTE = 3; // en ≤3 días (o ya vencido) → prioridad alta
const INACTIVO_DIAS = 14; // sin sesiones hace ≥14 días → colegio inactivo
const COSTO_FACTOR = 2; // costo del mes > 2× el mes anterior → disparado
// Umbral absoluto: > 50 USD/mes en un colegio ya es mucho para el pricing
// actual (Haiku/Sonnet con pool cacheado) — dispara aunque no haya mes
// anterior con el que comparar.
const COSTO_UMBRAL_USD = 50;

// Medianoche local del día de `now` (patrón haceDias de web/lib/luna.ts).
function medianoche(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

// Días de calendario desde hoy hasta una fecha 'YYYY-MM-DD' (negativo = ya
// pasó). Parseo manual: new Date('YYYY-MM-DD') sería medianoche UTC y podría
// correrse un día contra la medianoche local.
function diasHasta(fecha: string, now: Date): number {
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - medianoche(now)) / 86_400_000);
}

// Días de calendario desde un instante ISO hasta `now`.
function diasDesde(iso: string, now: Date): number {
  const f = new Date(iso);
  const inicio = new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime();
  return Math.round((medianoche(now) - inicio) / 86_400_000);
}

// Mes calendario local como 'YYYY-MM' (sufijo de las claves mensuales).
export function claveMes(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// (1) Trial por vencer: estado 'trial' con trial_fin en ≤7 días, incluidos el
// que vence HOY y el ya vencido (el operador tiene que actuar igual: extender
// o convertir). Alta si faltan ≤3 días o ya venció; media si faltan 4..7.
function detectarTrial(e: EscuelaAlerta, now: Date): AlertaAdmin | null {
  if (e.estado !== 'trial' || !e.trial_fin) return null;
  const dias = diasHasta(e.trial_fin, now);
  if (dias > TRIAL_DIAS_AVISO) return null;
  const cuando = dias < 0
    ? `venció hace ${-dias} ${-dias === 1 ? 'día' : 'días'}`
    : dias === 0
      ? 'vence HOY'
      : `vence en ${dias} ${dias === 1 ? 'día' : 'días'}`;
  return {
    clave: `trial:${e.id}:${e.trial_fin}`,
    tipo: 'trial_por_vencer',
    prioridad: dias <= TRIAL_DIAS_URGENTE ? 'alta' : 'media',
    escuelaId: e.id,
    escuelaNombre: e.nombre,
    titulo: `El trial de ${e.nombre} ${cuando}`,
    detalle: `Fin del trial: ${e.trial_fin}. Extendelo o convertí el colegio a activo antes de que quede en solo lectura.`,
  };
}

// (2) Colegio inactivo: estado activo/trial sin sesiones hace ≥14 días, o que
// nunca practicó (última sesión null — sin created_at en el input, null se
// toma como "nunca" y alerta). Suspendido/archivado no alertan: ya se actuó.
function detectarInactivo(e: EscuelaAlerta, ultimaSesion: string | null, now: Date): AlertaAdmin | null {
  if (e.estado !== 'activo' && e.estado !== 'trial') return null;
  const dias = ultimaSesion ? diasDesde(ultimaSesion, now) : null;
  if (dias !== null && dias < INACTIVO_DIAS) return null;
  return {
    clave: `inactivo:${e.id}:${claveMes(now)}`,
    tipo: 'colegio_inactivo',
    prioridad: 'media',
    escuelaId: e.id,
    escuelaNombre: e.nombre,
    titulo: `${e.nombre} está inactivo`,
    detalle: dias === null
      ? 'Ningún alumno practicó todavía. Llamá a la maestra: capaz necesita una mano para arrancar.'
      : `Hace ${dias} días que ningún alumno practica. Un llamado a tiempo evita perder el colegio.`,
  };
}

// (3) Costo disparado: el costo de API del mes supera 2× el del mes anterior
// (con mes anterior > 0 — sin base no hay comparación) O supera el umbral
// absoluto de 50 USD. Ambas comparaciones estrictas (>).
function detectarCosto(e: EscuelaAlerta, costoMes: number, costoAnterior: number, now: Date): AlertaAdmin | null {
  const porFactor = costoAnterior > 0 && costoMes > COSTO_FACTOR * costoAnterior;
  const porUmbral = costoMes > COSTO_UMBRAL_USD;
  if (!porFactor && !porUmbral) return null;
  const detalle = porFactor
    ? `Va $${costoMes.toFixed(2)} USD este mes contra $${costoAnterior.toFixed(2)} el anterior (más del doble). Revisá el uso y el tope del colegio.`
    : `Va $${costoMes.toFixed(2)} USD este mes (umbral: $${COSTO_UMBRAL_USD}). Revisá el uso y el tope del colegio.`;
  return {
    clave: `costo:${e.id}:${claveMes(now)}`,
    tipo: 'costo_disparado',
    prioridad: 'alta',
    escuelaId: e.id,
    escuelaNombre: e.nombre,
    titulo: `Se disparó el costo de API de ${e.nombre}`,
    detalle,
  };
}

const ORDEN: Record<AlertaAdmin['prioridad'], number> = { alta: 0, media: 1 };

// Corre los tres detectores por colegio, filtra las claves ya atendidas y
// ordena alta → media (estable: dentro de cada prioridad queda el orden de
// entrada). Listas vacías → [].
export function evaluarAlertas(
  input: {
    escuelas: EscuelaAlerta[];
    ultimaSesionPorEscuela: Record<string, string | null>;
    costoMesPorEscuela: Record<string, number>;
    costoMesAnteriorPorEscuela: Record<string, number>;
    atendidas: string[];
  },
  now: Date,
): AlertaAdmin[] {
  const atendidas = new Set(input.atendidas);
  const alertas: AlertaAdmin[] = [];
  for (const e of input.escuelas) {
    for (const a of [
      detectarTrial(e, now),
      detectarInactivo(e, input.ultimaSesionPorEscuela[e.id] ?? null, now),
      detectarCosto(e, input.costoMesPorEscuela[e.id] ?? 0, input.costoMesAnteriorPorEscuela[e.id] ?? 0, now),
    ]) if (a && !atendidas.has(a.clave)) alertas.push(a);
  }
  return alertas.sort((x, y) => ORDEN[x.prioridad] - ORDEN[y.prioridad]);
}

// Agrega filas de uso_api (desde el 1° del mes ANTERIOR) en costo por escuela
// del mes actual y del anterior. Filas sin escuela_id se ignoran.
export function costosPorMes(
  filas: { escuela_id: string | null; costo_usd: number | string; created_at: string }[],
  now: Date,
): { mesActual: Record<string, number>; mesAnterior: Record<string, number> } {
  const actual = claveMes(now);
  const anterior = claveMes(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const mesActual: Record<string, number> = {};
  const mesAnterior: Record<string, number> = {};
  for (const f of filas) {
    if (!f.escuela_id) continue;
    const mes = claveMes(new Date(f.created_at));
    const costo = Number(f.costo_usd) || 0;
    if (mes === actual) mesActual[f.escuela_id] = (mesActual[f.escuela_id] ?? 0) + costo;
    else if (mes === anterior) mesAnterior[f.escuela_id] = (mesAnterior[f.escuela_id] ?? 0) + costo;
  }
  return { mesActual, mesAnterior };
}

// ── Validadores de las acciones CRM (puros, también testeables) ─────────────

export const TIPOS_NOTA = ['nota', 'contacto', 'acuerdo'] as const;

export function validarNota(input: { tipo?: unknown; cuerpo?: unknown }):
  | { ok: true; tipo: string; cuerpo: string }
  | { ok: false; error: string } {
  const tipo = input.tipo === undefined ? 'nota' : input.tipo;
  if (typeof tipo !== 'string' || !(TIPOS_NOTA as readonly string[]).includes(tipo)) {
    return { ok: false, error: 'tipo_invalido' };
  }
  if (typeof input.cuerpo !== 'string' || input.cuerpo.trim().length === 0) {
    return { ok: false, error: 'cuerpo_vacio' };
  }
  return { ok: true, tipo, cuerpo: input.cuerpo.trim() };
}

const CLAVES_CONTACTO = ['director', 'telefono', 'email', 'notas'] as const;

// Shape simple {director?, telefono?, email?, notas?}, todo string. Claves
// desconocidas o valores no-string → inválido (no se cuela nada raro al jsonb).
export function validarContacto(input: unknown):
  | { ok: true; contacto: Record<string, string> }
  | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'contacto_invalido' };
  }
  const contacto: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!(CLAVES_CONTACTO as readonly string[]).includes(k)) return { ok: false, error: 'contacto_invalido' };
    if (typeof v !== 'string') return { ok: false, error: 'contacto_invalido' };
    contacto[k] = v.trim();
  }
  return { ok: true, contacto };
}
