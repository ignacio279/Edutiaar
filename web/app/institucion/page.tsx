'use client';
// Panel institucional (alumno golondrina, migración 0025): lo que ve una
// fundación, una provincia o una red sobre SUS colegios.
//
// REGLA INQUEBRANTABLE: acá no aparece ni un chico. Todo son números
// agregados, y el desempeño de un colegio con menos de 5 alumnos se suprime
// (k-anonimato, igual que el observatorio). El backend lo garantiza; esta
// pantalla lo dice en voz alta para que nadie espere otra cosa.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN } from '@/lib/admin/tema';
import { toast } from '@/lib/toast';
import { ERRS_LICENCIAS, PLAN_COPY, copyCupos, copyVencimientoLicencia } from '@/lib/admin/licencias';
import { copyCosto, copyDeuda, copyPrecision, totalesInstitucion, type FilaColegio } from '@/lib/institucion';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient();

type ColegioResumen = {
  id: string; nombre: string; provincia: string | null; estado: string;
  docentes: number; alumnos: number; matriculas_activas: number; deuda_consentimientos: number;
  licencia: { id: string; plan: string; estado: string; fecha_fin: string | null; via: string } | null;
};
type Pool = { id: string; plan: string; cupos: number | null; estado: string; fecha_fin: string | null; usados: number; disponibles: number | null };
type Resumen = { institucion: { id: string; nombre: string; estado: string }; colegios: ColegioResumen[]; pools: Pool[] };

