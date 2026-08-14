'use client';
// Observatorio educativo (WP-A — fase "Observatorio y avisos"; restyle 2026-08
// al mock Admin.dc.html): agregados de aprendizaje SIEMPRE anónimos por
// jurisdicción (provincia), por materia × grado y, desde la fase "marco NAP",
// por eje y tema del marco curricular (Núcleos de Aprendizajes Prioritarios) —
// la vara común entre colegios, a diferencia de `nodo.nombre` que cada
// docente escribe distinto. Todo sale YA AGREGADO de admin-observatorio (a
// diferencia de métricas: mandar sesiones crudas al browser rompería el
// anonimato, D-OA3); acá solo se formatea.
// El diseño reemplaza las tablas densas por tarjetas: "Aprendizaje por zona"
// con chips Fuerte/Cuesta, "Tendencias por tema" con mini-barras por grado y
// "Desempeño por eje y tema (NAP)" con chips de materia + selector de grado.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN, CAMPO, ETIQUETA } from '@/lib/admin/tema';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';
import { PROVINCIAS } from '@/lib/admin/provincias';
import { MATERIAS_NAP } from '@/lib/admin/nap';
import FiltroChips from '@/components/admin/FiltroChips';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

// Rangos del selector (días). El backend acota igual (máximo 90).
const RANGOS = [30, 60, 90] as const;
// Grados del marco NAP (nivel primario completo, D-NAP1).
const GRADOS = [1, 2, 3, 4, 5, 6, 7] as const;

const h2: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 12px' };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22 };

