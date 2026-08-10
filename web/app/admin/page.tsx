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

const h2: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: 0 };
const carta: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22,
  padding: 22, boxShadow: '0 4px 14px rgba(120,90,40,.06)',
};

// Punto de color por tipo de evento (el feed es de un vistazo, no una tabla).
const PUNTO: Record<string, string> = {
  sesion: ADMIN.sol,
  boletin_aprobado: ADMIN.luna,
  alta_maestra: ADMIN.base,
  alta_colegio: ADMIN.base,
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
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: 0 }}>
            Hola 👋
          </h1>
          <p style={{ fontSize: 15.5, color: ADMIN.tinta2, margin: '4px 0 0', fontWeight: 600 }}>
            {ahora ? `${ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ` : ''}La foto del día de la plataforma
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/metricas')}
          className="ad-ghost"
          style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.borde}`, color: ADMIN.oscuro, borderRadius: 999, padding: '11px 22px', fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}
        >
          Ver métricas ›
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <Stat valor={resumen?.colegiosActivos ?? 0} label="Colegios activos" detalle="en prueba o activos" />
            <Stat valor={resumen?.maestrasActivas7d ?? 0} label="Maestras activas" detalle="últimos 7 días" />
            <Stat valor={resumen?.alumnosActivos7d ?? 0} label="Chicos practicando" detalle="últimos 7 días" />
            <Stat valor={resumen?.sesionesHoy ?? 0} label="Sesiones de hoy" detalle={`${uso?.ejerciciosRespondidos ?? 0} ejercicios este mes`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, marginTop: 18, alignItems: 'start' }}>
            {/* ── Feed de actividad ─────────────────────────────────────── */}
            <section style={carta}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <h2 style={h2}>Actividad en vivo</h2>
                <span style={{ fontSize: 12, color: ADMIN.tinta2, fontWeight: 700 }}>se refresca cada 30 s</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                {feed.length === 0 ? (
                  <p style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: '14px 0 0' }}>
                    Todavía no hay actividad para mostrar.
                  </p>
                ) : (
                  feed.map((item, i) => (
                    <div
                      key={`${item.tipo}-${item.fecha}-${i}`}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderBottom: i === feed.length - 1 ? 'none' : `1px solid ${ADMIN.divisor}` }}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: PUNTO[item.tipo] ?? ADMIN.base }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700, color: ADMIN.ink }}>{item.texto}</div>
                        <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 1 }}>
                          {ahora ? fechaRelativa(item.fecha, ahora) : ''}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* ── Alertas del operador (WP7: puede no estar deployado) ──── */}
            <section style={carta}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <h2 style={h2}>Alertas del operador</h2>
                <button
                  onClick={() => router.push('/admin/alertas')}
                  style={{ background: 'none', border: 'none', color: ADMIN.base, fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
                >
                  Ver todas ›
                </button>
              </div>
              {!alertas || alertas.length === 0 ? (
                <p style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: '14px 0 0' }}>
                  Sin alertas. Todo tranquilo por acá.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                  {alertas.slice(0, 4).map((a) => (
                    <div
                      key={a.clave}
                      style={{ background: a.prioridad === 'alta' ? ADMIN.dangerFondo : ADMIN.warnFondo, border: `1.5px solid ${a.prioridad === 'alta' ? ADMIN.dangerBorde : ADMIN.warnBorde}`, borderRadius: 14, padding: '12px 14px' }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: ADMIN.ink }}>{a.titulo}</div>
                      <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 2 }}>
                        {a.escuelaNombre}{a.detalle ? ` · ${a.detalle}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
