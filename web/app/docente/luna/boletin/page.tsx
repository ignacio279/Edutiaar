'use client';
// LUNA — flujo "Escribir boletín": grado → alumno → generando → revisión.
// LUNA genera el BORRADOR con la evidencia del mes (Edge Function luna-boletin);
// la seño lo edita inline, lo aprueba, lo regenera o lo corrige. Editar y
// aprobar van directo por RLS (boletin_update, 0016) con verificación de que
// la fila volvió (.select) — patrón de Mis materias.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DocenteSidebar from '@/components/DocenteSidebar';
import { toast } from '@/lib/toast';
import { fetchConTimeout } from '@/lib/edge';
import { animal, uiIcon } from '@/lib/art';
import { periodoActual, mensajeErrorLuna, type AlumnoLuna } from '@/lib/luna';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

const card: React.CSSProperties = {
  background: '#FFFCF5', border: '2px solid #EFE3CE', borderRadius: 22,
  padding: '18px 20px', boxShadow: '0 3px 10px rgba(120,90,40,.06)',
};
const btnSm: React.CSSProperties = {
  background: '#FFFCF5', color: '#7A6F5F', border: '1.5px solid #EFE3CE', borderRadius: 10,
  padding: '8px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
};
const btnPrimario: React.CSSProperties = {
  background: '#7FB069', color: '#fff', border: 'none', borderRadius: 12,
  padding: '11px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, cursor: 'pointer',
};

type Contenido = { materias: { materia: string; texto: string }[]; actitud: string; sugerencia: string };
type Boletin = { id: string; alumno_id: string; periodo: string; contenido: Contenido; estado: 'borrador' | 'aprobado'; version: number };
type Paso = 'grado' | 'alumno' | 'generando' | 'revision';

// Clave de sección editable: 'm0', 'm1', … / 'actitud' / 'sugerencia'.
type SeccionKey = string;

