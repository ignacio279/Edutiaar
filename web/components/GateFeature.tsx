'use client';
// Gate de features del colegio para el panel docente (Dashboard admin v3, F3).
// Si la administración apagó la feature, la pantalla no se muestra: se explica
// con copy cálido y se ofrece volver. El servidor igual corta (las Edge
// Functions chequean el mismo flag) — esto evita que la seño choque contra un
// error después de escribir media consulta.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { featureActiva, type Acceso } from '@/lib/acceso';

const BALOO = 'var(--font-baloo), cursive';
const NUNITO = 'var(--font-nunito)';

// Hook compartido: null = todavía no sabemos (no escondas nada aún).
export function useFeatures(): unknown {
  const [features, setFeatures] = useState<unknown>(null);
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc('mi_acceso');
        if (data) setFeatures((data as Acceso).features);
      } catch {
        /* sin datos: la UI queda como está y manda el server */
      }
    })();
  }, []);
  return features;
}

export default function GateFeature({
  feature, children,
}: { feature: string; children: React.ReactNode }) {
  const router = useRouter();
  const features = useFeatures();

  // Mientras no sabemos, mostramos la pantalla (evita el parpadeo).
  if (features === null || featureActiva(features, feature)) return <>{children}</>;

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 460, background: '#FFFCF5', border: '2px solid #EFE3CE', borderRadius: 22, padding: '28px 30px', textAlign: 'center', boxShadow: '0 3px 10px rgba(120,90,40,.06)' }}>
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 22, color: '#3A332A', margin: '0 0 8px' }}>
          Esta sección no está habilitada
        </h1>
        <p style={{ fontFamily: NUNITO, fontSize: 15, color: '#7A6F5F', margin: '0 0 20px', fontWeight: 600, lineHeight: 1.5 }}>
          Tu colegio todavía no la tiene activada. Si la necesitás, escribinos y la prendemos.
        </p>
        <button
          onClick={() => router.push('/docente')}
          className="ed-primary"
          style={{ background: '#F4A93B', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 22px', fontFamily: BALOO, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}
        >
          Volver a mis alumnos
        </button>
      </div>
    </div>
  );
}
