'use client';
// Panel docente (portado de scHomeDocente + loadMeAndRoute para docente).
// Carga el perfil y el listado de SUS alumnos (RLS los filtra). La protección
// de "no logueado" la hace el proxy; acá redirigimos si el rol no corresponde.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { animal, sol } from '@/lib/art';

const QUICK = 'var(--font-quicksand), sans-serif';
const solHappy = `${sol('happy')} center/contain no-repeat`;

type Perfil = { nombre: string; rol: string };
type Alumno = { nombre: string; avatar: string; grado: number };

export default function PanelDocente() {
  const router = useRouter();
  const supabase = createClient();
  const [me, setMe] = useState<Perfil | null>(null);
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }
      const { data: perfil } = await supabase
        .from('perfil')
        .select('nombre,rol')
        .eq('id', user.id)
        .single();
      if ((perfil as Perfil | null)?.rol === 'alumno') {
        router.replace('/alumno/mapa');
        return;
      }
      setMe(perfil as Perfil);
      const { data: list } = await supabase
        .from('perfil')
        .select('nombre,avatar,grado')
        .eq('rol', 'alumno')
        .order('nombre');
      setAlumnos((list as Alumno[]) || []);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', padding: 'clamp(28px,5vw,52px) 22px', animation: 'edFade .3s ease' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ width: 54, height: 54, background: solHappy }} />
          <div>
            <h1 style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 'clamp(26px,4.5vw,34px)', color: '#3A332A', margin: 0 }}>
              Hola, seño {me?.nombre || ''}
            </h1>
            <p style={{ fontSize: 15, color: '#7A6F5F', margin: '3px 0 0', fontWeight: 600 }}>
              Estos son tus alumnos
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 22 }}>
          {alumnos.length ? (
            alumnos.map((a, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  background: '#FFFCF5',
                  border: '1.5px solid #EFE3CE',
                  borderRadius: 18,
                  padding: '13px 18px',
                }}
              >
                <div style={{ width: 48, height: 48, flexShrink: 0, background: `${animal(a.avatar)} center/contain no-repeat` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: '#3A332A' }}>{a.nombre}</div>
                  <div style={{ fontSize: 13.5, color: '#7A6F5F', fontWeight: 600 }}>{a.grado || 3}° grado</div>
                </div>
              </div>
            ))
          ) : (
            <p style={{ color: '#7A6F5F', fontWeight: 600 }}>
              {loaded ? 'Todavía no tenés alumnos.' : 'Cargando…'}
            </p>
          )}
        </div>

        <button
          onClick={signOut}
          className="ed-signout"
          style={{
            marginTop: 26,
            background: '#FFFCF5',
            color: '#7A6F5F',
            border: '2px solid #EFE3CE',
            borderRadius: 999,
            padding: '12px 28px',
            fontFamily: QUICK,
            fontWeight: 700,
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
