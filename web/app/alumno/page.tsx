'use client';
// STUB Fase 1 — confirma que el login del alumno dejó sesión válida.
// Fase 2 reemplaza esto por el home + mapa reales (scHomeAlumno / scMapa).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { animal } from '@/lib/art';

const BALOO = 'var(--font-baloo), cursive';

type Perfil = { nombre: string; avatar: string; grado: number };

export default function HomeAlumno() {
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
        .select('nombre,avatar,grado')
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 22px',
        animation: 'edFade .3s ease',
      }}
    >
      <div
        style={{
          width: 110,
          height: 110,
          animation: 'edBob 4.5s ease-in-out infinite',
          background: `${animal(me?.avatar || 'fox')} center/contain no-repeat`,
        }}
      />
      <h1
        style={{
          fontFamily: BALOO,
          fontWeight: 800,
          fontSize: 'clamp(30px,6vw,46px)',
          margin: '10px 0 6px',
          color: '#3A332A',
        }}
      >
        ¡Hola, {me?.nombre || ''}!
      </h1>
      <p style={{ fontSize: 18, color: '#7A6F5F', margin: '0 0 26px', fontWeight: 600 }}>
        Entraste. (Fase 2: acá va tu mapa con SOL.)
      </p>
      <button
        onClick={signOut}
        className="ed-signout"
        style={{
          background: '#FFFCF5',
          color: '#7A6F5F',
          border: '2px solid #EFE3CE',
          borderRadius: 999,
          padding: '12px 28px',
          fontFamily: BALOO,
          fontWeight: 700,
          fontSize: 17,
          cursor: 'pointer',
        }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}
