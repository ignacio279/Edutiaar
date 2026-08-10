'use client';
// Maestras (Dashboard admin v3, WP2): roster global de cuentas de maestras.
// Lectura y TODA mutación vía Edge Function admin-maestras (guard
// plataforma_admin server-side); los colegios del alta se leen de la vista
// pública escuela_publica con el client anon (cero dependencia de WP1).
// El link de invitación y la password temporal se muestran UNA sola vez.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN, ESTADO_MAESTRA } from '@/lib/admin/tema';
import { fechaRelativa } from '@/lib/admin/metricas';
import { useAdmin } from '../admin-context';
import Pill from '@/components/admin/Pill';
import Confirmar from '@/components/admin/Confirmar';
import { toast } from '@/lib/toast';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type Maestra = {
  id: string;
  nombre: string;
  email: string | null;
  ultimo_acceso: string | null; // last_sign_in_at real de Auth
  escuela_id: string | null;
  escuela_nombre: string | null;
  estado: string;
  trial_inicio: string | null;
  trial_fin: string | null;
  aulas: { id: string; nombre: string }[];
  alumnos: number;
};
type Colegio = { id: string; nombre: string };
type Invitacion = { nombre: string; link: string | null; password_temporal?: string; warning?: string };

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  email_invalido: 'Ese email no parece válido.',
  nombre_vacio: 'Poné el nombre de la maestra.',
  escuela_requerida: 'Elegí un colegio.',
  escuela_inexistente: 'Ese colegio no existe.',
  email_en_uso: 'Ya hay una cuenta con ese email.',
  no_existe: 'Esa maestra no existe.',
  tiene_alumnos: 'Tiene alumnos a cargo: no se puede. Resolvé eso primero.',
  link_no_generado: 'No se pudo generar el link. Probá de nuevo.',
  sin_email: 'Esa cuenta no tiene email.',
};
const msgErr = (j: { error?: string }) => ERRS[j?.error ?? ''] || j?.error || 'No se pudo.';

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('¡Copiado!');
  } catch {
    toast('No se pudo copiar. Seleccionalo a mano.');
  }
}

const supabase = createClient();

export default function MaestrasPage() {
  const router = useRouter();
  const me = useAdmin();
  const [maestras, setMaestras] = useState<Maestra[]>([]);
  const [colegios, setColegios] = useState<Colegio[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [nueva, setNueva] = useState(false);
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null);
  const [resetDe, setResetDe] = useState<{ nombre: string; link: string } | null>(null);
  const [aBorrar, setABorrar] = useState<Maestra | null>(null);
  const [busyId, setBusyId] = useState('');

  async function cargar() {
    const r = await llamarAdmin<{ maestras: Maestra[] }>('admin-maestras', 'listar');
    if (!r.ok) toast(msgErr(r.data));
    else setMaestras(r.data.maestras ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    cargar();
    supabase.from('escuela_publica').select('id, nombre').order('nombre')
      .then(({ data }) => setColegios((data as Colegio[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return maestras;
    return maestras.filter((m) =>
      m.nombre.toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q));
  }, [maestras, busqueda]);

  async function accionFila(m: Maestra, accion: 'suspender' | 'reactivar' | 'reset_password') {
    if (busyId) return;
    setBusyId(m.id);
    const r = await llamarAdmin<{ link?: string }>('admin-maestras', accion, { perfil_id: m.id });
    setBusyId('');
    if (!r.ok) { toast(msgErr(r.data)); return; }
    if (accion === 'reset_password') {
      setResetDe({ nombre: m.nombre, link: r.data.link ?? '' });
    } else {
      toast(accion === 'suspender' ? 'Cuenta suspendida.' : 'Cuenta reactivada.');
      cargar();
    }
  }

  async function borrar() {
    if (!aBorrar || busyId) return;
    setBusyId(aBorrar.id);
    const r = await llamarAdmin('admin-maestras', 'borrar', { perfil_id: aBorrar.id });
    setBusyId('');
    if (!r.ok) { toast(msgErr(r.data)); return; }
    toast('Cuenta borrada.');
    setABorrar(null);
    cargar();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: 0 }}>Maestras</h1>
        <button onClick={() => setNueva(true)} className="ed-primary" style={{ ...btnPrimario, fontSize: 15, padding: '12px 24px' }}>+ Nueva maestra</button>
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o email..."
        style={{ ...campo, maxWidth: 340, padding: '11px 16px', background: ADMIN.carta, marginBottom: 16 }}
      />

      {!loaded ? (
        <p style={{ color: ADMIN.tinta2, fontWeight: 700, fontFamily: QUICK }}>Cargando…</p>
      ) : visibles.length === 0 ? (
        <div style={{ textAlign: 'center', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '48px 24px' }}>
          <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>
            {maestras.length === 0 ? 'Todavía no hay maestras' : 'Ninguna maestra coincide con la búsqueda'}
          </div>
          <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>
            {maestras.length === 0 ? 'Creá la primera con «+ Nueva maestra».' : 'Probá con otro nombre u otro email.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visibles.map((m) => (
            <FilaMaestra
              key={m.id}
              m={m}
              conColegio
              busy={busyId === m.id}
              esSuper={me?.nivel === 'super'}
              onReset={() => accionFila(m, 'reset_password')}
              onEstado={() => accionFila(m, m.estado === 'suspendido' ? 'reactivar' : 'suspender')}
              onVerComo={() => router.push(`/admin/ver-como/${m.id}`)}
              onBorrar={() => setABorrar(m)}
            />
          ))}
        </div>
      )}

      {nueva && (
        <ModalNueva
          colegios={colegios}
          onCerrar={() => setNueva(false)}
          onCreada={(inv) => { setNueva(false); setInvitacion(inv); cargar(); }}
        />
      )}
      {invitacion && <ModalInvitacion inv={invitacion} onCerrar={() => setInvitacion(null)} />}
      {resetDe && <ModalReset nombre={resetDe.nombre} link={resetDe.link} onCerrar={() => setResetDe(null)} />}
      {aBorrar && (
        <Confirmar
          titulo="Borrar cuenta de maestra"
          descripcion={`Se borra la cuenta de ${aBorrar.nombre} para siempre (perfil, acceso y aulas vacías). Solo se puede si no tiene alumnos a cargo.`}
          nombre={aBorrar.nombre}
          verbo="Borrar"
          busy={busyId === aBorrar.id}
          onConfirmar={borrar}
          onCerrar={() => setABorrar(null)}
        />
      )}
    </div>
  );
}

