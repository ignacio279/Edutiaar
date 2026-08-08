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
  fmtTokens, fmtUsd, porcentaje, RANGOS, SIN_DATOS_COPY,
  type GrupoCosto, type SemanaCosto, type TotalCosto,
} from '@/lib/admin/costos';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

const h2: React.CSSProperties = { fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.oscuro, margin: '26px 0 10px' };
const carta: React.CSSProperties = { background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`, overflow: 'hidden' };
const th: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.tinta2, textAlign: 'left', padding: '10px 16px', borderBottom: `2px solid ${ADMIN.bordeCalido}` };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '10px 16px', fontSize: 14, color: ADMIN.ink, borderBottom: `1px solid ${ADMIN.bordeCalido}` };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

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
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: 0 }}>
          Costos{detalle?.nombre ? ` — ${detalle.nombre}` : ''}
        </h1>
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
            <Stat valor={fmtTokens((total?.tokens_entrada ?? 0) + (total?.tokens_salida ?? 0))} label="Tokens usados" detalle={`${fmtTokens(total?.tokens_entrada ?? 0)} entrada · ${fmtTokens(total?.tokens_salida ?? 0)} salida`} />
            <Stat valor={`${porcentaje(total?.errores ?? 0, total?.llamadas ?? 0)}%`} label="Tasa de error" detalle={`${total?.errores ?? 0} con error`} />
          </div>

          {sinDatos ? (
            <div style={{ marginTop: 22, background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 22, padding: '22px 24px', color: ADMIN.medio, fontWeight: 700, fontSize: 14.5, lineHeight: 1.5 }}>
              {SIN_DATOS_COPY}
            </div>
          ) : (
            <>
              <h2 style={h2}>Por función</h2>
              <div style={carta}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Función</th>
                      <th style={thNum}>Costo</th>
                      <th style={thNum}>Llamadas</th>
                      <th style={thNum}>Tokens</th>
                      <th style={thNum}>Errores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detalle?.por_funcion ?? []).map((g, i, arr) => (
                      <tr key={g.clave}>
                        <td style={{ ...td, fontWeight: 700, ...(i === arr.length - 1 ? { borderBottom: 'none' } : {}) }}>{g.clave}</td>
                        <td style={{ ...tdNum, ...(i === arr.length - 1 ? { borderBottom: 'none' } : {}) }}>{fmtUsd(g.costo_usd)}</td>
                        <td style={{ ...tdNum, ...(i === arr.length - 1 ? { borderBottom: 'none' } : {}) }}>{g.llamadas}</td>
                        <td style={{ ...tdNum, ...(i === arr.length - 1 ? { borderBottom: 'none' } : {}) }}>{fmtTokens(g.tokens_entrada + g.tokens_salida)}</td>
                        <td style={{ ...tdNum, color: g.errores > 0 ? ADMIN.danger : ADMIN.tinta2, ...(i === arr.length - 1 ? { borderBottom: 'none' } : {}) }}>{g.errores}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2 style={h2}>Semana a semana</h2>
              <div style={{ ...carta, padding: '10px 0' }}>
                {(detalle?.serie ?? []).map((s, i, arr) => (
                  <div key={s.desde} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px', borderBottom: i === arr.length - 1 ? 'none' : `1px solid ${ADMIN.bordeCalido}` }}>
                    <div style={{ width: 110, fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, fontVariantNumeric: 'tabular-nums' }}>
                      {fechaCorta(s.desde)} – {fechaCorta(s.hasta)}
                    </div>
                    <div style={{ flex: 1, height: 14, borderRadius: 999, background: ADMIN.burbuja, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, (s.costo_usd / maxSemana) * 100)}%`, height: '100%', background: ADMIN.base, borderRadius: 999 }} />
                    </div>
                    <div style={{ width: 90, textAlign: 'right', fontWeight: 800, fontSize: 13.5, color: ADMIN.ink, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(s.costo_usd)}</div>
                    <div style={{ width: 90, textAlign: 'right', fontSize: 12.5, color: ADMIN.tinta2 }}>{s.llamadas} llamadas</div>
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
