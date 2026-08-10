'use client';
// Accesos y límites de un colegio (Dashboard admin v3, WP3): trial con corte
// suave (fechas + countdown + "+30 días" + finalizar), topes mensuales de IA y
// consumo del mes contra esos topes. La verdad vive en la Edge Function
// admin-accesos (guard plataforma_admin); esta página solo pinta y dispara.
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import FichaTabs from '@/components/admin/FichaTabs';
import Pill from '@/components/admin/Pill';
import { ADMIN, ESTADO_COLEGIO } from '@/lib/admin/tema';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { toast } from '@/lib/toast';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type EstadoUso = {
  colegio: { id: string; nombre: string; estado: string; trial_inicio: string | null; trial_fin: string | null };
  limites: { sol_mes: number; boletines_mes: number; chats_mes: number };
  limites_custom: Record<string, number | null> | null;
  uso: Record<string, number>;
  desde: string;
};

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  colegio_inexistente: 'Ese colegio no existe.',
  objetivo_invalido: 'Elegí un colegio o una maestra, no ambos.',
  fechas_invalidas: 'Revisá las fechas: el fin tiene que ser posterior al inicio.',
  dias_invalidos: 'Los días de extensión tienen que ser un número positivo.',
  limites_invalidos: 'Los topes tienen que ser números enteros positivos (o vacío para volver al default).',
};
const copyErr = (codigo?: string) => ERRS[codigo ?? ''] ?? 'Algo salió mal. Probá de nuevo.';

const FEATURES_UI: readonly { feature: string; clave: 'sol_mes' | 'boletines_mes' | 'chats_mes'; label: string }[] = [
  { feature: 'sol', clave: 'sol_mes', label: 'SOL — ejercicios y evaluación' },
  { feature: 'luna.boletines', clave: 'boletines_mes', label: 'LUNA — boletines' },
  { feature: 'luna.chat', clave: 'chats_mes', label: 'LUNA — chat' },
];

const card: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22,
};
const h2: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 12px' };
const labelSt: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 6 };
const inputSt: React.CSSProperties = {
  width: '100%', padding: '11px 12px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12,
  fontFamily: NUNITO, fontSize: 14, color: ADMIN.ink, background: ADMIN.suave, outline: 'none',
};
const btnPrimario: React.CSSProperties = {
  background: ADMIN.base, border: 'none', borderRadius: 999, padding: '11px 22px',
  fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: '#fff', cursor: 'pointer',
  boxShadow: `0 6px 16px ${ADMIN.sombraCTA}`,
};
const btnBorde: React.CSSProperties = {
  background: ADMIN.carta, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 999, padding: '11px 18px',
  fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: ADMIN.oscuro, cursor: 'pointer',
};

// Días (enteros) desde hoy hasta `fecha` (YYYY-MM-DD). Negativo = ya pasó.
function diasHasta(fecha: string): number {
  const hoy = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000);
}

// Caja de countdown del mock: warn si quedan ≤5 días (o venció), petróleo si no.
function CajaTrial({ estado, fin }: { estado: string; fin: string | null }) {
  const d = estado === 'trial' && fin ? diasHasta(fin) : null;
  const urgente = d !== null && d <= 5;
  const texto = estado !== 'trial'
    ? 'Sin prueba activa'
    : d === null ? 'Sin fecha de vencimiento'
    : d < 0 ? `Venció hace ${-d} ${-d === 1 ? 'día' : 'días'}`
    : d === 0 ? 'Vence hoy'
    : `Vence en ${d} ${d === 1 ? 'día' : 'días'}`;
  return (
    <div style={{
      fontFamily: BALOO, fontWeight: 700, fontSize: 26, display: 'inline-block', borderRadius: 16, padding: '14px 20px',
      color: urgente ? ADMIN.warnTexto : ADMIN.oscuro,
      background: urgente ? ADMIN.warnFondo : ADMIN.burbuja,
      border: `1.5px solid ${urgente ? ADMIN.warnBorde : ADMIN.borde}`,
    }}>
      {texto}
    </div>
  );
}

