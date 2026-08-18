// Lógica PURA de las MÉTRICAS DE VALOR del panel admin: no "cuánta gente la
// usó" sino "qué le pasó al chico que la usó".
// Spec: docs/superpowers/specs/2026-08-17-metricas-de-valor-design.md
//
// Mismo contrato que web/lib/admin/metricas.ts: recibe filas ya traídas + el
// rango o `now` INYECTADO (nada de new Date() adentro) → determinística y
// unit-testeable con node --test (tests/unit/admin-valor.test.mjs). Standalone
// a propósito: cero imports de otros libs (Next quiere import sin extensión;
// node --test la quiere con .ts). Quien toca la red es admin-metricas.
//
// Va aparte de metricas.ts (que ya tiene 327 líneas y mide adopción/volumen):
// esto mide VALOR y se nutre de tablas distintas (hito_aprendizaje,
// snapshot_aprendizaje, luna_alerta — migración 0032).
//
// HONESTIDAD DE LOS DATOS (no negociable, ver spec):
// - Los hitos con origen='backfill' tienen fecha APROXIMADA (se sembraron desde
//   alumno_nodo.actualizado_at al aplicar 0032). NUNCA entran en una serie
//   temporal ni en el conteo del período: se informan aparte como "antes de la
//   medición".
// - Con menos de MIN_MUESTRA observaciones no se devuelve porcentaje: `null`.
//   Un 100% sobre n=1 es una mentira con formato de dato.
// - Toda función con listas vacías devuelve ceros / null / listas vacías, nunca
//   NaN.

const HORA_MS = 3_600_000;

// Debajo de esto una tasa no se publica como porcentaje (ver arriba).
export const MIN_MUESTRA = 5;

// Supuesto EXPLÍCITO de "horas ahorradas": lo que tarda una maestra en escribir
// a mano un boletín mensual. Es una estimación declarada, no un dato medido; el
// front la muestra siempre etiquetada.
export const MINUTOS_POR_BOLETIN = 18;

// ── Tipos de las filas que llegan ───────────────────────────────────────────

export type TipoHito = 'dominado' | 'destrabado' | 'trabado' | 'override';

export type HitoFila = {
  tipo: TipoHito | string;
  alumno_id: string;
  nodo_id?: string | null;
  escuela_id?: string | null;
  grado?: number | null;
  ejercicios_hasta?: number | null;
  puntaje?: number | null;
  origen?: string | null; // 'vivo' | 'backfill'
  created_at: string;
};

export type SnapshotFila = { fecha: string; escuela_id?: string | null; bucket: number; nodos: number };
export type NapTemaFila = { id: string; grado: number; materia: string; nombre?: string | null };
export type NodoMapeado = { id: string; nap_tema_id?: string | null };
export type AlumnoNodoFila = { alumno_id: string; nodo_id: string; estado: string };
export type AlumnoGrado = { id: string; grado?: number | null };
export type AlertaEmitida = { docente_id: string; clave: string; tipo: string; prioridad?: string | null; primera_vez_at: string };
export type AlertaAtendida = { docente_id: string; clave: string; atendida_at: string };
export type BoletinValor = { estado?: string | null; version?: number | null; created_at?: string | null };

export type Rango = { desde: Date; hasta: Date };

// ── Helpers ────────────────────────────────────────────────────────────────

// Timestamp en ms, o NaN si falta o es inválido (las comparaciones con NaN dan
// false → la fila rara queda afuera sin romper nada).
function ts(iso?: string | null): number {
  if (!iso) return NaN;
  const v = new Date(iso).getTime();
  return Number.isFinite(v) ? v : NaN;
}

function enRango(iso: string | null | undefined, r: Rango): boolean {
  const v = ts(iso);
  return v >= r.desde.getTime() && v < r.hasta.getTime();
}

// Mediana clásica: con cantidad par, promedio de los dos del medio. Lista
// vacía → null (no 0: "no sé" y "cero" no son lo mismo).
export function mediana(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : Math.round(((xs[m - 1] + xs[m]) / 2) * 100) / 100;
}

