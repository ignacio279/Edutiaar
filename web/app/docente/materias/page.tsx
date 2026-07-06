'use client';
// Mis materias: registro de las materias de la docente (borrador y publicadas)
// con sus nodos. Acciones: agregar (va a autoría), editar (reabre autoría con
// ?sol=), despublicar (vuelve a borrador; el progreso queda) y eliminar
// definitivo (solo en borrador — policy programa_delete_autor, 0013 — con
// confirmación tipeando el nombre; el cascade borra nodos, ejercicios y todo
// el progreso de los alumnos).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DocenteSidebar from '@/components/DocenteSidebar';
import { toast } from '@/lib/toast';
import { materiaEmblem } from '@/lib/art';
import { temaMateria } from '@/lib/materia-tema';
import { armarListadoMaterias, confirmaBorrado, puedeBorrar, type MateriaVista, type NodoLite, type SolMateriaFila } from '@/lib/materias';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

const BADGE: Record<'borrador' | 'publicado', [string, string, string]> = {
  borrador: ['#FBEBD6', '#B9722A', 'Borrador'],
  publicado: ['#E6F0DC', '#4E7A3A', 'Publicada'],
};

const btnSm: React.CSSProperties = {
  background: '#FFFCF5', color: '#7A6F5F', border: '1.5px solid #EFE3CE', borderRadius: 10,
  padding: '8px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
};

