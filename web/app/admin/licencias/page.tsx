'use client';
// Licencias (alumno golondrina, migración 0026) — restyle 2026-08 al mock
// Admin.dc.html. La evolución de los trials: una licencia es de UN colegio XOR
// de UNA institución (pool con cupos).
//
// Recordatorio del corte, que el mock pone en pantalla a propósito: vencida =
// SOLO LECTURA (el colegio sigue viendo todo, no genera contenido nuevo) y
// suspendida = bloqueado. Nunca se borra nada por falta de pago.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN, CAMPO, ETIQUETA, ESTADO_LICENCIA_PILL } from '@/lib/admin/tema';
import { toast } from '@/lib/toast';
import Pill from '@/components/admin/Pill';
import Modal from '@/components/admin/Modal';
import FiltroChips from '@/components/admin/FiltroChips';
import {
  ERRS_LICENCIAS, PLANES, PLAN_COPY, copyCupos, cuposDe, diasHastaFin,
  extenderTreintaDias, validarFormLicencia,
} from '@/lib/admin/licencias';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

type Licencia = {
  id: string; escuela_id: string | null; institucion_id: string | null;
  plan: string; cupos: number | null; fecha_inicio: string; fecha_fin: string | null;
  estado: string; condiciones: string | null; usados: number;
  escuela?: { nombre: string } | null;
  institucion?: { nombre: string } | null;
};
type Opcion = { id: string; nombre: string };

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN, ...ERRS_LICENCIAS,
  no_existe: 'Esa licencia ya no existe. Actualizá la lista.',
  cupos_solo_pool: 'Los cupos son solo para las licencias de una institución.',
  licencia_no_es_pool: 'Esa licencia no es un pool: no tiene cupos para asignar.',
  sin_asignacion: 'Ese colegio no estaba consumiendo ningún cupo.',
  fecha_invalida: 'Revisá las fechas.',
};
const copyError = (c?: string) => ERRS[c ?? ''] ?? 'Algo salió mal. Probá de nuevo.';

const FILTROS = [
  { key: '', label: 'Todas' },
  { key: 'prueba', label: 'En prueba' },
  { key: 'activa', label: 'Activas' },
  { key: 'vencida', label: 'Vencidas' },
  { key: 'suspendida', label: 'Suspendidas' },
] as const;

// Qué significa cada estado, en la pantalla y no en la documentación.
const LEYENDA: readonly [string, string][] = [
  ['prueba', 'Los primeros 30 días. Todo habilitado.'],
  ['activa', 'Licencia al día: sin límites nuevos.'],
  ['vencida', 'El colegio queda en solo lectura: ve todo lo suyo, no genera contenido nuevo.'],
  ['suspendida', 'Acceso bloqueado. Los datos quedan intactos.'],
];

const carta: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22,
};
const btnChico: React.CSSProperties = {
  background: ADMIN.carta, borderRadius: 999, padding: '8px 15px',
  fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
};

