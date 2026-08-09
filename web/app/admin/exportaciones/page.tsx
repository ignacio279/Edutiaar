'use client';
// Pantalla de VISIÓN — Exportaciones para el ministerio (fase Observatorio y
// avisos, WP-D). Pieza de venta: cuenta a dónde va EDUTIA, sin datos ni Edge
// Functions (cero estado). No va al nav a propósito (D-OA6): se llega desde el
// Observatorio y de acá se vuelve. NO usa <EnConstruccion> — no es un stub.
import { useRouter } from 'next/navigation';
import { ADMIN } from '@/lib/admin/tema';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

const MINIS: readonly [string, string][] = [
  ['Reportes por jurisdicción', 'CSV/PDF por provincia y período.'],
  ['Siempre anónimos', 'Misma regla de muestra mínima del Observatorio.'],
  ['Formatos oficiales', 'Plantillas que pida cada organismo.'],
  ['Programables', 'Envío periódico automático.'],
];

export default function ExportacionesPage() {
  const router = useRouter();
  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 'clamp(24px,4vw,30px)', color: ADMIN.ink, margin: '0 0 16px' }}>
        Exportaciones para el ministerio
      </h1>

      <div style={{ background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 22, padding: '24px 26px' }}>
        <span style={{ background: ADMIN.claro, color: ADMIN.oscuro, borderRadius: 999, padding: '5px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5 }}>
          Próximamente
        </span>
        <p style={{ fontFamily: NUNITO, fontSize: 15.5, color: ADMIN.ink, fontWeight: 600, lineHeight: 1.65, margin: '14px 0 20px' }}>
          Reportes agregados y anónimos, listos para descargar y presentar: lo que
          hoy muestra el Observatorio en pantalla, mañana sale en el formato que
          cada ministerio u organismo necesite, sin exponer jamás el dato de un
          alumno individual.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          {MINIS.map(([titulo, linea]) => (
            <div key={titulo} style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.borde}`, borderRadius: 16, padding: '14px 16px' }}>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 15, color: ADMIN.oscuro, marginBottom: 4 }}>{titulo}</div>
              <div style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, lineHeight: 1.5 }}>{linea}</div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => router.push('/admin/observatorio')}
        style={{ background: 'none', border: 'none', color: ADMIN.medio, fontFamily: QUICK, fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: 0, marginTop: 16 }}
      >
        ← Volver al Observatorio
      </button>
    </div>
  );
}
