'use client';
// Observatorio educativo (WP-A — fase "Observatorio y avisos"): agregados de
// aprendizaje SIEMPRE anónimos por jurisdicción (provincia) y por materia ×
// grado, más el top de "temas que más cuestan" (best-effort, marcado
// "aproximado"). Todo sale YA AGREGADO de admin-observatorio (a diferencia de
// métricas: mandar sesiones crudas al browser rompería el anonimato, D-OA3);
// acá solo se formatea. Capacitación y Exportaciones se linkean desde el
// footer (D-OA6: el nav es operativo, no aspiracional).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN } from '@/lib/admin/tema';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';
import { PROVINCIAS } from '@/lib/admin/provincias';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

// Rangos del selector (días). El backend acota igual (máximo 90).
const RANGOS = [30, 60, 90] as const;

const h2: React.CSSProperties = { fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.oscuro, margin: '26px 0 10px' };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`, overflow: 'hidden' };
const th: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.tinta2, textAlign: 'left', padding: '10px 16px', borderBottom: `2px solid ${ADMIN.bordeCalido}` };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '10px 16px', fontSize: 14, color: ADMIN.ink, borderBottom: `1px solid ${ADMIN.bordeCalido}` };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

// Pill gris de k-anonimato (D-OA3): la celda existe pero su desempeño no se
// muestra con menos de 5 alumnos distintos.
const pillInsuf = (
  <span style={{ display: 'inline-block', background: '#EFE3CE', color: '#9A8E78', borderRadius: 999, padding: '3px 10px', fontFamily: QUICK, fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap' }}>
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
type Tema = { tema: string; alumnos: number; respuestas: number; precision: number };

type RespResumen = { rango_dias: number; generado_en: string; provincias: FilaProvincia[]; sinProvincia: { colegios: number } };
type RespMaterias = { filas: FilaMateria[] };
type RespTemas = { temas: Tema[]; aproximado: boolean };

export default function Page() {
  const router = useRouter();
  const [rango, setRango] = useState<number>(30);
  const [provSel, setProvSel] = useState(''); // '' = todas
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [provincias, setProvincias] = useState<FilaProvincia[]>([]);
  const [sinProvincia, setSinProvincia] = useState(0);
  const [materias, setMaterias] = useState<FilaMateria[]>([]);
  const [celda, setCelda] = useState<{ materia: string; grado: number } | null>(null);
  const [temas, setTemas] = useState<Tema[] | null>(null);
  const [cargandoTemas, setCargandoTemas] = useState(false);

  // Resumen por provincia + tabla de materias (la segunda depende también del
  // select de provincia). Cambiar rango o provincia cierra el panel de temas.
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      setCelda(null);
      setTemas(null);
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
      } else {
        setProvincias(rRes.data.provincias ?? []);
        setSinProvincia(rRes.data.sinProvincia?.colegios ?? 0);
        setMaterias(rMat.data.filas ?? []);
      }
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [rango, provSel]);

  const verTemas = async (materia: string, grado: number) => {
    setCelda({ materia, grado });
    setTemas(null);
    setCargandoTemas(true);
    const r = await llamarAdmin<RespTemas>('admin-observatorio', 'temas', {
      rango_dias: rango,
      materia,
      grado,
      ...(provSel ? { provincia: provSel } : {}),
    });
    setTemas(r.ok ? (r.data.temas ?? []) : []);
    setCargandoTemas(false);
  };

  const vacioGlobal = !cargando && !error && provincias.length === 0 && materias.length === 0 && sinProvincia === 0;

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: 0 }}>Observatorio educativo</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGOS.map((r) =>
            r === rango ? (
              <div key={r} style={{ background: ADMIN.claro, color: ADMIN.oscuro, borderRadius: 999, padding: '6px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5 }}>
                {r} días
              </div>
            ) : (
              <button key={r} onClick={() => setRango(r)} className="ed-side" style={{ background: 'none', border: `2px solid ${ADMIN.borde}`, color: ADMIN.tinta2, borderRadius: 999, padding: '4px 12px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                {r} días
              </button>
            ),
          )}
        </div>
      </div>

      {/* Banner PERMANENTE de anonimato (D-OA3): se muestra siempre, con o sin datos. */}
      <div style={{ marginTop: 16, background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 16, padding: '12px 18px', color: ADMIN.medio, fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, lineHeight: 1.5 }}>
        Datos 100% agregados y anónimos. Nunca se muestran datos individuales; las celdas con menos de 5 alumnos se marcan como muestra insuficiente.
      </div>

      {error && (
        <div style={{ marginTop: 18, background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '14px 18px', color: ADMIN.warnTexto, fontWeight: 700, fontSize: 14 }}>
          {error}
        </div>
      )}

      {cargando && !error && (
        <div style={{ marginTop: 24, color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>Cargando…</div>
      )}

      {vacioGlobal && (
        <div style={{ marginTop: 22, ...carta, padding: '26px 24px', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14.5 }}>
          Todavía no hay actividad suficiente para el observatorio.
        </div>
      )}

      {!cargando && !error && !vacioGlobal && (
        <>
          {/* ── Por jurisdicción ──────────────────────────────────────────── */}
          <h2 style={h2}>Por jurisdicción</h2>
          <div style={carta}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Provincia</th>
                  <th style={thNum}>Colegios</th>
                  <th style={thNum}>Alumnos activos</th>
                  <th style={thNum}>Sesiones</th>
                  <th style={thNum}>Precisión</th>
                </tr>
              </thead>
              <tbody>
                {provincias.length === 0 ? (
                  <tr>
                    <td style={{ ...td, borderBottom: 'none', color: ADMIN.tinta2 }} colSpan={5}>
                      Todavía no hay colegios con provincia asignada.
                    </td>
                  </tr>
                ) : (
                  provincias.map((f, i) => {
                    const ultima = i === provincias.length - 1 ? { borderBottom: 'none' } : {};
                    return (
                      <tr key={f.provincia}>
                        <td style={{ ...td, ...ultima, fontWeight: 700 }}>{f.provincia}</td>
                        <td style={{ ...tdNum, ...ultima }}>{f.colegios}</td>
                        <td style={{ ...tdNum, ...ultima }}>{f.alumnosActivos}</td>
                        <td style={{ ...tdNum, ...ultima }}>{f.sesiones}</td>
                        <td style={{ ...tdNum, ...ultima }}>
                          {f.muestraInsuficiente ? pillInsuf : f.precision === null ? '—' : `${f.precision}%`}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {sinProvincia > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>
              {sinProvincia === 1 ? '1 colegio sin provincia asignada' : `${sinProvincia} colegios sin provincia asignada`} —{' '}
              <button
                onClick={() => router.push('/admin/colegios')}
                className="ed-side"
                style={{ background: 'none', border: 'none', padding: 0, color: ADMIN.medio, fontFamily: QUICK, fontWeight: 800, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
              >
                asignala desde Colegios
              </button>
            </div>
          )}

          {/* ── Por materia y grado ───────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <h2 style={h2}>Por materia y grado</h2>
            <select
              value={provSel}
              onChange={(e) => setProvSel(e.target.value)}
              style={{ border: `2px solid ${ADMIN.borde}`, borderRadius: 12, padding: '7px 12px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.ink, background: ADMIN.carta, cursor: 'pointer' }}
            >
              <option value="">Todas las provincias</option>
              {PROVINCIAS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div style={carta}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Materia</th>
                  <th style={thNum}>Grado</th>
                  <th style={thNum}>Alumnos</th>
                  <th style={thNum}>Sesiones</th>
                  <th style={thNum}>Precisión</th>
                  <th style={thNum}>Dominio</th>
                </tr>
              </thead>
              <tbody>
                {materias.length === 0 ? (
                  <tr>
                    <td style={{ ...td, borderBottom: 'none', color: ADMIN.tinta2 }} colSpan={6}>
                      Sin actividad en este rango{provSel ? ` en ${provSel}` : ''}.
                    </td>
                  </tr>
                ) : (
                  materias.map((f, i) => {
                    const ultima = i === materias.length - 1 ? { borderBottom: 'none' } : {};
                    const activa = celda && celda.materia === f.materia && celda.grado === f.grado;
                    return (
                      <tr
                        key={`${f.materia}|${f.grado}`}
                        onClick={() => verTemas(f.materia, f.grado)}
                        title="Ver los temas que más cuestan"
                        style={{ cursor: 'pointer', background: activa ? ADMIN.claro : 'transparent' }}
                      >
                        <td style={{ ...td, ...ultima, fontWeight: 700 }}>{f.materia}</td>
                        <td style={{ ...tdNum, ...ultima }}>{f.grado}°</td>
                        <td style={{ ...tdNum, ...ultima }}>{f.alumnos}</td>
                        <td style={{ ...tdNum, ...ultima }}>{f.sesiones}</td>
                        <td style={{ ...tdNum, ...ultima }}>
                          {f.muestraInsuficiente ? pillInsuf : f.precision === null ? '—' : `${f.precision}%`}
                        </td>
                        <td style={{ ...tdNum, ...ultima }}>
                          {f.muestraInsuficiente ? pillInsuf : f.dominioPromedio === null ? '—' : `${f.dominioPromedio}/100`}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Temas que más cuestan (celda seleccionada) ────────────────── */}
          {celda && (
            <>
              <h2 style={h2}>
                Temas que más cuestan — {celda.materia} · {celda.grado}°{provSel ? ` · ${provSel}` : ''}{' '}
                <span style={{ background: ADMIN.warnFondo, color: ADMIN.warnTexto, border: `1px solid ${ADMIN.warnBorde}`, borderRadius: 999, padding: '3px 10px', fontFamily: QUICK, fontWeight: 800, fontSize: 11.5, verticalAlign: 'middle' }}>
                  aproximado
                </span>
              </h2>
              <div style={{ fontSize: 13, color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, margin: '-4px 0 10px' }}>
                Los nombres de tema los escribe cada docente; se agrupan por texto normalizado.
              </div>
              <div style={carta}>
                {cargandoTemas ? (
                  <div style={{ padding: '18px 20px', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>Cargando…</div>
                ) : !temas || temas.length === 0 ? (
                  <div style={{ padding: '18px 20px', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>
                    Ningún tema junta todavía muestra suficiente (mínimo 20 respuestas y 5 alumnos).
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={th}>Tema</th>
                        <th style={thNum}>Alumnos</th>
                        <th style={thNum}>Respuestas</th>
                        <th style={thNum}>Precisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {temas.map((t, i) => {
                        const ultima = i === temas.length - 1 ? { borderBottom: 'none' } : {};
                        return (
                          <tr key={t.tema}>
                            <td style={{ ...td, ...ultima, fontWeight: 700 }}>{t.tema}</td>
                            <td style={{ ...tdNum, ...ultima }}>{t.alumnos}</td>
                            <td style={{ ...tdNum, ...ultima }}>{t.respuestas}</td>
                            <td style={{ ...tdNum, ...ultima }}>{t.precision}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Footer: pantallas de visión (las páginas las trae otro WP) ─────── */}
      {!cargando && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 28 }}>
          {[
            { ruta: '/admin/capacitacion', titulo: 'Capacitación', linea: 'Formación para maestras a partir de lo que muestra el observatorio.' },
            { ruta: '/admin/exportaciones', titulo: 'Exportaciones', linea: 'Reportes agregados para ministerios y jurisdicciones.' },
          ].map((c) => (
            <button
              key={c.ruta}
              onClick={() => router.push(c.ruta)}
              className="ed-side"
              style={{ ...carta, padding: '16px 18px', textAlign: 'left', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 17, color: ADMIN.ink }}>{c.titulo}</span>
                <span style={{ background: ADMIN.claro, color: ADMIN.oscuro, borderRadius: 999, padding: '3px 10px', fontFamily: QUICK, fontWeight: 800, fontSize: 11.5 }}>
                  Próximamente
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 13.5, color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>{c.linea}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
