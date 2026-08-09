// Lógica PURA del observatorio educativo (WP-A — fase "Observatorio y avisos").
// Módulo hermano de index.ts SIN imports de Deno/supabase: testeable desde Node
// (patrón admin-costos/agregar.ts; tests/unit/admin-observatorio.test.mjs).
//
// ANONIMATO (D-OA3): acá se cocina el k-anonimato. Toda métrica de DESEMPEÑO
// (precisión, dominio) de una celda con menos de K_ANONIMATO alumnos distintos
// sale `null` + `muestraInsuficiente: true`; los conteos de volumen (colegios,
// alumnos, sesiones) sí se muestran. Ningún agregador devuelve nombres ni ids
// de alumnos — hay un test que congela eso (anonimato estructural).
//
// EJES (D-OA4): el primario es materia × grado × provincia. `nodo.nombre` no
// es comparable entre colegios → el nivel "tema" va solo como top-N con nombre
// normalizado, piso de MIN_RESPUESTAS_TEMA respuestas y flag `aproximado`.
//
// Determinístico: nada de new Date() acá adentro — las sesiones vienen YA
// filtradas por rango desde index.ts. Listas vacías → vacío/ceros, nunca NaN.

export const K_ANONIMATO = 5;
export const MIN_RESPUESTAS_TEMA = 20;
export const TOP_TEMAS = 10;

// ── Tipos de entrada (shapes de las filas que trae index.ts) ────────────────
export type EscuelaObs = { id: string; provincia?: string | null };
export type AlumnoObs = { id: string; grado?: number | null; escuela_id?: string | null };
export type SesionObs = {
  alumno_id: string;
  nodo_id?: string | null;
  aciertos?: number | null;
  total?: number | null;
};
export type NodoObs = { id: string; nombre?: string | null; programa_id?: string | null };
export type ProgramaObs = { id: string; materia_id?: string | null; grado?: number | null };
export type MateriaObs = { id: string; nombre?: string | null };
export type AlumnoNodoObs = { alumno_id: string; nodo_id: string; puntaje?: number | null };

// ── Tipos de salida (agregados, jamás individuos) ───────────────────────────
export type InfoNodo = { materia: string; grado: number };
export type FilaProvincia = {
  provincia: string;
  colegios: number;
  alumnosActivos: number;
  sesiones: number;
  precision: number | null; // % redondeado, null si muestra insuficiente o sin respuestas
  muestraInsuficiente: boolean;
};
export type FilaMateria = {
  materia: string;
  grado: number;
  alumnos: number;
  sesiones: number;
  precision: number | null;
  dominioPromedio: number | null; // promedio de alumno_nodo.puntaje (0-100), redondeado
  muestraInsuficiente: boolean;
};
export type TemaAgregado = { tema: string; alumnos: number; respuestas: number; precision: number };

