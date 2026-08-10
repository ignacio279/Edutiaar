'use client';
// Administradores (Dashboard admin v3, WP9): quiénes entran al panel y con qué
// nivel. TODO pasa por admin-plataforma, que exige nivel SUPER incluso para
// listar — acá el gate de UI solo evita mostrar una pantalla que el server va a
// rechazar igual (403 requiere_super).
// El admin NO tiene fila en `perfil` (ADR-009): es auth.users + plataforma_admin.
// El alta devuelve link de invitación + contraseña temporal UNA sola vez
// (mismo patrón que Maestras): si se cierra el modal, no se vuelven a ver.
// Nadie se toca a sí mismo: la fila propia va deshabilitada (el server además
// devuelve no_a_vos_mismo).
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { llamarAdmin, ERRS_ADMIN } from '@/lib/admin/api';
import { ADMIN, NIVEL_ADMIN } from '@/lib/admin/tema';
import { useAdmin } from '../admin-context';
import Pill from '@/components/admin/Pill';
import { toast } from '@/lib/toast';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type Admin = {
  perfil_id: string;
  nombre: string;
  email: string | null;
  nivel: string;
  activo: boolean;
  created_at?: string;
};
type Invitacion = { nombre: string; link: string | null; password_temporal?: string; warning?: string };

const ERRS: Record<string, string> = {
  ...ERRS_ADMIN,
  email_invalido: 'Ese email no parece válido.',
  nombre_vacio: 'Poné el nombre del admin.',
  nivel_invalido: 'Elegí un nivel válido.',
  email_en_uso: 'Ya hay una cuenta con ese email.',
  no_existe: 'Ese admin ya no existe. Recargá la lista.',
  no_a_vos_mismo: 'No podés cambiarte a vos mismo.',
  link_no_generado: 'No se pudo generar el link. Pasale la contraseña temporal.',
};
const msgErr = (j: { error?: string }) => ERRS[j?.error ?? ''] || j?.error || 'No se pudo.';

const PILL_ACTIVO: readonly [string, string, string] = [ADMIN.okFondo, ADMIN.okTexto, 'Activo'];
const PILL_INACTIVO: readonly [string, string, string] = [ADMIN.neutroFondo, ADMIN.neutroTexto, 'Inactivo'];

const NO_A_VOS = 'Sos vos: no podés cambiarte a vos mismo el nivel ni desactivarte.';

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('¡Copiado!');
  } catch {
    toast('No se pudo copiar. Seleccionalo a mano.');
  }
}

const supabase = createClient();

