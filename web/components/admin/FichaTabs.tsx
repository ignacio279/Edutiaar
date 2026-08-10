'use client';
// Tabs de la ficha de colegio (Dashboard admin v3, restyle 2026-08 al mock
// Admin.dc.html: activa llena en petróleo, inactivas outline cálidas). Las
// tabs son FIJAS; cada work-package implementa su página destino, nadie edita
// esta lista (clave anti-conflictos del trabajo en paralelo).
import { usePathname, useRouter } from 'next/navigation';
import { ADMIN } from '@/lib/admin/tema';

const QUICK = 'var(--font-quicksand), sans-serif';

const TABS: readonly { key: string; label: string; sub: string }[] = [
  { key: 'resumen', label: 'Resumen', sub: '' },
  { key: 'maestras', label: 'Maestras', sub: 'maestras' },
  { key: 'accesos', label: 'Accesos', sub: 'accesos' },
  { key: 'features', label: 'Features', sub: 'features' },
  { key: 'notas', label: 'Notas', sub: 'notas' },
  { key: 'uso', label: 'Uso', sub: 'uso' },
  { key: 'costos', label: 'Costos', sub: 'costos' },
] as const;

export default function FichaTabs({ colegioId }: { colegioId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const base = `/admin/colegios/${colegioId}`;

  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 22 }}>
      {TABS.map((t) => {
        const ruta = t.sub ? `${base}/${t.sub}` : base;
        const activa = pathname === ruta;
        return activa ? (
          <div key={t.key} style={{ background: ADMIN.base, color: '#fff', borderRadius: 999, padding: '9px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5 }}>
            {t.label}
          </div>
        ) : (
          <button key={t.key} onClick={() => router.push(ruta)} className="ad-ghost-warm" style={{ background: ADMIN.carta, border: `1.5px solid ${ADMIN.bordeCalido}`, color: ADMIN.tinta2, borderRadius: 999, padding: '9px 18px', fontFamily: QUICK, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
