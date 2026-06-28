'use client';
// Mi clase (Fase 2): la docente gestiona sus AULAS y ALUMNOS. Lee aulas+alumnos por
// cliente (RLS: aula.docente_id / perfil.docente_id); TODA escritura pasa por la Edge
// Function gestion-alumnos con el JWT de la docente (service role server-side, Rule 1/5).
// El secreto del aula no se puede re-mostrar (hasheado): se ve al crear/cambiar. El
// código sí queda visible. PIN: 4 dígitos que pone la seño.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { animal, sol, uiIcon } from '@/lib/art';
import { toast } from '@/lib/toast';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';
const solHappy = `${sol('happy')} center/contain no-repeat`;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const AVATARES = ['fox', 'owl', 'turtle', 'cat', 'sheep'];

type Aula = { id: string; nombre: string; grado: number | null; codigo: string };
type Alumno = { id: string; nombre: string; avatar: string; grado: number; aula_id: string | null };

const ERRS: Record<string, string> = {
  codigo_duplicado: 'Ese código de aula ya existe. Probá otro.',
  aula_con_alumnos: 'El aula tiene alumnos. Movelos o borralos primero.',
  no_es_tuyo: 'Eso no es tuyo.',
  no_docente: 'Necesitás entrar como docente.',
  sin_escuela: 'Tu cuenta no tiene escuela asignada.',
};
const msgErr = (j: { error?: string }) => ERRS[j?.error ?? ''] || j?.error || 'No se pudo.';

const supabase = createClient();

