// Fase 0 — prueba de conexión a Supabase desde un Server Component.
// Lee `escuela` (tiene policy de select para anon → migración 0004).
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: escuelas, error } = await supabase
    .from('escuela')
    .select('id, nombre')
    .order('nombre');

  return (
    <main
      style={{
        fontFamily: "system-ui, 'Nunito', sans-serif",
        background: '#FBF4E6',
        color: '#3A332A',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          padding: 32,
          background: '#fff',
          borderRadius: 18,
          boxShadow: '0 8px 30px rgba(0,0,0,.08)',
        }}
      >
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>EDUTIA — Next.js</h1>
        <p style={{ margin: '4px 0 18px', color: '#7a7060' }}>
          Fase 0 · prueba de conexión a Supabase
        </p>

        {error ? (
          <p style={{ color: '#C0392B' }}>Error: {error.message}</p>
        ) : (
          <>
            <p style={{ fontWeight: 700, margin: '0 0 8px' }}>
              Escuelas ({escuelas?.length ?? 0}):
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {escuelas?.map((e) => (
                <li
                  key={e.id}
                  style={{ padding: '8px 0', borderTop: '1px solid #eee' }}
                >
                  {e.nombre}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
