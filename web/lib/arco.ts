// Lógica PURA del front de ARCO (Ley 25.326; alumno golondrina, migración
// 0024). Sin DOM ni imports: la testea Node directo (tests/unit/arco-logica).
// El backend (admin-arco + arco-logica.ts) es la fuente de verdad: acá solo
// vive cómo se le MUESTRA al operador lo que va a pasar.

export const TIPOS_ARCO = ['acceso', 'rectificacion', 'cancelacion', 'oposicion'] as const;
export type TipoArco = (typeof TIPOS_ARCO)[number];

export const TIPO_ARCO_COPY: Record<string, { titulo: string; detalle: string }> = {
  acceso: {
    titulo: 'Acceso',
    detalle: 'La familia pide ver todo lo que EDUTIA guarda del chico.',
  },
  rectificacion: {
    titulo: 'Rectificación',
    detalle: 'Corregir datos de identidad mal cargados (nombre o avatar).',
  },
  cancelacion: {
    titulo: 'Cancelación',
    detalle: 'Borrado definitivo. Es el único borrado real de todo el sistema.',
  },
  oposicion: {
    titulo: 'Oposición',
    detalle: 'El chico queda fuera de los agregados no esenciales (observatorio).',
  },
};

export const ESTADO_ARCO: Record<string, { copy: string; color: string }> = {
  solicitado: { copy: 'Solicitado', color: '#F4A93B' },
  confirmado: { copy: 'Confirmado', color: '#6A8CAF' },
  ejecutado: { copy: 'Ejecutado', color: '#7FB069' },
  rechazado: { copy: 'Rechazado', color: '#BB4F3F' },
};

export function copyEstadoArco(estado: string): { copy: string; color: string } {
  return ESTADO_ARCO[estado] ?? { copy: estado, color: '#9A8C7E' };
}

// ── Dry-run de la cancelación ───────────────────────────────────────────────
// Recibe el plan que arma `planDeBorrado` en el backend y lo vuelve texto.
// Los ítems en 0 se omiten: la lista tiene que decir lo que REALMENTE se
// borra, sin ruido.
export type ItemBorrado = { clave: string; singular: string; plural: string; cantidad: number };

export function lineasDelPlan(plan: ItemBorrado[] | null | undefined): string[] {
  if (!Array.isArray(plan)) return [];
  return plan
    .filter((i) => Number(i?.cantidad) > 0)
    .map((i) => `${i.cantidad} ${i.cantidad === 1 ? i.singular : i.plural}`);
}

export function resumenDelPlan(plan: ItemBorrado[] | null | undefined): string {
  const lineas = lineasDelPlan(plan);
  if (lineas.length === 0) return 'No hay datos que borrar: el legajo ya está vacío.';
  return `Se van a borrar para siempre: ${lineas.join(', ')}.`;
}

// La confirmación tipeada: el operador escribe el nombre del alumno tal cual.
// Compara sin distinguir mayúsculas ni espacios de más (no es una trampa, es
// un freno para que nadie borre de un click).
export function confirmacionValida(escrito: unknown, esperado: unknown): boolean {
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const e = norm(esperado);
  return e.length > 0 && norm(escrito) === e;
}

// ── Vista imprimible del legajo (el "PDF" del MVP) ──────────────────────────
// Transforma el JSON que devuelve `exportar_legajo` en secciones listas para
// renderizar e imprimir. Función pura: la página solo pinta lo que sale acá.
export type SeccionLegajo = {
  titulo: string;
  filas: { etiqueta: string; valor: string }[];
  vacio: boolean;
};

const texto = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
};

const fecha = (v: unknown): string =>
  typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : texto(v);

