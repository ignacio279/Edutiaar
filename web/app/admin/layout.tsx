'use client';
// Layout del panel de administración (Dashboard admin v3). A diferencia de
// /docente (sidebar duplicado inline), acá el shell vive en el layout.
// Gate de rol: sin sesión o sin fila activa en plataforma_admin (RPC
// admin_nivel) → afuera. El server re-verifica en cada Edge Function.
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { uiIcon } from '@/lib/art';
import { ADMIN } from '@/lib/admin/tema';
import { ADMIN_NAV, navActivo } from './nav';
import { AdminContext, type AdminMe } from './admin-context';

const QUICK = 'var(--font-quicksand), sans-serif';
const BALOO = 'var(--font-baloo), cursive';

const sideBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 14,
  background: 'none', border: 'none', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700,
  fontSize: 15.5, cursor: 'pointer', textAlign: 'left',
};
const sideActive: React.CSSProperties = {
  ...sideBtn, background: ADMIN.claro, color: ADMIN.oscuro, cursor: 'default',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [me, setMe] = useState<AdminMe | null>(null);
  const esLogin = pathname === '/admin/login';

  useEffect(() => {
    if (esLogin) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/admin/login'); return; }
      const { data: nivel } = await supabase.rpc('admin_nivel');
      if (nivel !== 'super' && nivel !== 'operativo') {
        // Sesión de docente/alumno o cuenta desactivada: no pertenece acá.
        await supabase.auth.signOut();
        router.replace('/admin/login');
        return;
      }
      setMe({ nivel });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esLogin]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/admin/login');
    router.refresh();
  }

  if (esLogin) return <>{children}</>;

  if (!me) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700 }}>
        Entrando…
      </div>
    );
  }

  const activo = navActivo(pathname);
  const items = ADMIN_NAV.filter((it) => !it.soloSuper || me.nivel === 'super');

  return (
    <AdminContext.Provider value={me}>
      <div style={{ minHeight: '100vh', display: 'flex', animation: 'edFade .3s ease' }}>
        <aside style={{ width: 236, flexShrink: 0, background: ADMIN.carta, borderRight: `2px solid ${ADMIN.bordeCalido}`, padding: '26px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px 20px' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: ADMIN.base, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: BALOO, fontWeight: 800, fontSize: 18 }}>E</div>
            <div>
              <div style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.ink, letterSpacing: '-.5px', lineHeight: 1 }}>EDUTIA</div>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 11.5, color: ADMIN.medio, letterSpacing: '.4px' }}>ADMINISTRACIÓN</div>
            </div>
          </div>
          {items.map((it) =>
            it.key === activo ? (
              <div key={it.key} style={sideActive}>
                <span style={{ width: 21, height: 21, background: `${uiIcon(it.icono)} center/contain no-repeat` }} />{it.label}
              </div>
            ) : (
              <button key={it.key} onClick={() => router.push(it.ruta)} className="ed-side" style={sideBtn}>
                <span style={{ width: 21, height: 21, background: `${uiIcon(it.icono)} center/contain no-repeat` }} />{it.label}
              </button>
            ),
          )}
          <div style={{ flex: 1 }} />
          <button onClick={signOut} className="ed-side" style={sideBtn}>Cerrar sesión</button>
        </aside>
        <main style={{ flex: 1, minWidth: 0, padding: '30px 34px', overflowX: 'hidden' }}>
          {children}
        </main>
      </div>
    </AdminContext.Provider>
  );
}