// ---------- Fila del roster ----------
// (La ficha del colegio repite esta UI en su propia página: los page.tsx de
// Next no pueden exportar componentes con nombre, y los WP no comparten archivos.)
function FilaMaestra({ m, conColegio, busy, esSuper, onReset, onEstado, onVerComo, onBorrar }: {
  m: Maestra;
  conColegio: boolean;
  busy: boolean;
  esSuper: boolean;
  onReset: () => void;
  onEstado: () => void;
  onVerComo: () => void;
  onBorrar: () => void;
}) {
  const suspendida = m.estado === 'suspendido';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 20, padding: '16px 20px' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16.5, color: ADMIN.ink }}>{m.nombre}</span>
          {m.trial_fin && (
            <span style={{ background: ADMIN.warnFondo, border: `1px solid ${ADMIN.warnBorde}`, color: ADMIN.warnTexto, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 800 }}>
              Prueba hasta {m.trial_fin}
            </span>
          )}
        </div>
        <div style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, fontWeight: 600 }}>
          {m.email ?? 'sin email'}
          {conColegio && <> · {m.escuela_nombre ?? 'sin colegio'}</>}
          {' · '}{m.aulas.length} {m.aulas.length === 1 ? 'aula' : 'aulas'} · {m.alumnos} {m.alumnos === 1 ? 'alumno' : 'alumnos'}
          {' · '}Último acceso: {m.ultimo_acceso ? fechaRelativa(m.ultimo_acceso, new Date()) : 'Nunca entró'}
        </div>
      </div>
      <Pill tupla={ESTADO_MAESTRA[m.estado]} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onReset} disabled={busy} className="ad-ghost" style={btnGhostSm}>Reset contraseña</button>
        <button onClick={onEstado} disabled={busy} className="ad-ghost-warm" style={{ ...btnGhostSm, color: ADMIN.tinta2, borderColor: ADMIN.bordeCalido }}>
          {busy ? 'Un momento…' : suspendida ? 'Reactivar' : 'Suspender'}
        </button>
        <button onClick={onVerComo} disabled={busy} className="ad-ghost" style={btnGhostSm}>Ver como</button>
        {esSuper && (
          <button onClick={onBorrar} disabled={busy} className="ad-ghost-danger" style={{ ...btnGhostSm, color: ADMIN.danger, borderColor: ADMIN.dangerBorde }}>
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Alta ----------
function ModalNueva({ colegios, colegioFijo, onCerrar, onCreada }: {
  colegios: Colegio[];
  colegioFijo?: string; // ficha de colegio: alta directa, sin select
  onCerrar: () => void;
  onCreada: (inv: Invitacion) => void;
}) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [escuelaId, setEscuelaId] = useState(colegioFijo ?? '');
  const [busy, setBusy] = useState(false);

  async function crear() {
    if (busy) return;
    const eid = colegioFijo ?? escuelaId;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast(ERRS.email_invalido); return; }
    if (!nombre.trim()) { toast(ERRS.nombre_vacio); return; }
    if (!eid) { toast(ERRS.escuela_requerida); return; }
    setBusy(true);
    const r = await llamarAdmin<{ maestra: { nombre: string }; invitacion: { link: string | null; password_temporal: string; warning?: string } }>(
      'admin-maestras', 'crear_maestra', { email: email.trim(), nombre: nombre.trim(), escuela_id: eid });
    setBusy(false);
    if (!r.ok) { toast(msgErr(r.data)); return; }
    onCreada({ nombre: r.data.maestra?.nombre ?? nombre.trim(), ...r.data.invitacion });
  }

  return (
    <Overlay onCerrar={onCerrar}>
      <h3 style={tituloModal}>Nueva maestra</h3>
      <p style={textoModal}>Se crea la cuenta con link de invitación y contraseña temporal para pasarle.</p>
      <label style={labelStyle}>Nombre</label>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...campo, marginBottom: 12 }} placeholder="Marcela Duarte" />
      <label style={labelStyle}>Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...campo, marginBottom: 12 }} placeholder="marcela@escuela.edu.ar" />
      {!colegioFijo && (
        <>
          <label style={labelStyle}>Colegio</label>
          <select value={escuelaId} onChange={(e) => setEscuelaId(e.target.value)} style={{ ...campo, marginBottom: 12, fontWeight: 700, cursor: 'pointer' }}>
            <option value="">Elegí un colegio…</option>
            {colegios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onCerrar} className="ad-ghost-warm" style={btnGhost}>Cancelar</button>
        <button onClick={crear} className="ed-primary" style={btnPrimario} disabled={busy}>
          {busy ? 'Creando…' : 'Crear cuenta'}
        </button>
      </div>
    </Overlay>
  );
}

