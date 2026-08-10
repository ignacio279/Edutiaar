'use client';
// Uso de UN colegio (WP5 — Dashboard admin v3): tab "Uso" de la ficha.
// Tiles del colegio + serie semanal de sesiones + mini feed de su actividad,
// todo desde admin-metricas (accion detalle_colegio). La fn devuelve filas
// crudas acotadas y el cálculo lo hace la lógica pura de
// web/lib/admin/metricas.ts.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ADMIN, ESTADO_COLEGIO } from '@/lib/admin/tema';
import { ERRS_ADMIN, llamarAdmin } from '@/lib/admin/api';
import Stat from '@/components/admin/Stat';
import FichaTabs from '@/components/admin/FichaTabs';
import {
  armarFeed, compararColegios, fechaRelativa, metricasUso, serieSemanal,
  type BoletinFila, type ColegioComparado, type EscuelaFila, type EventoFeed,
  type MensajeFila, type SesionFila,
} from '@/lib/admin/metricas';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

const RANGOS = [7, 30, 90] as const;

const h2: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 16px' };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22 };

// Rampa de colores de las barras del mock (de la más vieja a la más nueva).
const RAMPA = [ADMIN.borde, ADMIN.barra2, ADMIN.barra3, ADMIN.base] as const;

const fechaCorta = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}/${d.getMonth() + 1}`;
};

type Detalle = {
  rango_dias: number;
  desde: string;
  hasta: string;
  escuela: EscuelaFila;
  counts: { maestras: number; alumnos: number };
  comparado: ColegioComparado;
  sesiones: SesionFila[];
  boletines: BoletinFila[];
  mensajes: MensajeFila[];
  eventos: EventoFeed[];
};

export default function Page() {
  const params = useParams();
  const router = useRouter();
  const colegioId = String(params.id);

  const [rango, setRango] = useState<number>(30);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      const r = await llamarAdmin<Detalle>('admin-metricas', 'detalle_colegio', { escuela_id: colegioId, rango_dias: rango });
      if (!vivo) return;
      if (!r.ok) {
        setError(
          r.data.error === 'no_existe'
            ? 'Este colegio ya no existe.'
            : (ERRS_ADMIN[r.data.error ?? ''] ?? 'No se pudo cargar el uso del colegio. Probá de nuevo.'),
        );
      } else {
        setDetalle(r.data);
        setAhora(new Date());
      }
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [colegioId, rango]);

  // Precisión y normalización: la misma función pura que la comparativa
  // general, con un solo colegio adentro.
  const fila = useMemo(
    () => (detalle ? compararColegios([detalle.comparado])[0] : null),
    [detalle],
  );
  // Chats y boletines del rango: metricasUso con las listas que no aplican a un
  // colegio (respuestas y ejercicios no tienen columna de escuela) en vacío.
  const uso = useMemo(
    () => (detalle
      ? metricasUso(
        { respuestas: [], ejerciciosCreados: [], boletines: detalle.boletines ?? [], mensajes: detalle.mensajes ?? [] },
        { desde: new Date(detalle.desde), hasta: new Date(detalle.hasta) },
      )
      : null),
    [detalle],
  );
  const serie = useMemo(
    () => (detalle && ahora ? serieSemanal(detalle.sesiones ?? [], rango, ahora) : []),
    [detalle, rango, ahora],
  );
  const feed = useMemo(() => armarFeed(detalle?.eventos ?? [], 8), [detalle]);
  const maxSemana = Math.max(1, ...serie.map((s) => s.sesiones));
  const pill = ESTADO_COLEGIO[detalle?.escuela.estado ?? ''] ?? null;

  return (
    <div style={{ maxWidth: 960 }}>
      <FichaTabs colegioId={colegioId} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(24px, 3.2vw, 32px)', color: ADMIN.ink, margin: 0 }}>
            Uso{detalle?.escuela.nombre ? ` — ${detalle.escuela.nombre}` : ''}
          </h1>
          {pill && (
            <span style={{ background: pill[0], color: pill[1], borderRadius: 999, padding: '5px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: QUICK }}>
              {pill[2]}
            </span>
          )}
        </div>
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

      {!cargando && !error && detalle && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginTop: 18, marginBottom: 18 }}>
            <Stat
              chico
              valor={fila?.alumnosActivos ?? 0}
              label="alumnos activos"
              detalle={`de ${detalle.counts.alumnos} en el colegio`}
            />
            <Stat chico valor={fila?.sesiones ?? 0} label={`sesiones · ${rango} días`} />
            <Stat
              chico
              valor={fila?.precision === null || fila?.precision === undefined ? '—' : `${fila.precision}%`}
              label="precisión"
              detalle={fila?.precision === null ? 'sin datos todavía' : 'respuestas correctas'}
            />
            <Stat
              chico
              valor={fila?.boletinesAprobados ?? 0}
              label="boletines aprobados"
              detalle={`${uso?.chats ?? 0} chats con LUNA`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'start' }}>
            <div style={carta}>
              <h2 style={h2}>Sesiones por semana</h2>
              {serie.length === 0 ? (
                <div style={{ color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>Sin datos todavía.</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 12, height: 130, paddingBottom: 24, position: 'relative' }}>
                  {serie.map((s, i) => (
                    <div key={s.desde} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
                      <div
                        title={`${s.sesiones} sesiones · ${s.alumnosActivos} chicos`}
                        style={{ width: '68%', maxWidth: 46, height: `${Math.max(3, Math.round((s.sesiones / maxSemana) * 100))}%`, background: RAMPA[serie.length > 1 ? Math.min(3, Math.round((i / (serie.length - 1)) * 3)) : 3], borderRadius: '10px 10px 4px 4px' }}
                      />
                      <span style={{ position: 'absolute', bottom: -22, fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {fechaCorta(s.desde)}–{fechaCorta(s.hasta)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={carta}>
              <h2 style={{ ...h2, margin: '0 0 8px' }}>Actividad del colegio</h2>
              {feed.length === 0 ? (
                <div style={{ padding: '10px 0', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>
                  Este colegio todavía no registró actividad.
                </div>
              ) : (
                feed.map((item, i) => (
                  <div
                    key={`${item.tipo}-${item.fecha}-${i}`}
                    style={{ padding: '10px 0', borderBottom: i === feed.length - 1 ? 'none' : `1px solid ${ADMIN.divisor}` }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: ADMIN.ink }}>{item.texto}</div>
                    <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600 }}>
                      {ahora ? fechaRelativa(item.fecha, ahora) : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => router.push('/admin/metricas')}
            className="ad-ghost"
            style={{ marginTop: 18, background: ADMIN.carta, border: `1.5px solid ${ADMIN.borde}`, color: ADMIN.oscuro, borderRadius: 999, padding: '9px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
          >
            Ver métricas de toda la plataforma
          </button>
        </>
      )}
    </div>
  );
}
