'use client';
// STUB Fase 1 — confirma que el login de la docente dejó sesión válida.
// Fase 2 reemplaza esto por el panel real con el listado de alumnos (scHomeDocente).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { sol } from '@/lib/art';

const QUICK = 'var(--font-quicksand), sans-serif';

type Perfil = { nombre: string; rol: string };

export default function HomeDocente() {
  const router = useRouter();
  const supabase = createClient();
  const [me, setMe] = useState<Perfil | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }
      const { data } = await supabase
        .from('perfil')
        .select('nombre,rol')
        .eq('id', user.id)
        .single();
      setMe(data as Perfil);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <div style={{ minHeight: '100vh', padding: 'clamp(28px,5vw,52px) 22px', animation: 'edFade .3s ease' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ width: 54, height: 54, background: `${sol('happy')} center/contain no-repeat` }} />
          <div>
            <h1
              style={{
                fontFamily: QUICK,
                fontWeight: 700,
                fontSize: 'clamp(26px,4.5vw,34px)',
                color: '#3A332A',
                margin: 0,
              }}
            >
              Hola, seño {me?.nombre || ''}
            </h1>
            <p style={{ fontSize: 15, color: '#7A6F5F', margin: '3px 0 0', fontWeight: 600 }}>
              Entraste. (Fase 2: acá va el listado de tus alumnos.)
            </p>
          </div>
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
