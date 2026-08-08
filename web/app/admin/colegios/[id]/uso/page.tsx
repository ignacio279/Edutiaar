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

const h2: React.CSSProperties = { fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.oscuro, margin: '26px 0 10px' };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`, overflow: 'hidden' };

const ICONO: Record<string, string> = { sesion: '✏️', boletin_aprobado: '📋', alta_maestra: '👩‍🏫', alta_colegio: '🏫' };

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
          <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: 0 }}>
            Uso{detalle?.escuela.nombre ? ` — ${detalle.escuela.nombre}` : ''}
          </h1>
          {pill && (
            <span style={{ background: pill[0], color: pill[1], borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 800, fontFamily: QUICK }}>
              {pill[2]}
            </span>
          )}
        </div>
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

      {!cargando && !error && detalle && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 18 }}>
            <Stat
              valor={fila?.alumnosActivos ?? 0}
              label="Chicos practicando"
              detalle={`de ${detalle.counts.alumnos} en el colegio`}
            />
            <Stat valor={fila?.sesiones ?? 0} label="Sesiones" detalle={`últimos ${rango} días`} />
            <Stat
              valor={fila?.precision === null || fila?.precision === undefined ? '—' : `${fila.precision}%`}
              label="Precisión"
              detalle={fila?.precision === null ? 'sin datos todavía' : 'respuestas correctas'}
            />
            <Stat
              valor={fila?.boletinesAprobados ?? 0}
              label="Boletines aprobados"
              detalle={`${uso?.chats ?? 0} consultas a LUNA`}
            />
          </div>

          <h2 style={h2}>Sesiones, semana a semana</h2>
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

          <h2 style={h2}>Últimos movimientos</h2>
          <div style={carta}>
            {feed.length === 0 ? (
              <div style={{ padding: '22px 20px', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>
                Este colegio todavía no registró actividad.
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

          <button
            onClick={() => router.push('/admin/metricas')}
            className="ed-side"
            style={{ marginTop: 18, background: 'none', border: `2px solid ${ADMIN.borde}`, color: ADMIN.medio, borderRadius: 999, padding: '8px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
          >
            Ver métricas de toda la plataforma
          </button>
        </>
      )}
    </div>
  );
}
