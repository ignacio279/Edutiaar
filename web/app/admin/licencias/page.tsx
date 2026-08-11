'use client';
// Licencias (alumno golondrina, migración 0026): la evolución de los trials.
// Una licencia es de UN colegio XOR de UNA institución (pool con cupos).
//
// Recordatorio del corte: vencida = SOLO LECTURA (el colegio sigue viendo
// todo, no genera contenido nuevo) y suspendida = bloqueado. Nunca se borra
// nada por falta de pago.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN } from '@/lib/admin/tema';
import { toast } from '@/lib/toast';
import {
  ERRS_LICENCIAS, ESTADOS_LICENCIA, PLANES, PLAN_COPY, copyCupos,
  copyVencimientoLicencia, cuposDe, porVencer, validarFormLicencia,
} from '@/lib/admin/licencias';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

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
const card: React.CSSProperties = {
  background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 16,
  padding: 20, marginBottom: 18, boxShadow: `0 4px 16px ${ADMIN.sombraCalida}`,
};
const h2: React.CSSProperties = { fontFamily: BALOO, fontSize: 19, color: ADMIN.oscuro, margin: '0 0 4px' };
const sub: React.CSSProperties = { fontFamily: QUICK, fontSize: 13.5, color: ADMIN.tinta2, margin: '0 0 14px' };

const COLOR_ESTADO: Record<string, string> = {
  prueba: '#F4A93B', activa: '#7FB069', vencida: '#BB4F3F', suspendida: '#9A8C7E',
};

