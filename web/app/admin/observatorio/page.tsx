'use client';
// Observatorio educativo (WP-A — fase "Observatorio y avisos"; restyle 2026-08
// al mock Admin.dc.html): agregados de aprendizaje SIEMPRE anónimos por
// jurisdicción (provincia) y por materia × grado, más el top de "temas que más
// cuestan" (best-effort, marcado "aproximado"). Todo sale YA AGREGADO de
// admin-observatorio (a diferencia de métricas: mandar sesiones crudas al
// browser rompería el anonimato, D-OA3); acá solo se formatea.
// El diseño reemplaza las tablas densas por tarjetas: "Aprendizaje por zona"
// con chips Fuerte/Cuesta y "Tendencias por tema" con mini-barras por grado.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN } from '@/lib/admin/tema';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';
import { PROVINCIAS } from '@/lib/admin/provincias';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

// Rangos del selector (días). El backend acota igual (máximo 90).
const RANGOS = [30, 60, 90] as const;

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
type Tema = { tema: string; alumnos: number; respuestas: number; precision: number };

type RespResumen = { rango_dias: number; generado_en: string; provincias: FilaProvincia[]; sinProvincia: { colegios: number } };
type RespMaterias = { filas: FilaMateria[] };
type RespTemas = { temas: Tema[]; aproximado: boolean };

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
  const [celda, setCelda] = useState<{ materia: string; grado: number } | null>(null);
  const [temas, setTemas] = useState<Tema[] | null>(null);
  const [cargandoTemas, setCargandoTemas] = useState(false);

  // Resumen por provincia + materias (la segunda depende también del select de
  // provincia). Cambiar rango o provincia cierra el panel de temas.
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
        <>
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
                Dominio promedio por grado{provSel ? ` en ${provSel}` : ''}. Tocá una barra para ver los temas que más cuestan.
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
                  return (
                    <div key={materia} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, color: ADMIN.ink, marginBottom: 6 }}>
                        <span>{materia}</span>
                        <span style={{ color: ADMIN.oscuro }}>
                          {ordenadas.every((f) => f.muestraInsuficiente) ? 'muestra insuficiente' : `${Math.round(mejor)}%`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 44 }}>
                        {ordenadas.map((f, i) => {
                          const valor = valores[i];
                          const activa = celda?.materia === f.materia && celda?.grado === f.grado;
                          return (
                            <button
                              key={`${f.materia}|${f.grado}`}
                              onClick={() => verTemas(f.materia, f.grado)}
                              title={`${f.grado}° · ${f.alumnos} alumnos · ${f.sesiones} sesiones`}
                              aria-label={`${materia}, ${f.grado}° grado`}
                              style={{
                                flex: 1, height: `${Math.max(8, Math.round((valor / max) * 100))}%`,
                                background: activa || valor === mejor ? ADMIN.base : ADMIN.borde,
                                border: 'none', borderRadius: '6px 6px 3px 3px', cursor: 'pointer', padding: 0,
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

          {/* ── Temas que más cuestan (celda seleccionada) ────────────────── */}
          {celda && (
            <div style={{ ...carta, marginTop: 18, maxWidth: 640 }}>
              <h2 style={{ ...h2, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                Temas que más cuestan — {celda.materia} · {celda.grado}°{provSel ? ` · ${provSel}` : ''}
                <span style={{ background: ADMIN.warnFondo, color: ADMIN.warnTexto, border: `1px solid ${ADMIN.warnBorde}`, borderRadius: 999, padding: '3px 10px', fontWeight: 800, fontSize: 11.5 }}>
                  aproximado
                </span>
              </h2>
              <p style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 12px' }}>
                Los nombres de tema los escribe cada docente; se agrupan por texto normalizado.
              </p>
              {cargandoTemas ? (
                <div style={{ color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>Cargando…</div>
              ) : !temas || temas.length === 0 ? (
                <div style={{ fontFamily: NUNITO, color: ADMIN.tinta2, fontWeight: 600, fontSize: 14 }}>
                  Ningún tema junta todavía muestra suficiente (mínimo 20 respuestas y 5 alumnos).
                </div>
              ) : (
                temas.map((t, i) => (
                  <div key={t.tema} style={{ marginBottom: i === temas.length - 1 ? 0 : 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, color: ADMIN.ink, marginBottom: 6 }}>
                      <span>{t.tema}</span>
                      <span style={{ color: ADMIN.oscuro }}>
                        {t.precision}% <span style={{ color: ADMIN.tinta2, fontWeight: 600 }}>· {t.alumnos} alumnos · {t.respuestas} respuestas</span>
                      </span>
                    </div>
                    <div style={{ height: 10, background: ADMIN.divisor, borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, t.precision)}%`, height: '100%', background: t.precision >= 70 ? ADMIN.okCheck : t.precision >= 50 ? ADMIN.sol : ADMIN.danger, borderRadius: 999 }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
