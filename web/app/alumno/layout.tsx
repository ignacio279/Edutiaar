'use client';
// Layout raíz del alumno: carga el perfil una vez y lo provee por contexto. El
// header (con la materia y el toggle) vive en el sub-layout por materia
// (/alumno/[programaId]/layout), porque depende de la materia elegida.
// La protección de "no logueado" la hace el proxy; acá solo redirigimos por rol.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MeContext, type Perfil } from '@/lib/me-context';

export default function AlumnoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createClient();
  const [me, setMe] = useState<Perfil | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data } = await supabase
        .from('perfil')
        .select('id,nombre,avatar,grado,rol')
        .eq('id', user.id)
        .single();
      const perfil = data as Perfil | null;
      if (perfil?.rol === 'docente') { router.replace('/docente'); return; }
      setMe(perfil);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MeContext.Provider value={me}>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </MeContext.Provider>
  );
}
