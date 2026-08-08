'use client';
// Métricas de la plataforma (WP5 — Dashboard admin v3): uso del período,
// curva de adopción, funnel de onboarding por colegio y comparativa entre
// colegios. Todo sale de admin-metricas en FILAS CRUDAS acotadas (default 30
// días, máximo 90) y se calcula acá con la lógica pura de
// web/lib/admin/metricas.ts — la misma que cubren los unit tests.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN, ESTADO_COLEGIO } from '@/lib/admin/tema';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';
import Stat from '@/components/admin/Stat';
import {
  compararColegios, funnelColegio, metricasUso, serieSemanal,
  type ColegioComparado, type DatosFunnel, type DatosUso, type SesionFila,
} from '@/lib/admin/metricas';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

// Rangos del selector (días). El backend acota igual (máximo 90).
const RANGOS = [7, 30, 90] as const;

const h2: React.CSSProperties = { fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.oscuro, margin: '26px 0 10px' };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`, overflow: 'hidden' };
const th: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.tinta2, textAlign: 'left', padding: '10px 16px', borderBottom: `2px solid ${ADMIN.bordeCalido}` };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '10px 16px', fontSize: 14, color: ADMIN.ink, borderBottom: `1px solid ${ADMIN.bordeCalido}` };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

// "6/8" — el año no aporta nada en estas vistas.
const fechaCorta = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}/${d.getMonth() + 1}`;
};

type RespUso = { rango_dias: number; desde: string; hasta: string; uso: DatosUso };
type RespAdopcion = { sesiones: SesionFila[] };
type RespFunnel = { colegios: DatosFunnel[] };
type RespComparativa = { colegios: ColegioComparado[] };

