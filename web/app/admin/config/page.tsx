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

const PILL_ACTIVO: readonly [string, string, string] = ['#E6F0DC', '#4E7A3A', 'Activo'];
const PILL_INACTIVO: readonly [string, string, string] = ['#E8C9C2', '#8A3D30', 'Inactivo'];

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
      <div style={{ maxWidth: 620 }}>
        <h1 style={tituloPagina}>Administradores</h1>
        <div style={{ background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 22, padding: '22px 24px' }}>
          <p style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16, color: ADMIN.oscuro, margin: '0 0 6px' }}>
            Solo el super-admin gestiona administradores
          </p>
          <p style={{ fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.tinta2, margin: 0, lineHeight: 1.5 }}>
            Tu cuenta es de nivel operativo: podés operar la plataforma, pero dar de alta, cambiar de nivel o
            desactivar admins es tarea del super-admin. Si necesitás un cambio acá, pedíselo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={tituloPagina}>Administradores</h1>
      <p style={{ fontFamily: NUNITO, fontSize: 15, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 20px' }}>
        Quiénes entran al panel. El super-admin puede todo; el operativo no gestiona admins ni borra nada.
      </p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
        <button onClick={() => setNuevo(true)} className="ed-primary" style={btnPrimario}>+ Nuevo admin</button>
      </div>

      {error && (
        <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 16, padding: '12px 16px', color: ADMIN.warnTexto, fontFamily: QUICK, fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {!loaded ? (
        <p style={{ color: ADMIN.tinta2, fontWeight: 700, fontFamily: QUICK }}>Cargando…</p>
      ) : admins.length === 0 ? (
        <div style={{ background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 22, padding: '22px 24px', color: ADMIN.medio, fontWeight: 700, fontFamily: QUICK }}>
          No hay administradores cargados todavía.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {admins.map((a) => {
            const soyYo = a.perfil_id === yoId;
            const busy = busyId === a.perfil_id;
            return (
              <div key={a.perfil_id} style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: '16px 20px', boxShadow: `0 3px 10px ${ADMIN.sombraCalida}`, display: 'flex', flexDirection: 'column', gap: 10, opacity: a.activo ? 1 : 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.ink }}>{a.nombre}</span>
                  <Pill tupla={NIVEL_ADMIN[a.nivel]} />
                  <Pill tupla={a.activo ? PILL_ACTIVO : PILL_INACTIVO} />
                  {soyYo && (
                    <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, color: ADMIN.medio, background: ADMIN.claro, borderRadius: 999, padding: '4px 12px' }}>
                      Sos vos
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600 }}>
                  {a.email ?? 'sin email'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: QUICK, fontWeight: 700, fontSize: 13, color: ADMIN.tinta2 }}
                    title={soyYo ? NO_A_VOS : undefined}
                  >
                    Nivel
                    <select
                      value={a.nivel}
                      disabled={soyYo || busy}
                      title={soyYo ? NO_A_VOS : undefined}
                      onChange={(e) => cambiarNivel(a, e.target.value)}
                      style={{ ...campo, width: 'auto', padding: '8px 11px', fontSize: 14, cursor: soyYo ? 'not-allowed' : 'pointer', opacity: soyYo ? 0.6 : 1 }}
                    >
                      <option value="super">Super admin</option>
                      <option value="operativo">Operativo</option>
                    </select>
                  </label>
                  <button
                    onClick={() => cambiarEstado(a)}
                    disabled={soyYo || busy}
                    title={soyYo ? NO_A_VOS : undefined}
                    style={{
                      ...btnGhostSm,
                      cursor: soyYo ? 'not-allowed' : 'pointer',
                      opacity: soyYo ? 0.6 : 1,
                      color: a.activo ? ADMIN.danger : ADMIN.okTexto,
                      borderColor: a.activo ? ADMIN.dangerBorde : ADMIN.okBorde,
                    }}
                  >
                    {busy ? 'Un momento…' : a.activo ? 'Desactivar' : 'Reactivar'}
                  </button>
                </div>
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
      <h3 style={tituloModal}>Nuevo admin</h3>
      <p style={textoModal}>
        Se crea la cuenta del panel (no es una maestra: no tiene aulas ni alumnos) y te damos un link de
        invitación + una contraseña temporal para pasarle.
      </p>
      <label style={labelStyle}>Nombre</label>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...campo, marginBottom: 12 }} placeholder="Jorge Pérez" />
      <label style={labelStyle}>Email</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...campo, marginBottom: 12 }} placeholder="jorge@edutia.ar" />
      <label style={labelStyle}>Nivel</label>
      <select value={nivel} onChange={(e) => setNivel(e.target.value)} style={{ ...campo, marginBottom: 6 }}>
        <option value="operativo">Operativo — opera la plataforma</option>
        <option value="super">Super admin — puede todo</option>
      </select>
      <p style={{ ...textoModal, fontSize: 13, marginBottom: 14 }}>
        El operativo no gestiona admins, no archiva colegios ni borra cuentas.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onCerrar} style={btnGhost}>Cancelar</button>
        <button onClick={crear} className="ed-primary" style={btnPrimario} disabled={busy}>
          {busy ? 'Creando…' : 'Crear admin'}
        </button>
      </div>
    </Overlay>
  );
}

