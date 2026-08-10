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

const h2: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: 0 };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22 };
// Encabezado de la comparativa: mayúsculas chiquitas, como en el mock.
const thComp: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: ADMIN.tinta2, letterSpacing: '.6px' };

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: 0 }}>Métricas</h1>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
            <Stat valor={uso?.ejerciciosRespondidos ?? 0} label="ejercicios respondidos" detalle={`últimos ${rango} días`} />
            <Stat valor={uso?.ejerciciosGenerados ?? 0} label="ejercicios generados" detalle="por SOL" />
            <Stat valor={uso?.boletinesGenerados ?? 0} label="boletines generados" detalle={`${uso?.boletinesAprobadosSinEditar ?? 0} aprobados sin editar`} />
            <Stat valor={uso?.chats ?? 0} label="chats con LUNA" detalle="consultas de maestras" />
          </div>

          {/* ── Funnel de onboarding ──────────────────────────────────────── */}
          <div style={{ ...carta, marginBottom: 18 }}>
            <h2 style={{ ...h2, margin: '0 0 4px' }}>Funnel de onboarding</h2>
            <p style={{ fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 16px' }}>
              Creado → maestras invitadas → primera actividad → primer boletín aprobado
            </p>
            {funnels.length === 0 ? (
              <p style={{ color: ADMIN.tinta2, fontWeight: 600, fontSize: 14.5, margin: 0 }}>
                Todavía no hay colegios cargados.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {funnels.map((f) => {
                  const etapas = funnelColegio(f);
                  return (
                    <div key={f.escuela.id} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: ADMIN.suave, borderRadius: 16, padding: '12px 16px' }}>
                      <button
                        onClick={() => router.push(`/admin/colegios/${f.escuela.id}`)}
                        style={{ background: 'none', border: 'none', padding: 0, minWidth: 180, textAlign: 'left', fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.ink, cursor: 'pointer' }}
                      >
                        {f.escuela.nombre ?? 'Colegio'}
                      </button>
                      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                        {etapas.map((e) => (
                          <div key={e.clave} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, flexShrink: 0, background: e.hecho ? ADMIN.okCheck : ADMIN.neutroFondo, color: e.hecho ? '#fff' : ADMIN.neutroTexto }}>
                              {e.hecho ? '✓' : '○'}
                            </span>
                            <span style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700 }}>
                              {e.label}{e.fecha ? ` · ${fechaCorta(e.fecha)}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Comparativa + adopción ────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }}>
            <div style={carta}>
              <h2 style={{ ...h2, marginBottom: 12 }}>Comparativa entre colegios</h2>
              <div style={{ display: 'flex', gap: 12, padding: '8px 12px', ...thComp }}>
                <span style={{ flex: 2 }}>COLEGIO</span>
                <span style={{ flex: 1, textAlign: 'right' }}>ALUMNOS</span>
                <span style={{ flex: 1, textAlign: 'right' }}>SESIONES</span>
                <span style={{ flex: 1, textAlign: 'right' }}>PRECISIÓN</span>
                <span style={{ flex: 1, textAlign: 'right' }}>BOLETINES</span>
              </div>
              {filas.length === 0 ? (
                <p style={{ color: ADMIN.tinta2, fontWeight: 600, fontSize: 14.5, margin: '12px 0 0' }}>
                  Todavía no hay colegios para comparar.
                </p>
              ) : (
                filas.map((f) => {
                  const pill = ESTADO_COLEGIO[f.estado ?? ''] ?? null;
                  return (
                    <button
                      key={f.escuelaId}
                      onClick={() => router.push(`/admin/colegios/${f.escuelaId}/uso`)}
                      className="ad-flat"
                      style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', background: ADMIN.suave, border: 'none', borderRadius: 12, padding: 12, marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
                    >
                      <span style={{ flex: 2, fontWeight: 700, fontSize: 14, color: ADMIN.ink }}>
                        {f.nombre || 'Colegio'}
                        {pill && (
                          <span style={{ marginLeft: 8, background: pill[0], color: pill[1], borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 800, fontFamily: QUICK }}>
                            {pill[2]}
                          </span>
                        )}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: 14, color: ADMIN.ink }}>{f.alumnosActivos}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: 14, color: ADMIN.ink }}>{f.sesiones}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 800, fontSize: 14, color: ADMIN.oscuro }}>{f.precision === null ? '—' : `${f.precision}%`}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: 14, color: ADMIN.ink }}>{f.boletinesAprobados}</span>
                    </button>
                  );
                })
              )}
            </div>

            <div style={carta}>
              <h2 style={{ ...h2, marginBottom: 16 }}>Adopción semanal</h2>
              {serie.length === 0 ? (
                <div style={{ color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>Sin datos todavía.</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 10, height: 150, paddingBottom: 24, position: 'relative' }}>
                  {serie.map((s, i) => (
                    <div key={s.desde} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
                      <div
                        title={`${s.sesiones} sesiones · ${s.alumnosActivos} chicos`}
                        style={{ width: '70%', maxWidth: 38, height: `${Math.max(3, Math.round((s.sesiones / maxSemana) * 100))}%`, background: i === serie.length - 1 ? ADMIN.base : ADMIN.barra2, borderRadius: '9px 9px 4px 4px' }}
                      />
                      <span style={{ position: 'absolute', bottom: -22, fontSize: 12, color: ADMIN.tinta2, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {fechaCorta(s.desde)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
