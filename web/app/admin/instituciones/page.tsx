'use client';
// Instituciones (alumno golondrina, migración 0025): provincias, fundaciones,
// redes y municipios que agrupan colegios. Desde acá el admin de plataforma
// las crea, las suspende, les cuelga colegios y les da sus propios admins.
//
// OJO: el admin de institución JAMÁS ve alumnos individuales — su panel
// (/institucion) devuelve solo agregados. Acá se administra la institución,
// no a sus chicos.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN } from '@/lib/admin/tema';
import { toast } from '@/lib/toast';
import {
  ERRS_LICENCIAS, ESTADO_INSTITUCION, TIPOS_INSTITUCION, TIPO_INSTITUCION_COPY, copyCupos,
} from '@/lib/admin/licencias';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type Institucion = {
  id: string; nombre: string; tipo: string | null; estado: string;
  colegios: number; admins: number; licencias: number;
};
type Colegio = { id: string; nombre: string; provincia: string | null; estado: string };
type AdminInst = { perfil_id: string; nombre: string; activo: boolean; email: string | null };
type Pool = { id: string; plan: string; cupos: number | null; estado: string; fecha_fin: string | null; usados: number };
type Ficha = { institucion: Institucion; colegios: Colegio[]; admins: AdminInst[]; pools: Pool[] };

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN, ...ERRS_LICENCIAS,
  no_existe: 'Esa institución ya no existe. Actualizá la lista.',
  nombre_vacio: 'Poné un nombre.',
  tipo_invalido: 'Elegí un tipo válido.',
  estado_invalido: 'Ese estado no es válido.',
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

