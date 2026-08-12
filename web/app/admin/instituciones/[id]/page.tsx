'use client';
// Ficha de una institución (alumno golondrina, migración 0025) — restyle
// 2026-08 al mock Admin.dc.html: tres tarjetas al lado (colegios, admins,
// licencias) en vez del acordeón inline que tenía el listado.
//
// Recordatorio del diseño: el admin de institución entra por /institucion y
// SOLO ve agregados. Acá se le da o se le saca el acceso, nunca se le muestra
// un chico.
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN, CAMPO, ETIQUETA, ESTADO_INSTITUCION_PILL, ESTADO_LICENCIA_PILL } from '@/lib/admin/tema';
import { toast } from '@/lib/toast';
import Pill from '@/components/admin/Pill';
import Modal from '@/components/admin/Modal';
import CampoCopiable from '@/components/admin/CampoCopiable';
import {
  ERRS_LICENCIAS, PLAN_COPY, TIPO_INSTITUCION_COPY, copyCupos, cuposDe,
} from '@/lib/admin/licencias';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

type Institucion = { id: string; nombre: string; tipo: string | null; estado: string };
type Colegio = { id: string; nombre: string; provincia: string | null; estado: string };
type AdminInst = { perfil_id: string; nombre: string; activo: boolean; email: string | null };
type Pool = { id: string; plan: string; cupos: number | null; estado: string; fecha_fin: string | null; usados: number };
type Ficha = { institucion: Institucion; colegios: Colegio[]; admins: AdminInst[]; pools: Pool[] };
type Invitacion = { email: string; password: string; link: string | null };

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN, ...ERRS_LICENCIAS,
  no_existe: 'Esa institución ya no existe.',
  email_invalido: 'Ese email no parece válido.',
  estado_invalido: 'Ese estado no es válido.',
};
const copyError = (c?: string) => ERRS[c ?? ''] ?? 'Algo salió mal. Probá de nuevo.';

const carta: React.CSSProperties = {
  background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22,
};
const tituloCarta: React.CSSProperties = {
  fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.oscuro, margin: 0,
};
const fila: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, background: ADMIN.suave, borderRadius: 14, padding: '12px 14px',
};
const btnChico: React.CSSProperties = {
  background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, color: ADMIN.tinta2,
  borderRadius: 999, padding: '7px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 12, cursor: 'pointer',
};
const vacio: React.CSSProperties = { fontSize: 14, color: ADMIN.tinta2, fontWeight: 600 };