async function gestion(accion: string, payload: Record<string, unknown>): Promise<{ ok: boolean; j: { error?: string; [k: string]: unknown } }> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${URL}/functions/v1/gestion-alumnos`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion, ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j };
}

export default function MiClase() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function cargar() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace('/'); return; }
    const { data: perfil } = await supabase.from('perfil').select('nombre,rol').eq('id', user.id).single();
    if ((perfil as { rol?: string } | null)?.rol !== 'docente') { router.replace('/alumno'); return; }
    setNombre((perfil as { nombre?: string } | null)?.nombre || '');
    const [{ data: au }, { data: al }] = await Promise.all([
      supabase.from('aula').select('id,nombre,grado,codigo').eq('docente_id', user.id).order('nombre'),
      supabase.from('perfil').select('id,nombre,avatar,grado,aula_id').eq('rol', 'alumno').eq('docente_id', user.id).order('nombre'),
    ]);
    setAulas((au as Aula[]) || []);
    setAlumnos((al as Alumno[]) || []);
    setLoaded(true);
  }

  useEffect(() => {
    (async () => { await cargar(); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FBF4E6', animation: 'edFade .3s ease' }}>
      <aside style={{ width: 236, flexShrink: 0, background: '#FFFCF5', borderRight: '2px solid #EFE3CE', padding: '26px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px 22px' }}>
          <div style={{ width: 36, height: 36, background: solHappy }} />
          <span style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 22, color: '#3A332A', letterSpacing: '-.5px' }}>EDUTIA</span>
        </div>
        <button onClick={() => router.push('/docente')} className="ed-side" style={sideBtn}>
          <span style={{ width: 22, height: 22, background: `${uiIcon('people')} center/contain no-repeat` }} />Mis alumnos
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', borderRadius: 14, background: '#E3EEF4', color: '#3A332A', fontFamily: QUICK, fontWeight: 700, fontSize: 16 }}>
          <span style={{ width: 22, height: 22, background: `${uiIcon('people')} center/contain no-repeat` }} />Mi clase
        </div>
        <button onClick={() => router.push('/docente/autoria')} className="ed-side" style={sideBtn}>
          <span style={{ width: 22, height: 22, background: `${uiIcon('mapI')} center/contain no-repeat` }} />Subir un plan
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={signOut} className="ed-side" style={sideBtn}>Cerrar sesión</button>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px,3.5vw,40px)', maxWidth: 820 }}>
        <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px,4vw,32px)', color: '#3A332A', margin: '0 0 4px' }}>Mi clase</h1>
        <p style={{ fontSize: 15.5, color: '#7A6F5F', margin: '0 0 22px', fontWeight: 600 }}>
          Seño {nombre}. Acá creás tus aulas y las cuentas de tus alumnos.
        </p>

        {!loaded ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Cargando…</p>
        ) : (
          <>
            <CrearAula onDone={cargar} />
            <CrearAlumno aulas={aulas} onDone={cargar} />

            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: '#7A6F5F', margin: '28px 0 14px' }}>Tus aulas</h2>
            {aulas.length === 0 ? (
              <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Todavía no tenés aulas. Creá una arriba.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {aulas.map((a) => (
                  <AulaCard key={a.id} aula={a} alumnos={alumnos.filter((x) => x.aula_id === a.id)} aulas={aulas} onDone={cargar} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ---------- Crear aula ----------
function CrearAula({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [grado, setGrado] = useState('');
  const [codigo, setCodigo] = useState('');
  const [secreto, setSecreto] = useState('');
  const [busy, setBusy] = useState(false);

  async function crear() {
    if (busy) return;
    if (!nombre.trim() || !codigo.trim() || !secreto.trim()) { toast('Completá nombre, código y secreto.'); return; }
    setBusy(true);
    const { ok, j } = await gestion('crear_aula', { nombre, codigo, secreto, grado: grado ? Number(grado) : undefined });
    setBusy(false);
    if (!ok) { toast(msgErr(j)); return; }
    toast('¡Aula creada!');
    setNombre(''); setGrado(''); setCodigo(''); setSecreto(''); setOpen(false);
    onDone();
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="ed-primary" style={{ ...btnPrimary, marginBottom: 12 }}>+ Crear aula</button>;
  }
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
      <b style={{ fontFamily: QUICK, color: '#3A332A' }}>Nueva aula</b>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 160 }}><label style={labelStyle}>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} style={field} placeholder="Sala de Ana" /></div>
        <div style={{ flex: 1, minWidth: 90 }}><label style={labelStyle}>Grado (opcional)</label><input type="number" min={1} max={7} value={grado} onChange={(e) => setGrado(e.target.value)} style={field} /></div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140 }}><label style={labelStyle}>Código (lo ven los chicos)</label><input value={codigo} onChange={(e) => setCodigo(e.target.value)} style={field} placeholder="SALA1" /></div>
        <div style={{ flex: 1, minWidth: 140 }}><label style={labelStyle}>Secreto del aula</label><input value={secreto} onChange={(e) => setSecreto(e.target.value)} style={field} placeholder="una palabra fácil" /></div>
      </div>
      <p style={{ fontSize: 13, color: '#9A8E78', margin: 0 }}>Anotá el secreto: por seguridad no se vuelve a mostrar.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={crear} className="ed-primary" style={btnPrimary} disabled={busy}>{busy ? 'Creando…' : 'Crear aula'}</button>
        <button onClick={() => setOpen(false)} style={btnGhost}>Cancelar</button>
      </div>
    </div>
  );
}

// ---------- Agregar alumno ----------
function CrearAlumno({ aulas, onDone }: { aulas: Aula[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [aulaId, setAulaId] = useState('');
  const [nombre, setNombre] = useState('');
  const [avatar, setAvatar] = useState('fox');
  const [grado, setGrado] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  async function crear() {
    if (busy) return;
    const aid = aulaId || aulas[0]?.id;
    if (!aid) { toast('Primero creá un aula.'); return; }
    if (!nombre.trim()) { toast('Poné el nombre.'); return; }
    if (!/^\d{4}$/.test(pin)) { toast('El PIN tiene que ser de 4 dígitos.'); return; }
    if (!grado) { toast('Poné el grado.'); return; }
    setBusy(true);
    const { ok, j } = await gestion('crear_alumno', { aula_id: aid, nombre, avatar, grado: Number(grado), pin });
    setBusy(false);
    if (!ok) { toast(msgErr(j)); return; }
    toast('¡Alumno creado!');
    setNombre(''); setPin(''); setGrado(''); setAvatar('fox'); setOpen(false);
    onDone();
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="ed-primary" style={{ ...btnPrimary, background: '#7FB069', marginBottom: 4 }}>+ Agregar alumno</button>;
  }
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <b style={{ fontFamily: QUICK, color: '#3A332A' }}>Nuevo alumno</b>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 160 }}><label style={labelStyle}>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} style={field} /></div>
        <div style={{ flex: 1, minWidth: 90 }}><label style={labelStyle}>Grado</label><input type="number" min={1} max={7} value={grado} onChange={(e) => setGrado(e.target.value)} style={field} /></div>
        <div style={{ flex: 1, minWidth: 90 }}><label style={labelStyle}>PIN (4 díg.)</label><input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} style={field} /></div>
      </div>
      <div>
        <label style={labelStyle}>Aula</label>
        <select value={aulaId || aulas[0]?.id || ''} onChange={(e) => setAulaId(e.target.value)} style={field}>
          {aulas.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.codigo})</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Avatar</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {AVATARES.map((k) => (
            <button key={k} onClick={() => setAvatar(k)} style={{ width: 54, height: 54, borderRadius: 14, border: `2px solid ${avatar === k ? '#7FB069' : '#EFE3CE'}`, background: `#FBF4E6 ${animal(k)} center/70% no-repeat`, cursor: 'pointer' }} aria-label={k} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={crear} className="ed-primary" style={{ ...btnPrimary, background: '#7FB069' }} disabled={busy}>{busy ? 'Creando…' : 'Crear alumno'}</button>
        <button onClick={() => setOpen(false)} style={btnGhost}>Cancelar</button>
      </div>
    </div>
  );
}