export default function AdminLicencias() {
  const [licencias, setLicencias] = useState<Licencia[] | null>(null);
  const [colegios, setColegios] = useState<Opcion[]>([]);
  const [instituciones, setInstituciones] = useState<Opcion[]>([]);
  const [filtro, setFiltro] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    tipo: 'escuela', escuela_id: '', institucion_id: '', plan: 'docente', cupos: '10', fecha_fin: '',
  });
  const [cupo, setCupo] = useState<{ licencia: Licencia; escuela_id: string } | null>(null);
  const ahora = new Date();

  async function cargar() {
    const r = await llamarAdmin<{ licencias: Licencia[] }>('admin-instituciones', 'licencia_listar');
    if (!r.ok) { toast(copyError(r.data.error)); setLicencias([]); return; }
    setLicencias(r.data.licencias ?? []);
  }

  useEffect(() => {
    cargar();
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('escuela_publica').select('id, nombre').order('nombre');
      setColegios((data as Opcion[]) ?? []);
      const r = await llamarAdmin<{ instituciones: Opcion[] }>('admin-instituciones', 'listar');
      if (r.ok) setInstituciones(r.data.instituciones ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const esPool = form.tipo === 'institucion';

  async function crear() {
    if (busy) return;
    const payload = {
      escuela_id: esPool ? '' : form.escuela_id,
      institucion_id: esPool ? form.institucion_id : '',
      plan: form.plan,
      cupos: esPool && form.cupos ? Number(form.cupos) : undefined,
    };
    const v = validarFormLicencia(payload);
    if (!v.ok) { toast(v.error); return; }
    setBusy(true);
    const r = await llamarAdmin('admin-instituciones', 'licencia_crear', {
      ...(payload.escuela_id ? { escuela_id: payload.escuela_id } : {}),
      ...(payload.institucion_id ? { institucion_id: payload.institucion_id } : {}),
      plan: form.plan,
      ...(payload.cupos ? { cupos: payload.cupos } : {}),
      ...(form.fecha_fin ? { fecha_fin: form.fecha_fin } : {}),
      estado: 'activa',
    });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setForm({ ...form, escuela_id: '', institucion_id: '', fecha_fin: '' });
    toast('Licencia creada.');
    await cargar();
  }

  async function editar(id: string, patch: Record<string, unknown>, ok: string) {
    if (busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-instituciones', 'licencia_editar', { licencia_id: id, ...patch });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    toast(ok);
    await cargar();
  }

  async function asignarCupo() {
    if (!cupo || !cupo.escuela_id || busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-instituciones', 'cupo_asignar', {
      licencia_id: cupo.licencia.id, escuela_id: cupo.escuela_id,
    });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setCupo(null);
    toast('Cupo asignado.');
    await cargar();
  }

  const filas = (licencias ?? []).filter((l) => !filtro || l.estado === filtro);

  return (
    <div>
      <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 4px' }}>
        Licencias
      </h1>
      <p style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 18px', maxWidth: 700, textWrap: 'pretty' }}>
        Una licencia es de un colegio o de una institución, nunca de las dos. Las de institución son un
        pool con cupos que se van asignando.
      </p>

      <div style={{ background: ADMIN.okFondo, border: `1.5px solid ${ADMIN.okBorde}`, borderRadius: 18, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 20, maxWidth: 760 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: ADMIN.okCheck, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: ADMIN.okTexto, lineHeight: 1.4 }}>
          Nunca se borra nada por falta de pago. Lo peor que puede pasar es que el colegio quede en solo lectura.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22, maxWidth: 1000 }}>
        {LEYENDA.map(([estado, consecuencia]) => (
          <div key={estado} style={{ ...carta, borderRadius: 18, padding: '14px 16px' }}>
            <Pill tupla={ESTADO_LICENCIA_PILL[estado]} />
            <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>
              {consecuencia}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'start' }}>
        {/* ── Listado ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <FiltroChips opciones={FILTROS} valor={filtro} onCambio={setFiltro} />
          </div>

          {licencias === null ? (
            <p style={{ fontFamily: QUICK, fontSize: 14, color: ADMIN.tinta2 }}>Cargando…</p>
          ) : filas.length === 0 ? (
            <div style={{ ...carta, textAlign: 'center', padding: '44px 24px' }}>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>No hay licencias con ese estado</div>
              <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>Probá con otro filtro.</div>
            </div>
          ) : filas.map((l) => {
            const c = cuposDe(l);
            const dias = diasHastaFin(l.fecha_fin, ahora);
            const vencido = dias !== null && dias < 0;
            const pronto = dias !== null && dias >= 0 && dias <= 7 && l.estado !== 'suspendida';
            const pct = c.porcentaje ?? 100;
            const suspendida = l.estado === 'suspendida';
            return (
              <div
                key={l.id}
                style={{ ...carta, borderRadius: 20, padding: '18px 22px', border: `2px solid ${pronto || vencido ? ADMIN.warnBorde : ADMIN.bordeCalido}`, boxShadow: `0 3px 10px ${ADMIN.sombraCalida}` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16.5, color: ADMIN.ink }}>
                    {l.escuela?.nombre ?? l.institucion?.nombre ?? 'Sin destino'}
                  </span>
                  <span style={{ background: ADMIN.hover, border: `1px solid ${ADMIN.chipBorde}`, color: ADMIN.tinta2, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 800 }}>
                    {c.esPool ? 'Institución' : 'Colegio'}
                  </span>
                  <Pill tupla={ESTADO_LICENCIA_PILL[l.estado]} />
                  <span style={{
                    background: vencido ? ADMIN.dangerFondo : pronto ? ADMIN.warnFondo : 'transparent',
                    color: vencido ? ADMIN.danger : pronto ? ADMIN.warnTexto : ADMIN.tinta2,
                    border: `1px solid ${vencido ? ADMIN.dangerBorde : pronto ? ADMIN.warnBorde : 'transparent'}`,
                    borderRadius: 999, padding: '3px 11px', fontSize: 12, fontWeight: 800,
                  }}>
                    {l.fecha_fin
                      ? `${vencido ? 'Venció el' : 'Vence el'} ${l.fecha_fin.slice(0, 10)}`
                      : 'Sin vencimiento'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
                  <span style={{ fontSize: 13, color: ADMIN.tinta2, fontWeight: 700, minWidth: 120 }}>
                    Plan {PLAN_COPY[l.plan] ?? l.plan}
                  </span>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 5 }}>
                      <span>{c.esPool ? copyCupos(l) : 'Un solo colegio · sin cupos'}</span>
                    </div>
                    <div style={{ height: 10, background: ADMIN.divisor, borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: c.esPool ? `${Math.min(100, pct)}%` : '100%', height: '100%', background: c.esPool ? (pct > 90 ? ADMIN.danger : ADMIN.base) : ADMIN.bordeCalido, borderRadius: 999 }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  <button
                    onClick={() => editar(l.id, {
                      fecha_fin: extenderTreintaDias(l.fecha_fin, ahora),
                      ...(l.estado === 'vencida' ? { estado: 'activa' } : {}),
                    }, 'Licencia extendida 30 días.')}
                    className="ad-ghost"
                    style={{ ...btnChico, border: `1.5px solid ${ADMIN.borde}`, color: ADMIN.oscuro }}
                  >
                    Extender +30 días
                  </button>
                  <button
                    onClick={() => editar(l.id, { estado: suspendida ? 'activa' : 'suspendida' }, suspendida ? 'Licencia reactivada.' : 'Licencia suspendida.')}
                    className="ad-ghost-warm"
                    style={{ ...btnChico, border: `1.5px solid ${ADMIN.bordeCalido}`, color: ADMIN.tinta2 }}
                  >
                    {suspendida ? 'Reactivar' : 'Suspender'}
                  </button>
                  {c.esPool && (
                    <button
                      onClick={() => setCupo({ licencia: l, escuela_id: '' })}
                      className="ad-ghost"
                      style={{ ...btnChico, border: `1.5px solid ${ADMIN.borde}`, color: ADMIN.oscuro }}
                    >
                      Asignar cupo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Alta ─────────────────────────────────────────────────────── */}
        <div style={carta}>
          <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: '0 0 16px' }}>Nueva licencia</h2>

          <label style={ETIQUETA}>¿De quién es?</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <FiltroChips
              opciones={[{ key: 'escuela', label: 'Un colegio' }, { key: 'institucion', label: 'Una institución' }]}
              valor={form.tipo}
              onCambio={(k) => setForm({ ...form, tipo: k })}
            />
          </div>

          <label style={ETIQUETA}>{esPool ? '¿Qué institución?' : '¿Qué colegio?'}</label>
          {esPool ? (
            <select
              value={form.institucion_id} onChange={(e) => setForm({ ...form, institucion_id: e.target.value })}
              style={{ ...CAMPO, fontWeight: 700, marginBottom: 14, cursor: 'pointer' }}
            >
              <option value="">Elegí una</option>
              {instituciones.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
          ) : (
            <select
              value={form.escuela_id} onChange={(e) => setForm({ ...form, escuela_id: e.target.value })}
              style={{ ...CAMPO, fontWeight: 700, marginBottom: 14, cursor: 'pointer' }}
            >
              <option value="">Elegí uno</option>
              {colegios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}

          <label style={ETIQUETA}>Plan</label>
          <select
            value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}
            style={{ ...CAMPO, fontWeight: 700, marginBottom: 14, cursor: 'pointer' }}
          >
            {PLANES.map((p) => <option key={p} value={p}>{PLAN_COPY[p]}</option>)}
          </select>

          {esPool ? (
            <div style={{ background: ADMIN.burbuja, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
              <label style={{ ...ETIQUETA, color: ADMIN.oscuro }}>Cupos del pool</label>
              <input
                value={form.cupos} inputMode="numeric"
                onChange={(e) => setForm({ ...form, cupos: e.target.value.replace(/\D/g, '') })}
                style={{ ...CAMPO, padding: '11px 13px', fontWeight: 700, border: `2px solid ${ADMIN.borde}`, background: ADMIN.carta }}
              />
              <div style={{ fontSize: 12.5, color: ADMIN.oscuro, fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>
                La institución reparte estos cupos entre sus colegios.
              </div>
            </div>
          ) : (
            <div style={{ background: ADMIN.hover, border: `1.5px solid ${ADMIN.chipBorde}`, borderRadius: 14, padding: '12px 16px', marginBottom: 14, fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, lineHeight: 1.45 }}>
              Una licencia de colegio no lleva cupos: habilita ese colegio y nada más.
            </div>
          )}

          <label style={ETIQUETA}>Vence el</label>
          <input
            type="date" value={form.fecha_fin}
            onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
            style={{ ...CAMPO, marginBottom: 18 }}
          />
          <button
            onClick={crear} disabled={busy}
            className="ed-primary"
            style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '12px 26px', fontFamily: QUICK, fontWeight: 700, fontSize: 15, cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1, boxShadow: `0 6px 16px ${ADMIN.sombraCTA}` }}
          >
            Crear licencia
          </button>
        </div>
      </div>

      {cupo && (
        <Modal
          titulo="Asignar un cupo"
          descripcion={`Del pool de ${cupo.licencia.institucion?.nombre ?? 'la institución'} · ${cuposDe(cupo.licencia).disponibles ?? 0} libres`}
          verbo="Asignar cupo"
          busy={busy}
          puede={!!cupo.escuela_id}
          confirmar={asignarCupo}
          onCerrar={() => setCupo(null)}
        >
          <label style={ETIQUETA}>¿A qué colegio?</label>
          <select
            value={cupo.escuela_id} onChange={(e) => setCupo({ ...cupo, escuela_id: e.target.value })}
            style={{ ...CAMPO, fontWeight: 700, cursor: 'pointer' }}
          >
            <option value="">Elegí un colegio</option>
            {colegios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Modal>
      )}
    </div>
  );
}
