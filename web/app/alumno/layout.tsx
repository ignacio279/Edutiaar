'use client';
// Layout del alumno: carga el perfil una vez, lo provee por contexto, y muestra
// el header con el toggle Mi mapa / Practicar. La protección de "no logueado"
// la hace el proxy; acá solo redirigimos si el rol no corresponde.
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MeContext, type Perfil } from '@/lib/me-context';
import AlumnoHeader from '@/components/AlumnoHeader';

export default function AlumnoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
        .select('id,nombre,avatar,grado,rol')
        .eq('id', user.id)
        .single();
      const perfil = data as Perfil | null;
      if (perfil?.rol === 'docente') {
        router.replace('/docente');
        return;
      }
      setMe(perfil);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = pathname.includes('practicar') ? 'practicar' : 'mapa';

  return (
    <MeContext.Provider value={me}>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AlumnoHeader me={me} active={active} />
        {children}
      </div>
    </MeContext.Provider>
  );
}
