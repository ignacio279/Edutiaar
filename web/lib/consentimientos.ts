// Lógica PURA de los consentimientos parentales (alumno golondrina, ADR-011,
// migración 0023). Sin DOM ni imports: la testea Node directo.
// Tono: la deuda de consentimientos NUNCA se le reprocha a la maestra — es un
// pendiente administrativo que se resuelve en dos clicks.

export const VINCULOS = ['madre', 'padre', 'tutor', 'otro'] as const;
export type Vinculo = (typeof VINCULOS)[number];

export const ALCANCES = ['tratamiento', 'transferencia'] as const;
export const VIAS = ['asistida', 'link', 'migracion'] as const;

export const ALCANCE_COPY: Record<string, string> = {
  tratamiento: 'Uso de datos en el colegio',
  transferencia: 'Pase a otro colegio',
};

export const VIA_COPY: Record<string, string> = {
  asistida: 'Registrado por la maestra',
  link: 'Autorizado por la familia desde el link',
  migracion: 'Anterior a EDUTIA (a regularizar)',
};

export const ESTADO_CONSENTIMIENTO: Record<string, { copy: string; color: string }> = {
  vigente: { copy: 'Vigente', color: '#7FB069' },
  revocado: { copy: 'Revocado', color: '#BB4F3F' },
  pendiente_regularizar: { copy: 'A regularizar', color: '#F4A93B' },
};

export function copyEstadoConsentimiento(estado: string): { copy: string; color: string } {
  return ESTADO_CONSENTIMIENTO[estado] ?? { copy: estado, color: '#9A8C7E' };
}

export function vinculoValido(v: unknown): v is Vinculo {
  return typeof v === 'string' && (VINCULOS as readonly string[]).includes(v);
}

// Form del adulto responsable (alta de alumno y regularización).
export function validarConsentimiento(d: { adulto_nombre?: unknown; adulto_vinculo?: unknown }):
  | { ok: true; adulto_nombre: string; adulto_vinculo: Vinculo }
  | { ok: false; error: string } {
  const nombre = typeof d.adulto_nombre === 'string' ? d.adulto_nombre.trim() : '';
  if (nombre.length === 0) return { ok: false, error: 'Poné el nombre del adulto responsable.' };
  if (!vinculoValido(d.adulto_vinculo)) return { ok: false, error: 'Elegí el vínculo con el chico.' };
  return { ok: true, adulto_nombre: nombre, adulto_vinculo: d.adulto_vinculo };
}

// Aviso de deuda. Singular/plural correctos; 0 pendientes → null (sin aviso).
export function mensajeDeuda(pendientes: number): string | null {
  if (!Number.isFinite(pendientes) || pendientes <= 0) return null;
  return pendientes === 1
    ? 'Falta el consentimiento de 1 familia.'
    : `Faltan los consentimientos de ${pendientes} familias.`;
}

export const ERRS_CONSENTIMIENTO: Record<string, string> = {
  no_es_tuyo: 'Ese alumno no es de tu clase.',
  consentimiento_inexistente: 'No encontramos ese consentimiento.',
  datos_invalidos: 'Revisá el nombre del adulto y el vínculo.',
  ya_vigente: 'Ese consentimiento ya está registrado.',
  no_docente: 'Necesitás entrar como docente.',
};