async function panel(accion: string, payload: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${URL}/functions/v1/institucion-panel`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion, ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j: j as { error?: string; [k: string]: unknown } };
}

const copyError = (j: { error?: string }) => ERRS_LICENCIAS[j?.error ?? ''] || j?.error || 'No se pudo.';

const card: React.CSSProperties = {
  background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 16,
  padding: 20, marginBottom: 18, boxShadow: `0 4px 16px ${ADMIN.sombraCalida}`,
};
const h2: React.CSSProperties = { fontFamily: BALOO, fontSize: 19, color: ADMIN.oscuro, margin: '0 0 4px' };
const sub: React.CSSProperties = { fontFamily: QUICK, fontSize: 13.5, color: ADMIN.tinta2, margin: '0 0 14px' };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: `2px solid ${ADMIN.borde}`, borderRadius: 12,
  fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.ink, background: '#fff', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: QUICK, fontWeight: 700, fontSize: 13, color: ADMIN.tinta2, margin: '0 0 5px',
};
const btnSm: React.CSSProperties = {
  background: ADMIN.carta, color: ADMIN.medio, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 10,
  padding: '7px 13px', fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: 'pointer',
};

export default function PanelInstitucion() {
  const router = useRouter();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [metricas, setMetricas] = useState<FilaColegio[]>([]);
  const [busy, setBusy] = useState(false);
  const [nuevoColegio, setNuevoColegio] = useState({ nombre: '', provincia: '' });
  const [nuevaDocente, setNuevaDocente] = useState({ escuela_id: '', nombre: '', email: '' });
  const [credencial, setCredencial] = useState<{ email: string; password: string } | null>(null);
  const ahora = new Date();

  async function cargar() {
    const [r, m] = await Promise.all([panel('resumen'), panel('metricas')]);
    if (!r.ok) {
      // 403 = no es admin de institución (o está suspendida): al login propio.
      router.replace('/institucion/login');
      return;
    }
    setResumen(r.j as unknown as Resumen);
    if (m.ok) setMetricas((m.j.filas ?? []) as FilaColegio[]);
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function crearColegio() {
    if (busy) return;
    if (!nuevoColegio.nombre.trim()) { toast('Poné el nombre del colegio.'); return; }
    setBusy(true);
    const { ok, j } = await panel('colegio_crear', {
      nombre: nuevoColegio.nombre.trim(),
      provincia: nuevoColegio.provincia || null,
    });
    setBusy(false);
    if (!ok) { toast(copyError(j)); return; }
    setNuevoColegio({ nombre: '', provincia: '' });
    toast('Colegio creado en tu institución.');
    await cargar();
  }

  async function crearDocente() {
    if (busy) return;
    if (!nuevaDocente.escuela_id || !nuevaDocente.nombre.trim() || !nuevaDocente.email.trim()) {
      toast('Completá colegio, nombre y email.'); return;
    }
    setBusy(true);
    const { ok, j } = await panel('docente_crear', nuevaDocente);
    setBusy(false);
    if (!ok) { toast(copyError(j)); return; }
    const inv = (j.invitacion ?? {}) as { password_temporal?: string };
    setCredencial({ email: nuevaDocente.email.trim(), password: inv.password_temporal ?? '' });
    setNuevaDocente({ escuela_id: '', nombre: '', email: '' });
    await cargar();
  }

  if (!resumen) {
    return (
      <div style={{ minHeight: '100vh', background: ADMIN.suave, display: 'grid', placeItems: 'center' }}>
        <p style={{ fontFamily: QUICK, color: ADMIN.tinta2 }}>Cargando…</p>
      </div>
    );
  }

  const totales = totalesInstitucion(metricas);

  return (
    <div style={{ minHeight: '100vh', background: ADMIN.suave, padding: '26px 28px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: BALOO, fontSize: 27, color: ADMIN.oscuro, margin: 0, flex: 1 }}>
            {resumen.institucion.nombre}
          </h1>
          <button
            style={btnSm}
            onClick={async () => { await supabase.auth.signOut(); router.replace('/institucion/login'); }}
          >Salir</button>
        </div>
        <p style={{ ...sub, fontSize: 14.5, marginBottom: 20 }}>
          Números agregados de tus colegios. Por diseño no vas a ver alumnos individuales, y el
          desempeño de un colegio con pocos chicos no se muestra: son datos de menores.
        </p>

        {/* ── Totales ──────────────────────────────────────────────── */}
        <section style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          {[
            ['Colegios', String(totales.colegios)],
            ['Sesiones (30 días)', String(totales.sesiones)],
            ['Chicos activos (7 días)', String(totales.activos)],
            ['Costo del mes', copyCosto(totales.costo)],
          ].map(([label, valor]) => (
            <div key={label}>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.tinta2 }}>{label}</div>
              <div style={{ fontFamily: BALOO, fontSize: 24, color: ADMIN.oscuro }}>{valor}</div>
            </div>
          ))}
        </section>

        {/* ── Colegios ─────────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>Tus colegios</h2>
          <p style={sub}>Cada uno con su gente, su licencia y su deuda de consentimientos.</p>
          {resumen.colegios.length === 0 ? (
            <p style={{ fontFamily: QUICK, fontSize: 14, color: ADMIN.tinta2 }}>Todavía no hay colegios.</p>
          ) : resumen.colegios.map((c) => {
            const m = metricas.find((f) => f.escuela_id === c.id);
            return (
              <div key={c.id} style={{ padding: '12px 0', borderTop: `1px solid ${ADMIN.bordeCalido}` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.ink, flex: 1, minWidth: 180 }}>
                    {c.nombre}
                    <span style={{ fontWeight: 400, color: ADMIN.tinta2 }}>{c.provincia ? ` · ${c.provincia}` : ''}</span>
                  </span>
                  {c.licencia ? (
                    <span style={{ fontFamily: QUICK, fontSize: 12.5, color: ADMIN.tinta2 }}>
                      {PLAN_COPY[c.licencia.plan] ?? c.licencia.plan} · {copyVencimientoLicencia(c.licencia.fecha_fin, ahora)}
                    </span>
                  ) : (
                    <span style={{ fontFamily: QUICK, fontSize: 12.5, color: ADMIN.warnTexto }}>Sin licencia</span>
                  )}
                </div>
                <div style={{ fontFamily: QUICK, fontSize: 13, color: ADMIN.tinta2, marginTop: 4 }}>
                  {c.docentes} maestras · {c.matriculas_activas} chicos con matrícula activa ·{' '}
                  {m ? `${m.sesiones ?? 0} sesiones · ${copyPrecision(m)}` : 'sin métricas'} · {copyDeuda(c.deuda_consentimientos)}
                </div>
              </div>
            );
          })}
        </section>

        {/* ── Pools ────────────────────────────────────────────────── */}
        {resumen.pools.length > 0 ? (
          <section style={card}>
            <h2 style={h2}>Tus licencias</h2>
            <p style={sub}>Los cupos se asignan a los colegios de tu institución.</p>
            {resumen.pools.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${ADMIN.bordeCalido}`, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 160, fontFamily: QUICK, fontSize: 14, color: ADMIN.ink }}>
                  {PLAN_COPY[p.plan] ?? p.plan} · {p.estado}
                </span>
                <span style={{ fontFamily: QUICK, fontSize: 12.5, color: ADMIN.tinta2 }}>{copyCupos(p)}</span>
              </div>
            ))}
          </section>
        ) : null}

        {/* ── Altas ────────────────────────────────────────────────── */}
        <section style={card}>
          <h2 style={h2}>Sumar un colegio</h2>
          <p style={sub}>Nace dentro de tu institución, con 30 días de prueba.</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={labelStyle}>Nombre</label>
              <input value={nuevoColegio.nombre} onChange={(e) => setNuevoColegio({ ...nuevoColegio, nombre: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={labelStyle}>Provincia</label>
              <input value={nuevoColegio.provincia} onChange={(e) => setNuevoColegio({ ...nuevoColegio, provincia: e.target.value })} style={inputStyle} />
            </div>
            <button style={btnSm} onClick={crearColegio} disabled={busy}>Crear</button>
          </div>
        </section>

        <section style={card}>
          <h2 style={h2}>Sumar una maestra</h2>
          <p style={sub}>Se le crea la cuenta y se le pasa una contraseña temporal, una sola vez.</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 170 }}>
              <label style={labelStyle}>Colegio</label>
              <select
                value={nuevaDocente.escuela_id}
                onChange={(e) => setNuevaDocente({ ...nuevaDocente, escuela_id: e.target.value })}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Elegí uno</option>
                {resumen.colegios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={labelStyle}>Nombre</label>
              <input value={nuevaDocente.nombre} onChange={(e) => setNuevaDocente({ ...nuevaDocente, nombre: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={labelStyle}>Email</label>
              <input value={nuevaDocente.email} onChange={(e) => setNuevaDocente({ ...nuevaDocente, email: e.target.value })} style={inputStyle} />
            </div>
            <button style={btnSm} onClick={crearDocente} disabled={busy}>Dar de alta</button>
          </div>
          {credencial ? (
            <div style={{ marginTop: 12, padding: 14, background: ADMIN.burbuja, borderRadius: 12 }}>
              <p style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.oscuro, margin: '0 0 6px' }}>
                Pasale esto UNA sola vez (no se vuelve a mostrar):
              </p>
              <p style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.ink, margin: 0 }}>
                {credencial.email} · contraseña temporal <strong>{credencial.password}</strong>
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
