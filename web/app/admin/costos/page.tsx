'use client';
// Costos y salud técnica (WP6 — Dashboard admin v3): cuánto gasta la
// plataforma en la API de Claude (por colegio y por función) y cómo vienen
// las Edge Functions (tasa de error, latencias, rachas). Todo sale de
// admin-costos; los agregados los computa el server, acá solo se formatea.
import { useEffect, useState } from 'react';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN } from '@/lib/admin/tema';
import Stat from '@/components/admin/Stat';
import {
  colorSalud, fmtMs, fmtTokens, fmtUsd, porcentaje, RANGOS, SIN_DATOS_COPY,
  type GrupoCosto, type SaludFn, type SaludGlobal, type TotalCosto,
} from '@/lib/admin/costos';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

// Semáforo → color del texto y de la barra (umbrales de colorSalud).
const SEMAFORO: Record<'ok' | 'aviso' | 'rojo', string> = {
  ok: ADMIN.okCheck,
  aviso: ADMIN.sol,
  rojo: ADMIN.danger,
};

const h2: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 12px' };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22 };

// Lista de costos en filas con divisores (el mock no usa tablas densas).
function ListaCostos({ grupos, titulo }: { grupos: GrupoCosto[]; titulo: string }) {
  return (
    <div style={carta}>
      <h2 style={h2}>{titulo}</h2>
      {grupos.length === 0 ? (
        <p style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: 0 }}>Sin movimientos en este período.</p>
      ) : (
        grupos.map((g, i) => (
          <div key={g.clave} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', padding: '11px 0', borderBottom: i === grupos.length - 1 ? 'none' : `1px solid ${ADMIN.divisor}`, fontSize: 14, fontWeight: 700 }}>
            <span style={{ color: ADMIN.ink, flex: 2, minWidth: 0 }}>{g.nombre ?? g.clave}</span>
            <span style={{ color: ADMIN.tinta2, flex: 1, textAlign: 'right' }}>{g.llamadas} llamadas</span>
            <span style={{ color: g.errores > 0 ? ADMIN.danger : ADMIN.tinta2, flex: 1, textAlign: 'right' }}>
              {fmtTokens(g.tokens_entrada + g.tokens_salida)}
            </span>
            <span style={{ color: ADMIN.oscuro, flex: 1, textAlign: 'right' }}>{fmtUsd(g.costo_usd)}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default function Page() {
  const [rango, setRango] = useState<number>(30);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [porColegio, setPorColegio] = useState<GrupoCosto[]>([]);
  const [porFuncion, setPorFuncion] = useState<GrupoCosto[]>([]);
  const [total, setTotal] = useState<TotalCosto | null>(null);
  const [salud, setSalud] = useState<SaludFn[]>([]);
  const [saludGlobal, setSaludGlobal] = useState<SaludGlobal | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      const [rCol, rFn, rSalud] = await Promise.all([
        llamarAdmin<{ grupos: GrupoCosto[]; total: TotalCosto }>('admin-costos', 'costos', { rango_dias: rango, agrupar: 'colegio' }),
        llamarAdmin<{ grupos: GrupoCosto[]; total: TotalCosto }>('admin-costos', 'costos', { rango_dias: rango, agrupar: 'funcion' }),
        llamarAdmin<{ funciones: SaludFn[]; global: SaludGlobal }>('admin-costos', 'salud', { rango_dias: rango }),
      ]);
      if (!vivo) return;
      const fallo = [rCol, rFn, rSalud].find((r) => !r.ok);
      if (fallo) {
        setError(ERRS_ADMIN[fallo.data.error ?? ''] ?? 'No se pudieron cargar los costos. Probá de nuevo.');
      } else {
        setPorColegio(rCol.data.grupos ?? []);
        setTotal(rCol.data.total ?? null);
        setPorFuncion(rFn.data.grupos ?? []);
        setSalud(rSalud.data.funciones ?? []);
        setSaludGlobal(rSalud.data.global ?? null);
      }
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [rango]);

  const sinDatos = !cargando && !error && (total?.llamadas ?? 0) === 0;

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: 0 }}>Costos y salud</h1>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
            <Stat valor={fmtUsd(total?.costo_usd ?? 0)} label="costo del período" detalle={`últimos ${rango} días`} />
            <Stat valor={total?.llamadas ?? 0} label="llamadas a la IA" detalle="SOL + LUNA" />
            <Stat valor={`${porcentaje(total?.errores ?? 0, total?.llamadas ?? 0)}%`} label="tasa de error global" detalle={`${total?.errores ?? 0} con error`} />
            <Stat valor={fmtMs(saludGlobal?.p95)} label="latencia p95" detalle={`p50: ${fmtMs(saludGlobal?.p50)}`} />
          </div>

          {sinDatos ? (
            <div style={{ textAlign: 'center', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '48px 24px', maxWidth: 640 }}>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>Sin datos de uso todavía</div>
              <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>{SIN_DATOS_COPY}</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start', marginBottom: 18 }}>
                <ListaCostos grupos={porColegio} titulo="Por colegio" />
                <ListaCostos grupos={porFuncion} titulo="Por función" />
              </div>

              <div style={carta}>
                <h2 style={{ ...h2, marginBottom: 16 }}>Salud técnica</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {salud.map((s) => {
                    const color = SEMAFORO[colorSalud(s.tasa_error)];
                    const pct = Math.round(s.tasa_error * 1000) / 10; // fracción → % con 1 decimal
                    return (
                      <div key={s.funcion}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ fontSize: 14.5, fontWeight: 700, color: ADMIN.ink, minWidth: 170 }}>{s.funcion}</span>
                          <span style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700 }}>
                            p50 {fmtMs(s.p50)} · p95 {fmtMs(s.p95)} · {s.llamadas} llamadas
                          </span>
                          {s.errores_consecutivos > 3 && (
                            <span style={{ background: ADMIN.dangerFondo, border: `1px solid ${ADMIN.dangerBorde}`, color: ADMIN.danger, borderRadius: 999, padding: '3px 11px', fontSize: 11.5, fontWeight: 800 }}>
                              {s.errores_consecutivos} fallos seguidos
                            </span>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800, color }}>
                            {String(pct).replace('.', ',')}% de error
                          </span>
                        </div>
                        <div style={{ height: 10, background: ADMIN.divisor, borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, Math.max(s.tasa_error > 0 ? 3 : 0, s.tasa_error * 1000))}%`, height: '100%', background: color, borderRadius: 999 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