export default function ConfigPage() {
  const me = useAdmin();
  const esSuper = me?.nivel === 'super';
  const [yoId, setYoId] = useState('');
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [invitacion, setInvitacion] = useState<Invitacion | null>(null);
  const [busyId, setBusyId] = useState('');

  async function cargar() {
    const r = await llamarAdmin<{ admins: Admin[] }>('admin-plataforma', 'listar_admins');
    if (!r.ok) setError(msgErr(r.data));
    else { setError(''); setAdmins(r.data.admins ?? []); }
    setLoaded(true);
  }

  useEffect(() => {
    if (!esSuper) return;
    supabase.auth.getUser().then(({ data }) => setYoId(data.user?.id ?? ''));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cargar() es async: los setState caen después del await (patrón de Maestras/Auditoría).
    cargar();
  }, [esSuper]);

  async function cambiarNivel(a: Admin, nivel: string) {
    if (busyId || nivel === a.nivel) return;
    setBusyId(a.perfil_id);
    const r = await llamarAdmin('admin-plataforma', 'cambiar_nivel', { perfil_id: a.perfil_id, nivel });
    setBusyId('');
    if (!r.ok) { toast(msgErr(r.data)); return; }
    toast(nivel === 'super' ? 'Ahora es super admin.' : 'Ahora es operativo.');
    cargar();
  }

  async function cambiarEstado(a: Admin) {
    if (busyId) return;
    const accion = a.activo ? 'desactivar_admin' : 'reactivar_admin';
    setBusyId(a.perfil_id);
    const r = await llamarAdmin('admin-plataforma', accion, { perfil_id: a.perfil_id });
    setBusyId('');
    if (!r.ok) { toast(msgErr(r.data)); return; }
    toast(a.activo ? 'Admin desactivado.' : 'Admin reactivado.');
    cargar();
  }

  // Gate de UI: el server exige super hasta para listar (requiere_super).
  if (!esSuper) {
    return (
      <div>
        <h1 style={{ ...tituloPagina, marginBottom: 18 }}>Administradores</h1>
        <div style={{ textAlign: 'center', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '48px 24px', maxWidth: 560 }}>
          <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>
            Solo el super-admin gestiona administradores
          </div>
          <div style={{ fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4, lineHeight: 1.5 }}>
            Tu cuenta es de nivel operativo: podés operar la plataforma, pero dar de alta, cambiar de nivel o
            desactivar admins es tarea del super-admin. Si necesitás un cambio acá, pedíselo.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={tituloPagina}>Administradores</h1>
      <p style={{ fontFamily: NUNITO, fontSize: 15.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 18px' }}>
        Quiénes entran al panel. El super-admin puede todo; el operativo no gestiona admins ni borra nada.
      </p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14, maxWidth: 760 }}>
        <button onClick={() => setNuevo(true)} className="ed-primary" style={btnPrimario}>+ Nuevo admin</button>
      </div>

      {error && (
        <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '12px 16px', color: ADMIN.warnTexto, fontFamily: QUICK, fontWeight: 700, fontSize: 14, marginBottom: 14, maxWidth: 760 }}>
          {error}
        </div>
      )}

      {!loaded ? (
        <p style={{ color: ADMIN.tinta2, fontWeight: 700, fontFamily: QUICK }}>Cargando…</p>
      ) : admins.length === 0 ? (
        <div style={{ textAlign: 'center', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '48px 24px', maxWidth: 760 }}>
          <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: ADMIN.ink }}>No hay administradores cargados todavía</div>
          <div style={{ fontSize: 14.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4 }}>Creá el primero con «+ Nuevo admin».</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
          {admins.map((a) => {
            const soyYo = a.perfil_id === yoId;
            const busy = busyId === a.perfil_id;
            return (
              <div key={a.perfil_id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 20, padding: '16px 20px', opacity: soyYo ? 0.75 : 1 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16, color: ADMIN.ink }}>
                    {a.nombre}
                    {soyYo && (
                      <span style={{ background: ADMIN.burbuja, border: `1px solid ${ADMIN.borde}`, color: ADMIN.oscuro, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 800, marginLeft: 8 }}>
                        Sos vos
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, fontWeight: 600 }}>
                    {a.email ?? 'sin email'}
                  </div>
                </div>
                <Pill tupla={NIVEL_ADMIN[a.nivel]} />
                <Pill tupla={a.activo ? PILL_ACTIVO : PILL_INACTIVO} />
                <select
                  value={a.nivel}
                  disabled={soyYo || busy}
                  title={soyYo ? NO_A_VOS : 'Nivel del admin'}
                  aria-label="Nivel del admin"
                  onChange={(e) => cambiarNivel(a, e.target.value)}
                  style={{ ...campo, width: 'auto', padding: '9px 12px', borderRadius: 11, fontWeight: 700, fontSize: 13, cursor: soyYo ? 'not-allowed' : 'pointer', opacity: soyYo ? 0.6 : 1 }}
                >
                  <option value="super">Super admin</option>
                  <option value="operativo">Operativo</option>
                </select>
                {!soyYo && (
                  <button
                    onClick={() => cambiarEstado(a)}
                    disabled={busy}
                    className="ad-ghost-warm"
                    style={btnGhostSm}
                  >
                    {busy ? 'Un momento…' : a.activo ? 'Desactivar' : 'Reactivar'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {nuevo && (
        <ModalNuevo
          onCerrar={() => setNuevo(false)}
          onCreado={(inv) => { setNuevo(false); setInvitacion(inv); cargar(); }}
        />
      )}
      {invitacion && <ModalInvitacion inv={invitacion} onCerrar={() => setInvitacion(null)} />}
    </div>
  );
}

// ---------- Alta ----------
function ModalNuevo({ onCerrar, onCreado }: { onCerrar: () => void; onCreado: (inv: Invitacion) => void }) {
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [nivel, setNivel] = useState('operativo');
  const [busy, setBusy] = useState(false);

  async function crear() {
    if (busy) return;
    // Chequeo espejo del server (validar.ts): el server manda igual.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast(ERRS.email_invalido); return; }
    if (!nombre.trim()) { toast(ERRS.nombre_vacio); return; }
    setBusy(true);
    const r = await llamarAdmin<{
      admin: { nombre: string };
      invitacion: { link: string | null; password_temporal: string; warning?: string };
    }>('admin-plataforma', 'crear_admin', { email: email.trim(), nombre: nombre.trim(), nivel });
    setBusy(false);
    if (!r.ok) { toast(msgErr(r.data)); return; }
    onCreado({ nombre: r.data.admin?.nombre ?? nombre.trim(), ...r.data.invitacion });
  }

  return (
    <Overlay onCerrar={onCerrar}>
      <h3 style={{ ...tituloModal, marginBottom: 18 }}>Nuevo admin</h3>
      <label style={labelStyle}>Nombre</label>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...campo, marginBottom: 12 }} placeholder="Jorge Pérez" />
      <label style={labelStyle}>Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...campo, marginBottom: 12 }} placeholder="jorge@edutia.ar" />
      <label style={labelStyle}>Nivel</label>
      <select value={nivel} onChange={(e) => setNivel(e.target.value)} style={{ ...campo, marginBottom: 12, fontWeight: 700, cursor: 'pointer' }}>
        <option value="operativo">Operativo</option>
        <option value="super">Super admin</option>
      </select>
      <div style={{ background: ADMIN.burbuja, border: `1.5px solid ${ADMIN.borde}`, borderRadius: 12, padding: '12px 14px', fontFamily: NUNITO, fontSize: 12.5, fontWeight: 600, color: ADMIN.oscuro, marginBottom: 20, lineHeight: 1.45 }}>
        El operativo ve todo pero <b>no puede</b>: archivar colegios, gestionar admins ni borrar maestras.
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCerrar} className="ad-ghost-warm" style={btnGhost}>Cancelar</button>
        <button onClick={crear} className="ed-primary" style={btnPrimario} disabled={busy}>
          {busy ? 'Creando…' : 'Crear e invitar'}
        </button>
      </div>
    </Overlay>
  );
}