export default function AdminLicencias() {
  const [licencias, setLicencias] = useState<Licencia[]>([]);
  const [colegios, setColegios] = useState<Opcion[]>([]);
  const [instituciones, setInstituciones] = useState<Opcion[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    destino: 'escuela', escuela_id: '', institucion_id: '', plan: 'docente',
    cupos: '', fecha_fin: '', estado: 'activa',
  });
  const [asignar, setAsignar] = useState<{ licencia_id: string; escuela_id: string } | null>(null);
  const ahora = new Date();

  async function cargar() {
    const r = await llamarAdmin<{ licencias: Licencia[] }>('admin-instituciones', 'licencia_listar');
    if (!r.ok) { toast(copyError(r.data.error)); return; }
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

  async function crear() {
    if (busy) return;
    const payload = {
      escuela_id: form.destino === 'escuela' ? form.escuela_id : '',
      institucion_id: form.destino === 'institucion' ? form.institucion_id : '',
      plan: form.plan,
      cupos: form.destino === 'institucion' && form.cupos ? Number(form.cupos) : undefined,
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
      estado: form.estado,
    });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setForm({ ...form, escuela_id: '', institucion_id: '', cupos: '', fecha_fin: '' });
    toast('Licencia creada.');
    await cargar();
  }

  async function editar(id: string, patch: Record<string, unknown>) {
    setBusy(true);
    const r = await llamarAdmin('admin-instituciones', 'licencia_editar', { licencia_id: id, ...patch });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    toast('Licencia actualizada.');
    await cargar();
  }

  async function asignarCupo() {
    if (!asignar || busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-instituciones', 'cupo_asignar', asignar);
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setAsignar(null);
    toast('Cupo asignado.');
    await cargar();
  }

  return (
    <div style={{ padding: '26px 28px', maxWidth: 1000 }}>
      <h1 style={{ fontFamily: BALOO, fontSize: 27, color: ADMIN.oscuro, margin: '0 0 4px' }}>Licencias</h1>
      <p style={{ ...sub, fontSize: 14.5, marginBottom: 20 }}>
        Una licencia es de un colegio o de una institución (pool con cupos). Vencida deja al colegio en
        solo lectura; suspendida lo bloquea. Nunca se borra nada por falta de pago.
      </p>

      <section style={card}>
        <h2 style={h2}>Nueva licencia</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>¿De quién es?</label>
            <select
              value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="escuela">De un colegio</option>
              <option value="institucion">De una institución (pool)</option>
            </select>
          </div>
          {form.destino === 'escuela' ? (
            <div>
              <label style={labelStyle}>Colegio</label>
              <select value={form.escuela_id} onChange={(e) => setForm({ ...form, escuela_id: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Elegí uno</option>
                {colegios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label style={labelStyle}>Institución</label>
                <select value={form.institucion_id} onChange={(e) => setForm({ ...form, institucion_id: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Elegí una</option>
                  {instituciones.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Cupos</label>
                <input
                  value={form.cupos} inputMode="numeric" placeholder="Ej: 10"
                  onChange={(e) => setForm({ ...form, cupos: e.target.value.replace(/\D/g, '') })}
                  style={inputStyle}
                />
              </div>
            </>
          )}
          <div>
            <label style={labelStyle}>Plan</label>
            <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
              {PLANES.map((p) => <option key={p} value={p}>{PLAN_COPY[p]}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Estado</label>
            <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
              {ESTADOS_LICENCIA.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Vence</label>
            <input type="date" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} style={inputStyle} />
          </div>
        </div>
        <button
          onClick={crear} disabled={busy}
          style={{
            marginTop: 14, background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 12,
            padding: '11px 20px', fontFamily: BALOO, fontSize: 15, cursor: 'pointer', opacity: busy ? .6 : 1,
          }}
        >Crear licencia</button>
      </section>

      <section style={card}>
        <h2 style={h2}>Todas</h2>
        {licencias.length === 0 ? (
          <p style={{ fontFamily: QUICK, fontSize: 14, color: ADMIN.tinta2 }}>Todavía no hay licencias.</p>
        ) : licencias.map((l) => {
          const c = cuposDe(l);
          const avisa = porVencer(l.fecha_fin, ahora) && l.estado !== 'suspendida';
          return (
            <div key={l.id} style={{
              display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
              padding: '11px 0', borderTop: `1px solid ${ADMIN.bordeCalido}`,
            }}>
              <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.ink, flex: 1, minWidth: 190 }}>
                {l.escuela?.nombre ?? l.institucion?.nombre ?? 'Sin destino'}
                <span style={{ fontWeight: 400, color: ADMIN.tinta2 }}>
                  {` · ${PLAN_COPY[l.plan] ?? l.plan}`}{c.esPool ? ` · ${copyCupos(l)}` : ''}
                </span>
              </span>
              <span style={{
                fontFamily: QUICK, fontSize: 12.5,
                color: avisa ? ADMIN.warnTexto : ADMIN.tinta2, fontWeight: avisa ? 700 : 400,
              }}>{copyVencimientoLicencia(l.fecha_fin, ahora)}</span>
              <span style={{
                fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: '#fff',
                background: COLOR_ESTADO[l.estado] ?? '#9A8C7E', borderRadius: 999, padding: '4px 12px',
              }}>{l.estado}</span>
              <button
                style={btnSm}
                onClick={() => {
                  const nueva = window.prompt('Nueva fecha de vencimiento (AAAA-MM-DD)', l.fecha_fin ?? '');
                  if (nueva) editar(l.id, { fecha_fin: nueva, estado: 'activa' });
                }}
              >Extender</button>
              {l.estado === 'suspendida' ? (
                <button style={btnSm} onClick={() => editar(l.id, { estado: 'activa' })}>Reactivar</button>
              ) : (
                <button style={btnSm} onClick={() => editar(l.id, { estado: 'suspendida' })}>Suspender</button>
              )}
              {c.esPool ? (
                <button style={btnSm} onClick={() => setAsignar({ licencia_id: l.id, escuela_id: '' })}>Asignar cupo</button>
              ) : null}
            </div>
          );
        })}

        {asignar ? (
          <div style={{ marginTop: 14, padding: 14, background: ADMIN.burbuja, borderRadius: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={asignar.escuela_id}
              onChange={(e) => setAsignar({ ...asignar, escuela_id: e.target.value })}
              style={{ ...inputStyle, maxWidth: 280, cursor: 'pointer' }}
            >
              <option value="">¿Qué colegio consume el cupo?</option>
              {colegios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <button style={btnSm} onClick={asignarCupo} disabled={!asignar.escuela_id}>Asignar</button>
            <button style={btnSm} onClick={() => setAsignar(null)}>Cancelar</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
