// Lógica PURA del front de ARCO (Ley 25.326; alumno golondrina, migración
// 0024). Sin DOM: la testea Node directo (tests/unit/golondrina-front).
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

// ── El legajo que se le entrega a la familia ────────────────────────────────
// Transforma el JSON que devuelve `exportar_legajo` en secciones listas para
// renderizar e imprimir (el operador imprime → "Guardar como PDF"). Función
// pura: la página solo pinta lo que sale acá.
//
// Desde 2026-08-18 esta hoja es EL entregable del derecho de acceso: se sacó
// el "Bajar JSON" porque un JSON crudo no es información "en forma clara,
// exenta de codificaciones" (art. 15 de la 25.326). Por eso el documento dice
// en palabras lo que antes eran tres contadores: cómo viene aprendiendo tema
// por tema, la práctica mes a mes, las devoluciones de SOL y el TEXTO completo
// de los boletines de LUNA.
//
// Lo único que NO se transcribe es la tabla de respuestas una por una (suelen
// ser cientos: quince páginas ilegibles). Se informa cuántas hay y que se
// pueden pedir: es un dato que existe y la familia tiene derecho a saberlo.
export type FilaLegajo = { etiqueta: string; valor: string };
export type ParteLegajo = { titulo?: string; texto: string };
export type BloqueLegajo = { titulo: string; sub?: string; partes: ParteLegajo[] };
export type SeccionLegajo = {
  titulo: string;
  nota?: string;      // una línea que explica la sección en lenguaje de familia
  filas: FilaLegajo[];
  bloques: BloqueLegajo[];
  vacio: boolean;
};

const texto = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
};

