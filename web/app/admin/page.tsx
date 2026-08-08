'use client';
// Home del panel admin (WP5 — Dashboard admin v3): la foto del día de la
// plataforma. Tiles de adopción + feed de actividad en vivo (polling cada 30 s)
// + widget de alertas del operador.
//
// La Edge Function admin-metricas devuelve FILAS CRUDAS ya acotadas y el
// cálculo lo hace acá con la lógica pura de web/lib/admin/metricas.ts (misma
// que testea tests/unit/admin-metricas.test.mjs).
//
// Las alertas vienen de OTRO work-package (admin-crm): la llamada va envuelta
// en try/catch — si esa fn no está deployada o falla, la home no se rompe:
// muestra "Sin alertas" y sigue.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN } from '@/lib/admin/tema';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';
import Stat from '@/components/admin/Stat';
import {
  armarFeed, fechaRelativa, metricasUso, resumenAdopcion,
  type DatosAdopcion, type DatosUso, type EventoFeed, type ItemFeed,
  type MetricasUso, type ResumenAdopcion,
} from '@/lib/admin/metricas';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

// Cada cuánto se refresca la home sin tocar nada (feed en vivo).
const POLLING_MS = 30_000;
const EVENTOS_FEED = 12;

const h2: React.CSSProperties = { fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.oscuro, margin: '0 0 10px' };
const carta: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22,
  boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`, overflow: 'hidden',
};

// Emoji por tipo de evento (el feed es de un vistazo, no una tabla).
const ICONO: Record<string, string> = {
  sesion: '✏️',
  boletin_aprobado: '📋',
  alta_maestra: '👩‍🏫',
  alta_colegio: '🏫',
};

type RespResumen = {
  mes: { desde: string; hasta: string };
  adopcion: DatosAdopcion;
  uso: DatosUso;
};

type AlertaAdmin = {
  clave: string;
  prioridad: 'alta' | 'media';
  escuelaNombre: string;
  titulo: string;
  detalle: string;
};

export default function Page() {
  const router = useRouter();
  const [resumen, setResumen] = useState<ResumenAdopcion | null>(null);
  const [uso, setUso] = useState<MetricasUso | null>(null);
  const [feed, setFeed] = useState<ItemFeed[]>([]);
  const [ahora, setAhora] = useState<Date | null>(null);
  const [alertas, setAlertas] = useState<AlertaAdmin[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async (vivo: () => boolean) => {
    const [rRes, rFeed] = await Promise.all([
      llamarAdmin<RespResumen>('admin-metricas', 'resumen'),
      llamarAdmin<{ eventos: EventoFeed[] }>('admin-metricas', 'feed', { limite: EVENTOS_FEED }),
    ]);
    if (!vivo()) return;

    const fallo = [rRes, rFeed].find((r) => !r.ok);
    if (fallo) {
      setError(ERRS_ADMIN[fallo.data.error ?? ''] ?? 'No se pudo cargar el panel. Probá de nuevo.');
      setCargando(false);
      return;
    }
    setError('');

    const now = new Date();
    setAhora(now);
    setResumen(resumenAdopcion(rRes.data.adopcion, now));
    setUso(metricasUso(rRes.data.uso, {
      desde: new Date(rRes.data.mes.desde),
      hasta: new Date(rRes.data.mes.hasta),
    }));
    setFeed(armarFeed(rFeed.data.eventos ?? [], EVENTOS_FEED));
    setCargando(false);

    // Las alertas son de otro WP: si falla, la home sigue viva.
    try {
      const rAl = await llamarAdmin<{ alertas: AlertaAdmin[] }>('admin-crm', 'alertas_listar');
      if (vivo()) setAlertas(rAl.ok ? (rAl.data.alertas ?? []) : []);
    } catch {
      if (vivo()) setAlertas([]);
    }
  }, []);

  useEffect(() => {
    let activo = true;
    const vivo = () => activo;
    cargar(vivo);
    const id = setInterval(() => cargar(vivo), POLLING_MS);
    return () => {
      activo = false;
      clearInterval(id); // sin esto el polling sigue corriendo al salir de la home
    };
  }, [cargar]);

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: 0 }}>
            Hola 👋
          </h1>
          <p style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.tinta2, margin: '4px 0 0' }}>
            Así viene EDUTIA hoy.
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/metricas')}
          className="ed-side"
          style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '10px 20px', fontFamily: QUICK, fontWeight: 800, fontSize: 14.5, cursor: 'pointer', boxShadow: `0 4px 12px ${ADMIN.sombra}` }}
        >
          Ver métricas
        </button>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 20 }}>
            <Stat valor={resumen?.colegiosActivos ?? 0} label="Colegios activos" detalle="en prueba o activos" />
            <Stat valor={resumen?.maestrasActivas7d ?? 0} label="Maestras activas" detalle="últimos 7 días" />
            <Stat valor={resumen?.alumnosActivos7d ?? 0} label="Chicos practicando" detalle="últimos 7 días" />
            <Stat valor={resumen?.sesionesHoy ?? 0} label="Sesiones de hoy" detalle={`${uso?.ejerciciosRespondidos ?? 0} ejercicios este mes`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginTop: 26, alignItems: 'start' }}>
            {/* ── Feed de actividad ─────────────────────────────────────── */}
            <section>
              <h2 style={h2}>Lo que está pasando</h2>
              <div style={carta}>
                {feed.length === 0 ? (
                  <div style={{ padding: '22px 20px', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>
                    Todavía no hay actividad para mostrar.
                  </div>
                ) : (
                  feed.map((item, i) => (
                    <div
                      key={`${item.tipo}-${item.fecha}-${i}`}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 16px', borderBottom: i === feed.length - 1 ? 'none' : `1px solid ${ADMIN.bordeCalido}` }}
                    >
                      <span style={{ fontSize: 16, lineHeight: '20px' }}>{ICONO[item.tipo] ?? '•'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, color: ADMIN.ink, fontWeight: 600 }}>{item.texto}</div>
                        <div style={{ fontSize: 12.5, color: ADMIN.tinta2, marginTop: 1 }}>
                          {ahora ? fechaRelativa(item.fecha, ahora) : ''}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div style={{ fontSize: 12.5, color: ADMIN.tinta2, marginTop: 8, fontFamily: QUICK, fontWeight: 700 }}>
                Se actualiza solo cada 30 segundos.
              </div>
            </section>

            {/* ── Alertas del operador (WP7: puede no estar deployado) ──── */}
            <section>
              <h2 style={h2}>Para atender</h2>
              <div style={carta}>
                {!alertas || alertas.length === 0 ? (
                  <div style={{ padding: '22px 20px', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>
                    Sin alertas. Todo tranquilo por acá.
                  </div>
                ) : (
                  alertas.slice(0, 4).map((a, i) => (
                    <div
                      key={a.clave}
                      style={{ padding: '12px 16px', borderBottom: i === Math.min(alertas.length, 4) - 1 ? 'none' : `1px solid ${ADMIN.bordeCalido}` }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ background: a.prioridad === 'alta' ? ADMIN.dangerBorde : ADMIN.warnFondo, color: a.prioridad === 'alta' ? ADMIN.danger : ADMIN.warnTexto, borderRadius: 999, padding: '2px 10px', fontSize: 11.5, fontWeight: 800, fontFamily: QUICK }}>
                          {a.prioridad === 'alta' ? 'Alta' : 'Media'}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: ADMIN.ink }}>{a.titulo}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: ADMIN.tinta2, marginTop: 3 }}>
                        {a.escuelaNombre}{a.detalle ? ` · ${a.detalle}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {alertas && alertas.length > 0 && (
                <button
                  onClick={() => router.push('/admin/alertas')}
                  className="ed-side"
                  style={{ marginTop: 10, background: 'none', border: `2px solid ${ADMIN.borde}`, color: ADMIN.medio, borderRadius: 999, padding: '7px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
                >
                  Ver todas ({alertas.length})
                </button>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