// Porcentaje entero, o null si la muestra no alcanza (ver MIN_MUESTRA).
function tasa(parte: number, total: number, minimo = MIN_MUESTRA): number | null {
  if (total < minimo || total <= 0) return null;
  return Math.round((100 * parte) / total);
}

function pct(parte: number, total: number): number {
  return total > 0 ? Math.round((100 * parte) / total) : 0;
}

// 'YYYY-MM' de un ISO, en UTC (las series mensuales del panel no dependen del
// huso de quien mira).
function mesClave(iso?: string | null): string | null {
  const v = ts(iso);
  if (Number.isNaN(v)) return null;
  const d = new Date(v);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const esVivo = (h: HitoFila) => (h.origen ?? 'vivo') !== 'backfill';
const esTipo = (h: HitoFila, t: TipoHito) => h.tipo === t;

// ── 1. Temas dominados ─────────────────────────────────────────────────────

export type TemasDominados = {
  total: number; // hitos vivos del rango
  previo: number; // mismo largo de ventana, inmediatamente anterior
  delta: number;
  chicos: number; // chicos distintos que dominaron algo
  historicos: number; // backfill: "antes de la medición", NO se mezcla
};

// El hito `dominado` es caro (≥70 de puntaje, ≥2 `producir`, ≥1 difícil al
// primer intento, ≥50 respondidos) y pegajoso: no se regala. Por eso es LA
// métrica de valor y no un contador de actividad.
export function temasDominados(hitos: HitoFila[], rango: Rango): TemasDominados {
  const largo = rango.hasta.getTime() - rango.desde.getTime();
  const anterior: Rango = { desde: new Date(rango.desde.getTime() - largo), hasta: rango.desde };

  let total = 0;
  let previo = 0;
  let historicos = 0;
  const chicos = new Set<string>();

  for (const h of hitos ?? []) {
    if (!esTipo(h, 'dominado')) continue;
    if (!esVivo(h)) { historicos += 1; continue; }
    if (enRango(h.created_at, rango)) {
      total += 1;
      chicos.add(h.alumno_id);
    } else if (enRango(h.created_at, anterior)) {
      previo += 1;
    }
  }
  return { total, previo, delta: total - previo, chicos: chicos.size, historicos };
}

// ── 2. Esfuerzo para dominar ───────────────────────────────────────────────

export type EsfuerzoMes = { mes: string; mediana: number; n: number };
export type Esfuerzo = {
  mediana: number | null; // ejercicios hasta el hito, global
  n: number;
  serie: EsfuerzoMes[]; // de la más vieja a la más nueva
  tendencia: number | null; // último mes − primer mes: NEGATIVO es bueno
};

// Cuántos ejercicios le cuesta a un chico dominar un tema. Si BAJA mes a mes,
// SOL está eligiendo mejor: mide si mejoramos nosotros, no si practican más.
// Solo hitos vivos: el backfill cuenta también lo practicado DESPUÉS del hito.
export function esfuerzoParaDominar(hitos: HitoFila[]): Esfuerzo {
  const usables = (hitos ?? []).filter((h) => esTipo(h, 'dominado') && esVivo(h));
  const porMes = new Map<string, number[]>();
  const todos: number[] = [];

  for (const h of usables) {
    const n = Number(h.ejercicios_hasta ?? 0);
    if (!Number.isFinite(n)) continue;
    todos.push(n);
    const mes = mesClave(h.created_at);
    if (!mes) continue;
    const lista = porMes.get(mes) ?? [];
    lista.push(n);
    porMes.set(mes, lista);
  }

  const serie: EsfuerzoMes[] = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, xs]) => ({ mes, mediana: mediana(xs) as number, n: xs.length }));

  return {
    mediana: mediana(todos),
    n: todos.length,
    serie,
    tendencia: serie.length >= 2
      ? Math.round((serie[serie.length - 1].mediana - serie[0].mediana) * 100) / 100
      : null,
  };
}