// ---------- Éxito del alta: link + password, una sola vez ----------
function ModalInvitacion({ inv, onCerrar }: { inv: Invitacion; onCerrar: () => void }) {
  return (
    <Overlay onCerrar={onCerrar}>
      <h3 style={tituloModal}>¡Cuenta creada para {inv.nombre}!</h3>
      <div style={{ background: ADMIN.warnFondo, border: `2px solid ${ADMIN.warnBorde}`, borderRadius: 14, padding: '12px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.warnTexto, marginBottom: 14 }}>
        Guardá estos datos ahora: no se vuelven a mostrar.
      </div>
      {inv.link ? (
        <CampoCopiable label="Link de invitación (elige su contraseña)" valor={inv.link} />
      ) : (
        <p style={textoModal}>No se pudo generar el link de invitación. Pasale la contraseña temporal.</p>
      )}
      {inv.password_temporal && <CampoCopiable label="Contraseña temporal" valor={inv.password_temporal} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onCerrar} className="ed-primary" style={btnPrimario}>Listo, ya los guardé</button>
      </div>
    </Overlay>
  );
}

function CampoCopiable({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input readOnly value={valor} onFocus={(e) => e.currentTarget.select()} style={{ ...campo, flex: 1, minWidth: 0, fontSize: 13.5, background: ADMIN.burbuja }} />
        <button onClick={() => copiar(valor)} style={btnGhostSm}>Copiar</button>
      </div>
    </div>
  );
}

function Overlay({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,51,42,.45)', display: 'grid', placeItems: 'center', zIndex: 60, animation: 'edFade .2s ease', padding: 18 }} onClick={onCerrar}>
      <div style={{ width: '100%', maxWidth: 480, background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 24, padding: '26px 28px', boxShadow: '0 18px 44px rgba(58,51,42,.3)' }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ---------- estilos ----------
const tituloPagina: React.CSSProperties = { fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: '0 0 4px' };
const tituloModal: React.CSSProperties = { fontFamily: BALOO, fontWeight: 800, fontSize: 21, color: ADMIN.ink, margin: '0 0 8px' };
const textoModal: React.CSSProperties = { fontFamily: NUNITO, fontSize: 14.5, color: ADMIN.tinta2, margin: '0 0 14px', lineHeight: 1.5 };
const labelStyle: React.CSSProperties = { display: 'block', fontFamily: QUICK, fontSize: 13, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 5 };
const campo: React.CSSProperties = { width: '100%', padding: '11px 13px', border: `2px solid ${ADMIN.borde}`, borderRadius: 12, fontFamily: NUNITO, fontSize: 15, color: ADMIN.ink, background: ADMIN.carta, outline: 'none' };
const btnPrimario: React.CSSProperties = { background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 12, padding: '11px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 15, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: 'none', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 12, padding: '10px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: ADMIN.tinta2, cursor: 'pointer' };
const btnGhostSm: React.CSSProperties = { background: 'none', border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 10, padding: '7px 13px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: ADMIN.tinta2, cursor: 'pointer' };
