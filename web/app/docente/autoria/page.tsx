'use client';
// Autoría docente (Fase 2 / SP-2): la seño sube/pega el contenido de una materia,
// SOL lo divide en nodos (modo mock por ahora), ella los revisa/edita y publica.
// Llama a la Edge Function dividir-nodos con el JWT del docente (no la anon key).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { sol } from '@/lib/art';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';
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

export default function Autoria() {
  const router = useRouter();
  const supabase = createClient();

  const [loaded, setLoaded] = useState(false);
  const [materia, setMateria] = useState('Lengua');
  const [grado, setGrado] = useState(3);
  const [contenido, setContenido] = useState('');
  const [busy, setBusy] = useState(false);

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
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generar() {
    if (busy) return;
    if (!contenido.trim()) { toast('Pegá el contenido del plan primero'); return; }
    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`${URL}/functions/v1/dividir-nodos`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ materia_nombre: materia.trim(), grado: Number(grado), contenido, mock: true }),
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

  async function guardar() {
    if (busy || !programaId) return;
    setBusy(true);
    try {
      for (let i = 0; i < nodos.length; i++) {
        const n = nodos[i];
        if (!n.nombre.trim()) continue;
        if (n.id) {
          await supabase.from('nodo')
            .update({ nombre: n.nombre.trim(), descripcion: n.descripcion, orden: i, actualizado_at: new Date().toISOString() })
            .eq('id', n.id);
        } else {
          const { data } = await supabase.from('nodo')
            .insert({ programa_id: programaId, nombre: n.nombre.trim(), descripcion: n.descripcion, orden: i })
            .select('id').single();
          if (data) setNodos((ns) => ns.map((x, k) => (k === i ? { ...x, id: (data as { id: string }).id } : x)));
        }
      }
      toast('Cambios guardados');
    } finally {
      setBusy(false);
    }
  }

  async function publicar() {
    if (busy || !solMateriaId) return;
    setBusy(true);
    const { error } = await supabase.from('sol_materia').update({ estado: 'publicado' }).eq('id', solMateriaId);
    setBusy(false);
    if (error) { toast('No se pudo publicar'); return; }
    setEstado('publicado');
    toast('¡Publicado! Ya lo pueden practicar.');
  }

  if (!loaded) return <p style={{ padding: 40, color: '#7A6F5F', fontWeight: 600 }}>Cargando…</p>;

  return (
    <div style={{ minHeight: '100vh', padding: 'clamp(24px,5vw,48px) 22px', animation: 'edFade .3s ease' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <button
          onClick={() => router.push('/docente')}
          style={{ background: 'none', border: 'none', color: '#7A6F5F', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 14 }}
        >
          ‹ Volver al panel
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 48, height: 48, background: `${sol('happy')} center/contain no-repeat` }} />
          <div>
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px,4.5vw,30px)', color: '#3A332A', margin: 0 }}>
              Subir un plan
            </h1>
            <p style={{ fontSize: 14.5, color: '#7A6F5F', margin: '3px 0 0', fontWeight: 600 }}>
              Pegá el contenido y SOL lo divide en nodos. Después los revisás.
            </p>
          </div>
        </div>

        {/* Formulario */}
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
              placeholder="Ej: Vocales, sílabas, palabras, oraciones, lectura, cuento."
              rows={5}
              style={{ ...field, resize: 'vertical', fontFamily: NUNITO }}
            />
          </div>
          <button onClick={generar} className="ed-primary" style={{ ...btnPrimary, alignSelf: 'flex-start' }}>
            {busy ? 'Generando…' : 'Generar nodos'}
          </button>
        </div>

        {/* Revisión de nodos */}
        {nodos.length > 0 && (
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
              <button onClick={publicar} className="ed-primary" style={{ ...btnPrimary, background: '#7FB069' }} disabled={estado === 'publicado'}>
                {estado === 'publicado' ? 'Publicado ✓' : 'Publicar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