// ---------- Éxito del alta: link + password, una sola vez ----------
function ModalInvitacion({ inv, onCerrar }: { inv: Invitacion; onCerrar: () => void }) {
  return (
    <Overlay onCerrar={onCerrar}>
      <h3 style={tituloModal}>Cuenta creada</h3>
      <p style={textoModal}>Pasale estos datos a {inv.nombre} para que entre por primera vez.</p>
      <div style={avisoSecretos}>Guardá estos datos ahora: no se vuelven a mostrar.</div>
      {inv.link ? (
        <CampoCopiable label="Link de invitación" valor={inv.link} />
      ) : (
        <p style={textoModal}>No se pudo generar el link de invitación. Pasale la contraseña temporal.</p>
      )}
      {inv.password_temporal && <CampoCopiable label="Contraseña temporal" valor={inv.password_temporal} destacado />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onCerrar} className="ed-primary" style={{ ...btnPrimario, padding: '11px 26px', boxShadow: 'none' }}>Listo, los guardé</button>
      </div>
    </Overlay>
  );
}

// ---------- Reset de contraseña: link nuevo ----------
function ModalReset({ nombre, link, onCerrar }: { nombre: string; link: string; onCerrar: () => void }) {
  return (
    <Overlay onCerrar={onCerrar}>
      <h3 style={tituloModal}>Contraseña reseteada</h3>
      <p style={textoModal}>El link anterior de {nombre} quedó inválido.</p>
      <div style={avisoSecretos}>Guardá estos datos ahora: no se vuelven a mostrar.</div>
      <CampoCopiable label="Link de recuperación" valor={link} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onCerrar} className="ed-primary" style={{ ...btnPrimario, padding: '11px 26px', boxShadow: 'none' }}>Listo, los guardé</button>
      </div>
    </Overlay>
  );
}

function CampoCopiable({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          readOnly
          value={valor}
          onFocus={(e) => e.currentTarget.select()}
          style={{ ...campo, flex: 1, minWidth: 0, padding: '11px 12px', fontSize: destacado ? 14 : 13, fontWeight: destacado ? 800 : undefined, letterSpacing: destacado ? 1 : undefined }}
        />
        <button
          onClick={() => { copiar(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1400); }}
          className="ed-primary"
          style={{ background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 12, padding: '0 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

function Overlay({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: ADMIN.velo, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 22 }} onClick={onCerrar}>
      <div style={{ width: '100%', maxWidth: 440, background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 24, padding: 28, boxShadow: '0 20px 50px rgba(58,51,42,.25)', animation: 'adPop .25s ease' }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ---------- estilos (del mock Admin.dc.html) ----------
const tituloModal: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: ADMIN.ink, margin: '0 0 4px' };
const textoModal: React.CSSProperties = { fontFamily: NUNITO, fontSize: 13.5, fontWeight: 600, color: ADMIN.tinta2, margin: '0 0 16px', lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 6 };
const campo: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12, fontFamily: NUNITO, fontSize: 14, color: ADMIN.ink, background: ADMIN.suave, outline: 'none' };
const btnPrimario: React.CSSProperties = { background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '11px 24px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: `0 6px 16px ${ADMIN.sombraCTA}` };
const btnGhost: React.CSSProperties = { background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 999, padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: ADMIN.tinta2, cursor: 'pointer' };
const btnGhostSm: React.CSSProperties = { background: ADMIN.carta, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 999, padding: '8px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.oscuro, cursor: 'pointer' };
const avisoSecretos: React.CSSProperties = { background: ADMIN.warnFondo, border: `1.5px solid ${ADMIN.sol}`, borderRadius: 12, padding: '12px 14px', fontSize: 13.5, fontWeight: 800, color: ADMIN.warnTexto, marginBottom: 16 };