// Pill gris de k-anonimato (D-OA3): la celda existe pero su desempeño no se
// muestra con menos de 5 alumnos distintos.
const pillInsuf = (
  <span style={{ display: 'inline-block', background: ADMIN.neutroFondo, color: ADMIN.neutroTexto, borderRadius: 999, padding: '4px 12px', fontFamily: QUICK, fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
    muestra insuficiente
  </span>
);

type FilaProvincia = {
  provincia: string;
  colegios: number;
  alumnosActivos: number;
  sesiones: number;
  precision: number | null;
  muestraInsuficiente: boolean;
};
type FilaMateria = {
  materia: string;
  grado: number;
  alumnos: number;
  sesiones: number;
  precision: number | null;
  dominioPromedio: number | null;
  muestraInsuficiente: boolean;
};

// Espejo de EjeDesempeno/TemaDesempeno de
// supabase/functions/admin-observatorio/observatorio-logica.ts (la verdad
// vive ahí; acá solo se replica la forma para tipar la respuesta del front).
// `precision`, `dominioPromedio` y `dominados` en null = no se publica por
// k-anonimato, NUNCA cero.
type TemaDesempeno = {
  temaId: string; tema: string;
  alumnos: number; respuestas: number;
  precision: number | null; dominioPromedio: number | null; dominados: number | null;
  colegiosConTema: number; colegiosTotal: number;
  muestraInsuficiente: boolean;
};
type EjeDesempeno = {
  ejeId: string; eje: string;
  alumnos: number;
  precision: number | null; dominioPromedio: number | null; dominados: number | null;
  colegiosConTema: number; colegiosTotal: number;
  muestraInsuficiente: boolean;
  temas: TemaDesempeno[];
};

type RespResumen = { rango_dias: number; generado_en: string; provincias: FilaProvincia[]; sinProvincia: { colegios: number } };
type RespMaterias = { filas: FilaMateria[] };
type RespDesempeno = { rango_dias: number; ejes: EjeDesempeno[] };

// Materia más fuerte y más floja de una jurisdicción, sobre las filas con
// muestra suficiente: si no hay al menos dos, no se muestran chips.
function fuerteYFloja(filas: FilaMateria[]): { fuerte: string | null; cuesta: string | null } {
  const utiles = filas.filter((f) => !f.muestraInsuficiente && f.precision !== null);
  if (utiles.length === 0) return { fuerte: null, cuesta: null };
  const ordenadas = [...utiles].sort((a, b) => (b.precision ?? 0) - (a.precision ?? 0));
  const fuerte = ordenadas[0];
  const cuesta = ordenadas[ordenadas.length - 1];
  return {
    fuerte: fuerte.materia,
    cuesta: cuesta.materia === fuerte.materia ? null : cuesta.materia,
  };
}

// Barra de dominio (0-100): mismo esquema de color que el resto del panel
// (verde ≥70, ámbar ≥50, rojo cálido debajo).
function BarraDominio({ valor }: { valor: number }) {
  const color = valor >= 70 ? ADMIN.okCheck : valor >= 50 ? ADMIN.sol : ADMIN.danger;
  return (
    <div style={{ height: 8, background: ADMIN.divisor, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: `${Math.min(100, Math.max(0, valor))}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  );
}

// Texto de una métrica secundaria del NAP (precisión, dominaron), con la
// MISMA regla de k-anonimato que el número grande de dominio: alumnos===0 →
// "sin datos todavía"; fila suprimida o la métrica puntual en null →
// "muestra insuficiente" (nunca un cero ni un número inventado); si no, el
// valor.
function textoMetrica(sinDatos: boolean, muestraInsuficiente: boolean, valor: number | null): string {
  if (sinDatos) return 'sin datos todavía';
  if (muestraInsuficiente || valor === null) return 'muestra insuficiente';
  return `${valor}%`;
}

// Fila de eje o de tema del marco NAP (misma pinta; el tema va indentado). La
// cobertura ("N de M colegios") va SIEMPRE al lado del número, nunca en un
// tooltip (D-NAP5): sin ella, un tema que da un solo colegio se lee como dato
// provincial. `alumnos === 0` es "sin datos todavía" (nadie lo practicó
// todavía, no es un error); `muestraInsuficiente` con alumnos > 0 es la pill
// gris de k-anonimato. Tres métricas, jerarquía clara: DOMINIO es el número
// grande (rotulado, para no confundirlo con la "Precisión: X%" de la tarjeta
// de al lado) con su barra; precisión y "dominaron" van como stats
// secundarias, sin competir con el número grande.
function FilaEjeTema({
  nombre, alumnos, respuestas, dominioPromedio, precision, dominados, muestraInsuficiente,
  colegiosConTema, colegiosTotal, indentado, expandible, abierto, onClick,
}: {
  nombre: string;
  alumnos: number;
  respuestas?: number;
  dominioPromedio: number | null;
  precision: number | null;
  dominados: number | null;
  muestraInsuficiente: boolean;
  colegiosConTema: number;
  colegiosTotal: number;
  indentado?: boolean;
  expandible?: boolean;
  abierto?: boolean;
  onClick?: () => void;
}) {
  const sinDatos = alumnos === 0;
  const dominioSuprimido = muestraInsuficiente || dominioPromedio === null;
  const contenido = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {expandible && (
            <span style={{ display: 'inline-block', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease', color: ADMIN.tinta2, fontSize: 11 }}>▸</span>
          )}
          <span style={{ fontFamily: QUICK, fontWeight: indentado ? 600 : 700, fontSize: indentado ? 14 : 15, color: ADMIN.ink }}>{nombre}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: ADMIN.tinta2, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {colegiosConTema} de {colegiosTotal} {colegiosTotal === 1 ? 'colegio' : 'colegios'}
          </span>
          {sinDatos ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: ADMIN.tinta3 }}>sin datos todavía</span>
          ) : dominioSuprimido ? (
            pillInsuf
          ) : (
            // Rotulado "Dominio" a propósito: es la misma pantalla donde
            // "Aprendizaje por zona" rotula su número "Precisión: X%" — sin
            // etiqueta, este número se lee como esa otra métrica.
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
              <span style={{ fontFamily: QUICK, fontWeight: 800, fontSize: indentado ? 16 : 20, color: ADMIN.oscuro }}>{dominioPromedio}%</span>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: ADMIN.tinta2, textTransform: 'uppercase', letterSpacing: 0.4 }}>Dominio</span>
            </span>
          )}
        </span>
      </div>
      {!sinDatos && !dominioSuprimido && <BarraDominio valor={dominioPromedio as number} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: ADMIN.tinta2, fontWeight: 600 }}>
          {alumnos} {alumnos === 1 ? 'alumno' : 'alumnos'}{typeof respuestas === 'number' ? ` · ${respuestas} respuestas` : ''}
        </span>
        <span style={{ fontSize: 11.5, color: ADMIN.tinta2, fontWeight: 700 }}>
          Precisión: {textoMetrica(sinDatos, muestraInsuficiente, precision)}
        </span>
        <span style={{ fontSize: 11.5, color: ADMIN.tinta2, fontWeight: 700 }}>
          Dominaron: {textoMetrica(sinDatos, muestraInsuficiente, dominados)}
        </span>
      </div>
    </>
  );

  const paddingLeft = indentado ? 34 : 14;
  if (expandible) {
    return (
      <button
        onClick={onClick}
        className="ad-flat"
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 12, padding: `12px 14px 12px ${paddingLeft}px`, cursor: 'pointer', font: 'inherit' }}
      >
        {contenido}
      </button>
    );
  }
  return (
    <div style={{ padding: `10px 14px 10px ${paddingLeft}px` }}>
      {contenido}
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const [rango, setRango] = useState<number>(30);
  const [provSel, setProvSel] = useState(''); // '' = todas
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [provincias, setProvincias] = useState<FilaProvincia[]>([]);
  const [sinProvincia, setSinProvincia] = useState(0);
  const [materias, setMaterias] = useState<FilaMateria[]>([]);
  // Fuerte/Cuesta por jurisdicción: una llamada de `materias` por provincia con
  // datos (son pocas y el agregado ya viene del server).
  const [porZona, setPorZona] = useState<Record<string, { fuerte: string | null; cuesta: string | null }>>({});

  // Desempeño contra el marco NAP: chips de materia + selector de grado,
  // filtrados también por la provincia y el rango de arriba (misma llamada
  // que el resto de la pantalla, acción propia).
  const [materiaSel, setMateriaSel] = useState<string>(MATERIAS_NAP[0]);
  const [gradoSel, setGradoSel] = useState<number>(1);
  const [cargandoNap, setCargandoNap] = useState(true);
  const [errorNap, setErrorNap] = useState('');
  const [ejesNap, setEjesNap] = useState<EjeDesempeno[]>([]);
  const [ejeAbierto, setEjeAbierto] = useState<string | null>(null);

  // Resumen por provincia + materias (la segunda depende también del select de
  // provincia).
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      const [rRes, rMat] = await Promise.all([
        llamarAdmin<RespResumen>('admin-observatorio', 'resumen', { rango_dias: rango }),
        llamarAdmin<RespMaterias>('admin-observatorio', 'materias', {
          rango_dias: rango,
          ...(provSel ? { provincia: provSel } : {}),
        }),
      ]);
      if (!vivo) return;
      const fallo = [rRes, rMat].find((r) => !r.ok);
      if (fallo) {
        setError(ERRS_ADMIN[fallo.data.error ?? ''] ?? 'No se pudo cargar el observatorio. Probá de nuevo.');
        setCargando(false);
        return;
      }
      const filasProv = rRes.data.provincias ?? [];
      setProvincias(filasProv);
      setSinProvincia(rRes.data.sinProvincia?.colegios ?? 0);
      setMaterias(rMat.data.filas ?? []);
      setCargando(false);

      // Detalle por zona: best-effort, si falla se queda sin chips.
      const conDatos = filasProv.filter((p) => p.sesiones > 0);
      const detalles = await Promise.all(conDatos.map((p) =>
        llamarAdmin<RespMaterias>('admin-observatorio', 'materias', { rango_dias: rango, provincia: p.provincia })
          .then((r) => [p.provincia, r.ok ? fuerteYFloja(r.data.filas ?? []) : { fuerte: null, cuesta: null }] as const)
          .catch(() => [p.provincia, { fuerte: null, cuesta: null }] as const),
      ));
      if (vivo) setPorZona(Object.fromEntries(detalles));
    })();
    return () => { vivo = false; };
  }, [rango, provSel]);

  // Desempeño NAP: acción propia, independiente del resumen/materias de
  // arriba (así una falla en una no tapa a la otra). Catálogo vacío → `ejes`
  // vuelve `[]`, que NO es un error (ver estado vacío más abajo).
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargandoNap(true);
      setErrorNap('');
      setEjeAbierto(null);
      const r = await llamarAdmin<RespDesempeno>('admin-observatorio', 'desempeno', {
        rango_dias: rango,
        materia: materiaSel,
        grado: gradoSel,
        ...(provSel ? { provincia: provSel } : {}),
      });
      if (!vivo) return;
      if (!r.ok) {
        setErrorNap(ERRS_ADMIN[r.data.error ?? ''] ?? 'No se pudo cargar el desempeño por eje y tema. Probá de nuevo.');
        setCargandoNap(false);
        return;
      }
      setEjesNap(r.data.ejes ?? []);
      setCargandoNap(false);
    })();
    return () => { vivo = false; };
  }, [rango, provSel, materiaSel, gradoSel]);

  const vacioGlobal = !cargando && !error && provincias.length === 0 && materias.length === 0 && sinProvincia === 0;

  // Materias agrupadas: una tarjeta de tendencia por materia, con una barra por
  // grado (altura = dominio promedio, o precisión si no hay dominio).
  const porMateria = new Map<string, FilaMateria[]>();
  for (const f of materias) {
    const previas = porMateria.get(f.materia) ?? [];
    porMateria.set(f.materia, [...previas, f]);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: 0 }}>Observatorio educativo</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 5, background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 999, padding: 4 }}>
            {RANGOS.map((r) => (
              <button
                key={r}
                onClick={() => r !== rango && setRango(r)}
                style={{ background: r === rango ? ADMIN.base : 'transparent', color: r === rango ? '#fff' : ADMIN.tinta2, border: 'none', borderRadius: 999, padding: '8px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: r === rango ? 'default' : 'pointer' }}
              >
                {r} días
              </button>
            ))}
          </div>
          <select
            value={provSel}
            onChange={(e) => setProvSel(e.target.value)}
            style={{ padding: '10px 14px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12, fontFamily: NUNITO, fontWeight: 700, fontSize: 14, color: ADMIN.ink, background: ADMIN.carta, outline: 'none', cursor: 'pointer' }}
          >
            <option value="">Todas las jurisdicciones</option>
            {PROVINCIAS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Chip PERMANENTE de anonimato (D-OA3): se muestra siempre, con o sin datos. */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ADMIN.okFondo, border: `1.5px solid ${ADMIN.okBorde}`, borderRadius: 999, padding: '7px 16px', marginBottom: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: ADMIN.okCheck }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: ADMIN.okTexto }}>Datos agregados y anónimos — jamás datos individuales</span>
      </div>
      <div style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, marginBottom: 20 }}>
        Las celdas con menos de 5 alumnos se marcan como muestra insuficiente.
      </div>

      {error && (
        <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '14px 18px', color: ADMIN.warnTexto, fontWeight: 700, fontSize: 14 }}>
          {error}
        </div>
      )}

      {cargando && !error && (
        <div style={{ color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>Cargando…</div>
      )}

      {vacioGlobal && (
        <div style={{ ...carta, textAlign: 'center', padding: '48px 24px', maxWidth: 640 }}>
          <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>Todavía no hay actividad suficiente</div>
          <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>
            Cuando los chicos practiquen, el observatorio empieza a mostrar los agregados por zona.
          </div>
        </div>
      )}

      {!cargando && !error && !vacioGlobal && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }}>
          {/* ── Aprendizaje por zona ──────────────────────────────────── */}
          <div style={carta}>
            <h2 style={h2}>Aprendizaje por zona</h2>
            {provincias.length === 0 ? (
              <p style={{ fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: 0 }}>
                Todavía no hay colegios con provincia asignada.
              </p>
            ) : (
              provincias.map((f, i) => {
                const zona = porZona[f.provincia];
                return (
                  <div key={f.provincia} style={{ padding: '13px 0', borderBottom: i === provincias.length - 1 ? 'none' : `1px solid ${ADMIN.divisor}` }}>
                    <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.ink }}>
                      {f.provincia}{' '}
                      <span style={{ fontSize: 12, color: ADMIN.tinta2, fontWeight: 700 }}>
                        · {f.colegios} {f.colegios === 1 ? 'colegio' : 'colegios'} · {f.alumnosActivos} {f.alumnosActivos === 1 ? 'alumno activo' : 'alumnos activos'} · {f.sesiones} sesiones
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 7 }}>
                      {f.muestraInsuficiente ? (
                        pillInsuf
                      ) : (
                        <>
                          {f.precision !== null && (
                            <span style={{ background: ADMIN.burbuja, color: ADMIN.oscuro, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800 }}>
                              Precisión: {f.precision}%
                            </span>
                          )}
                          {zona?.fuerte && (
                            <span style={{ background: ADMIN.okFondo, color: ADMIN.okTexto, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800 }}>
                              Fuerte: {zona.fuerte}
                            </span>
                          )}
                          {zona?.cuesta && (
                            <span style={{ background: ADMIN.dangerFondo, color: ADMIN.danger, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800 }}>
                              Cuesta: {zona.cuesta}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {sinProvincia > 0 && (
              <div style={{ marginTop: 12, fontSize: 13, color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>
                {sinProvincia === 1 ? '1 colegio sin provincia asignada' : `${sinProvincia} colegios sin provincia asignada`} —{' '}
                <button
                  onClick={() => router.push('/admin/colegios')}
                  style={{ background: 'none', border: 'none', padding: 0, color: ADMIN.base, fontFamily: QUICK, fontWeight: 800, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  asignala desde Colegios
                </button>
              </div>
            )}
          </div>

          {/* ── Tendencias por tema (materia × grado) ─────────────────── */}
          <div style={carta}>
            <h2 style={{ ...h2, margin: '0 0 4px' }}>Tendencias por tema</h2>
            <p style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 16px' }}>
              Dominio promedio por grado{provSel ? ` en ${provSel}` : ''}.
            </p>
            {porMateria.size === 0 ? (
              <p style={{ fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: 0 }}>
                Sin actividad en este rango{provSel ? ` en ${provSel}` : ''}.
              </p>
            ) : (
              [...porMateria.entries()].map(([materia, filas]) => {
                const ordenadas = [...filas].sort((a, b) => a.grado - b.grado);
                const valores = ordenadas.map((f) => f.dominioPromedio ?? f.precision ?? 0);
                const max = Math.max(1, ...valores);
                const mejor = Math.max(...valores);
                // Con k-anonimato todos los valores llegan en null: dibujar
                // barras planas mentiría ("cero dominio"), así que se dice.
                const sinMuestra = ordenadas.every((f) => f.muestraInsuficiente);
                if (sinMuestra) {
                  return (
                    <div key={materia} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: ADMIN.ink }}>
                        {materia}{' '}
                        <span style={{ fontSize: 12, color: ADMIN.tinta2 }}>
                          · {ordenadas.map((f) => `${f.grado}°`).join(' · ')}
                        </span>
                      </span>
                      {pillInsuf}
                    </div>
                  );
                }
                return (
                  <div key={materia} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, color: ADMIN.ink, marginBottom: 6 }}>
                      <span>{materia}</span>
                      <span style={{ color: ADMIN.oscuro }}>{Math.round(mejor)}%</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 44 }}>
                      {ordenadas.map((f, i) => {
                        const valor = valores[i];
                        return (
                          <div
                            key={`${f.materia}|${f.grado}`}
                            title={`${f.grado}° · ${f.alumnos} alumnos · ${f.sesiones} sesiones`}
                            style={{
                              flex: 1, height: `${Math.max(8, Math.round((valor / max) * 100))}%`,
                              background: valor === mejor ? ADMIN.base : ADMIN.borde,
                              borderRadius: '6px 6px 3px 3px',
                            }}
                          />
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                      {ordenadas.map((f) => (
                        <span key={`lbl-${f.materia}|${f.grado}`} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, color: ADMIN.tinta2, fontWeight: 700 }}>
                          {f.grado}°
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Desempeño por eje y tema (marco NAP) ──────────────────────── */}
      <div style={{ ...carta, marginTop: 18 }}>
        <h2 style={{ ...h2, margin: '0 0 4px' }}>Desempeño por eje y tema (NAP)</h2>
        <p style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 16px' }}>
          Núcleos de Aprendizajes Prioritarios: la misma vara para todos los colegios, sin importar cómo cada docente nombró sus temas.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end', marginBottom: 18 }}>
          <div>
            <label style={ETIQUETA}>Materia</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <FiltroChips
                opciones={MATERIAS_NAP.map((m) => ({ key: m, label: m }))}
                valor={materiaSel}
                onCambio={setMateriaSel}
              />
            </div>
          </div>
          <div>
            <label style={ETIQUETA}>Grado</label>
            <select
              value={gradoSel}
              onChange={(e) => setGradoSel(Number(e.target.value))}
              style={{ ...CAMPO, width: 'auto', minWidth: 120, cursor: 'pointer' }}
            >
              {GRADOS.map((g) => (
                <option key={g} value={g}>{g}° grado</option>
              ))}
            </select>
          </div>
        </div>

        {cargandoNap && (
          <div style={{ color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>Cargando…</div>
        )}

        {!cargandoNap && errorNap && (
          <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '14px 18px', color: ADMIN.warnTexto, fontWeight: 700, fontSize: 14 }}>
            {errorNap}
          </div>
        )}

        {/* Estado vacío OBLIGATORIO (no un error genérico): el catálogo NAP
            todavía no llegó a esta materia y grado — muy distinto de "algo se
            rompió", y quien lo lee no puede distinguirlas si el copy no lo dice. */}
        {!cargandoNap && !errorNap && ejesNap.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16, color: ADMIN.ink }}>
              Todavía no hay catálogo NAP cargado para {materiaSel} · {gradoSel}°
            </div>
            <div style={{ fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 6, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
              Los núcleos de aprendizaje se transcriben de las resoluciones oficiales a medida que están disponibles. No es un error: esta materia y grado todavía no tienen ejes cargados.
            </div>
          </div>
        )}

        {!cargandoNap && !errorNap && ejesNap.length > 0 && (
          <div>
            {ejesNap.map((eje, i) => (
              <div key={eje.ejeId} style={{ borderBottom: i === ejesNap.length - 1 ? 'none' : `1px solid ${ADMIN.divisor}` }}>
                <FilaEjeTema
                  nombre={eje.eje}
                  alumnos={eje.alumnos}
                  dominioPromedio={eje.dominioPromedio}
                  precision={eje.precision}
                  dominados={eje.dominados}
                  muestraInsuficiente={eje.muestraInsuficiente}
                  colegiosConTema={eje.colegiosConTema}
                  colegiosTotal={eje.colegiosTotal}
                  expandible
                  abierto={ejeAbierto === eje.ejeId}
                  onClick={() => setEjeAbierto(ejeAbierto === eje.ejeId ? null : eje.ejeId)}
                />
                {ejeAbierto === eje.ejeId && (
                  <div style={{ paddingBottom: 10 }}>
                    {eje.temas.length === 0 ? (
                      <div style={{ padding: '4px 14px 10px 34px', fontSize: 13, color: ADMIN.tinta2, fontWeight: 600 }}>
                        Este eje todavía no tiene temas cargados para {gradoSel}°.
                      </div>
                    ) : (
                      eje.temas.map((t) => (
                        <FilaEjeTema
                          key={t.temaId}
                          nombre={t.tema}
                          alumnos={t.alumnos}
                          respuestas={t.respuestas}
                          dominioPromedio={t.dominioPromedio}
                          precision={t.precision}
                          dominados={t.dominados}
                          muestraInsuficiente={t.muestraInsuficiente}
                          colegiosConTema={t.colegiosConTema}
                          colegiosTotal={t.colegiosTotal}
                          indentado
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