export default function FichaInstitucion() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [libres, setLibres] = useState<{ id: string; nombre: string }[]>([]);
  const [colegioSel, setColegioSel] = useState('');
  const [modalAdmin, setModalAdmin] = useState(false);
  const [nuevoAdmin, setNuevoAdmin] = useState({ nombre: '', email: '' });
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null);
  const [busy, setBusy] = useState(false);

  async function cargar() {
    const r = await llamarAdmin<Ficha>('admin-instituciones', 'ficha', { institucion_id: id });
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setFicha(r.data as unknown as Ficha);
  }

  async function cargarLibres() {
    // Colegios que todavía no cuelgan de ninguna institución. La vista pública
    // no trae institucion_id, así que se consulta la tabla (RLS de admin).
    const supabase = createClient();
    const { data } = await supabase.from('escuela').select('id, nombre, institucion_id').order('nombre');
    const filas = (data ?? []) as { id: string; nombre: string; institucion_id: string | null }[];
    setLibres(filas.filter((e) => !e.institucion_id).map((e) => ({ id: e.id, nombre: e.nombre })));
  }

  useEffect(() => { cargar(); cargarLibres(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function accion(fnAccion: string, payload: Record<string, unknown>, ok: string) {
    if (busy) return false;
    setBusy(true);
    const r = await llamarAdmin('admin-instituciones', fnAccion, payload);
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return false; }
    toast(ok);
    await Promise.all([cargar(), cargarLibres()]);
    return true;
  }

  async function crearAdmin() {
    if (busy) return;
    if (!nuevoAdmin.nombre.trim() || !nuevoAdmin.email.trim()) { toast('Completá nombre y email.'); return; }
    setBusy(true);
    const r = await llamarAdmin<{ invitacion: { link: string | null; password_temporal: string } }>(
      'admin-instituciones', 'admin_crear',
      { institucion_id: id, nombre: nuevoAdmin.nombre.trim(), email: nuevoAdmin.email.trim() },
    );
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setInvitacion({
      email: nuevoAdmin.email.trim(),
      password: r.data.invitacion?.password_temporal ?? '',
      link: r.data.invitacion?.link ?? null,
    });
    setModalAdmin(false);
    setNuevoAdmin({ nombre: '', email: '' });
    await cargar();
  }

  if (!ficha) {
    return <p style={{ fontFamily: QUICK, fontSize: 14, color: ADMIN.tinta2 }}>Cargando…</p>;
  }

  const inst = ficha.institucion;
  const activa = inst.estado === 'activa';

  return (
    <div>
      <button
        onClick={() => router.push('/admin/instituciones')}
        style={{ background: 'none', border: 'none', color: ADMIN.tinta2, fontWeight: 700, fontSize: 14.5, cursor: 'pointer', marginBottom: 14, padding: 0 }}
      >
        ‹ Instituciones
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(24px, 3.2vw, 32px)', color: ADMIN.ink, margin: 0 }}>
          {inst.nombre}
        </h1>
        <Pill tupla={ESTADO_INSTITUCION_PILL[inst.estado]} />
        {inst.tipo && (
          <span style={{ background: ADMIN.burbuja, border: `1px solid ${ADMIN.borde}`, color: ADMIN.oscuro, borderRadius: 999, padding: '5px 13px', fontFamily: QUICK, fontWeight: 700, fontSize: 13 }}>
            {TIPO_INSTITUCION_COPY[inst.tipo] ?? inst.tipo}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => accion('estado', { institucion_id: id, estado: activa ? 'suspendida' : 'activa' }, activa ? 'Institución suspendida.' : 'Institución reactivada.')}
          className={activa ? 'ad-ghost-danger' : 'ad-ghost'}
          style={{ background: ADMIN.carta, border: `1.5px solid ${activa ? ADMIN.dangerBorde : ADMIN.borde}`, color: activa ? ADMIN.danger : ADMIN.oscuro, borderRadius: 999, padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          {activa ? 'Suspender' : 'Reactivar'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }}>
        {/* ── Colegios ─────────────────────────────────────────────────── */}
        <div style={carta}>
          <h2 style={{ ...tituloCarta, marginBottom: 14 }}>Colegios de la institución</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {ficha.colegios.length === 0 ? (
              <div style={vacio}>Todavía no tiene colegios asignados.</div>
            ) : ficha.colegios.map((c) => (
              <div key={c.id} style={fila}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.ink }}>{c.nombre}</div>
                  <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600 }}>{c.provincia ?? 'Sin provincia'}</div>
                </div>
                <button
                  onClick={() => accion('colegio_quitar', { escuela_id: c.id }, 'Colegio desvinculado.')}
                  className="ad-ghost-warm" style={btnChico}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select
              value={colegioSel} onChange={(e) => setColegioSel(e.target.value)}
              style={{ ...CAMPO, flex: 1, minWidth: 180, width: 'auto', padding: '11px 13px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              <option value="">Sumar un colegio sin institución…</option>
              {libres.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <button
              onClick={async () => {
                if (!colegioSel) return;
                if (await accion('colegio_asignar', { institucion_id: id, escuela_id: colegioSel }, 'Colegio asignado.')) setColegioSel('');
              }}
              disabled={!colegioSel}
              style={{ background: colegioSel ? ADMIN.base : ADMIN.bordeCalido, color: '#fff', border: 'none', borderRadius: 999, padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: colegioSel ? 'pointer' : 'not-allowed' }}
            >
              Asignar
            </button>
          </div>
        </div>

        {/* ── Administradores ──────────────────────────────────────────── */}
        <div style={carta}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <h2 style={tituloCarta}>Administradores</h2>
            <button
              onClick={() => setModalAdmin(true)} className="ad-ghost"
              style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.borde}`, color: ADMIN.oscuro, borderRadius: 999, padding: '8px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
            >
              + Nuevo
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 14px', lineHeight: 1.45 }}>
            Entran por <b>/institucion</b> y solo ven números agregados: ningún chico, ningún legajo.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ficha.admins.length === 0 ? (
              <div style={vacio}>Todavía no hay nadie con acceso al panel institucional.</div>
            ) : ficha.admins.map((a) => (
              <div key={a.perfil_id} style={fila}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.ink }}>{a.nombre}</div>
                  <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 600 }}>{a.email ?? '—'}</div>
                </div>
                <button
                  onClick={() => accion('admin_estado', { perfil_id: a.perfil_id, activo: !a.activo }, a.activo ? 'Acceso suspendido.' : 'Acceso reactivado.')}
                  className="ad-ghost-warm" style={btnChico}
                >
                  {a.activo ? 'Suspender' : 'Reactivar'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Licencias ────────────────────────────────────────────────── */}
        <div style={carta}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
            <h2 style={tituloCarta}>Licencias</h2>
            <button
              onClick={() => router.push('/admin/licencias')}
              style={{ background: 'none', border: 'none', color: ADMIN.base, fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Ver todas ›
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ficha.pools.length === 0 ? (
              <div style={vacio}>Todavía no tiene licencias.</div>
            ) : ficha.pools.map((p) => {
              const c = cuposDe(p);
              const pct = c.porcentaje ?? 100;
              return (
                <div key={p.id} style={{ background: ADMIN.suave, borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.ink }}>
                      Plan {PLAN_COPY[p.plan] ?? p.plan}
                    </span>
                    <Pill tupla={ESTADO_LICENCIA_PILL[p.estado]} />
                  </div>
                  <div style={{ fontSize: 12.5, color: ADMIN.tinta2, fontWeight: 700, margin: '8px 0 6px' }}>
                    {copyCupos(p)} · {p.fecha_fin ? `vence ${p.fecha_fin}` : 'sin vencimiento'}
                  </div>
                  <div style={{ height: 10, background: ADMIN.divisor, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: pct > 90 ? ADMIN.danger : ADMIN.base, borderRadius: 999 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {modalAdmin && (
        <Modal
          titulo="Nuevo admin de la institución"
          descripcion="Entra por /institucion y ve solo números agregados de sus colegios."
          verbo="Crear e invitar"
          busy={busy}
          puede={!!(nuevoAdmin.nombre.trim() && nuevoAdmin.email.trim())}
          confirmar={crearAdmin}
          onCerrar={() => setModalAdmin(false)}
        >
          <label style={ETIQUETA}>Nombre</label>
          <input
            value={nuevoAdmin.nombre} placeholder="Paula Benítez"
            onChange={(e) => setNuevoAdmin({ ...nuevoAdmin, nombre: e.target.value })}
            style={{ ...CAMPO, marginBottom: 12 }}
          />
          <label style={ETIQUETA}>Email</label>
          <input
            type="email" value={nuevoAdmin.email} placeholder="paula@raiznorte.org"
            onChange={(e) => setNuevoAdmin({ ...nuevoAdmin, email: e.target.value })}
            style={{ ...CAMPO, marginBottom: 14 }}
          />
          <div style={{ background: ADMIN.burbuja, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 12, padding: '12px 14px', fontSize: 12.5, fontWeight: 600, color: ADMIN.oscuro, lineHeight: 1.45 }}>
            Este acceso <b>nunca</b> muestra un chico: ni nombres, ni legajos. Solo totales por colegio.
          </div>
        </Modal>
      )}

      {invitacion && (
        <Modal
          titulo="Acceso creado"
          descripcion={`Pasale estos datos a ${invitacion.email} para que entre por primera vez.`}
          verbo="Listo, los guardé"
          confirmar={() => setInvitacion(null)}
          onCerrar={() => setInvitacion(null)}
        >
          <div style={{ background: ADMIN.warnFondo, border: `1.5px solid ${ADMIN.sol}`, borderRadius: 12, padding: '12px 14px', fontSize: 13.5, fontWeight: 800, color: ADMIN.warnTexto, marginBottom: 16 }}>
            Guardá estos datos ahora: no se vuelven a mostrar.
          </div>
          {invitacion.link
            ? <CampoCopiable label="Link de invitación" valor={invitacion.link} />
            : <p style={{ fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 14px' }}>
                No se pudo generar el link. Pasale la contraseña temporal.
              </p>}
          {invitacion.password && <CampoCopiable label="Contraseña temporal" valor={invitacion.password} destacado />}
        </Modal>
      )}
    </div>
  );
}
