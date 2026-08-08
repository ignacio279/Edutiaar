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

// Semáforo → colores del tema: [fondo de la barra, relleno/texto fuerte].
const SEMAFORO: Record<'ok' | 'aviso' | 'rojo', readonly [string, string]> = {
  ok: [ADMIN.okFondo, ADMIN.okCheck],
  aviso: [ADMIN.warnFondo, ADMIN.warnTexto],
  rojo: [ADMIN.dangerBorde, ADMIN.danger],
};

const h2: React.CSSProperties = { fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.oscuro, margin: '26px 0 10px' };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`, overflow: 'hidden' };
const th: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.tinta2, textAlign: 'left', padding: '10px 16px', borderBottom: `2px solid ${ADMIN.bordeCalido}` };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '10px 16px', fontSize: 14, color: ADMIN.ink, borderBottom: `1px solid ${ADMIN.bordeCalido}` };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

function TablaCostos({ grupos, etiqueta }: { grupos: GrupoCosto[]; etiqueta: string }) {
  return (
    <div style={carta}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>{etiqueta}</th>
            <th style={thNum}>Costo</th>
            <th style={thNum}>Llamadas</th>
            <th style={thNum}>Tokens</th>
            <th style={thNum}>Errores</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g, i) => (
            <tr key={g.clave}>
              <td style={{ ...td, fontWeight: 700, ...(i === grupos.length - 1 ? { borderBottom: 'none' } : {}) }}>{g.nombre ?? g.clave}</td>
              <td style={{ ...tdNum, ...(i === grupos.length - 1 ? { borderBottom: 'none' } : {}) }}>{fmtUsd(g.costo_usd)}</td>
              <td style={{ ...tdNum, ...(i === grupos.length - 1 ? { borderBottom: 'none' } : {}) }}>{g.llamadas}</td>
              <td style={{ ...tdNum, ...(i === grupos.length - 1 ? { borderBottom: 'none' } : {}) }}>{fmtTokens(g.tokens_entrada + g.tokens_salida)}</td>
              <td style={{ ...tdNum, color: g.errores > 0 ? ADMIN.danger : ADMIN.tinta2, ...(i === grupos.length - 1 ? { borderBottom: 'none' } : {}) }}>{g.errores}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: 0 }}>Costos y salud</h1>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 18 }}>
            <Stat valor={fmtUsd(total?.costo_usd ?? 0)} label="Costo del período" detalle={`últimos ${rango} días`} />
            <Stat valor={total?.llamadas ?? 0} label="Llamadas a la API" />
            <Stat valor={`${porcentaje(total?.errores ?? 0, total?.llamadas ?? 0)}%`} label="Tasa de error global" detalle={`${total?.errores ?? 0} con error`} />
            <Stat valor={fmtMs(saludGlobal?.p95)} label="Latencia p95 global" detalle={`p50 ${fmtMs(saludGlobal?.p50)}`} />
          </div>

          {sinDatos ? (
            <div style={{ marginTop: 22, background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 22, padding: '22px 24px', color: ADMIN.medio, fontWeight: 700, fontSize: 14.5, lineHeight: 1.5 }}>
              {SIN_DATOS_COPY}
            </div>
          ) : (
            <>
              <h2 style={h2}>Por colegio</h2>
              <TablaCostos grupos={porColegio} etiqueta="Colegio" />

              <h2 style={h2}>Por función</h2>
              <TablaCostos grupos={porFuncion} etiqueta="Función" />

              <h2 style={h2}>Salud de las funciones</h2>
              <div style={{ ...carta, padding: '6px 0' }}>
                {salud.map((s, i) => {
                  const clave = colorSalud(s.tasa_error);
                  const [fondo, fuerte] = SEMAFORO[clave];
                  const pct = Math.round(s.tasa_error * 1000) / 10; // fracción → % con 1 decimal
                  return (
                    <div key={s.funcion} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px', borderBottom: i === salud.length - 1 ? 'none' : `1px solid ${ADMIN.bordeCalido}`, flexWrap: 'wrap' }}>
                      <div style={{ width: 170, fontWeight: 700, fontSize: 14, color: ADMIN.ink }}>{s.funcion}</div>
                      <div style={{ flex: '1 1 140px', minWidth: 120, height: 12, borderRadius: 999, background: fondo, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.max(s.tasa_error > 0 ? 3 : 0, s.tasa_error * 100))}%`, height: '100%', background: fuerte, borderRadius: 999 }} />
                      </div>
                      <div style={{ width: 64, textAlign: 'right', fontWeight: 800, fontSize: 13.5, color: fuerte, fontVariantNumeric: 'tabular-nums' }}>{pct}%</div>
                      <div style={{ width: 150, textAlign: 'right', fontSize: 12.5, color: ADMIN.tinta2, fontVariantNumeric: 'tabular-nums' }}>
                        p50 {fmtMs(s.p50)} · p95 {fmtMs(s.p95)}
                      </div>
                      <div style={{ width: 110, textAlign: 'right', fontSize: 12.5, color: ADMIN.tinta2 }}>
                        {s.errores_consecutivos > 3 ? (
                          <span style={{ background: ADMIN.dangerBorde, color: ADMIN.danger, borderRadius: 999, padding: '3px 10px', fontWeight: 800, fontSize: 12 }}>
                            {s.errores_consecutivos} seguidos
                          </span>
                        ) : (
                          `${s.llamadas} llamadas`
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