export default function EscribirBoletin() {
  const router = useRouter();
  const supabase = createClient();

  const [uid, setUid] = useState<string | null>(null);
  const [alumnos, setAlumnos] = useState<AlumnoLuna[] | null>(null);
  const [boletines, setBoletines] = useState<Boletin[]>([]);
  const [paso, setPaso] = useState<Paso>('grado');
  const [gradoSel, setGradoSel] = useState<number | null>(null);
  const [alumnoSel, setAlumnoSel] = useState<AlumnoLuna | null>(null);
  const [boletin, setBoletin] = useState<Boletin | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<SeccionKey | null>(null);
  const [editTexto, setEditTexto] = useState('');
  const [busy, setBusy] = useState(false);

  const periodo = periodoActual(new Date());

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: perfil } = await supabase.from('perfil').select('rol').eq('id', user.id).single();
      if ((perfil as { rol?: string } | null)?.rol !== 'docente') { router.replace('/alumno'); return; }
      setUid(user.id);
      const [als, bols] = await Promise.all([
        supabase.from('perfil').select('id, nombre, avatar, grado').eq('rol', 'alumno').eq('docente_id', user.id).order('nombre'),
        supabase.from('boletin').select('id, alumno_id, periodo, contenido, estado, version').eq('periodo', periodo.clave),
      ]);
      setAlumnos(((als.data as AlumnoLuna[]) || []));
      setBoletines(((bols.data as Boletin[]) || []));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boletinDe = (alumnoId: string) => boletines.find((b) => b.alumno_id === alumnoId) ?? null;

  function elegirAlumno(a: AlumnoLuna) {
    setAlumnoSel(a);
    setEditKey(null);
    const existente = boletinDe(a.id);
    if (existente) { setBoletin(existente); setPaso('revision'); return; }
    generar(a);
  }

  // fetch manual con el JWT (patrón autoría): a diferencia de functions.invoke,
  // deja leer el CÓDIGO de error del cuerpo para dar copy específico.
  async function generar(a: AlumnoLuna) {
    setPaso('generando');
    setGenError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // 60s de tope: la generación con Sonnet es lenta; mejor avisar que colgar.
      const r = await fetchConTimeout(`${URL}/functions/v1/luna-boletin`, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumno_id: a.id }),
      }, 60000);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.boletin) { setGenError(mensajeErrorLuna(j?.error)); return; }
      const b = j.boletin as Boletin;
      setBoletin(b);
      setBoletines((prev) => [...prev.filter((x) => x.id !== b.id), b]);
      setPaso('revision');
    } catch {
      setGenError(mensajeErrorLuna('timeout'));
    }
  }

  // Persiste el contenido completo (RLS: solo la dueña; .select verifica que no
  // lo filtró en silencio).
  async function guardarContenido(nuevo: Contenido) {
    if (!boletin) return false;
    const { data } = await supabase.from('boletin')
      .update({ contenido: nuevo, updated_at: new Date().toISOString() })
      .eq('id', boletin.id).select('id');
    if (!data?.length) { toast('No se pudo guardar el cambio.'); return false; }
    const b = { ...boletin, contenido: nuevo };
    setBoletin(b);
    setBoletines((prev) => prev.map((x) => (x.id === b.id ? b : x)));
    return true;
  }

  function empezarEdicion(key: SeccionKey, texto: string) {
    setEditKey(key);
    setEditTexto(texto);
  }

  async function guardarEdicion() {
    if (!boletin || editKey === null || busy) return;
    setBusy(true);
    const c: Contenido = {
      materias: boletin.contenido.materias.map((m, i) => (editKey === `m${i}` ? { ...m, texto: editTexto } : m)),
      actitud: editKey === 'actitud' ? editTexto : boletin.contenido.actitud,
      sugerencia: editKey === 'sugerencia' ? editTexto : boletin.contenido.sugerencia,
    };
    const ok = await guardarContenido(c);
    setBusy(false);
    if (ok) { setEditKey(null); toast('Cambio guardado.'); }
  }

  async function aprobar() {
    if (!boletin || busy || !uid) return;
    setBusy(true);
    const { data } = await supabase.from('boletin')
      .update({ estado: 'aprobado', aprobado_por: uid, aprobado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', boletin.id).select('id');
    setBusy(false);
    if (!data?.length) { toast('No se pudo aprobar.'); return; }
    const b = { ...boletin, estado: 'aprobado' as const };
    setBoletin(b);
    setBoletines((prev) => prev.map((x) => (x.id === b.id ? b : x)));
    toast('Boletín aprobado 🌙 Queda listo para entregar.');
  }

  async function corregir() {
    if (!boletin || busy) return;
    setBusy(true);
    const { data } = await supabase.from('boletin')
      .update({ estado: 'borrador', aprobado_por: null, aprobado_at: null, version: boletin.version + 1, updated_at: new Date().toISOString() })
      .eq('id', boletin.id).select('id');
    setBusy(false);
    if (!data?.length) { toast('No se pudo abrir la corrección.'); return; }
    const b = { ...boletin, estado: 'borrador' as const, version: boletin.version + 1 };
    setBoletin(b);
    setBoletines((prev) => prev.map((x) => (x.id === b.id ? b : x)));
    toast('El boletín volvió a borrador para corregir.');
  }

  function regenerar() {
    if (!alumnoSel || busy) return;
    if (!window.confirm('Regenerar descarta el texto actual (y tus ediciones) y escribe uno nuevo. ¿Seguimos?')) return;
    generar(alumnoSel);
  }

  const grados = [...new Set((alumnos ?? []).map((a) => a.grado ?? 0))].sort((a, b) => a - b);
  const esAprobado = boletin?.estado === 'aprobado';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FBF4E6', animation: 'edFade .3s ease' }}>
      <DocenteSidebar activo="luna" />

      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px,3.5vw,40px)', maxWidth: 860 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 30, height: 30, background: `${uiIcon('moon')} center/contain no-repeat` }} />
          <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px,4vw,32px)', color: '#3A332A', margin: 0 }}>Escribir boletín</h1>
        </div>
        <p style={{ fontSize: 15.5, color: '#7A6F5F', margin: '0 0 22px', fontWeight: 600 }}>
          Boletines de {periodo.label}. LUNA redacta el borrador con la evidencia del mes; vos lo revisás y decidís.
        </p>

        {alumnos === null ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Cargando…</p>
        ) : alumnos.length === 0 ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Todavía no tenés alumnos. Cargalos desde «Mi clase» y después volvé por acá.</p>
        ) : paso === 'grado' ? (
          <>
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: '#3A332A', margin: '0 0 12px' }}>1 · Elegí el grado</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {grados.map((g) => {
                const n = alumnos.filter((a) => a.grado === g).length;
                return (
                  <button key={g} onClick={() => { setGradoSel(g); setPaso('alumno'); }} className="ed-materia-card" style={{ ...card, cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 26, color: '#3A332A' }}>{g}° grado</div>
                    <div style={{ fontSize: 14, color: '#7A6F5F', fontWeight: 600, marginTop: 3 }}>{n} {n === 1 ? 'alumno' : 'alumnos'}</div>
                  </button>
                );
              })}
            </div>
          </>
        ) : paso === 'alumno' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <button onClick={() => setPaso('grado')} style={btnSm}>← Grados</button>
              <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: '#3A332A', margin: 0 }}>2 · Elegí el alumno ({gradoSel}° grado)</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              {alumnos.filter((a) => a.grado === gradoSel).map((a) => {
                const b = boletinDe(a.id);
                return (
                  <button key={a.id} onClick={() => elegirAlumno(a)} className="ed-materia-card" style={{ ...card, cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 48, height: 48, flexShrink: 0, background: `${animal(a.avatar ?? 'fox')} center/contain no-repeat` }} />
                    <div>
                      <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: '#3A332A' }}>{a.nombre}</div>
                      {b && (
                        <span style={{
                          background: b.estado === 'aprobado' ? '#E6F0DC' : '#FBEBD6',
                          color: b.estado === 'aprobado' ? '#4E7A3A' : '#B9722A',
                          padding: '3px 10px', borderRadius: 999, fontFamily: QUICK, fontWeight: 700, fontSize: 11.5,
                        }}>{b.estado === 'aprobado' ? 'Aprobado' : 'Borrador'}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : paso === 'generando' ? (
          <div style={{ ...card, maxWidth: 560 }}>
            {genError === null ? (
              <>
                <p style={{ margin: 0, fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: '#3A332A' }}>
                  LUNA está leyendo la actividad de {alumnoSel?.nombre}…
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 14.5, color: '#7A6F5F', fontWeight: 600 }}>
                  Puede tardar un ratito. No cierres esta pantalla.
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontSize: 15, color: '#3A332A', fontWeight: 600, lineHeight: 1.5 }}>{genError}</p>
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button onClick={() => alumnoSel && generar(alumnoSel)} style={btnPrimario}>Reintentar</button>
                  <button onClick={() => { setGenError(null); setPaso('alumno'); }} style={btnSm}>← Volver</button>
                </div>
              </>
            )}
          </div>
        ) : boletin && alumnoSel ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <button onClick={() => { setPaso('alumno'); setBoletin(null); setEditKey(null); }} style={btnSm}>← Alumnos</button>
              <div style={{ width: 40, height: 40, background: `${animal(alumnoSel.avatar ?? 'fox')} center/contain no-repeat` }} />
              <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: '#3A332A', margin: 0 }}>{alumnoSel.nombre} · {periodo.label}</h2>
              <span style={{
                background: esAprobado ? '#E6F0DC' : '#FBEBD6', color: esAprobado ? '#4E7A3A' : '#B9722A',
                padding: '4px 12px', borderRadius: 999, fontFamily: QUICK, fontWeight: 700, fontSize: 12.5,
              }}>{esAprobado ? 'Aprobado' : 'Borrador'} · v{boletin.version}</span>
            </div>

            {esAprobado && (
              <div style={{ ...card, borderColor: '#D9E8CB', background: '#F5FAEF', marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: 14.5, color: '#4E7A3A', fontWeight: 700 }}>
                  Boletín aprobado: es el documento oficial de {periodo.label}, listo para entregar a la familia.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ...boletin.contenido.materias.map((m, i) => ({ key: `m${i}`, titulo: m.materia, texto: m.texto })),
                { key: 'actitud', titulo: 'Actitud frente al aprendizaje', texto: boletin.contenido.actitud },
                { key: 'sugerencia', titulo: 'Sugerencia para el próximo período', texto: boletin.contenido.sugerencia },
              ].map((s) => (
                <div key={s.key} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <h3 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16, color: '#3A332A', margin: 0 }}>{s.titulo}</h3>
                    {!esAprobado && editKey !== s.key && (
                      <button onClick={() => empezarEdicion(s.key, s.texto)} style={{ ...btnSm, padding: '5px 12px', fontSize: 12.5 }}>Editar</button>
                    )}
                  </div>
                  {editKey === s.key ? (
                    <>
                      <textarea
                        value={editTexto}
                        onChange={(e) => setEditTexto(e.target.value)}
                        rows={5}
                        autoFocus
                        style={{ width: '100%', marginTop: 10, padding: '12px 14px', border: '2px solid #EFE3CE', borderRadius: 12, fontFamily: NUNITO, fontSize: 15, color: '#3A332A', background: '#FBF4E6', outline: 'none', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditKey(null)} style={btnSm} disabled={busy}>Cancelar</button>
                        <button onClick={guardarEdicion} style={{ ...btnPrimario, padding: '8px 14px', fontSize: 13.5, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }} disabled={busy}>
                          {busy ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: '8px 0 0', fontSize: 15, color: '#3A332A', fontWeight: 500, fontFamily: NUNITO, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                      {s.texto || 'Sin texto todavía. Tocá «Editar» para escribirlo.'}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              {esAprobado ? (
                <button onClick={corregir} style={{ ...btnSm, opacity: busy ? 0.6 : 1 }} disabled={busy}>Corregir (vuelve a borrador)</button>
              ) : (
                <>
                  <button onClick={aprobar} className="ed-primary" style={{ ...btnPrimario, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }} disabled={busy}>
                    {busy ? 'Un momento…' : 'Aprobar boletín'}
                  </button>
                  <button onClick={regenerar} style={{ ...btnSm, opacity: busy ? 0.6 : 1 }} disabled={busy}>Regenerar</button>
                </>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
