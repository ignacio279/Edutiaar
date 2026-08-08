'use client';
// Layout del panel docente (Dashboard admin v3, F3). Existe solo para montar
// los avisos de arriba en TODAS las pantallas de la seño sin tocar cada
// página: el estado de su acceso (prueba por vencer / terminada / cuenta en
// pausa) y los anuncios que manda la administración.
// El shell con el sidebar sigue viviendo en cada page.tsx, como estaba.
import AccesoBanner from '@/components/AccesoBanner';
import AnuncioBanner from '@/components/AnuncioBanner';

export default function DocenteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AccesoBanner />
      <AnuncioBanner />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}
