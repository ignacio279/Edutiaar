'use client';
// LUNA — flujo "Escribir boletín": grado → alumno → generando → revisión,
// acotado al aula activa (`?aula=`): el wizard solo ofrece los alumnos de esa
// aula y los grados se derivan de ellos. Sin aula resuelta se vuelve al
// selector de /docente/luna (con una sola aula, auto-selección).
// LUNA genera el BORRADOR con la evidencia del mes (Edge Function luna-boletin);
// la seño lo edita inline, lo aprueba, lo regenera o lo corrige. Editar y
// aprobar van directo por RLS (boletin_update, 0016) con verificación de que
// la fila volvió (.select) — patrón de Mis materias.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DocenteSidebar from '@/components/DocenteSidebar';
import GateFeature from '@/components/GateFeature';
import { toast } from '@/lib/toast';
import { fetchConTimeout } from '@/lib/edge';
import { animal, uiIcon } from '@/lib/art';
import { periodoActual, mensajeErrorLuna, type AlumnoLuna } from '@/lib/luna';
import { enAula, linkLuna, puedeCambiarAula, resolverAula, type AulaLite } from '@/lib/luna-aula';
import { VIOLETA } from '@/lib/luna-tema';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

// Pill neutra cálida ("‹ LUNA", "‹ Grados", "Cambiar de aula"…): hover violeta
// vía la clase local .bol-pill.
const pill: React.CSSProperties = {
  background: VIOLETA.carta, border: `1.5px solid ${VIOLETA.bordeCalido}`, borderRadius: 999,
  padding: '8px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: VIOLETA.tinta2, cursor: 'pointer',
};
// Chip violeta claro (aula activa, estado Borrador).
const chipVioleta: React.CSSProperties = {
  background: VIOLETA.claro, border: `1.5px solid ${VIOLETA.borde}`, borderRadius: 999,
  padding: '8px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, color: VIOLETA.medio,
};
// Título de paso del wizard.
const h2Paso: React.CSSProperties = {
  fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: VIOLETA.oscuro, margin: '24px 0 14px',
};
// Tarjeta seleccionable del wizard (grado / alumno): hover levanta + borde base
// vía la clase local .bol-sel.
const cardSel: React.CSSProperties = {
  background: VIOLETA.carta, border: `2px solid ${VIOLETA.borde}`, cursor: 'pointer', textAlign: 'left',
};
// CTA primaria pill (violeta base) y secundaria pill (borde violeta, hover
// fondo claro vía .bol-sec).
const btnPrimario: React.CSSProperties = {
  background: VIOLETA.base, color: '#fff', border: 'none', borderRadius: 999,
  padding: '14px 30px', fontFamily: QUICK, fontWeight: 700, fontSize: 16, cursor: 'pointer',
  boxShadow: `0 6px 16px ${VIOLETA.sombraFuerte}`,
};
const btnSecundario: React.CSSProperties = {
  background: VIOLETA.carta, color: VIOLETA.medio, border: `2px solid ${VIOLETA.borde}`, borderRadius: 999,
  padding: '14px 26px', fontFamily: QUICK, fontWeight: 700, fontSize: 16, cursor: 'pointer',
};
// Variantes chicas para las acciones de edición inline.
const btnSecundarioXs: React.CSSProperties = {
  ...btnSecundario, border: `1.5px solid ${VIOLETA.borde}`, padding: '5px 14px', fontSize: 13,
};
const btnPrimarioSm: React.CSSProperties = {
  ...btnPrimario, padding: '8px 18px', fontSize: 13.5, boxShadow: 'none',
};

type Contenido = { secciones: { titulo: string; texto: string }[]; actitud: string; sugerencia_proximo_periodo: string };

// Lectura tolerante: los boletines generados antes de los prompts v2 quedaron
// en la DB con el shape viejo { materias:[{materia,texto}], actitud, sugerencia }.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizarContenido(c: any): Contenido {
  const secciones = Array.isArray(c?.secciones)
    ? c.secciones
    : Array.isArray(c?.materias)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? c.materias.map((m: any) => ({ titulo: String(m?.materia ?? ''), texto: String(m?.texto ?? '') }))
      : [];
  return {
    secciones,
    actitud: String(c?.actitud ?? ''),
    sugerencia_proximo_periodo: String(c?.sugerencia_proximo_periodo ?? c?.sugerencia ?? ''),
  };
}
type Boletin = { id: string; alumno_id: string; periodo: string; contenido: Contenido; estado: 'borrador' | 'aprobado'; version: number };
type Paso = 'alumno' | 'generando' | 'revision';

