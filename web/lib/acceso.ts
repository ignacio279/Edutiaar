// Acceso de plataforma visto desde el front docente (Dashboard admin v3, F3).
// Espejo de lectura de la RPC mi_acceso (migración 0018): la MISMA semántica de
// _shared/acceso-logica.ts, pero para decidir qué mostrar. El servidor sigue
// siendo la fuente de verdad: acá solo se esconde lo que no se puede usar.
// Módulo standalone (sin imports) para que node --test lo cargue directo.

export type Acceso = {
  estado: 'activo' | 'solo_lectura' | 'bloqueado';
  motivo: string | null;
  trial_fin: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features: any;
};

// Copia exacta de featureActiva de _shared/acceso-logica.ts: `luna.activa`
// apaga TODAS las sub-features; una feature desconocida se considera apagada.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function featureActiva(features: any, feature?: string): boolean {
  if (!feature) return true;
  if (feature === 'sol') return features?.sol === true;
  if (feature === 'terra') return features?.terra === true;
  if (feature.startsWith('luna.')) {
    const luna = features?.luna;
    if (!luna || luna.activa !== true) return false;
    const sub = feature.slice('luna.'.length);
    return luna[sub] === true;
  }
  if (feature === 'luna') return features?.luna?.activa === true;
  return false;
}

// ¿Puede generar cosas nuevas? En solo_lectura y bloqueado, no.
export function puedeGenerar(acceso: Acceso | null): boolean {
  if (!acceso) return true; // sin datos todavía: no trabamos la UI
  return acceso.estado === 'activo';
}

export type AvisoAcceso =
  | { tipo: 'solo_lectura'; titulo: string; detalle: string }
  | { tipo: 'bloqueado'; titulo: string; detalle: string }
  | { tipo: 'por_vencer'; titulo: string; detalle: string; dias: number }
  | null;

const DIA_MS = 86400000;

// Días enteros entre hoy y la fecha de fin del trial (negativo = ya venció).
export function diasHasta(fechaISO: string | null, now: Date): number | null {
  if (!fechaISO) return null;
  const fin = new Date(`${fechaISO.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(fin)) return null;
  const hoy = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((fin - hoy) / DIA_MS);
}

// Qué avisarle a la docente. Copy cálido: el trial vencido no es un reto.
export function avisoAcceso(acceso: Acceso | null, now: Date): AvisoAcceso {
  if (!acceso) return null;
  if (acceso.estado === 'bloqueado') {
    return {
      tipo: 'bloqueado',
      titulo: 'Tu cuenta está en pausa',
      detalle: 'Escribinos y lo resolvemos: mientras tanto no vas a poder entrar a las secciones.',
    };
  }
  if (acceso.estado === 'solo_lectura') {
    // 0026: la licencia paga vencida no es un "período de prueba" — mismo
    // corte suave, copy distinto.
    const esLicencia = acceso.motivo === 'licencia_vencida';
    return {
      tipo: 'solo_lectura',
      titulo: esLicencia ? 'La licencia del colegio venció' : 'Terminó el período de prueba',
      detalle: 'Podés seguir viendo todo lo de tus chicos, pero por ahora no se genera contenido nuevo.',
    };
  }
  const dias = diasHasta(acceso.trial_fin, now);
  if (dias !== null && dias >= 0 && dias <= 7) {
    return {
      tipo: 'por_vencer',
      dias,
      titulo: dias === 0 ? 'Tu prueba termina hoy' : `Tu prueba termina en ${dias} ${dias === 1 ? 'día' : 'días'}`,
      detalle: 'Después vas a poder seguir viendo todo, pero no generar contenido nuevo.',
    };
  }
  return null;
}

// Copys de los códigos que devuelven las Edge Functions con el corte puesto.
export const ERRS_ACCESO: Record<string, string> = {
  trial_vencido: 'Terminó el período de prueba: podés ver todo, pero no generar contenido nuevo.',
  licencia_vencida: 'La licencia del colegio venció: podés ver todo, pero no generar contenido nuevo.',
  licencia_suspendida: 'La licencia del colegio está en pausa. Escribinos y lo resolvemos.',
  colegio_suspendido: 'El colegio está en pausa. Escribinos y lo resolvemos.',
  cuenta_suspendida: 'Tu cuenta está en pausa. Escribinos y lo resolvemos.',
  feature_apagada: 'Esta sección no está habilitada en tu colegio.',
  tope_excedido: 'Se llegó al tope de uso del mes. Escribinos para ampliarlo.',
  acceso_no_disponible: 'No pudimos verificar tu acceso. Probá de nuevo en un rato.',
};