export default function AdminInstituciones() {
  const [instituciones, setInstituciones] = useState<Institucion[]>([]);
  const [sinInstitucion, setSinInstitucion] = useState<{ id: string; nombre: string }[]>([]);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [busy, setBusy] = useState(false);

  const [nueva, setNueva] = useState({ nombre: '', tipo: '' });
  const [nuevoAdmin, setNuevoAdmin] = useState({ nombre: '', email: '' });
  const [credencial, setCredencial] = useState<{ email: string; password: string; link: string | null } | null>(null);
  const [colegioSel, setColegioSel] = useState('');

  async function cargar() {
    const r = await llamarAdmin<{ instituciones: Institucion[] }>('admin-instituciones', 'listar');
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setInstituciones(r.data.instituciones ?? []);
  }

  async function cargarSinInstitucion() {
    // Colegios que todavía no cuelgan de ninguna institución. La vista pública
    // no trae institucion_id, así que se consulta la tabla (RLS de admin).
    const supabase = createClient();
    const { data } = await supabase.from('escuela').select('id, nombre, institucion_id').order('nombre');
    const filas = (data ?? []) as { id: string; nombre: string; institucion_id: string | null }[];
    setSinInstitucion(filas.filter((e) => !e.institucion_id).map((e) => ({ id: e.id, nombre: e.nombre })));
  }

  useEffect(() => { cargar(); cargarSinInstitucion(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function abrirFicha(id: string) {
    const r = await llamarAdmin<Ficha>('admin-instituciones', 'ficha', { institucion_id: id });
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setFicha(r.data as unknown as Ficha);
    setCredencial(null);
  }

  async function crear() {
    if (busy) return;
    if (!nueva.nombre.trim()) { toast('Poné un nombre.'); return; }
    setBusy(true);
    const r = await llamarAdmin('admin-instituciones', 'crear', {
      nombre: nueva.nombre.trim(), tipo: nueva.tipo || null,
    });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setNueva({ nombre: '', tipo: '' });
    toast('Institución creada.');
    await cargar();
  }

  async function cambiarEstado(id: string, estado: string) {
    setBusy(true);
    const r = await llamarAdmin('admin-instituciones', 'estado', { institucion_id: id, estado });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    toast('Estado actualizado.');
    await cargar();
    if (ficha?.institucion.id === id) await abrirFicha(id);
  }

  async function asignarColegio() {
    if (!ficha || !colegioSel || busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-instituciones', 'colegio_asignar', {
      institucion_id: ficha.institucion.id, escuela_id: colegioSel,
    });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setColegioSel('');
    toast('Colegio asignado.');
    await Promise.all([abrirFicha(ficha.institucion.id), cargar(), cargarSinInstitucion()]);
  }

  async function quitarColegio(escuelaId: string) {
    if (!ficha || busy) return;
    setBusy(true);
    const r = await llamarAdmin('admin-instituciones', 'colegio_quitar', { escuela_id: escuelaId });
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    toast('Colegio desvinculado.');
    await Promise.all([abrirFicha(ficha.institucion.id), cargar(), cargarSinInstitucion()]);
  }

  async function crearAdmin() {
    if (!ficha || busy) return;
    if (!nuevoAdmin.nombre.trim() || !nuevoAdmin.email.trim()) { toast('Completá nombre y email.'); return; }
    setBusy(true);
    const r = await llamarAdmin<{ admin: { email: string }; invitacion: { link: string | null; password_temporal: string } }>(
      'admin-instituciones', 'admin_crear',
      { institucion_id: ficha.institucion.id, nombre: nuevoAdmin.nombre.trim(), email: nuevoAdmin.email.trim() },
    );
    setBusy(false);
    if (!r.ok) { toast(copyError(r.data.error)); return; }
    setCredencial({
      email: nuevoAdmin.email.trim(),
      password: r.data.invitacion?.password_temporal ?? '',
      link: r.data.invitacion?.link ?? null,
    });
    setNuevoAdmin({ nombre: '', email: '' });
    await abrirFicha(ficha.institucion.id);
  }

  return (
    <div style={{ padding: '26px 28px', maxWidth: 1000 }}>
      <h1 style={{ fontFamily: BALOO, fontSize: 27, color: ADMIN.oscuro, margin: '0 0 4px' }}>Instituciones</h1>
      <p style={{ ...sub, fontSize: 14.5, marginBottom: 20 }}>
        Provincias, fundaciones, redes y municipios que agrupan colegios. Sus admins ven agregados de
        sus escuelas: nunca a un chico en particular.
      </p>

      <section style={card}>
        <h2 style={h2}>Nueva institución</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <label style={labelStyle}>Nombre</label>
            <input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: 170 }}>
            <label style={labelStyle}>Tipo</label>
            <select value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Sin especificar</option>
              {TIPOS_INSTITUCION.map((t) => <option key={t} value={t}>{TIPO_INSTITUCION_COPY[t]}</option>)}
            </select>
          </div>
          <button
            onClick={crear} disabled={busy}
            style={{
              background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 12,
              padding: '11px 20px', fontFamily: BALOO, fontSize: 15, cursor: 'pointer', opacity: busy ? .6 : 1,
            }}
          >Crear</button>
        </div>
      </section>

      <section style={card}>
        <h2 style={h2}>Todas</h2>
        {instituciones.length === 0 ? (
          <p style={{ fontFamily: QUICK, fontSize: 14, color: ADMIN.tinta2 }}>Todavía no hay instituciones.</p>
        ) : instituciones.map((i) => {
          const e = ESTADO_INSTITUCION[i.estado] ?? { copy: i.estado, color: '#9A8C7E' };
          return (
            <div key={i.id} style={{
              display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
              padding: '11px 0', borderTop: `1px solid ${ADMIN.bordeCalido}`,
            }}>
              <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.ink, flex: 1, minWidth: 180 }}>
                {i.nombre}
                <span style={{ fontWeight: 400, color: ADMIN.tinta2 }}>
                  {i.tipo ? ` · ${TIPO_INSTITUCION_COPY[i.tipo] ?? i.tipo}` : ''}
                </span>
              </span>
              <span style={{ fontFamily: QUICK, fontSize: 12.5, color: ADMIN.tinta2 }}>
                {i.colegios} colegios · {i.admins} admins · {i.licencias} licencias
              </span>
              <span style={{
                fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: '#fff',
                background: e.color, borderRadius: 999, padding: '4px 12px',
              }}>{e.copy}</span>
              <button style={btnSm} onClick={() => abrirFicha(i.id)}>Ver</button>
              {i.estado === 'activa' ? (
                <button style={btnSm} onClick={() => cambiarEstado(i.id, 'suspendida')}>Suspender</button>
              ) : (
                <button style={btnSm} onClick={() => cambiarEstado(i.id, 'activa')}>Reactivar</button>
              )}
            </div>
          );
        })}
      </section>

      {ficha ? (
        <section style={{ ...card, border: `1.5px solid ${ADMIN.borde}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h2 style={{ ...h2, margin: 0, flex: 1 }}>{ficha.institucion.nombre}</h2>
            <button style={btnSm} onClick={() => setFicha(null)}>Cerrar</button>
          </div>

          {/* Colegios */}
          <h3 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.oscuro, margin: '10px 0 6px' }}>Colegios</h3>
          {ficha.colegios.length === 0 ? <p style={sub}>Sin colegios todavía.</p> : ficha.colegios.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: `1px solid ${ADMIN.bordeCalido}` }}>
              <span style={{ flex: 1, fontFamily: QUICK, fontSize: 14, color: ADMIN.ink }}>
                {c.nombre}<span style={{ color: ADMIN.tinta2 }}>{c.provincia ? ` · ${c.provincia}` : ''}</span>
              </span>
              <button style={btnSm} onClick={() => quitarColegio(c.id)}>Quitar</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <select value={colegioSel} onChange={(e) => setColegioSel(e.target.value)} style={{ ...inputStyle, maxWidth: 280, cursor: 'pointer' }}>
              <option value="">Sumar un colegio sin institución…</option>
              {sinInstitucion.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <button style={btnSm} onClick={asignarColegio} disabled={!colegioSel}>Asignar</button>
          </div>

          {/* Admins */}
          <h3 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.oscuro, margin: '18px 0 6px' }}>
            Administradores
          </h3>
          {ficha.admins.length === 0 ? <p style={sub}>Sin administradores todavía.</p> : ficha.admins.map((a) => (
            <div key={a.perfil_id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: `1px solid ${ADMIN.bordeCalido}` }}>
              <span style={{ flex: 1, fontFamily: QUICK, fontSize: 14, color: ADMIN.ink }}>
                {a.nombre}<span style={{ color: ADMIN.tinta2 }}>{a.email ? ` · ${a.email}` : ''}</span>
              </span>
              <button
                style={btnSm}
                onClick={async () => {
                  const r = await llamarAdmin('admin-instituciones', 'admin_estado', { perfil_id: a.perfil_id, activo: !a.activo });
                  if (!r.ok) { toast(copyError(r.data.error)); return; }
                  await abrirFicha(ficha.institucion.id);
                }}
              >{a.activo ? 'Suspender' : 'Reactivar'}</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={labelStyle}>Nombre</label>
              <input value={nuevoAdmin.nombre} onChange={(e) => setNuevoAdmin({ ...nuevoAdmin, nombre: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={labelStyle}>Email</label>
              <input value={nuevoAdmin.email} onChange={(e) => setNuevoAdmin({ ...nuevoAdmin, email: e.target.value })} style={inputStyle} />
            </div>
            <button style={btnSm} onClick={crearAdmin} disabled={busy}>Dar de alta</button>
          </div>
          {credencial ? (
            <div style={{ marginTop: 12, padding: 14, background: ADMIN.burbuja, borderRadius: 12 }}>
              <p style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.oscuro, margin: '0 0 6px' }}>
                Pasale esto UNA sola vez (no se vuelve a mostrar):
              </p>
              <p style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.ink, margin: 0, wordBreak: 'break-all' }}>
                {credencial.email} · contraseña temporal <strong>{credencial.password}</strong>
                {credencial.link ? <><br />Link de invitación: {credencial.link}</> : null}
              </p>
            </div>
          ) : null}

          {/* Pools */}
          <h3 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.oscuro, margin: '18px 0 6px' }}>
            Licencias de la institución
          </h3>
          {ficha.pools.length === 0 ? (
            <p style={sub}>Sin licencias. Se crean desde la pantalla de Licencias.</p>
          ) : ficha.pools.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: `1px solid ${ADMIN.bordeCalido}`, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 180, fontFamily: QUICK, fontSize: 14, color: ADMIN.ink }}>
                {p.plan} · {p.estado}
              </span>
              <span style={{ fontFamily: QUICK, fontSize: 12.5, color: ADMIN.tinta2 }}>{copyCupos(p)}</span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
