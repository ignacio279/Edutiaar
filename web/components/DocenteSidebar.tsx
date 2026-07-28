'use client';
// Sidebar compartido del panel docente (antes duplicado inline en cada página).
// El ítem activo se pinta como pill fija; el resto navega con router.push.
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { sol, uiIcon } from '@/lib/art';

const QUICK = 'var(--font-quicksand), sans-serif';
const BALOO = 'var(--font-baloo), cursive';
const solHappy = `${sol('happy')} center/contain no-repeat`;

const sideBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', borderRadius: 14,
  background: 'none', border: 'none', color: '#7A6F5F', fontFamily: QUICK, fontWeight: 700,
  fontSize: 16, cursor: 'pointer', textAlign: 'left',
};
const sideActive: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', borderRadius: 14,
  background: '#E3EEF4', color: '#3A332A', fontFamily: QUICK, fontWeight: 700, fontSize: 16,
};

const ITEMS: { key: 'alumnos' | 'clase' | 'materias' | 'luna'; label: string; ruta: string; icono: string }[] = [
  { key: 'alumnos', label: 'Mis alumnos', ruta: '/docente', icono: 'people' },
  { key: 'clase', label: 'Mi clase', ruta: '/docente/alumnos', icono: 'people' },
  { key: 'materias', label: 'Mis materias', ruta: '/docente/materias', icono: 'mapI' },
  { key: 'luna', label: 'LUNA', ruta: '/docente/luna', icono: 'moon' },
];

export default function DocenteSidebar({ activo }: { activo: 'alumnos' | 'clase' | 'materias' | 'luna' }) {
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  return (
    <aside style={{ width: 236, flexShrink: 0, background: '#FFFCF5', borderRight: '2px solid #EFE3CE', padding: '26px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px 22px' }}>
        <div style={{ width: 36, height: 36, background: solHappy }} />
        <span style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 22, color: '#3A332A', letterSpacing: '-.5px' }}>EDUTIA</span>
      </div>
      {ITEMS.map((it) =>
        it.key === activo ? (
          <div key={it.key} style={sideActive}>
            <span style={{ width: 22, height: 22, background: `${uiIcon(it.icono)} center/contain no-repeat` }} />{it.label}
          </div>
        ) : (
          <button key={it.key} onClick={() => router.push(it.ruta)} className="ed-side" style={sideBtn}>
            <span style={{ width: 22, height: 22, background: `${uiIcon(it.icono)} center/contain no-repeat` }} />{it.label}
          </button>
        ),
      )}
      <div style={{ flex: 1 }} />
      <button onClick={signOut} className="ed-side" style={sideBtn}>Cerrar sesión</button>
    </aside>
  );
}