// ── 3. Chicos destrabados ──────────────────────────────────────────────────

export type Destrabados = { chicos: number; eventos: number; trabados: number };

// Salir de `a_reforzar` es el caso más lindo del producto y hoy es invisible.
// Se cuentan CHICOS distintos, no eventos: un chico que destraba tres temas es
// una historia, no tres.
export function chicosDestrabados(hitos: HitoFila[], rango: Rango): Destrabados {
  const chicos = new Set<string>();
  let eventos = 0;
  let trabados = 0;
  for (const h of hitos ?? []) {
    if (!esVivo(h) || !enRango(h.created_at, rango)) continue;
    if (esTipo(h, 'destrabado')) { eventos += 1; chicos.add(h.alumno_id); }
    else if (esTipo(h, 'trabado')) trabados += 1;
  }
  return { chicos: chicos.size, eventos, trabados };
}

// ── 4. Histograma de puntaje ───────────────────────────────────────────────

export type FotoHistograma = { fecha: string | null; buckets: number[]; total: number };
export type Histograma = {
  hoy: FotoHistograma;
  antes: FotoHistograma | null;
  corrimiento: number | null; // deciles que se movió el promedio: POSITIVO es bueno
};

function fotoVacia(): FotoHistograma {
  return { fecha: null, buckets: Array(10).fill(0), total: 0 };
}

function armarFoto(filas: SnapshotFila[], fecha: string): FotoHistograma {
  const buckets = Array(10).fill(0) as number[];
  let total = 0;
  for (const f of filas) {
    if (f.fecha !== fecha) continue;
    const b = Math.max(0, Math.min(9, Math.floor(Number(f.bucket))));
    const n = Number(f.nodos ?? 0);
    if (!Number.isFinite(b) || !Number.isFinite(n)) continue;
    buckets[b] += n;
    total += n;
  }
  return { fecha, buckets, total };
}

function bucketPromedio(f: FotoHistograma): number | null {
  if (!f.total) return null;
  let acum = 0;
  for (let i = 0; i < f.buckets.length; i++) acum += i * f.buckets[i];
  return acum / f.total;
}

// La curva entera de la plataforma, hoy contra hace N días. Es lo único
// genuinamente poblacional (el estado de TODOS los nodos en un momento), por
// eso se fotografía de noche en vez de derivarse: no se puede reconstruir.
export function histogramaPuntaje(snapshots: SnapshotFila[], now: Date, diasAtras = 30): Histograma {
  const fechas = [...new Set((snapshots ?? []).map((s) => s.fecha).filter(Boolean))].sort();
  if (!fechas.length) return { hoy: fotoVacia(), antes: null, corrimiento: null };

  const ultima = fechas[fechas.length - 1];
  const objetivo = new Date(now.getTime() - diasAtras * 86_400_000).toISOString().slice(0, 10);
  // La foto más nueva que NO sea posterior al objetivo, y que no sea la de hoy.
  const previas = fechas.filter((f) => f <= objetivo && f !== ultima);
  const fechaAntes = previas.length ? previas[previas.length - 1] : null;

  const hoy = armarFoto(snapshots, ultima);
  const antes = fechaAntes ? armarFoto(snapshots, fechaAntes) : null;
  const pHoy = bucketPromedio(hoy);
  const pAntes = antes ? bucketPromedio(antes) : null;

  return {
    hoy,
    antes,
    corrimiento: pHoy !== null && pAntes !== null ? Math.round((pHoy - pAntes) * 10) / 10 : null,
  };
}

// ── 5. Cobertura del marco NAP ─────────────────────────────────────────────

export type CoberturaGrado = {
  grado: number;
  alumnos: number;
  temasTotal: number; // temas del catálogo NAP de ESE grado
  cubiertos: number; // unión: temas que la plataforma tocó en ese grado
  dominados: number;
  fueraDeGrado: number; // temas trabajados que son de OTRO grado
  pctCubierto: number; // unión / catálogo del grado
  pctPorAlumno: number; // promedio de la cobertura individual
};