export function seccionesDelLegajo(legajo: Record<string, unknown> | null | undefined): SeccionLegajo[] {
  const l = (legajo ?? {}) as Record<string, unknown>;
  const perfil = (l.perfil ?? {}) as Record<string, unknown>;
  const arr = (k: string): Record<string, unknown>[] =>
    Array.isArray(l[k]) ? (l[k] as Record<string, unknown>[]) : [];

  const secciones: SeccionLegajo[] = [];

  secciones.push({
    titulo: 'Identidad',
    vacio: Object.keys(perfil).length === 0,
    filas: [
      { etiqueta: 'Nombre', valor: texto(perfil.nombre) },
      { etiqueta: 'Avatar', valor: texto(perfil.avatar) },
      { etiqueta: 'Grado actual', valor: texto(perfil.grado) },
      { etiqueta: 'Estado', valor: texto(perfil.estado) },
      { etiqueta: 'Excluido de procesamiento no esencial', valor: texto(perfil.excluido_procesamiento) },
      // No hay "identificador EDUTIA" a propósito: el legajo se le entrega a la
      // familia y el UUID interno no le sirve para nada.
      { etiqueta: 'Documentos o identificadores', valor: 'EDUTIA no registra ninguno' },
    ],
  });

  // `admin-arco` manda el nombre de la escuela en `escuela` (join aplanado);
  // se leen los alias viejos por si el shape cambia de vuelta.
  const matriculas = arr('matriculas');
  secciones.push({
    titulo: 'Recorrido escolar',
    vacio: matriculas.length === 0,
    filas: matriculas.map((m, i) => ({
      etiqueta: `Matrícula ${i + 1}`,
      valor: `${texto(m.escuela ?? m.escuela_nombre ?? m.escuela_id)}${m.grado ? ` · ${texto(m.grado)}° grado` : ''} · ${fecha(m.fecha_inicio)} → ${m.fecha_fin ? fecha(m.fecha_fin) : 'en curso'}${m.motivo_cierre ? ` · ${texto(m.motivo_cierre)}` : ''}`,
    })),
  });

  const consentimientos = arr('consentimientos');
  secciones.push({
    titulo: 'Consentimientos',
    vacio: consentimientos.length === 0,
    filas: consentimientos.map((c, i) => ({
      etiqueta: `Consentimiento ${i + 1}`,
      valor: `${texto(c.alcance)} · ${texto(c.adulto_nombre)} (${texto(c.adulto_vinculo)}) · ${texto(c.estado)} · ${fecha(c.otorgado_at ?? c.created_at)}`,
    })),
  });

  const sesiones = arr('sesiones');
  const respuestas = arr('respuestas');
  // La fn devuelve el progreso por nodo bajo `progreso`, no `alumno_nodo`.
  const nodos = arr('progreso').length > 0 ? arr('progreso') : arr('alumno_nodo');
  secciones.push({
    titulo: 'Actividad de aprendizaje',
    vacio: sesiones.length === 0 && respuestas.length === 0 && nodos.length === 0,
    filas: [
      { etiqueta: 'Sesiones de práctica', valor: String(sesiones.length) },
      { etiqueta: 'Respuestas registradas', valor: String(respuestas.length) },
      { etiqueta: 'Nodos con progreso', valor: String(nodos.length) },
    ],
  });

  const boletines = arr('boletines');
  secciones.push({
    titulo: 'Boletines',
    vacio: boletines.length === 0,
    filas: boletines.map((b) => ({
      etiqueta: `Período ${texto(b.periodo)}`,
      valor: `${texto(b.estado)} · versión ${texto(b.version)}`,
    })),
  });

  return secciones;
}

// ── Lo que sobrevive a una cancelación ──────────────────────────────────────
// `arco_caso.agregado` es el snapshot que arma `armarSnapshotAnonimo` en el
// backend: números y jurisdicción, cero identificadores. Esta función lo vuelve
// una línea legible para la pantalla de pedidos. Si algún día el snapshot
// llegara con un nombre o un id, este texto NO lo mostraría: solo lee las
// claves conocidas.
export function resumenAnonimo(agregado: Record<string, unknown> | null | undefined): string {
  if (!agregado || typeof agregado !== 'object') return 'Del chico no queda ningún dato.';
  const a = agregado as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const partes: string[] = [];
  if (typeof a.grado === 'number') partes.push(`${a.grado}° grado`);
  if (typeof a.provincia === 'string' && a.provincia.trim()) partes.push(a.provincia);

  const sesiones = num(a.sesiones);
  const respuestas = num(a.respuestas);
  partes.push(`${sesiones} ${sesiones === 1 ? 'sesión' : 'sesiones'} y ${respuestas} ${respuestas === 1 ? 'respuesta' : 'respuestas'}`);

  const r = a.rango_fechas as { desde?: unknown; hasta?: unknown } | null | undefined;
  if (r && typeof r.desde === 'string' && typeof r.hasta === 'string') {
    partes.push(`entre ${r.desde} y ${r.hasta}`);
  }
  return partes.join(' · ');
}

// Nombre de archivo del export JSON. Sin nombre del chico: el archivo puede
// terminar en cualquier carpeta compartida.
export function nombreArchivoLegajo(alumnoId: string, fechaISO: string): string {
  return `legajo-${String(alumnoId).slice(0, 8)}-${fechaISO.slice(0, 10)}.json`;
}

export const ERRS_ARCO: Record<string, string> = {
  sin_conexion: 'Tu equipo está sin internet. Revisá la conexión y probá de nuevo.',
  sin_respuesta: 'El servidor no respondió. Si es una sección nueva, puede que su Edge Function todavía no esté deployada.',
  requiere_super: 'La cancelación definitiva la confirma solo el super-admin.',
  alumno_inexistente: 'No encontramos a ese alumno.',
  caso_inexistente: 'No encontramos ese caso.',
  ya_ejecutada: 'Ese caso ya se ejecutó.',
  sin_cambios: 'No hay nada que rectificar.',
  estado_invalido: 'Ese caso no está en un estado que permita esta acción.',
};

export const msgErrArco = (j: { error?: string } | null | undefined): string => {
  const code = j?.error ?? '';
  if (code.startsWith('campo_no_rectificable')) return 'Solo se pueden rectificar el nombre y el avatar.';
  if (code.startsWith('valor_invalido')) return 'Ese valor no es válido.';
  return ERRS_ARCO[code] || code || 'No se pudo.';
};
