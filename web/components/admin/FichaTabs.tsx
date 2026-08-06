'use client';
// Tabs de la ficha de colegio (Dashboard admin v3). Congelado en Fase 0: las
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
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: `2px solid ${ADMIN.bordeCalido}`, paddingBottom: 10, marginBottom: 22 }}>
      {TABS.map((t) => {
        const ruta = t.sub ? `${base}/${t.sub}` : base;
        const activa = pathname === ruta;
        return activa ? (
          <div key={t.key} style={{ background: ADMIN.claro, color: ADMIN.oscuro, borderRadius: 999, padding: '7px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14 }}>
            {t.label}
          </div>
        ) : (
          <button key={t.key} onClick={() => router.push(ruta)} className="ed-side" style={{ background: 'none', border: 'none', color: ADMIN.tinta2, borderRadius: 999, padding: '7px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