export type Cobertura = {
  porGrado: CoberturaGrado[];
  global: { pctCubierto: number; temasTotal: number; cubiertos: number; alumnos: number };
};

// El diferencial: con los 289 temas oficiales en la base (0028), esto responde
// "¿qué porción de lo que el país pide para 3° tocó un chico de 3°?".
// `pctCubierto` es la UNIÓN del grado (qué tanto del marco toca la plataforma);
// `pctPorAlumno` es el promedio individual (la frase vendible: "el chico
// promedio cubrió X%"). Se muestran los dos porque significan cosas distintas.
// Un nodo sin `nap_tema_id` está FUERA del marco por construcción (Ética, etc.)
// y no cuenta ni arriba ni abajo de la fracción.
export function coberturaNap(datos: {
  napTemas: NapTemaFila[];
  nodos: NodoMapeado[];
  alumnoNodo: AlumnoNodoFila[];
  alumnos: AlumnoGrado[];
}): Cobertura {
  const temaDeNodo = new Map<string, string>();
  for (const n of datos.nodos ?? []) if (n.nap_tema_id) temaDeNodo.set(n.id, n.nap_tema_id);

  const gradoDeTema = new Map<string, number>();
  const totalPorGrado = new Map<number, number>();
  for (const t of datos.napTemas ?? []) {
    gradoDeTema.set(t.id, t.grado);
    totalPorGrado.set(t.grado, (totalPorGrado.get(t.grado) ?? 0) + 1);
  }

  const gradoDeAlumno = new Map<string, number>();
  const alumnosPorGrado = new Map<number, string[]>();
  for (const a of datos.alumnos ?? []) {
    if (a.grado === null || a.grado === undefined) continue;
    gradoDeAlumno.set(a.id, a.grado);
    const lista = alumnosPorGrado.get(a.grado) ?? [];
    lista.push(a.id);
    alumnosPorGrado.set(a.grado, lista);
  }

  // Por grado: unión de temas tocados / dominados. Por alumno: sus propios sets.
  const union = new Map<number, { tocados: Set<string>; dominados: Set<string>; fuera: Set<string> }>();
  const porAlumno = new Map<string, Set<string>>();
  const slot = (g: number) => {
    let s = union.get(g);
    if (!s) { s = { tocados: new Set(), dominados: new Set(), fuera: new Set() }; union.set(g, s); }
    return s;
  };

  for (const an of datos.alumnoNodo ?? []) {
    if (an.estado === 'no_empezado') continue; // tener la fila no es haberlo tocado
    const g = gradoDeAlumno.get(an.alumno_id);
    if (g === undefined) continue;
    const tema = temaDeNodo.get(an.nodo_id);
    if (!tema) continue; // fuera del marco a propósito
    const s = slot(g);
    if (gradoDeTema.get(tema) === g) {
      s.tocados.add(tema);
      if (an.estado === 'dominado') s.dominados.add(tema);
      const mio = porAlumno.get(an.alumno_id) ?? new Set<string>();
      mio.add(tema);
      porAlumno.set(an.alumno_id, mio);
    } else {
      s.fuera.add(tema);
    }
  }

  const porGrado: CoberturaGrado[] = [...alumnosPorGrado.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([grado, ids]) => {
      const s = union.get(grado) ?? { tocados: new Set<string>(), dominados: new Set<string>(), fuera: new Set<string>() };
      const temasTotal = totalPorGrado.get(grado) ?? 0;
      const individuales = ids.map((id) => pct((porAlumno.get(id) ?? new Set()).size, temasTotal));
      return {
        grado,
        alumnos: ids.length,
        temasTotal,
        cubiertos: s.tocados.size,
        dominados: s.dominados.size,
        fueraDeGrado: s.fuera.size,
        pctCubierto: pct(s.tocados.size, temasTotal),
        pctPorAlumno: individuales.length
          ? Math.round(individuales.reduce((a, b) => a + b, 0) / individuales.length)
          : 0,
      };
    });

  const alumnosTotal = porGrado.reduce((a, g) => a + g.alumnos, 0);
  const promedioPonderado = alumnosTotal
    ? Math.round(porGrado.reduce((a, g) => a + g.pctPorAlumno * g.alumnos, 0) / alumnosTotal)
    : 0;

  return {
    porGrado,
    global: {
      pctCubierto: promedioPonderado,
      temasTotal: porGrado.reduce((a, g) => a + g.temasTotal, 0),
      cubiertos: porGrado.reduce((a, g) => a + g.cubiertos, 0),
      alumnos: alumnosTotal,
    },
  };
}