function BarraConsumo({ label, uso, tope }: { label: string; uso: number; tope: number }) {
  const pct = tope > 0 ? Math.min(100, (uso / tope) * 100) : 0;
  const color = pct > 90 ? ADMIN.danger : ADMIN.base;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, color: ADMIN.ink, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: pct > 90 ? ADMIN.danger : ADMIN.tinta2 }}>{uso} / {tope}</span>
      </div>
      <div style={{ height: 12, background: ADMIN.divisor, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, minWidth: uso > 0 ? 6 : 0, height: '100%', background: color, borderRadius: 999, transition: 'width .3s ease' }} />
      </div>
    </div>
  );
}

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<EstadoUso | null>(null);
  const [cargando, setCargando] = useState(true);
  const [falla, setFalla] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // qué acción está en vuelo

  // Inputs de trial y topes (se hidratan desde estado_uso).
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [topes, setTopes] = useState<Record<string, string>>({ sol_mes: '', boletines_mes: '', chats_mes: '' });

  const cargar = useCallback(async () => {
    const r = await llamarAdmin<EstadoUso>('admin-accesos', 'estado_uso', { escuela_id: id });
    if (!r.ok) { setFalla(copyErr(r.data.error)); setCargando(false); return; }
    setData(r.data);
    setInicio(r.data.colegio.trial_inicio ?? '');
    setFin(r.data.colegio.trial_fin ?? '');
    setTopes({
      sol_mes: r.data.limites_custom?.sol_mes != null ? String(r.data.limites_custom.sol_mes) : '',
      boletines_mes: r.data.limites_custom?.boletines_mes != null ? String(r.data.limites_custom.boletines_mes) : '',
      chats_mes: r.data.limites_custom?.chats_mes != null ? String(r.data.limites_custom.chats_mes) : '',
    });
    setFalla(null);
    setCargando(false);
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  async function accion(nombre: string, payload: Record<string, unknown>, okMsg: string) {
    setBusy(nombre);
    const r = await llamarAdmin('admin-accesos', nombre, { escuela_id: id, ...payload });
    setBusy(null);
    if (!r.ok) { toast(copyErr(r.data.error)); return; }
    toast(okMsg);
    await cargar();
  }

  const guardarFechas = () => {
    if (!inicio || !fin) { toast('Completá las dos fechas del trial.'); return; }
    accion('set_trial', { inicio, fin }, 'Trial guardado.');
  };
  const extender = () => accion('extender_trial', { dias: 30 }, 'Trial extendido 30 días.');
  const finalizar = () => accion('finalizar_trial', {}, 'Trial finalizado: el colegio quedó activo.');
  const guardarTopes = () => {
    const limites: Record<string, number | null> = {};
    for (const { clave } of FEATURES_UI) {
      const crudo = topes[clave].trim();
      if (crudo === '') { limites[clave] = null; continue; }
      const n = Number(crudo);
      if (!Number.isInteger(n) || n <= 0) { toast(ERRS.limites_invalidos); return; }
      limites[clave] = n;
    }
    accion('set_limites', { limites }, 'Topes guardados.');
  };

  return (
    <div>
      <FichaTabs colegioId={id} />

      {cargando && (
        <div style={{ ...card, color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>Cargando…</div>
      )}
      {!cargando && falla && (
        <div style={{ ...card, border: `2px solid ${ADMIN.dangerBorde}`, color: ADMIN.danger, fontFamily: QUICK, fontWeight: 700 }}>
          {falla}
        </div>
      )}

      {!cargando && data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'start' }}>
          {/* ── Período de prueba ─────────────────────────────────────── */}
          <section style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <h2 style={{ ...h2, margin: 0 }}>Período de prueba</h2>
              <Pill tupla={ESTADO_COLEGIO[data.colegio.estado]} />
            </div>
            <CajaTrial estado={data.colegio.estado} fin={data.colegio.trial_fin} />
            <div style={{ display: 'flex', gap: 12, margin: '16px 0' }}>
              <div style={{ flex: 1 }}>
                <label style={labelSt}>Inicio</label>
                <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} style={inputSt} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelSt}>Fin</label>
                <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} style={inputSt} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={extender} disabled={busy !== null} className="ed-primary" style={btnPrimario}>
                {busy === 'extender_trial' ? 'Extendiendo…' : '+30 días'}
              </button>
              <button onClick={guardarFechas} disabled={busy !== null} className="ad-ghost" style={btnBorde}>
                {busy === 'set_trial' ? 'Guardando…' : 'Guardar fechas'}
              </button>
              <button onClick={finalizar} disabled={busy !== null} className="ad-ghost" style={btnBorde}>
                {busy === 'finalizar_trial' ? 'Un momento…' : 'Finalizar prueba (activar)'}
              </button>
            </div>
          </section>

          {/* ── Topes mensuales ───────────────────────────────────────── */}
          <section style={card}>
            <h2 style={{ ...h2, margin: '0 0 4px' }}>Topes mensuales de IA</h2>
            <p style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 16px' }}>
              Vacío = volver al valor por defecto.
            </p>
            {FEATURES_UI.map(({ clave, label }) => (
              <div key={clave} style={{ marginBottom: 12 }}>
                <label style={labelSt}>{label}</label>
                <input
                  type="number"
                  min={1}
                  value={topes[clave]}
                  placeholder={String(data.limites[clave])}
                  onChange={(e) => setTopes((t) => ({ ...t, [clave]: e.target.value }))}
                  style={inputSt}
                />
              </div>
            ))}
            <button onClick={guardarTopes} disabled={busy !== null} className="ed-primary" style={{ ...btnPrimario, boxShadow: 'none', marginTop: 4 }}>
              {busy === 'set_limites' ? 'Guardando…' : 'Guardar'}
            </button>
          </section>

          {/* ── Consumo del mes ───────────────────────────────────────── */}
          <section style={card}>
            <h2 style={{ ...h2, margin: '0 0 16px' }}>Consumo del mes</h2>
            {FEATURES_UI.map(({ feature, clave, label }) => (
              <BarraConsumo key={feature} label={label} uso={data.uso[feature] ?? 0} tope={data.limites[clave]} />
            ))}
            <p style={{ fontFamily: NUNITO, fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, margin: '4px 0 0' }}>
              Desde el {new Date(data.desde).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}. Las alertas de LUNA no gastan IA y no tienen tope.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
