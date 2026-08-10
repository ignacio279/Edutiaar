'use client';
// Costos de UN colegio (WP6 — Dashboard admin v3): tab "Costos" de la ficha.
// Tiles del colegio + desglose por función + serie semanal simple, todo desde
// admin-costos (accion detalle_colegio).
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN } from '@/lib/admin/tema';
import Stat from '@/components/admin/Stat';
import FichaTabs from '@/components/admin/FichaTabs';
import {
  fmtTokens, fmtUsd, porcentaje, RANGOS,
  type GrupoCosto, type SemanaCosto, type TotalCosto,
} from '@/lib/admin/costos';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

const h2: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 12px' };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22 };

type Detalle = {
  nombre: string | null;
  total: TotalCosto;
  por_funcion: GrupoCosto[];
  serie: SemanaCosto[];
};

const fechaCorta = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};

export default function Page() {
  const params = useParams();
  const colegioId = String(params.id);
  const [rango, setRango] = useState<number>(30);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState<Detalle | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      const r = await llamarAdmin<Detalle>('admin-costos', 'detalle_colegio', { escuela_id: colegioId, rango_dias: rango });
      if (!vivo) return;
      if (!r.ok) {
        setError(ERRS_ADMIN[r.data.error ?? ''] ?? 'No se pudieron cargar los costos del colegio. Probá de nuevo.');
      } else {
        setDetalle(r.data);
      }
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [colegioId, rango]);

  const total = detalle?.total ?? null;
  const sinDatos = !cargando && !error && (total?.llamadas ?? 0) === 0;
  const maxSemana = Math.max(1e-9, ...(detalle?.serie ?? []).map((s) => s.costo_usd));

  return (
    <div style={{ maxWidth: 960 }}>
      <FichaTabs colegioId={colegioId} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(24px, 3.2vw, 32px)', color: ADMIN.ink, margin: 0 }}>
          Costos{detalle?.nombre ? ` — ${detalle.nombre}` : ''}
        </h1>
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
          {sinDatos ? (
            <div style={{ marginTop: 18, textAlign: 'center', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '48px 24px', maxWidth: 640 }}>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>Sin datos de uso todavía</div>
              <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>
                Cuando el colegio empiece a usar la IA, acá vas a ver el costo.
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginTop: 18, marginBottom: 18 }}>
                <Stat chico valor={fmtUsd(total?.costo_usd ?? 0)} label="costo del período" detalle={`últimos ${rango} días`} />
                <Stat chico valor={total?.llamadas ?? 0} label="llamadas a la IA" />
                <Stat chico valor={fmtTokens((total?.tokens_entrada ?? 0) + (total?.tokens_salida ?? 0))} label="tokens" detalle={`${fmtTokens(total?.tokens_entrada ?? 0)} entrada · ${fmtTokens(total?.tokens_salida ?? 0)} salida`} />
                <Stat chico valor={`${porcentaje(total?.errores ?? 0, total?.llamadas ?? 0)}%`} label="tasa de error" detalle={`${total?.errores ?? 0} con error`} />
              </div>

              <div style={{ ...carta, maxWidth: 640, marginBottom: 18 }}>
                <h2 style={h2}>Desglose por función</h2>
                {(detalle?.por_funcion ?? []).map((g, i, arr) => (
                  <div key={g.clave} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${ADMIN.divisor}`, fontSize: 14.5, fontWeight: 700 }}>
                    <span style={{ color: ADMIN.ink }}>{g.clave}</span>
                    <span style={{ color: g.errores > 0 ? ADMIN.danger : ADMIN.tinta2 }}>
                      {g.llamadas} llamadas · {fmtTokens(g.tokens_entrada + g.tokens_salida)}{g.errores > 0 ? ` · ${g.errores} con error` : ''}
                    </span>
                    <span style={{ color: ADMIN.oscuro }}>{fmtUsd(g.costo_usd)}</span>
                  </div>
                ))}
              </div>

              <div style={{ ...carta, maxWidth: 640 }}>
                <h2 style={h2}>Semana a semana</h2>
                {(detalle?.serie ?? []).map((s, i, arr) => (
                  <div key={s.desde} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 0', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${ADMIN.divisor}` }}>
                    <div style={{ width: 100, fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, fontVariantNumeric: 'tabular-nums' }}>
                      {fechaCorta(s.desde)} – {fechaCorta(s.hasta)}
                    </div>
                    <div style={{ flex: 1, height: 12, borderRadius: 999, background: ADMIN.divisor, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, (s.costo_usd / maxSemana) * 100)}%`, height: '100%', background: ADMIN.base, borderRadius: 999 }} />
                    </div>
                    <div style={{ width: 90, textAlign: 'right', fontWeight: 800, fontSize: 13.5, color: ADMIN.oscuro, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(s.costo_usd)}</div>
                    <div style={{ width: 90, textAlign: 'right', fontSize: 12.5, fontWeight: 600, color: ADMIN.tinta2 }}>{s.llamadas} llamadas</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
