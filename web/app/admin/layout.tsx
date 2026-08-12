'use client';
// Layout del panel de administración (Dashboard admin v3, restyle 2026-08 al
// mock Admin.dc.html: sidebar sin íconos, grupo VISIÓN con chip "Pronto", rol
// como label estático). A diferencia de /docente (sidebar duplicado inline),
// acá el shell vive en el layout. Gate de rol: sin sesión o sin fila activa en
// plataforma_admin (RPC admin_nivel) → afuera. El server re-verifica en cada
// Edge Function.
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN } from '@/lib/admin/tema';
import { llamarAdmin } from '@/lib/admin/api';
import { ADMIN_NAV, navActivo, type GrupoNav } from './nav';
import { AdminContext, type AdminMe } from './admin-context';

const QUICK = 'var(--font-quicksand), sans-serif';
const BALOO = 'var(--font-baloo), cursive';

const sideBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
  padding: '11px 13px', borderRadius: 12, border: 'none', cursor: 'pointer',
  fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, background: 'transparent', color: ADMIN.tinta2,
};
const sideActive: React.CSSProperties = {
  ...sideBtn, background: ADMIN.claro, color: ADMIN.oscuro, cursor: 'default',
};
const chipPronto: React.CSSProperties = {
  background: ADMIN.burbuja, border: `1px solid ${ADMIN.borde}`, color: ADMIN.base,
  borderRadius: 999, padding: '2px 8px', fontSize: 10.5, fontWeight: 800,
};
// Badge de pases esperando a la familia: lo único del sidebar que trae número.
const chipPendientes: React.CSSProperties = {
  background: ADMIN.warnFondo, border: `1px solid ${ADMIN.warnBorde}`, color: ADMIN.warnTexto,
  borderRadius: 999, padding: '2px 8px', fontSize: 10.5, fontWeight: 800,
};
const tituloGrupo: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: ADMIN.tinta3, letterSpacing: '1.4px', padding: '18px 12px 6px',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [pendientes, setPendientes] = useState(0);
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

  // Badge de "Pases": los que todavía esperan a la familia. Aparte del gate y
  // en silencio (si falla, el sidebar no muestra número), y se recalcula al
  // navegar para que cancelar un pase se vea reflejado.
  useEffect(() => {
    if (esLogin || !me) return;
    (async () => {
      const r = await llamarAdmin<{ transferencias: unknown[] }>(
        'gestion-transferencias', 'listar', { estado: 'pendiente' },
      );
      if (r.ok) setPendientes((r.data.transferencias ?? []).length);
    })();
  }, [esLogin, me, pathname]);

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
  const visibles = ADMIN_NAV.filter((it) => !it.soloSuper || me.nivel === 'super');
  const grupo = (g?: GrupoNav) => visibles.filter((it) => it.grupo === g);

  // Un ítem del sidebar: el activo no es botón (no se navega a donde ya estás)
  // y el chip de la derecha depende del grupo.
  const item = (it: (typeof ADMIN_NAV)[number]) => {
    const chip = it.grupo === 'vision'
      ? <span style={chipPronto}>Pronto</span>
      : it.key === 'transferencias' && pendientes > 0
        ? <span style={chipPendientes}>{pendientes}</span>
        : null;
    const cuerpo = chip
      ? <><span style={{ flex: 1, textAlign: 'left' }}>{it.label}</span>{chip}</>
      : it.label;
    return it.key === activo
      ? <div key={it.key} style={sideActive}>{cuerpo}</div>
      : (
        <button key={it.key} onClick={() => router.push(it.ruta)} className="ad-nav" style={sideBtn}>
          {cuerpo}
        </button>
      );
  };

  return (
    <AdminContext.Provider value={me}>
      <div style={{ minHeight: '100vh', display: 'flex', animation: 'edFade .3s ease' }}>
        <aside style={{ width: 236, flexShrink: 0, background: ADMIN.carta, borderRight: `2px solid ${ADMIN.bordeCalido}`, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 3, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 20px' }}>
            <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: ADMIN.base, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: BALOO, fontWeight: 800, fontSize: 22 }}>E</div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 19, color: ADMIN.ink, letterSpacing: '-.4px' }}>EDUTIA</div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: ADMIN.tinta2, letterSpacing: '1.4px' }}>ADMINISTRACIÓN</div>
            </div>
          </div>
          {grupo(undefined).map(item)}
          <div style={tituloGrupo}>CUSTODIA DE DATOS</div>
          {grupo('custodia').map(item)}
          <div style={tituloGrupo}>VISIÓN</div>
          {grupo('vision').map(item)}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: ADMIN.burbuja, border: `1px solid ${ADMIN.borde}`, color: ADMIN.oscuro, fontFamily: QUICK, fontWeight: 700, fontSize: 12.5, lineHeight: 1.3 }}>
            {me.nivel === 'super' ? 'Rol: Super admin' : 'Rol: Operativo'}
          </div>
          <button onClick={signOut} className="ed-side" style={{ padding: 12, borderRadius: 12, background: 'none', border: 'none', color: ADMIN.tinta2, fontFamily: QUICK, fontWeight: 700, fontSize: 15, cursor: 'pointer', textAlign: 'left' }}>
            Cerrar sesión
          </button>
        </aside>
        <main style={{ flex: 1, minWidth: 0, padding: 'clamp(22px, 3.2vw, 38px)', overflowX: 'hidden', animation: 'edFade .25s ease' }}>
          {children}
        </main>
      </div>
    </AdminContext.Provider>
  );
}