// Clave de sección editable: 's0', 's1', … / 'actitud' / 'sugerencia'.
type SeccionKey = string;

type AlumnoConAula = AlumnoLuna & { aula_id: string | null };

function EscribirBoletin({ aulaParam }: { aulaParam: string | null }) {
  const router = useRouter();
  const supabase = createClient();

  const [uid, setUid] = useState<string | null>(null);
  const [aula, setAula] = useState<AulaLite | null>(null);
  const [cambiable, setCambiable] = useState(false);
  const [alumnos, setAlumnos] = useState<AlumnoLuna[] | null>(null);
  const [boletines, setBoletines] = useState<Boletin[]>([]);
  // Sin paso de grados: el aula ya acota (decisión 2026-07-31) — directo a los
  // alumnos del aula, cada uno con su chip de grado (plurigrado a la vista).
  const [paso, setPaso] = useState<Paso>('alumno');
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
      const [aulasR, als, bols] = await Promise.all([
        supabase.from('aula').select('id, nombre, codigo').eq('docente_id', user.id).order('nombre'),
        supabase.from('perfil').select('id, nombre, avatar, grado, aula_id').eq('rol', 'alumno').eq('docente_id', user.id).order('nombre'),
        supabase.from('boletin').select('id, alumno_id, periodo, contenido, estado, version').eq('periodo', periodo.clave),
      ]);
      const aulas = ((aulasR.data as AulaLite[]) || []);
      const res = resolverAula(aulaParam, aulas);
      // Sin aula resuelta (2+ aulas y sin param válido) → a elegirla al selector.
      if (res.modo === 'selector') { router.replace('/docente/luna'); return; }
      setAula(res.aula);
      setCambiable(puedeCambiarAula(aulas));
      setAlumnos(enAula(((als.data as AlumnoConAula[]) || []), res.aula.id));
      setBoletines((((bols.data as Boletin[]) || []).map((b) => ({ ...b, contenido: normalizarContenido(b.contenido) }))));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aulaParam]);

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
      const b = { ...(j.boletin as Boletin), contenido: normalizarContenido(j.boletin.contenido) };
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
      secciones: boletin.contenido.secciones.map((s, i) => (editKey === `s${i}` ? { ...s, texto: editTexto } : s)),
      actitud: editKey === 'actitud' ? editTexto : boletin.contenido.actitud,
      sugerencia_proximo_periodo: editKey === 'sugerencia' ? editTexto : boletin.contenido.sugerencia_proximo_periodo,
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

  const esAprobado = boletin?.estado === 'aprobado';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: VIOLETA.suave, animation: 'edFade .3s ease' }}>
      {/* edPop no existe en globals.css (edBob y edFade sí): va local. Ídem los
          hovers del diseño (pill → borde violeta; tarjeta → levanta + borde base;
          secundaria → fondo claro). */}
      <style>{`
        @keyframes edPop {
          0% { transform: scale(.85); opacity: 0; }
          65% { transform: scale(1.04); }
          100% { transform: scale(1); opacity: 1; }
        }
        .bol-pill { transition: border-color .15s ease, color .15s ease; }
        .bol-pill:hover { border-color: ${VIOLETA.base}; color: ${VIOLETA.medio}; }
        .bol-sel { transition: transform .14s ease, border-color .14s ease; }
        .bol-sel:hover { transform: translateY(-3px); border-color: ${VIOLETA.base}; }
        .bol-sec { transition: background .15s ease; }
        .bol-sec:hover:not(:disabled) { background: ${VIOLETA.claro}; }
      `}</style>
      <DocenteSidebar activo="luna" />

      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px,3.5vw,40px)', maxWidth: 860 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, flexShrink: 0, background: `${uiIcon('moon')} center/contain no-repeat` }} />
          <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px,3.5vw,30px)', color: VIOLETA.ink, margin: 0 }}>Escribir boletín</h1>
        </div>
        {aula && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button onClick={() => router.push(linkLuna('/docente/luna', aula.id))} className="bol-pill" style={pill}>‹ LUNA</button>
            <span style={chipVioleta}>Aula: {aula.nombre} · {aula.codigo}</span>
            {cambiable && (
              <button onClick={() => router.push('/docente/luna')} className="bol-pill" style={pill}>Cambiar de aula</button>
            )}
          </div>
        )}
        <p style={{ fontSize: 15.5, color: VIOLETA.tinta2, fontWeight: 600, margin: '16px 0 0' }}>
          Boletines de {periodo.label}. LUNA redacta el borrador con la evidencia del mes; vos lo revisás y decidís.
        </p>

        {alumnos === null ? (
          <p style={{ color: VIOLETA.tinta2, fontWeight: 600, marginTop: 24 }}>Cargando…</p>
        ) : alumnos.length === 0 ? (
          <p style={{ color: VIOLETA.tinta2, fontWeight: 600, marginTop: 24 }}>Esta aula todavía no tiene alumnos. Cargalos desde «Mi clase» y después volvé por acá.</p>
        ) : paso === 'alumno' ? (
          <>
            <h2 style={h2Paso}>Elegí el alumno</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
              {alumnos.map((a) => {
                const b = boletinDe(a.id);
                return (
                  <button key={a.id} onClick={() => elegirAlumno(a)} className="bol-sel" style={{ ...cardSel, display: 'flex', alignItems: 'center', gap: 16, borderRadius: 18, padding: '14px 18px' }}>
                    <div style={{ width: 50, height: 50, flexShrink: 0, background: `${animal(a.avatar ?? 'fox')} center/contain no-repeat` }} />
                    <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 18, color: VIOLETA.ink }}>{a.nombre}</span>
                    <span style={{ fontFamily: NUNITO, fontSize: 13, color: VIOLETA.tinta2, fontWeight: 700 }}>{a.grado}° grado</span>
                    {b && (
                      b.estado === 'aprobado' ? (
                        <span style={{ marginLeft: 'auto', background: VIOLETA.okFondo, border: `1.5px solid ${VIOLETA.okBorde}`, color: VIOLETA.okTexto, padding: '4px 12px', borderRadius: 999, fontFamily: QUICK, fontWeight: 700, fontSize: 12.5 }}>Aprobado</span>
                      ) : (
                        <span style={{ ...chipVioleta, marginLeft: 'auto', padding: '4px 12px', fontSize: 12.5 }}>Borrador</span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : paso === 'generando' ? (
          genError === null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, background: VIOLETA.carta, border: `2px solid ${VIOLETA.borde}`, borderRadius: 24, padding: '26px 28px', marginTop: 24, maxWidth: 680, boxShadow: `0 6px 18px ${VIOLETA.sombra}` }}>
              <div style={{ width: 64, height: 64, flexShrink: 0, background: `${uiIcon('moon')} center/contain no-repeat`, animation: 'edBob 1.6s ease-in-out infinite' }} />
              <div>
                <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 20, color: VIOLETA.oscuro }}>
                  LUNA está leyendo la actividad de {alumnoSel?.nombre}…
                </div>
                <div style={{ fontSize: 15, color: VIOLETA.tinta2, fontWeight: 600, marginTop: 4 }}>
                  Puede tardar un ratito. No cierres esta pantalla.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: VIOLETA.carta, border: `2px solid ${VIOLETA.borde}`, borderRadius: 24, padding: '26px 28px', marginTop: 24, maxWidth: 680, boxShadow: `0 6px 18px ${VIOLETA.sombra}` }}>
              <p style={{ margin: 0, fontSize: 15.5, color: VIOLETA.ink, fontWeight: 600, lineHeight: 1.55, fontFamily: NUNITO }}>{genError}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
                <button onClick={() => alumnoSel && generar(alumnoSel)} className="ed-primary" style={btnPrimario}>Reintentar</button>
                <button onClick={() => { setGenError(null); setPaso('alumno'); }} className="bol-sec" style={btnSecundario}>‹ Volver</button>
              </div>
            </div>
          )
        ) : boletin && alumnoSel ? (
          <>
            <div style={{ marginTop: 22 }}>
              <button onClick={() => { setPaso('alumno'); setBoletin(null); setEditKey(null); }} className="bol-pill" style={pill}>‹ Alumnos</button>
            </div>
            <div style={{ maxWidth: 780, background: VIOLETA.carta, border: `2px solid ${VIOLETA.borde}`, borderRadius: 24, padding: '26px 28px', marginTop: 14, boxShadow: `0 8px 22px ${VIOLETA.sombra}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 52, height: 52, flexShrink: 0, background: `${animal(alumnoSel.avatar ?? 'fox')} center/contain no-repeat` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 21, color: VIOLETA.ink }}>Boletín de {periodo.label} · {alumnoSel.nombre}</div>
                  <div style={{ fontSize: 14, color: VIOLETA.tinta2, fontWeight: 600 }}>
                    {esAprobado ? 'Escrito por LUNA con la evidencia del mes; aprobado por vos' : 'Borrador escrito por LUNA con la evidencia del mes'}
                  </div>
                </div>
                {esAprobado ? (
                  <span style={{ background: VIOLETA.okFondo, border: `1.5px solid ${VIOLETA.okBorde}`, color: VIOLETA.okTexto, padding: '6px 14px', borderRadius: 999, fontFamily: QUICK, fontWeight: 700, fontSize: 13 }}>
                    Aprobado · v{boletin.version}
                  </span>
                ) : (
                  <span style={{ ...chipVioleta, padding: '6px 14px', fontSize: 13 }}>Borrador · v{boletin.version}</span>
                )}
              </div>

              {[
                ...boletin.contenido.secciones.map((sec, i) => ({ key: `s${i}`, titulo: sec.titulo, texto: sec.texto })),
                { key: 'actitud', titulo: 'Actitud frente al aprendizaje', texto: boletin.contenido.actitud },
                { key: 'sugerencia', titulo: 'Sugerencia para el próximo período', texto: boletin.contenido.sugerencia_proximo_periodo },
              ].map((s) => (
                <div key={s.key} style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: VIOLETA.oscuro }}>{s.titulo}</div>
                    {!esAprobado && editKey !== s.key && (
                      <button onClick={() => empezarEdicion(s.key, s.texto)} className="bol-sec" style={btnSecundarioXs}>Editar</button>
                    )}
                  </div>
                  {editKey === s.key ? (
                    <>
                      <textarea
                        value={editTexto}
                        onChange={(e) => setEditTexto(e.target.value)}
                        rows={5}
                        autoFocus
                        style={{ width: '100%', marginTop: 8, padding: '12px 14px', border: `2px solid ${VIOLETA.borde}`, borderRadius: 14, fontFamily: NUNITO, fontSize: 15.5, fontWeight: 600, color: VIOLETA.ink, background: VIOLETA.suave, outline: 'none', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: 10, marginTop: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditKey(null)} className="bol-sec" style={{ ...btnSecundarioXs, opacity: busy ? 0.6 : 1 }} disabled={busy}>Cancelar</button>
                        <button onClick={guardarEdicion} className="ed-primary" style={{ ...btnPrimarioSm, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }} disabled={busy}>
                          {busy ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: '4px 0 0', fontSize: 15.5, color: VIOLETA.ink, fontWeight: 600, fontFamily: NUNITO, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                      {s.texto || 'Sin texto todavía. Tocá «Editar» para escribirlo.'}
                    </p>
                  )}
                </div>
              ))}

              {esAprobado ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: VIOLETA.okFondo, border: `1.5px solid ${VIOLETA.okBorde}`, borderRadius: 16, padding: '16px 20px', marginTop: 26, animation: 'edPop .35s ease' }}>
                    <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', background: VIOLETA.okCheck, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15 }}>✓</span>
                    <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16, color: VIOLETA.okTexto }}>
                      Boletín aprobado. Listo para compartir con la familia de {alumnoSel.nombre}.
                    </span>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <button onClick={corregir} className="bol-sec" style={{ ...btnSecundario, padding: '11px 22px', fontSize: 14.5, opacity: busy ? 0.6 : 1 }} disabled={busy}>
                      Corregir (vuelve a borrador)
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 26 }}>
                  <button onClick={aprobar} className="ed-primary" style={{ ...btnPrimario, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }} disabled={busy}>
                    {busy ? 'Un momento…' : 'Aprobar y guardar'}
                  </button>
                  <button onClick={regenerar} className="bol-sec" style={{ ...btnSecundario, opacity: busy ? 0.6 : 1 }} disabled={busy}>Regenerar</button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

// useSearchParams exige Suspense en el App Router (mismo patrón que autoría).
// El key por aula remonta el wizard al cambiar de aula: arranca de cero
// (grado → alumno) con estado fresco, sin setState sincrónico en el efecto.
function ConAula() {
  const aulaParam = useSearchParams().get('aula');
  return <EscribirBoletin key={aulaParam ?? ''} aulaParam={aulaParam} />;
}

export default function Page() {
  return (
    <GateFeature feature="luna.boletines">
      <Suspense fallback={<p style={{ padding: 40, color: VIOLETA.tinta2, fontWeight: 600 }}>Cargando…</p>}>
        <ConAula />
      </Suspense>
    </GateFeature>
  );
}