// Nombre de tema comparable entre colegios (best-effort, D-OA4): trim +
// lowercase + colapsar espacios múltiples. Los acentos quedan como están (la
// docente los escribe igual en su idioma; normalizarlos "arreglaría" de más).
export function normalizarTema(nombre: string): string {
  return nombre.trim().toLowerCase().replace(/\s+/g, ' ');
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// % redondeado; total 0 → null (nunca NaN).
const pct = (aciertos: number, total: number): number | null =>
  total > 0 ? Math.round((aciertos / total) * 100) : null;

// Cadena nodo→programa→materia. Un nodo con la cadena rota (programa o
// materia inexistente) queda EXCLUIDO del índice (y por lo tanto de todos los
// agregados por materia). Las materias se agrupan case-insensitive (la seño
// puede haber escrito "Lengua" y "lengua"): el nombre que se muestra es la
// capitalización más frecuente (empate → la primera vista).
export function indexarCurriculo(
  nodos: NodoObs[],
  programas: ProgramaObs[],
  materias: MateriaObs[],
): Map<string, InfoNodo> {
  // clave lowercase → conteo por variante de capitalización (insertion order
  // de Map desempata a favor de la primera vista).
  const variantes = new Map<string, Map<string, number>>();
  const claveDeMateria = new Map<string, string>(); // materia_id → clave lowercase
  for (const m of materias) {
    const nombre = typeof m.nombre === 'string' ? m.nombre.trim() : '';
    if (!nombre) continue;
    const clave = nombre.toLowerCase();
    claveDeMateria.set(m.id, clave);
    let v = variantes.get(clave);
    if (!v) {
      v = new Map();
      variantes.set(clave, v);
    }
    v.set(nombre, (v.get(nombre) ?? 0) + 1);
  }
  const display = new Map<string, string>(); // clave lowercase → nombre a mostrar
  for (const [clave, v] of variantes) {
    let mejor = '';
    let max = 0;
    for (const [nombre, cuenta] of v) {
      if (cuenta > max) {
        mejor = nombre;
        max = cuenta;
      }
    }
    display.set(clave, mejor);
  }

  const programaPorId = new Map<string, ProgramaObs>();
  for (const p of programas) programaPorId.set(p.id, p);

  const indice = new Map<string, InfoNodo>();
  for (const n of nodos) {
    const prog = n.programa_id ? programaPorId.get(n.programa_id) : undefined;
    if (!prog) continue; // cadena rota: sin programa
    const clave = prog.materia_id ? claveDeMateria.get(prog.materia_id) : undefined;
    const materia = clave ? display.get(clave) : undefined;
    const grado = num(prog.grado);
    if (!materia || grado <= 0) continue; // cadena rota: sin materia (o grado inválido)
    indice.set(n.id, { materia, grado });
  }
  return indice;
}

// Agregado por jurisdicción (provincia). Las escuelas con provincia null van
// al bucket aparte `sinProvincia` (solo conteo de colegios: sin eje no hay
// agregado honesto). alumnosActivos = alumnos DISTINTOS con sesión en el
// rango; precisión con k-anonimato sobre esos alumnos.
export function agregarPorProvincia(
  datos: { escuelas: EscuelaObs[]; alumnos: AlumnoObs[]; sesiones: SesionObs[] },
  k: number = K_ANONIMATO,
): { filas: FilaProvincia[]; sinProvincia: { colegios: number } } {
  const { escuelas, alumnos, sesiones } = datos;

  const provinciaDeEscuela = new Map<string, string>();
  const colegiosPor = new Map<string, number>();
  let sinProvincia = 0;
  for (const e of escuelas) {
    const prov = typeof e.provincia === 'string' && e.provincia.trim() ? e.provincia : null;
    if (!prov) {
      sinProvincia += 1;
      continue;
    }
    provinciaDeEscuela.set(e.id, prov);
    colegiosPor.set(prov, (colegiosPor.get(prov) ?? 0) + 1);
  }

  const provinciaDeAlumno = new Map<string, string>();
  for (const a of alumnos) {
    const prov = a.escuela_id ? provinciaDeEscuela.get(a.escuela_id) : undefined;
    if (prov) provinciaDeAlumno.set(a.id, prov);
  }

  type Acum = { alumnos: Set<string>; sesiones: number; aciertos: number; total: number };
  const acum = new Map<string, Acum>();
  for (const s of sesiones) {
    const prov = provinciaDeAlumno.get(s.alumno_id);
    if (!prov) continue; // alumno de escuela sin provincia (o desconocida): fuera de las filas
    let a = acum.get(prov);
    if (!a) {
      a = { alumnos: new Set(), sesiones: 0, aciertos: 0, total: 0 };
      acum.set(prov, a);
    }
    a.alumnos.add(s.alumno_id);
    a.sesiones += 1;
    a.aciertos += num(s.aciertos);
    a.total += num(s.total);
  }

  const provincias = new Set<string>([...colegiosPor.keys(), ...acum.keys()]);
  const filas: FilaProvincia[] = [...provincias].map((provincia) => {
    const a = acum.get(provincia);
    const distintos = a ? a.alumnos.size : 0;
    const insuficiente = distintos < k;
    return {
      provincia,
      colegios: colegiosPor.get(provincia) ?? 0,
      alumnosActivos: distintos,
      sesiones: a?.sesiones ?? 0,
      precision: insuficiente ? null : pct(a?.aciertos ?? 0, a?.total ?? 0),
      muestraInsuficiente: insuficiente,
    };
  });
  filas.sort((x, y) => y.sesiones - x.sesiones || x.provincia.localeCompare(y.provincia, 'es'));
  return { filas, sinProvincia: { colegios: sinProvincia } };
}

// Agregado por celda materia × grado (el grado es el del PROGRAMA, no el del
// alumno: es lo que el chico está practicando). Las celdas nacen de las
// sesiones del rango; el dominio promedio sale de alumno_nodo (foto actual)
// de los nodos de la celda. `filtroProvincia` acota por la provincia del
// alumno (map alumnoId → provincia). Mismo k sobre alumnos distintos.
export function agregarPorMateria(
  datos: {
    sesiones: SesionObs[];
    curriculo: Map<string, InfoNodo>;
    alumnoNodo: AlumnoNodoObs[];
    provinciaDeAlumno: Map<string, string | null | undefined>;
  },
  k: number = K_ANONIMATO,
  filtroProvincia?: string,
): FilaMateria[] {
  const { sesiones, curriculo, alumnoNodo, provinciaDeAlumno } = datos;
  const pasaFiltro = (alumnoId: string) =>
    !filtroProvincia || provinciaDeAlumno.get(alumnoId) === filtroProvincia;

  type Acum = {
    materia: string;
    grado: number;
    alumnos: Set<string>;
    sesiones: number;
    aciertos: number;
    total: number;
    puntajes: number[];
  };
  const celdas = new Map<string, Acum>();
  const claveDe = (info: InfoNodo) => `${info.materia.toLowerCase()}|${info.grado}`;
  const slot = (info: InfoNodo): Acum => {
    const clave = claveDe(info);
    let c = celdas.get(clave);
    if (!c) {
      c = { materia: info.materia, grado: info.grado, alumnos: new Set(), sesiones: 0, aciertos: 0, total: 0, puntajes: [] };
      celdas.set(clave, c);
    }
    return c;
  };

  for (const s of sesiones) {
    const info = s.nodo_id ? curriculo.get(s.nodo_id) : undefined;
    if (!info || !pasaFiltro(s.alumno_id)) continue;
    const c = slot(info);
    c.alumnos.add(s.alumno_id);
    c.sesiones += 1;
    c.aciertos += num(s.aciertos);
    c.total += num(s.total);
  }

  // Dominio: solo suma a celdas que EXISTEN (con actividad en el rango) — el
  // observatorio muestra donde está pasando algo, no todo el catálogo.
  for (const an of alumnoNodo) {
    const info = curriculo.get(an.nodo_id);
    if (!info || !pasaFiltro(an.alumno_id)) continue;
    const c = celdas.get(claveDe(info));
    if (!c) continue;
    if (typeof an.puntaje === 'number' && Number.isFinite(an.puntaje)) c.puntajes.push(an.puntaje);
  }

  const filas: FilaMateria[] = [...celdas.values()].map((c) => {
    const insuficiente = c.alumnos.size < k;
    const dominio = c.puntajes.length
      ? Math.round(c.puntajes.reduce((s, p) => s + p, 0) / c.puntajes.length)
      : null;
    return {
      materia: c.materia,
      grado: c.grado,
      alumnos: c.alumnos.size,
      sesiones: c.sesiones,
      precision: insuficiente ? null : pct(c.aciertos, c.total),
      dominioPromedio: insuficiente ? null : dominio,
      muestraInsuficiente: insuficiente,
    };
  });
  filas.sort((a, b) => a.materia.localeCompare(b.materia, 'es') || a.grado - b.grado);
  return filas;
}

// Top de "temas que más cuestan" dentro de una celda materia + grado
// (opcionalmente acotado a una provincia). Best-effort HONESTO (D-OA4): los
// nombres de tema los escribe cada docente, así que se agrupan por texto
// normalizado y la respuesta lleva `aproximado: true` SIEMPRE. Un tema entra
// solo con respuestas totales >= MIN_RESPUESTAS_TEMA Y alumnos distintos >= k;
// se ordena por precisión ascendente (lo que más cuesta primero) y se corta
// en TOP_TEMAS.
export function topTemasQueCuestan(
  datos: {
    sesiones: SesionObs[];
    nodos: NodoObs[];
    curriculo: Map<string, InfoNodo>;
    provinciaDeAlumno: Map<string, string | null | undefined>;
  },
  filtro: { materia: string; grado: number; provincia?: string },
  k: number = K_ANONIMATO,
): { temas: TemaAgregado[]; aproximado: true } {
  const { sesiones, nodos, curriculo, provinciaDeAlumno } = datos;
  const materiaBuscada = normalizarTema(filtro.materia);

  const nombreDeNodo = new Map<string, string>();
  for (const n of nodos) {
    if (typeof n.nombre === 'string' && n.nombre.trim()) nombreDeNodo.set(n.id, n.nombre);
  }

  type Acum = { alumnos: Set<string>; aciertos: number; total: number };
  const temas = new Map<string, Acum>();
  for (const s of sesiones) {
    if (!s.nodo_id) continue;
    const info = curriculo.get(s.nodo_id);
    if (!info || info.grado !== filtro.grado) continue;
    if (normalizarTema(info.materia) !== materiaBuscada) continue;
    if (filtro.provincia && provinciaDeAlumno.get(s.alumno_id) !== filtro.provincia) continue;
    const nombre = nombreDeNodo.get(s.nodo_id);
    if (!nombre) continue;
    const tema = normalizarTema(nombre);
    let t = temas.get(tema);
    if (!t) {
      t = { alumnos: new Set(), aciertos: 0, total: 0 };
      temas.set(tema, t);
    }
    t.alumnos.add(s.alumno_id);
    t.aciertos += num(s.aciertos);
    t.total += num(s.total);
  }

  const lista: TemaAgregado[] = [];
  for (const [tema, t] of temas) {
    if (t.total < MIN_RESPUESTAS_TEMA || t.alumnos.size < k) continue;
    lista.push({
      tema,
      alumnos: t.alumnos.size,
      respuestas: t.total,
      precision: pct(t.aciertos, t.total) ?? 0, // total >= MIN > 0: nunca cae al 0
    });
  }
  lista.sort(
    (a, b) => a.precision - b.precision || b.respuestas - a.respuestas || a.tema.localeCompare(b.tema, 'es'),
  );
  return { temas: lista.slice(0, TOP_TEMAS), aproximado: true };
}
