// Lógica PURA de las transferencias (alumno golondrina, ADR-011). Sin DOM y
// sin imports: la testea Node directo (tests/unit/transferencias.test.mjs).
// Toda función que necesite "ahora" lo recibe por parámetro — nada de
// new Date() acá adentro (mismo criterio que web/lib/luna.ts).

export const VINCULOS = ['madre', 'padre', 'tutor', 'otro'] as const;
export type Vinculo = (typeof VINCULOS)[number];

export const VINCULO_COPY: Record<Vinculo, string> = {
  madre: 'Madre',
  padre: 'Padre',
  tutor: 'Tutor/a',
  otro: 'Otro adulto responsable',
};

export function vinculoValido(v: unknown): v is Vinculo {
  return typeof v === 'string' && (VINCULOS as readonly string[]).includes(v);
}

// El form que completa la FAMILIA en el link público. Mensajes pensados para
// alguien que no usa la app: nada de códigos ni jerga.
export function validarAutorizacion(d: { adulto_nombre?: unknown; adulto_vinculo?: unknown }):
  | { ok: true; adulto_nombre: string; adulto_vinculo: Vinculo }
  | { ok: false; error: string } {
  const nombre = typeof d.adulto_nombre === 'string' ? d.adulto_nombre.trim() : '';
  if (nombre.length === 0) return { ok: false, error: 'Escribí tu nombre para autorizar.' };
  if (!vinculoValido(d.adulto_vinculo)) return { ok: false, error: 'Contanos qué sos del chico o la chica.' };
  return { ok: true, adulto_nombre: nombre, adulto_vinculo: d.adulto_vinculo };
}

// ── Estados de la transferencia ─────────────────────────────────────────────

export type EstadoTransferencia = 'pendiente' | 'confirmada' | 'denegada' | 'expirada';

export const ESTADO_TRANSFERENCIA: Record<EstadoTransferencia, { copy: string; color: string }> = {
  pendiente: { copy: 'Esperando a la familia', color: '#F4A93B' },
  confirmada: { copy: 'Autorizada', color: '#7FB069' },
  denegada: { copy: 'Cancelada', color: '#BB4F3F' },
  expirada: { copy: 'Vencida', color: '#9A8C7E' },
};

export function copyEstado(estado: string): { copy: string; color: string } {
  return ESTADO_TRANSFERENCIA[estado as EstadoTransferencia]
    ?? { copy: estado, color: '#9A8C7E' };
}

// ── El link del pase ────────────────────────────────────────────────────────
// El token viaja en el FRAGMENT (#): así no llega a los logs del server ni al
// Referer. La fn lo devuelve ya armado; acá se arma el absoluto para copiar.

export function armarLinkAbsoluto(origen: string, id: string, token: string): string {
  return `${origen.replace(/\/+$/, '')}/transferir/${id}#${token}`;
}

// Lee el token del hash de la URL. Tolerante: sin '#', vacío, o con '#' solo.
export function tokenDelFragmento(hash: unknown): string | null {
  if (typeof hash !== 'string') return null;
  const limpio = hash.startsWith('#') ? hash.slice(1) : hash;
  const t = limpio.trim();
  return t.length > 0 ? t : null;
}

// ── Vencimiento ─────────────────────────────────────────────────────────────

const DIA_MS = 86400000;

// Días enteros hasta `expira_at` (negativo = ya venció). Compara medianoche
// UTC contra medianoche UTC para no correrse un día por la hora del día.
export function diasHastaVencer(expiraAt: string | null | undefined, ahora: Date): number | null {
  if (typeof expiraAt !== 'string' || expiraAt.length === 0) return null;
  const fin = new Date(expiraAt).getTime();
  if (Number.isNaN(fin)) return null;
  const finDia = Date.UTC(
    new Date(fin).getUTCFullYear(), new Date(fin).getUTCMonth(), new Date(fin).getUTCDate(),
  );
  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  return Math.round((finDia - hoy) / DIA_MS);
}

export function copyVencimiento(expiraAt: string | null | undefined, ahora: Date): string {
  const d = diasHastaVencer(expiraAt, ahora);
  if (d === null) return 'Sin fecha de vencimiento';
  if (d < 0) return `Venció hace ${-d} ${-d === 1 ? 'día' : 'días'}`;
  if (d === 0) return 'Vence hoy';
  return `Vence en ${d} ${d === 1 ? 'día' : 'días'}`;
}

// ── Motivos de cierre de matrícula (timeline del legajo) ────────────────────

export const MOTIVO_COPY: Record<string, string> = {
  migracion: 'Se mudó',
  egreso: 'Egresó',
  error_carga: 'Error de carga',
  arco_baja: 'Baja a pedido de la familia',
};

export function copyMotivo(motivo: string | null | undefined): string {
  if (!motivo) return 'Abierta';
  return MOTIVO_COPY[motivo] ?? motivo;
}

export const ESTADO_ALUMNO_COPY: Record<string, { copy: string; color: string }> = {
  activo: { copy: 'En el aula', color: '#7FB069' },
  en_transito: { copy: 'En tránsito', color: '#F4A93B' },
  egresado: { copy: 'Egresó', color: '#6A8CAF' },
  baja: { copy: 'Baja', color: '#9A8C7E' },
};

// ── Copys de error del backend ──────────────────────────────────────────────

export const ERRS_TRANSFERENCIA: Record<string, string> = {
  sin_conexion: 'No pudimos conectarnos. Revisá la conexión y probá de nuevo.',
  token_invalido: 'Este link no sirve. Pedile uno nuevo a la escuela.',
  transferencia_bloqueada: 'Probaste muchas veces seguidas. Esperá quince minutos y volvé a intentar.',
  transferencia_expirada: 'Este link ya venció. Pedile uno nuevo a la escuela.',
  ya_resuelta: 'Este pase ya se resolvió. Si tenés dudas, hablá con la escuela.',
  datos_invalidos: 'Faltan datos. Revisá el nombre y el vínculo.',
  transferencia_pendiente_existente: 'Ese chico ya tiene un pase esperando. Cancelá el anterior primero.',
  misma_escuela: 'El colegio de destino es el mismo en el que está.',
  escuela_inexistente: 'No encontramos ese colegio.',
  alumno_inexistente: 'No encontramos a ese alumno.',
  alumno_dado_de_baja: 'Ese alumno fue dado de baja a pedido de su familia: no se puede transferir.',
  sin_matricula_activa: 'Ese alumno no tiene una matrícula activa.',
  no_es_tuyo: 'Eso no es tuyo.',
  solo_admin: 'Esta acción es del equipo de EDUTIA.',
};

export const msgErrTransferencia = (j: { error?: string } | null | undefined): string =>
  ERRS_TRANSFERENCIA[j?.error ?? ''] || j?.error || 'No se pudo.';