// ── 6. Temas NAP que nadie toca ────────────────────────────────────────────

export type NapSinTocar = {
  total: number;
  cubiertos: number;
  sinTocar: NapTemaFila[];
  porMateria: { materia: string; total: number; sinTocar: number }[];
};

// Puntos ciegos de TODA la plataforma: temas del marco oficial que ningún nodo
// de ningún colegio mapea. Accionable: o falta contenido o falta programa.
export function napSinTocar(napTemas: NapTemaFila[], nodos: NodoMapeado[]): NapSinTocar {
  const mapeados = new Set<string>();
  for (const n of nodos ?? []) if (n.nap_tema_id) mapeados.add(n.nap_tema_id);

  const temas = napTemas ?? [];
  const sinTocar = temas.filter((t) => !mapeados.has(t.id));

  const acum = new Map<string, { total: number; sinTocar: number }>();
  for (const t of temas) {
    const a = acum.get(t.materia) ?? { total: 0, sinTocar: 0 };
    a.total += 1;
    if (!mapeados.has(t.id)) a.sinTocar += 1;
    acum.set(t.materia, a);
  }

  return {
    total: temas.length,
    cubiertos: temas.length - sinTocar.length,
    sinTocar,
    porMateria: [...acum.entries()]
      .map(([materia, a]) => ({ materia, ...a }))
      .sort((a, b) => b.sinTocar - a.sinTocar || a.materia.localeCompare(b.materia)),
  };
}

// ── 7. Alertas del copiloto ────────────────────────────────────────────────

export type CopilotoAlertas = {
  emitidas: number;
  atendidas: number;
  tasa: number | null;
  medianaHoras: number | null;
  porTipo: { tipo: string; emitidas: number; atendidas: number; tasa: number | null }[];
};

// La métrica más honesta del producto: si la seño marca "Listo ✓", LUNA está
// gobernando decisiones; si las ignora, LUNA es ruido bonito.
// El denominador son las alertas que LUNA efectivamente MOSTRÓ (las persiste el
// dashboard al calcularlas), no las que existirían si abriera la pantalla.
// Se cuentan las emitidas EN el rango; su atención vale aunque haya llegado
// después (si no, las alertas del final del rango arrancarían condenadas).
export function copilotoAlertas(
  emitidas: AlertaEmitida[],
  atendidas: AlertaAtendida[],
  rango: Rango,
): CopilotoAlertas {
  const atendidaAt = new Map<string, number>();
  for (const a of atendidas ?? []) {
    const v = ts(a.atendida_at);
    if (Number.isNaN(v)) continue;
    const k = `${a.docente_id}|${a.clave}`;
    const previo = atendidaAt.get(k);
    if (previo === undefined || v < previo) atendidaAt.set(k, v); // la primera vez
  }

  const delRango = (emitidas ?? []).filter((e) => enRango(e.primera_vez_at, rango));
  const horas: number[] = [];
  const porTipoAcum = new Map<string, { emitidas: number; atendidas: number }>();
  let atendidasN = 0;

  for (const e of delRango) {
    const slot = porTipoAcum.get(e.tipo) ?? { emitidas: 0, atendidas: 0 };
    slot.emitidas += 1;
    const cuando = atendidaAt.get(`${e.docente_id}|${e.clave}`);
    if (cuando !== undefined) {
      atendidasN += 1;
      slot.atendidas += 1;
      const dif = cuando - ts(e.primera_vez_at);
      if (Number.isFinite(dif) && dif >= 0) horas.push(Math.round(dif / HORA_MS));
    }
    porTipoAcum.set(e.tipo, slot);
  }

  return {
    emitidas: delRango.length,
    atendidas: atendidasN,
    tasa: tasa(atendidasN, delRango.length),
    medianaHoras: mediana(horas),
    porTipo: [...porTipoAcum.entries()]
      .map(([tipo, a]) => ({ tipo, ...a, tasa: tasa(a.atendidas, a.emitidas) }))
      .sort((a, b) => b.emitidas - a.emitidas || a.tipo.localeCompare(b.tipo)),
  };
}