// ---------- Card de aula + sus alumnos ----------
function AulaCard({ aula, alumnos, aulas, onDone }: { aula: Aula; alumnos: Alumno[]; aulas: Aula[]; onDone: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(aula.nombre);
  const [grado, setGrado] = useState(aula.grado ? String(aula.grado) : '');
  const [secreto, setSecreto] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  async function guardar() {
    const { ok, j } = await gestion('editar_aula', { aula_id: aula.id, nombre, grado: grado ? Number(grado) : null });
    if (!ok) { toast(msgErr(j)); return; }
    toast('Aula actualizada.'); setEditando(false); onDone();
  }
  async function cambiarSecreto() {
    if (!secreto.trim()) { toast('Poné el nuevo secreto.'); return; }
    const { ok, j } = await gestion('cambiar_secreto', { aula_id: aula.id, secreto });
    if (!ok) { toast(msgErr(j)); return; }
    toast('Secreto cambiado.'); setSecreto('');
  }
  async function borrar() {
    const { ok, j } = await gestion('borrar_aula', { aula_id: aula.id });
    if (!ok) { toast(msgErr(j)); return; }
    toast('Aula borrada.'); onDone();
  }

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          {editando ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...field, flex: 2 }} />
              <input type="number" min={1} max={7} value={grado} onChange={(e) => setGrado(e.target.value)} style={{ ...field, width: 80 }} placeholder="grado" />
            </div>
          ) : (
            <>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: '#3A332A' }}>{aula.nombre}{aula.grado ? ` · ${aula.grado}°` : ''}</div>
              <div style={{ fontSize: 14, color: '#7A6F5F', fontWeight: 600 }}>Código: <b>{aula.codigo}</b> · {alumnos.length} {alumnos.length === 1 ? 'alumno' : 'alumnos'}</div>
            </>
          )}
        </div>
        {editando ? (
          <><button onClick={guardar} className="ed-primary" style={btnSm}>Guardar</button><button onClick={() => setEditando(false)} style={btnGhostSm}>Cancelar</button></>
        ) : (
          <><button onClick={() => setEditando(true)} style={btnGhostSm}>Editar</button>
            {confirmDel ? (
              <><span style={{ fontSize: 13.5, color: '#BB4F3F', fontWeight: 700 }}>¿Borrar?</span><button onClick={borrar} style={{ ...btnSm, background: '#BB4F3F' }}>Sí</button><button onClick={() => setConfirmDel(false)} style={btnGhostSm}>No</button></>
            ) : (
              <button onClick={() => setConfirmDel(true)} style={btnGhostSm}>Borrar</button>
            )}
          </>
        )}
      </div>

      {/* Cambiar secreto */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={secreto} onChange={(e) => setSecreto(e.target.value)} placeholder="Nuevo secreto del aula" style={{ ...field, flex: 1, minWidth: 160, background: '#fff' }} />
        <button onClick={cambiarSecreto} style={btnGhostSm}>Cambiar secreto</button>
      </div>

      {/* Alumnos del aula */}
      {alumnos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #EFE3CE', paddingTop: 10 }}>
          {alumnos.map((al) => <AlumnoRow key={al.id} alumno={al} aulas={aulas} onDone={onDone} />)}
        </div>
      )}
    </div>
  );
}