// Fechas en dd/mm/aaaa: la familia lee un papel, no un timestamp ISO.
const fecha = (v: unknown): string => {
  if (typeof v !== 'string' || v.length < 10) return texto(v);
  const [a, m, d] = v.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : v.slice(0, 10);
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Nombre del mes sin `toLocaleDateString`: la hoja tiene que salir igual en
// cualquier equipo, con o sin ICU completo.
const mesLargo = (iso: string): string => {
  const [a, m] = iso.slice(0, 7).split('-');
  const i = Number(m) - 1;
  return MESES[i] ? `${MESES[i]} de ${a}` : iso.slice(0, 7);
};

const duracion = (seg: number): string => {
  const min = Math.round(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Copys espejados de `transferencias.ts` (MOTIVO_COPY / ESTADO_ALUMNO_COPY).
// No se importan: este módulo lo corre Node crudo en los tests y un import
// entre libs sin extensión no resuelve. La paridad la sostiene un test.
export const MOTIVO_CIERRE: Record<string, string> = {
  migracion: 'Se mudó',
  egreso: 'Egresó',
  error_carga: 'Error de carga',
  arco_baja: 'Baja a pedido de la familia',
};
export const ESTADO_ALUMNO: Record<string, string> = {
  activo: 'En el aula',
  en_transito: 'En tránsito',
  egresado: 'Egresó',
  baja: 'Baja',
};

// Los estados internos del motor de dominio no se le muestran crudos a una
// familia: 'en_construccion' no le dice nada a nadie.
export const ESTADO_NODO_FAMILIA: Record<string, string> = {
  no_empezado: 'Todavía no lo empezó',
  en_construccion: 'En camino',
  a_reforzar: 'Necesita más práctica',
  dominado: 'Dominado',
};

export function seccionesDelLegajo(legajo: Record<string, unknown> | null | undefined): SeccionLegajo[] {
  const l = (legajo ?? {}) as Record<string, unknown>;
  const perfil = (l.perfil ?? {}) as Record<string, unknown>;
  const arr = (k: string): Record<string, unknown>[] =>
    Array.isArray(l[k]) ? (l[k] as Record<string, unknown>[]) : [];

  const secciones: SeccionLegajo[] = [];
  const seccion = (s: Omit<SeccionLegajo, 'bloques' | 'filas'> & Partial<Pick<SeccionLegajo, 'bloques' | 'filas'>>) =>
    secciones.push({ filas: [], bloques: [], ...s });

  seccion({
    titulo: 'Identidad',
    vacio: Object.keys(perfil).length === 0,
    filas: [
      { etiqueta: 'Nombre', valor: texto(perfil.nombre) },
      { etiqueta: 'Avatar', valor: texto(perfil.avatar) },
      { etiqueta: 'Grado actual', valor: texto(perfil.grado) },
      { etiqueta: 'Estado', valor: ESTADO_ALUMNO[String(perfil.estado)] ?? texto(perfil.estado) },
      { etiqueta: 'Excluido de procesamiento no esencial', valor: texto(perfil.excluido_procesamiento) },
      // No hay "identificador EDUTIA" a propósito: el legajo se le entrega a la
      // familia y el UUID interno no le sirve para nada.
      { etiqueta: 'Documentos o identificadores', valor: 'EDUTIA no registra ninguno' },
    ],
  });

  // `admin-arco` manda el nombre de la escuela en `escuela` (join aplanado);
  // se leen los alias viejos por si el shape cambia de vuelta.
  const matriculas = arr('matriculas');
  seccion({
    titulo: 'Recorrido escolar',
    nota: 'Las escuelas por las que pasó, con las fechas en que estuvo en cada una.',
    vacio: matriculas.length === 0,
    filas: matriculas.map((m, i) => ({
      etiqueta: `Matrícula ${i + 1}`,
      valor: `${texto(m.escuela ?? m.escuela_nombre ?? m.escuela_id)}${m.grado ? ` · ${texto(m.grado)}° grado` : ''} · ${fecha(m.fecha_inicio)} → ${m.fecha_fin ? fecha(m.fecha_fin) : 'en curso'}${m.motivo_cierre ? ` · ${MOTIVO_CIERRE[String(m.motivo_cierre)] ?? texto(m.motivo_cierre)}` : ''}`,
    })),
  });

  const consentimientos = arr('consentimientos');
  seccion({
    titulo: 'Consentimientos',
    nota: 'Los permisos que dio un adulto responsable para que el chico use EDUTIA.',
    vacio: consentimientos.length === 0,
    filas: consentimientos.map((c, i) => ({
      etiqueta: `Consentimiento ${i + 1}`,
      valor: `${texto(c.alcance)} · ${texto(c.adulto_nombre)} (${texto(c.adulto_vinculo)}) · ${texto(c.estado)} · ${fecha(c.otorgado_at ?? c.created_at)}`,
    })),
  });

  // La fn devuelve el progreso por nodo bajo `progreso`, no `alumno_nodo`.
  const nodos = arr('progreso').length > 0 ? arr('progreso') : arr('alumno_nodo');
  seccion({
    titulo: 'Cómo viene aprendiendo',
    nota: 'Un renglón por tema. El puntaje va de 0 a 100 y sube cuando resuelve bien ejercicios nuevos y más difíciles.',
    vacio: nodos.length === 0,
    filas: nodos.map((n) => ({
      etiqueta: texto(n.nodo ?? n.nodo_nombre),
      valor: `${ESTADO_NODO_FAMILIA[String(n.estado)] ?? texto(n.estado)} · ${Math.round(num(n.puntaje))} de 100${n.actualizado_at ? ` · última práctica ${fecha(n.actualizado_at)}` : ''}`,
    })),
  });

  const sesiones = arr('sesiones');
  const respuestas = arr('respuestas');
  const porMes = new Map<string, { sesiones: number; aciertos: number; total: number; seg: number }>();
  for (const s of sesiones) {
    const f = typeof s.fecha === 'string' ? s.fecha.slice(0, 7) : '';
    if (!f) continue;
    const acc = porMes.get(f) ?? { sesiones: 0, aciertos: 0, total: 0, seg: 0 };
    acc.sesiones += 1;
    acc.aciertos += num(s.aciertos);
    acc.total += num(s.total);
    acc.seg += num(s.duracion_seg);
    porMes.set(f, acc);
  }
  const meses = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const totalEjercicios = meses.reduce((n, [, m]) => n + m.total, 0);
  const totalAciertos = meses.reduce((n, [, m]) => n + m.aciertos, 0);
  seccion({
    titulo: 'Práctica mes a mes',
    // El % es DE ESTE CHICO consigo mismo: no se compara con otros, porque cada
    // uno practica en su nivel y con dificultad adaptativa.
    nota: 'Cuánto practicó cada mes. El porcentaje es de sus propios ejercicios: no se compara con el de otros chicos.',
    vacio: sesiones.length === 0,
    filas: [
      ...meses.map(([clave, m]) => ({
        etiqueta: mesLargo(clave),
        valor: `${m.sesiones} ${m.sesiones === 1 ? 'práctica' : 'prácticas'} · ${m.total} ${m.total === 1 ? 'ejercicio' : 'ejercicios'}${m.total > 0 ? ` · ${Math.round((m.aciertos / m.total) * 100)}% de aciertos` : ''}${m.seg > 0 ? ` · ${duracion(m.seg)}` : ''}`,
      })),
      {
        etiqueta: 'Total',
        valor: `${sesiones.length} ${sesiones.length === 1 ? 'práctica' : 'prácticas'} · ${totalEjercicios} ${totalEjercicios === 1 ? 'ejercicio' : 'ejercicios'}${totalEjercicios > 0 ? ` · ${Math.round((totalAciertos / totalEjercicios) * 100)}% de aciertos` : ''}`,
      },
      // Se informa que existen aunque no se transcriban: es un dato del chico y
      // la familia puede pedir el detalle.
      {
        etiqueta: 'Respuestas guardadas',
        valor: `${respuestas.length} ${respuestas.length === 1 ? 'respuesta' : 'respuestas'}, una por una, con su fecha. El detalle completo se puede pedir en la escuela.`,
      },
    ],
  });

  const evaluaciones = arr('evaluaciones');
  seccion({
    titulo: 'Devoluciones de SOL',
    nota: 'Lo que SOL, el copiloto de práctica, le escribió a la maestra después de cada práctica.',
    vacio: evaluaciones.length === 0,
    bloques: evaluaciones.map((e) => {
      const reforzar = Array.isArray(e.a_reforzar) ? (e.a_reforzar as unknown[]).map(String).filter(Boolean) : [];
      return {
        titulo: `Práctica del ${fecha(e.created_at)}`,
        partes: [
          { texto: texto(e.resumen) },
          ...(reforzar.length > 0 ? [{ titulo: 'Para seguir practicando', texto: reforzar.join(', ') }] : []),
        ],
      };
    }),
  });

  const boletines = arr('boletines');
  seccion({
    titulo: 'Boletines',
    nota: 'Los boletines que escribió la maestra con LUNA. Se transcriben completos.',
    vacio: boletines.length === 0,
    bloques: boletines.map((b) => ({
      titulo: `Boletín de ${texto(b.periodo)}`,
      sub: `${texto(b.estado)} · versión ${texto(b.version)}`,
      partes: partesDelBoletin(b.contenido),
    })),
  });

  return secciones;
}

// Lectura tolerante del contenido del boletín: los generados antes de los
// prompts v2 quedaron con el shape viejo { materias:[{materia,texto}],
// actitud, sugerencia }. Mismo criterio que la pantalla de la docente.
export function partesDelBoletin(contenido: unknown): ParteLegajo[] {
  const c = (contenido ?? {}) as Record<string, unknown>;
  const crudas = Array.isArray(c.secciones)
    ? (c.secciones as Record<string, unknown>[]).map((s) => ({ titulo: String(s?.titulo ?? ''), texto: String(s?.texto ?? '') }))
    : Array.isArray(c.materias)
      ? (c.materias as Record<string, unknown>[]).map((m) => ({ titulo: String(m?.materia ?? ''), texto: String(m?.texto ?? '') }))
      : [];
  const partes: ParteLegajo[] = crudas.filter((s) => s.texto.trim().length > 0);

  const actitud = String(c.actitud ?? '').trim();
  if (actitud) partes.push({ titulo: 'Cómo se planta frente a la tarea', texto: actitud });

  const sugerencia = String(c.sugerencia_proximo_periodo ?? c.sugerencia ?? '').trim();
  if (sugerencia) partes.push({ titulo: 'Para el próximo período', texto: sugerencia });

  // Un boletín aprobado siempre tiene texto; si no lo tiene, se dice, no se
  // deja el bloque mudo.
  return partes.length > 0 ? partes : [{ texto: 'Este boletín todavía no tiene texto escrito.' }];
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

// Título del documento mientras se imprime: Chrome usa `document.title` como
// nombre por defecto del PDF que guarda. Sin el nombre del chico a propósito —
// el archivo puede terminar en cualquier carpeta compartida.
export function tituloDocumentoLegajo(alumnoId: string, fechaISO: string): string {
  return `legajo-${String(alumnoId).slice(0, 8)}-${fechaISO.slice(0, 10)}`;
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