export default function MisMaterias() {
  const router = useRouter();
  const supabase = createClient();

  const [materias, setMaterias] = useState<MateriaVista[] | null>(null);
  const [borrando, setBorrando] = useState<MateriaVista | null>(null);
  const [tipeado, setTipeado] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data: perfil } = await supabase.from('perfil').select('rol').eq('id', user.id).single();
      if ((perfil as { rol?: string } | null)?.rol !== 'docente') { router.replace('/alumno'); return; }

      // .eq('docente_id') es obligatorio: sol_materia_select_publicado (0007)
      // también deja ver las publicadas de otras docentes de la escuela.
      const { data: sms } = await supabase
        .from('sol_materia')
        .select('id, programa_id, estado, created_at, programa:programa_id(grado, materia:materia_id(nombre))')
        .eq('docente_id', user.id);
      const filas = (sms as unknown as SolMateriaFila[]) || [];
      const ids = filas.map((r) => r.programa_id);
      let nodos: NodoLite[] = [];
      if (ids.length) {
        const { data: ns } = await supabase
          .from('nodo')
          .select('id, programa_id, nombre, orden')
          .in('programa_id', ids)
          .order('orden');
        nodos = (ns as NodoLite[]) || [];
      }
      setMaterias(armarListadoMaterias(filas, nodos));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function despublicar(m: MateriaVista) {
    if (busy) return;
    setBusy(true);
    const { data } = await supabase
      .from('sol_materia')
      .update({ estado: 'borrador' })
      .eq('id', m.sol_materia_id)
      .select('id');
    setBusy(false);
    if (!data?.length) { toast('No se pudo despublicar'); return; }
    setMaterias((prev) => prev && armarListadoMaterias(
      prev.map((x) => (x.sol_materia_id === m.sol_materia_id ? { ...smDe(x), estado: 'borrador' as const } : smDe(x))),
      prev.flatMap((x) => x.nodos),
    ));
    toast('La materia volvió a borrador. Los chicos ya no la ven; su progreso queda guardado.');
  }

  // Reconstruye la fila cruda desde la vista (para reordenar el listado en memoria).
  function smDe(v: MateriaVista): SolMateriaFila {
    return { id: v.sol_materia_id, programa_id: v.programa_id, estado: v.estado, programa: { grado: v.grado, materia: { nombre: v.nombre } } };
  }

  async function eliminar() {
    if (busy || !borrando || !confirmaBorrado(borrando.nombre, tipeado)) return;
    setBusy(true);
    const { data } = await supabase
      .from('programa')
      .delete()
      .eq('id', borrando.programa_id)
      .select('id');
    setBusy(false);
    if (!data?.length) { toast('No se pudo eliminar. Si está publicada, despublicala primero.'); return; }
    setMaterias((prev) => prev && prev.filter((x) => x.programa_id !== borrando.programa_id));
    setBorrando(null);
    setTipeado('');
    toast('Materia eliminada.');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FBF4E6', animation: 'edFade .3s ease' }}>
      <DocenteSidebar activo="materias" />

      <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px,3.5vw,40px)', maxWidth: 860 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
          <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(24px,4vw,32px)', color: '#3A332A', margin: 0 }}>Mis materias</h1>
          <button onClick={() => router.push('/docente/autoria')} className="ed-primary" style={{ background: '#7FB069', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 20px', fontFamily: QUICK, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            + Agregar materia
          </button>
        </div>
        <p style={{ fontSize: 15.5, color: '#7A6F5F', margin: '0 0 22px', fontWeight: 600 }}>
          Acá viven tus materias con sus nodos. Las publicadas las ven tus alumnos.
        </p>

        {materias === null ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Cargando…</p>
        ) : materias.length === 0 ? (
          <p style={{ color: '#7A6F5F', fontWeight: 600 }}>Todavía no creaste materias. Empezá con «+ Agregar materia».</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {materias.map((m) => {
              const tema = temaMateria(m.nombre);
              const [bg, co, label] = BADGE[m.estado];
              return (
                <div key={m.sol_materia_id} style={{ display: 'flex', gap: 16, background: '#FFFCF5', border: `2px solid ${tema.tintBorder}`, borderRadius: 22, padding: '16px 18px', boxShadow: '0 3px 10px rgba(120,90,40,.06)' }}>
                  <div style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 16, background: tema.tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 44, height: 44, backgroundImage: materiaEmblem(tema.emblem), backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 19, color: '#3A332A' }}>{m.nombre}</span>
                      <span style={{ fontSize: 14, color: '#7A6F5F', fontWeight: 700 }}>{m.grado}° grado</span>
                      <span style={{ background: bg, color: co, padding: '4px 12px', borderRadius: 999, fontFamily: QUICK, fontWeight: 700, fontSize: 12.5 }}>{label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                      {m.nodos.length ? (
                        m.nodos.map((n) => (
                          <span key={n.id} style={{ background: '#FBF4E6', border: '1.5px solid #EFE3CE', borderRadius: 999, padding: '4px 12px', fontSize: 13, color: '#7A6F5F', fontWeight: 700, fontFamily: NUNITO }}>{n.nombre}</span>
                        ))
                      ) : (
                        <span style={{ fontSize: 13.5, color: '#9A8E78', fontWeight: 600 }}>Sin nodos todavía</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
                      <button onClick={() => router.push(`/docente/autoria?sol=${m.sol_materia_id}`)} style={{ ...btnSm, background: '#6FB7D4', color: '#fff', border: 'none' }}>Editar</button>
                      {m.estado === 'publicado' && (
                        <button onClick={() => despublicar(m)} style={btnSm} disabled={busy}>Despublicar</button>
                      )}
                      {puedeBorrar(m.estado) ? (
                        <button onClick={() => { setBorrando(m); setTipeado(''); }} style={{ ...btnSm, color: '#BB4F3F', borderColor: '#E8C9C2' }}>Eliminar…</button>
                      ) : (
                        <span style={{ fontSize: 12.5, color: '#9A8E78', fontWeight: 600 }}>Para eliminarla, primero despublicala.</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {borrando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,51,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, padding: 18 }}>
          <div style={{ background: '#FFFCF5', borderRadius: 22, padding: '24px 26px', maxWidth: 440, width: '100%', boxShadow: '0 18px 50px rgba(58,51,42,.3)' }}>
            <h2 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 21, color: '#BB4F3F', margin: '0 0 10px' }}>Eliminar {borrando.nombre}</h2>
            <p style={{ fontSize: 15, color: '#3A332A', fontWeight: 600, margin: '0 0 6px', lineHeight: 1.45 }}>
              Se borra la materia, sus {borrando.nodos.length} {borrando.nodos.length === 1 ? 'nodo' : 'nodos'} y <b>todo el progreso de tus alumnos</b> en ella.
            </p>
            <p style={{ fontSize: 14, color: '#7A6F5F', fontWeight: 700, margin: '0 0 16px' }}>No se puede deshacer.</p>
            <label style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: '#7A6F5F', marginBottom: 6 }}>
              Para confirmar, escribí el nombre de la materia
            </label>
            <input
              value={tipeado}
              onChange={(e) => setTipeado(e.target.value)}
              placeholder={borrando.nombre}
              autoFocus
              style={{ width: '100%', padding: '12px 14px', border: '2px solid #EFE3CE', borderRadius: 12, fontFamily: NUNITO, fontSize: 15, color: '#3A332A', background: '#FBF4E6', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => { setBorrando(null); setTipeado(''); }} style={btnSm}>Cancelar</button>
              <button
                onClick={eliminar}
                disabled={busy || !confirmaBorrado(borrando.nombre, tipeado)}
                style={{
                  background: '#BB4F3F', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px',
                  fontFamily: QUICK, fontWeight: 700, fontSize: 13.5,
                  cursor: busy || !confirmaBorrado(borrando.nombre, tipeado) ? 'default' : 'pointer',
                  opacity: busy || !confirmaBorrado(borrando.nombre, tipeado) ? 0.5 : 1,
                }}
              >
                {busy ? 'Eliminando…' : 'Eliminar para siempre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