// ---------- Fila de alumno ----------
function AlumnoRow({ alumno, aulas, onDone }: { alumno: Alumno; aulas: Aula[]; onDone: () => void }) {
  const [mode, setMode] = useState<'' | 'pin' | 'edit' | 'del'>('');
  const [pin, setPin] = useState('');
  const [nombre, setNombre] = useState(alumno.nombre);
  const [grado, setGrado] = useState(String(alumno.grado));
  const [avatar, setAvatar] = useState(alumno.avatar);
  const [aulaId, setAulaId] = useState(alumno.aula_id || '');

  async function resetPin() {
    if (!/^\d{4}$/.test(pin)) { toast('PIN de 4 dígitos.'); return; }
    const { ok, j } = await gestion('resetear_pin', { alumno_id: alumno.id, pin });
    if (!ok) { toast(msgErr(j)); return; }
    toast('PIN cambiado.'); setPin(''); setMode('');
  }
  async function guardar() {
    const { ok, j } = await gestion('editar_alumno', { alumno_id: alumno.id, nombre, grado: Number(grado), avatar, aula_id: aulaId || undefined });
    if (!ok) { toast(msgErr(j)); return; }
    toast('Alumno actualizado.'); setMode(''); onDone();
  }
  async function borrar() {
    const { ok, j } = await gestion('borrar_alumno', { alumno_id: alumno.id });
    if (!ok) { toast(msgErr(j)); return; }
    toast('Alumno borrado.'); onDone();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, flexShrink: 0, background: `${animal(alumno.avatar)} center/contain no-repeat` }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: NUNITO, fontWeight: 700, fontSize: 16, color: '#3A332A' }}>{alumno.nombre}</div>
          <div style={{ fontSize: 13.5, color: '#7A6F5F', fontWeight: 600 }}>{alumno.grado}° grado</div>
        </div>
        <button onClick={() => setMode(mode === 'pin' ? '' : 'pin')} style={btnGhostSm}>PIN</button>
        <button onClick={() => setMode(mode === 'edit' ? '' : 'edit')} style={btnGhostSm}>Editar</button>
        {mode === 'del' ? (
          <><span style={{ fontSize: 13.5, color: '#BB4F3F', fontWeight: 700 }}>¿Borrar?</span><button onClick={borrar} style={{ ...btnSm, background: '#BB4F3F' }}>Sí</button><button onClick={() => setMode('')} style={btnGhostSm}>No</button></>
        ) : (
          <button onClick={() => setMode('del')} style={btnGhostSm}>Borrar</button>
        )}
      </div>

      {mode === 'pin' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 52 }}>
          <input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="Nuevo PIN" style={{ ...field, width: 130, background: '#fff' }} />
          <button onClick={resetPin} className="ed-primary" style={btnSm}>Guardar PIN</button>
        </div>
      )}

      {mode === 'edit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 52 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...field, flex: 2, minWidth: 140 }} />
            <input type="number" min={1} max={7} value={grado} onChange={(e) => setGrado(e.target.value)} style={{ ...field, width: 80 }} />
            <select value={aulaId} onChange={(e) => setAulaId(e.target.value)} style={{ ...field, minWidth: 140 }}>
              {aulas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {AVATARES.map((k) => (
              <button key={k} onClick={() => setAvatar(k)} style={{ width: 42, height: 42, borderRadius: 12, border: `2px solid ${avatar === k ? '#7FB069' : '#EFE3CE'}`, background: `#FBF4E6 ${animal(k)} center/70% no-repeat`, cursor: 'pointer' }} aria-label={k} />
            ))}
            <button onClick={guardar} className="ed-primary" style={{ ...btnSm, marginLeft: 'auto' }}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- estilos ----------
const sideBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', borderRadius: 14,
  background: 'none', border: 'none', color: '#7A6F5F', fontFamily: QUICK, fontWeight: 700,
  fontSize: 16, cursor: 'pointer', textAlign: 'left',
};
const card: React.CSSProperties = { background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 18, padding: '16px 18px' };
const field: React.CSSProperties = { width: '100%', padding: '11px 13px', border: '2px solid #EFE3CE', borderRadius: 12, fontFamily: NUNITO, fontSize: 15, color: '#3A332A', background: '#FBF4E6', outline: 'none' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: '#7A6F5F', marginBottom: 5 };
const btnPrimary: React.CSSProperties = { background: '#6FB7D4', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 22px', fontFamily: QUICK, fontWeight: 700, fontSize: 16, cursor: 'pointer' };
const btnSm: React.CSSProperties = { background: '#6FB7D4', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: 'none', border: '2px solid #EFE3CE', borderRadius: 12, padding: '11px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: '#7A6F5F', cursor: 'pointer' };
const btnGhostSm: React.CSSProperties = { background: 'none', border: '2px solid #EFE3CE', borderRadius: 10, padding: '7px 12px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, color: '#7A6F5F', cursor: 'pointer' };
