'use client';
// Autoría docente (Fase 2 / SP-2): la seño sube/pega el contenido de una materia,
// SOL lo divide en nodos (Claude real con ANTHROPIC_API_KEY seteada), ella los revisa/edita y publica.
// Llama a la Edge Function dividir-nodos con el JWT del docente (no la anon key).
// Con ?sol=<sol_materia_id> reabre una materia existente (desde Mis materias):
// carga programa + nodos y permite editar, guardar y (re)publicar.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DocenteSidebar from '@/components/DocenteSidebar';
import { toast } from '@/lib/toast';
import { sol, uiIcon } from '@/lib/art';
import { bytesABase64, validarArchivoPdf } from '@/lib/autoria';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';
const BALOO = 'var(--font-baloo), cursive';
const solHappy = `${sol('happy')} center/contain no-repeat`;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Nodo = { id?: string; nombre: string; orden: number; descripcion: string };

const card: React.CSSProperties = {
  background: '#FFFCF5', border: '1.5px solid #EFE3CE', borderRadius: 18, padding: '14px 16px',
};
const field: React.CSSProperties = {
  width: '100%', padding: '12px 14px', border: '2px solid #EFE3CE', borderRadius: 12,
  fontFamily: NUNITO, fontSize: 15, color: '#3A332A', background: '#FBF4E6', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13.5, fontWeight: 700, color: '#7A6F5F', marginBottom: 6,
};
const btnPrimary: React.CSSProperties = {
  background: '#6FB7D4', color: '#fff', border: 'none', borderRadius: 12,
  padding: '12px 22px', fontFamily: QUICK, fontWeight: 700, fontSize: 16, cursor: 'pointer',
};