// ── 8. Tendencia de boletines sin editar ───────────────────────────────────

export type BoletinMes = { mes: string; generados: number; aprobados: number; sinEditar: number; tasa: number | null };

// "Aprobado sin editar" = salió perfecto de LUNA (estado 'aprobado' y version 1;
// la versión sube al regenerar o corregir, 0016). Interesa como TENDENCIA: una
// caída mes a mes es una regresión de prompt detectada sola.
// La tasa es sobre GENERADOS, no sobre aprobados: un boletín que la seño nunca
// aprobó también es un boletín que LUNA no acertó.
export function serieBoletines(boletines: BoletinValor[]): BoletinMes[] {
  const acum = new Map<string, { generados: number; aprobados: number; sinEditar: number }>();
  for (const b of boletines ?? []) {
    const mes = mesClave(b.created_at);
    if (!mes) continue;
    const a = acum.get(mes) ?? { generados: 0, aprobados: 0, sinEditar: 0 };
    a.generados += 1;
    if (b.estado === 'aprobado') {
      a.aprobados += 1;
      if (Number(b.version) === 1) a.sinEditar += 1;
    }
    acum.set(mes, a);
  }
  return [...acum.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, a]) => ({ mes, ...a, tasa: tasa(a.sinEditar, a.generados) }));
}

// ── 9. Override docente ────────────────────────────────────────────────────

export type Override = { eventos: number; chicos: number; stock: number; pctStock: number };

// Cuántas veces la seño le lleva la contra al motor. Bajo = confía en la regla;
// alto = el modelo no matchea lo que ella ve en el aula. Interesante en los dos
// sentidos, por eso no hay "bueno" ni "malo" en el copy.
export function overrideDocente(
  hitos: HitoFila[],
  stockActual: { conOverride: number; total: number },
  rango: Rango,
): Override {
  let eventos = 0;
  const chicos = new Set<string>();
  for (const h of hitos ?? []) {
    if (!esTipo(h, 'override') || !esVivo(h) || !enRango(h.created_at, rango)) continue;
    eventos += 1;
    chicos.add(h.alumno_id);
  }
  const stock = stockActual?.conOverride ?? 0;
  return { eventos, chicos: chicos.size, stock, pctStock: pct(stock, stockActual?.total ?? 0) };
}

// ── 10. Horas ahorradas ────────────────────────────────────────────────────

export type HorasAhorradas = { boletines: number; horas: number; minutosPorBoletin: number; estimado: true };

// La historia de valor contada en la unidad que la maestra siente. Es una
// ESTIMACIÓN con supuesto declarado (MINUTOS_POR_BOLETIN): el front la muestra
// siempre etiquetada, nunca como si fuera medición.
export function horasAhorradas(boletines: BoletinValor[], rango: Rango): HorasAhorradas {
  const n = (boletines ?? []).filter((b) => b.estado === 'aprobado' && enRango(b.created_at, rango)).length;
  return {
    boletines: n,
    horas: Math.round(((n * MINUTOS_POR_BOLETIN) / 60) * 10) / 10,
    minutosPorBoletin: MINUTOS_POR_BOLETIN,
    estimado: true,
  };
}
