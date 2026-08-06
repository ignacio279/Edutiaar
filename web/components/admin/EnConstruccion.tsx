'use client';
// Placeholder de las rutas stub de Fase 0 (Dashboard admin v3). Congelado.
// Cada stub tiene UN work-package dueño que reemplaza su page.tsx completa.
import { ADMIN } from '@/lib/admin/tema';

const BALOO = 'var(--font-baloo), cursive';

export default function EnConstruccion({ titulo }: { titulo: string }) {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 26, color: ADMIN.ink, margin: '0 0 12px' }}>{titulo}</h1>
      <div style={{ background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 22, padding: '22px 24px', color: ADMIN.medio, fontWeight: 700 }}>
        En construcción.
      </div>
    </div>
  );
}