// ---------- Éxito del alta: link + password, una sola vez ----------
function ModalInvitacion({ inv, onCerrar }: { inv: Invitacion; onCerrar: () => void }) {
  return (
    <Overlay onCerrar={onCerrar}>
      <h3 style={tituloModal}>Admin invitado</h3>
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
const tituloPagina: React.CSSProperties = { fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 4px' };
const tituloModal: React.CSSProperties = { fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: ADMIN.ink, margin: '0 0 4px' };
const textoModal: React.CSSProperties = { fontFamily: NUNITO, fontSize: 13.5, fontWeight: 600, color: ADMIN.tinta2, margin: '0 0 16px', lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 6 };
const campo: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12, fontFamily: NUNITO, fontSize: 14, color: ADMIN.ink, background: ADMIN.suave, outline: 'none' };
const btnPrimario: React.CSSProperties = { background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 999, padding: '11px 22px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: `0 6px 16px ${ADMIN.sombraCTA}` };
const btnGhost: React.CSSProperties = { background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 999, padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: ADMIN.tinta2, cursor: 'pointer' };
const btnGhostSm: React.CSSProperties = { background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, borderRadius: 999, padding: '9px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.tinta2, cursor: 'pointer' };
const avisoSecretos: React.CSSProperties = { background: ADMIN.warnFondo, border: `1.5px solid ${ADMIN.sol}`, borderRadius: 12, padding: '12px 14px', fontSize: 13.5, fontWeight: 800, color: ADMIN.warnTexto, marginBottom: 16 };