export default function Page() {
  const router = useRouter();
  const [rango, setRango] = useState<number>(30);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [datosUso, setDatosUso] = useState<RespUso | null>(null);
  const [sesiones, setSesiones] = useState<SesionFila[]>([]);
  const [funnels, setFunnels] = useState<DatosFunnel[]>([]);
  const [comparados, setComparados] = useState<ColegioComparado[]>([]);
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      const [rUso, rAdop, rFunnel, rComp] = await Promise.all([
        llamarAdmin<RespUso>('admin-metricas', 'uso', { rango_dias: rango }),
        llamarAdmin<RespAdopcion>('admin-metricas', 'adopcion', { rango_dias: rango }),
        llamarAdmin<RespFunnel>('admin-metricas', 'funnel'),
        llamarAdmin<RespComparativa>('admin-metricas', 'comparativa', { rango_dias: rango }),
      ]);
      if (!vivo) return;
      const fallo = [rUso, rAdop, rFunnel, rComp].find((r) => !r.ok);
      if (fallo) {
        setError(ERRS_ADMIN[fallo.data.error ?? ''] ?? 'No se pudieron cargar las métricas. Probá de nuevo.');
      } else {
        setDatosUso(rUso.data);
        setSesiones(rAdop.data.sesiones ?? []);
        setFunnels(rFunnel.data.colegios ?? []);
        setComparados(rComp.data.colegios ?? []);
        setAhora(new Date());
      }
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [rango]);

  const uso = useMemo(
    () => (datosUso
      ? metricasUso(datosUso.uso, { desde: new Date(datosUso.desde), hasta: new Date(datosUso.hasta) })
      : null),
    [datosUso],
  );
  const serie = useMemo(
    () => (ahora ? serieSemanal(sesiones, rango, ahora) : []),
    [sesiones, rango, ahora],
  );
  const filas = useMemo(() => compararColegios(comparados), [comparados]);
  const maxSemana = Math.max(1, ...serie.map((s) => s.sesiones));

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: 0 }}>Métricas</h1>
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

      {error && (
        <div style={{ marginTop: 18, background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '14px 18px', color: ADMIN.warnTexto, fontWeight: 700, fontSize: 14 }}>
          {error}
        </div>
      )}

      {cargando && !error && (
        <div style={{ marginTop: 24, color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>Cargando…</div>
      )}

      {!cargando && !error && (
        <>
          {/* ── Uso del período ───────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 18 }}>
            <Stat valor={uso?.ejerciciosRespondidos ?? 0} label="Ejercicios respondidos" detalle={`últimos ${rango} días`} />
            <Stat valor={uso?.ejerciciosGenerados ?? 0} label="Ejercicios generados" detalle="por SOL" />
            <Stat valor={uso?.boletinesGenerados ?? 0} label="Boletines de LUNA" detalle={`${uso?.boletinesAprobadosSinEditar ?? 0} aprobados sin editar`} />
            <Stat valor={uso?.chats ?? 0} label="Consultas a LUNA" detalle="mensajes de las maestras" />
          </div>

          {/* ── Adopción semana a semana ──────────────────────────────────── */}
          <h2 style={h2}>Adopción, semana a semana</h2>
          <div style={{ ...carta, padding: '18px 20px' }}>
            {serie.length === 0 ? (
              <div style={{ color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>Sin datos todavía.</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 130 }}>
                {serie.map((s) => (
                  <div key={s.desde} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: ADMIN.medio, fontVariantNumeric: 'tabular-nums' }}>{s.sesiones}</div>
                    <div
                      title={`${s.alumnosActivos} chicos`}
                      style={{ width: '100%', maxWidth: 54, height: Math.max(4, Math.round((s.sesiones / maxSemana) * 82)), background: ADMIN.base, borderRadius: 8 }}
                    />
                    <div style={{ fontSize: 11.5, color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, textAlign: 'center' }}>
                      {fechaCorta(s.desde)}–{fechaCorta(s.hasta)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Funnel de onboarding ──────────────────────────────────────── */}
          <h2 style={h2}>Cómo arrancó cada colegio</h2>
          <div style={carta}>
            {funnels.length === 0 ? (
              <div style={{ padding: '22px 20px', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>
                Todavía no hay colegios cargados.
              </div>
            ) : (
              funnels.map((f, i) => {
                const etapas = funnelColegio(f);
                return (
                  <div key={f.escuela.id} style={{ padding: '14px 16px', borderBottom: i === funnels.length - 1 ? 'none' : `1px solid ${ADMIN.bordeCalido}` }}>
                    <button
                      onClick={() => router.push(`/admin/colegios/${f.escuela.id}`)}
                      className="ed-side"
                      style={{ background: 'none', border: 'none', padding: 0, fontFamily: BALOO, fontWeight: 800, fontSize: 16, color: ADMIN.ink, cursor: 'pointer' }}
                    >
                      {f.escuela.nombre ?? 'Colegio'}
                    </button>
                    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
                      {etapas.map((e) => (
                        <div key={e.clave} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ color: e.hecho ? ADMIN.okCheck : ADMIN.borde, fontWeight: 800, fontSize: 15 }}>
                            {e.hecho ? '✓' : '○'}
                          </span>
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: e.hecho ? ADMIN.ink : ADMIN.tinta2 }}>{e.label}</div>
                            <div style={{ fontSize: 12, color: ADMIN.tinta2 }}>
                              {e.fecha ? fechaCorta(e.fecha) : (e.hecho ? 'sin fecha' : 'pendiente')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Comparativa ───────────────────────────────────────────────── */}
          <h2 style={h2}>Comparativa entre colegios</h2>
          <div style={carta}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Colegio</th>
                  <th style={thNum}>Chicos activos</th>
                  <th style={thNum}>Sesiones</th>
                  <th style={thNum}>Precisión</th>
                  <th style={thNum}>Boletines</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 ? (
                  <tr>
                    <td style={{ ...td, borderBottom: 'none', color: ADMIN.tinta2 }} colSpan={5}>
                      Todavía no hay colegios para comparar.
                    </td>
                  </tr>
                ) : (
                  filas.map((f, i) => {
                    const ultima = i === filas.length - 1 ? { borderBottom: 'none' } : {};
                    const pill = ESTADO_COLEGIO[f.estado ?? ''] ?? null;
                    return (
                      <tr key={f.escuelaId}>
                        <td style={{ ...td, ...ultima }}>
                          <button
                            onClick={() => router.push(`/admin/colegios/${f.escuelaId}/uso`)}
                            className="ed-side"
                            style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, fontSize: 14, color: ADMIN.ink, cursor: 'pointer' }}
                          >
                            {f.nombre || 'Colegio'}
                          </button>
                          {pill && (
                            <span style={{ marginLeft: 8, background: pill[0], color: pill[1], borderRadius: 999, padding: '2px 9px', fontSize: 11.5, fontWeight: 800, fontFamily: QUICK }}>
                              {pill[2]}
                            </span>
                          )}
                        </td>
                        <td style={{ ...tdNum, ...ultima }}>{f.alumnosActivos}</td>
                        <td style={{ ...tdNum, ...ultima }}>{f.sesiones}</td>
                        <td style={{ ...tdNum, ...ultima }}>{f.precision === null ? '—' : `${f.precision}%`}</td>
                        <td style={{ ...tdNum, ...ultima }}>{f.boletinesAprobados}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