function Autoria() {
  const router = useRouter();
  const supabase = createClient();
  const solParam = useSearchParams().get('sol');

  const [loaded, setLoaded] = useState(false);
  const [materia, setMateria] = useState('Lengua');
  const [grado, setGrado] = useState(3);
  const [contenido, setContenido] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [modo, setModo] = useState<'crear' | 'editar'>('crear');

  const [solMateriaId, setSolMateriaId] = useState<string | null>(null);
  const [programaId, setProgramaId] = useState<string | null>(null);
  const [nodos, setNodos] = useState<Nodo[]>([]);
  const [estado, setEstado] = useState<'borrador' | 'publicado'>('borrador');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: perfil } = await supabase.from('perfil').select('rol').eq('id', user.id).single();
      if ((perfil as { rol?: string } | null)?.rol !== 'docente') { router.replace('/alumno'); return; }

      if (solParam) {
        // Reabrir una materia existente. Filtrar por docente_id es obligatorio:
        // la policy de 0007 también deja ver publicadas ajenas de la escuela.
        const { data: sm } = await supabase
          .from('sol_materia')
          .select('id, programa_id, estado, programa:programa_id(grado, materia:materia_id(nombre))')
          .eq('id', solParam)
          .eq('docente_id', user.id)
          .maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fila = sm as any;
        if (!fila) { toast('No encontramos esa materia'); router.replace('/docente/materias'); return; }
        const { data: ns } = await supabase
          .from('nodo')
          .select('id, nombre, orden, descripcion')
          .eq('programa_id', fila.programa_id)
          .order('orden');
        setSolMateriaId(fila.id);
        setProgramaId(fila.programa_id);
        setEstado(fila.estado);
        setMateria(fila.programa?.materia?.nombre ?? '');
        setGrado(fila.programa?.grado ?? 3);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setNodos(((ns as any[]) || []).map((n) => ({ id: n.id, nombre: n.nombre, orden: n.orden, descripcion: n.descripcion ?? '' })));
        setModo('editar');
      } else {
        // Sin ?sol=: arranque limpio para crear. Necesario porque al navegar de
        // ?sol=X a /docente/autoria el componente NO se remonta (misma ruta,
        // cambia solo la query) y el estado del modo editar quedaría vivo.
        setModo('crear');
        setSolMateriaId(null);
        setProgramaId(null);
        setNodos([]);
        setEstado('borrador');
        setMateria('Lengua');
        setGrado(3);
        setContenido('');
        setPdf(null);
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solParam]);

  function elegirPdf(f: File | undefined) {
    if (!f) return;
    const err = validarArchivoPdf(f.name, f.type, f.size);
    if (err) { toast(err); return; }
    setPdf(f);
  }

  async function generar() {
    if (busy) return;
    if (!contenido.trim() && !pdf) { toast('Pegá el contenido del plan o adjuntá un PDF'); return; }
    setBusy(true);
    let pdf_base64: string | undefined;
    if (pdf) {
      try {
        pdf_base64 = bytesABase64(await pdf.arrayBuffer());
      } catch {
        setBusy(false);
        toast('No se pudo leer el PDF. Probá elegirlo de nuevo.');
        return;
      }
    }
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`${URL}/functions/v1/dividir-nodos`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materia_nombre: materia.trim(),
        grado: Number(grado),
        contenido: contenido.trim() || undefined,
        pdf_base64,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast(j.error ? `No se pudo: ${j.error}` : 'No se pudo generar'); return; }
    setSolMateriaId(j.sol_materia_id);
    setProgramaId(j.programa_id);
    setNodos(j.nodos || []);
    setEstado('borrador');
    toast(`SOL armó ${j.nodos?.length ?? 0} nodos. Revisalos.`);
  }

  function editarNodo(i: number, campo: 'nombre' | 'descripcion', valor: string) {
    setNodos((ns) => ns.map((n, k) => (k === i ? { ...n, [campo]: valor } : n)));
  }

  function agregarNodo() {
    setNodos((ns) => [...ns, { nombre: '', orden: ns.length, descripcion: '' }]);
  }

  async function borrarNodo(i: number) {
    const n = nodos[i];
    if (n.id) {
      const { error } = await supabase.from('nodo').delete().eq('id', n.id);
      if (error) { toast('No se pudo borrar'); return; }
    }
    setNodos((ns) => ns.filter((_, k) => k !== i));
  }

  // Núcleo de guardado (sin manejo de busy): upsertea los nodos por RLS.
  // Devuelve false si algún insert/update falló.
  async function guardarNodos(): Promise<boolean> {
    if (!programaId) return false;
    let ok = true;
    for (let i = 0; i < nodos.length; i++) {
      const n = nodos[i];
      if (!n.nombre.trim()) continue;
      if (n.id) {
        const { error } = await supabase.from('nodo')
          .update({ nombre: n.nombre.trim(), descripcion: n.descripcion, orden: i, actualizado_at: new Date().toISOString() })
          .eq('id', n.id);
        if (error) ok = false;
      } else {
        const { data, error } = await supabase.from('nodo')
          .insert({ programa_id: programaId, nombre: n.nombre.trim(), descripcion: n.descripcion, orden: i })
          .select('id').single();
        if (error) ok = false;
        if (data) setNodos((ns) => ns.map((x, k) => (k === i ? { ...x, id: (data as { id: string }).id } : x)));
      }
    }
    return ok;
  }

  async function guardar() {
    if (busy || !programaId) return;
    setBusy(true);
    try {
      toast((await guardarNodos()) ? 'Cambios guardados' : 'Algunos cambios no se pudieron guardar');
    } finally {
      setBusy(false);
    }
  }

  async function publicar() {
    if (busy || !solMateriaId) return;
    setBusy(true);
    try {
      // Guardar primero: un nodo nuevo sin id no recibe ejercicios del generador.
      await guardarNodos();
      const republicacion = estado === 'publicado';
      if (!republicacion) {
        const { data } = await supabase.from('sol_materia').update({ estado: 'publicado' }).eq('id', solMateriaId).select('id');
        if (!data?.length) { toast('No se pudo publicar'); return; }
        setEstado('publicado');
      }
      toast(republicacion ? 'SOL está preparando los ejercicios de los nodos nuevos…' : '¡Publicado! SOL está preparando los ejercicios… 🌱');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch(`${URL}/functions/v1/generador-ejercicios`, {
          method: 'POST',
          headers: { apikey: ANON, Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ programa_id: programaId }),
        });
        const j = await r.json().catch(() => ({}));
        toast(r.ok ? `¡Listo! SOL preparó ${j.generados ?? 0} ejercicios.` : 'La materia quedó publicada, pero los ejercicios no salieron. SOL los va a preparar cuando un alumno entre a practicar.');
      } catch {
        toast('La materia quedó publicada, pero los ejercicios no salieron. SOL los va a preparar cuando un alumno entre a practicar.');
      }
    } finally {
      setBusy(false);
    }
  }


  if (!loaded) return <p style={{ padding: 40, color: '#7A6F5F', fontWeight: 600 }}>Cargando…</p>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FBF4E6', animation: 'edFade .3s ease' }}>
      <DocenteSidebar activo="materias" />

      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px,3.5vw,40px)', maxWidth: 760 }}>
        <button onClick={() => router.push('/docente/materias')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', color: '#7A6F5F', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 14 }}>‹ Mis materias</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 48, height: 48, background: `${sol('happy')} center/contain no-repeat` }} />
          <div>
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px,4.5vw,30px)', color: '#3A332A', margin: 0 }}>
              {modo === 'editar' ? 'Editar materia' : 'Subir un plan'}
            </h1>
            <p style={{ fontSize: 14.5, color: '#7A6F5F', margin: '3px 0 0', fontWeight: 600 }}>
              {modo === 'editar'
                ? `${materia} · ${grado}° grado · ${estado === 'publicado' ? 'publicada' : 'borrador'}`
                : 'Pegá el contenido o subí un PDF y SOL lo divide en nodos. Después los revisás.'}
            </p>
          </div>
        </div>

        {/* Formulario de generación (solo al crear; al editar los nodos ya existen) */}
        {modo === 'crear' && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Materia</label>
              <input value={materia} onChange={(e) => setMateria(e.target.value)} style={field} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Grado</label>
              <input type="number" min={1} max={7} value={grado} onChange={(e) => setGrado(Number(e.target.value))} style={field} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Contenido del plan</label>
            <textarea
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              placeholder={pdf ? 'Opcional: notas extra para SOL además del PDF.' : 'Ej: Vocales, sílabas, palabras, oraciones, lectura, cuento.'}
              rows={5}
              style={{ ...field, resize: 'vertical', fontFamily: NUNITO }}
            />
          </div>
          <div>
            <label style={labelStyle}>…o subí el plan en PDF</label>
            <input
              id="pdf-plan"
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => { elegirPdf(e.target.files?.[0]); e.target.value = ''; }}
            />
            {pdf ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, background: '#FBF4E6',
                border: '2px solid #EFE3CE', borderRadius: 999, padding: '8px 8px 8px 16px',
                fontFamily: NUNITO, fontSize: 14.5, fontWeight: 700, color: '#3A332A', maxWidth: '100%',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  📄 {pdf.name} · {(pdf.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  onClick={() => setPdf(null)}
                  aria-label="Quitar PDF"
                  style={{ background: '#EFE3CE', border: 'none', borderRadius: '50%', width: 26, height: 26, color: '#7A6F5F', fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}
                >×</button>
              </div>
            ) : (
              <label htmlFor="pdf-plan" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FFFCF5',
                border: '2px solid #EFE3CE', borderRadius: 12, padding: '10px 18px',
                fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: '#7A6F5F', cursor: 'pointer',
              }}>
                📎 Adjuntar PDF
              </label>
            )}
          </div>
          <button onClick={generar} className="ed-primary" style={{ ...btnPrimary, alignSelf: 'flex-start' }}>
            {busy ? 'Generando…' : 'Generar nodos'}
          </button>
        </div>
        )}

        {/* Revisión de nodos */}
        {(nodos.length > 0 || modo === 'editar') && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: '#3A332A', margin: 0 }}>
                Nodos {estado === 'publicado' ? '· publicado ✓' : '· borrador'}
              </h2>
              <button onClick={agregarNodo} style={{ background: 'none', border: '1.5px solid #EFE3CE', borderRadius: 999, padding: '6px 14px', color: '#7A6F5F', fontWeight: 700, cursor: 'pointer' }}>
                + nodo
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {nodos.map((n, i) => (
                <div key={n.id ?? `nuevo-${i}`} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 30, height: 30, flexShrink: 0, borderRadius: '50%', background: '#F4A93B', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, marginTop: 2,
                  }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={n.nombre} onChange={(e) => editarNodo(i, 'nombre', e.target.value)} placeholder="Nombre del nodo" style={{ ...field, fontWeight: 700 }} />
                    <input value={n.descripcion} onChange={(e) => editarNodo(i, 'descripcion', e.target.value)} placeholder="Qué cubre este nodo" style={field} />
                  </div>
                  <button onClick={() => borrarNodo(i)} aria-label="Borrar nodo" style={{ background: 'none', border: 'none', color: '#C98A8A', fontSize: 22, lineHeight: 1, cursor: 'pointer', marginTop: 2 }}>×</button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
              <button onClick={guardar} style={{ ...btnPrimary, background: '#FFFCF5', color: '#7A6F5F', border: '2px solid #EFE3CE' }}>
                {busy ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button onClick={publicar} className="ed-primary" style={{ ...btnPrimary, background: '#7FB069' }}>
                {estado === 'publicado' ? 'Publicar cambios' : 'Publicar'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// useSearchParams exige Suspense en el App Router (mismo patrón que practicar).
export default function Page() {
  return (
    <Suspense fallback={<p style={{ padding: 40, color: '#7A6F5F', fontWeight: 600 }}>Cargando…</p>}>
      <Autoria />
    </Suspense>
  );
}

