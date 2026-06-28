'use client';
// Sub-layout por materia: carga el nombre de la materia (por programa_id) y muestra
// el header del alumno (materia + toggle mapa/practicar + volver a materias).
import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMe } from '@/lib/me-context';
import AlumnoHeader from '@/components/AlumnoHeader';

export default function MateriaLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const me = useMe();
  const params = useParams();
  const pathname = usePathname();
  const programaId = String(params.programaId);
  const [materia, setMateria] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('programa')
        .select('materia:materia_id(nombre)')
        .eq('id', programaId)
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMateria((data as any)?.materia?.nombre || '');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programaId]);

  const active = pathname.includes('practicar') ? 'practicar' : 'mapa';

  return (
    <>
      <AlumnoHeader me={me} active={active} materiaNombre={materia} programaId={programaId} />
      {children}
    </>
  );
}
