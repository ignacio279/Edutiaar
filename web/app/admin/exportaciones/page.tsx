'use client';
// Pantalla de VISIÓN — Exportaciones para el ministerio (fase Observatorio y
// avisos, WP-D). Pieza de venta: cuenta a dónde va EDUTIA, sin datos ni Edge
// Functions. Vive en el grupo VISIÓN del sidebar.
// A propósito NO lista reportes de ejemplo: el resto del panel muestra datos
// reales y una tabla con períodos y jurisdicciones inventados se lee como si
// lo fueran.
import { ADMIN } from '@/lib/admin/tema';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

const CARACTERISTICAS: readonly [string, string][] = [
  ['Reportes por jurisdicción', 'PDF y CSV por provincia y período.'],
  ['Siempre anónimos', 'La misma regla de muestra mínima del Observatorio.'],
  ['Formatos oficiales', 'Las plantillas que pida cada organismo.'],
  ['Programables', 'Envío periódico automático.'],
];

export default function ExportacionesPage() {
  return (
    <div>
      <div style={{ background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 18, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <span style={{ background: ADMIN.base, color: '#fff', borderRadius: 999, padding: '5px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5 }}>
          Próximamente
        </span>
        <span style={{ fontSize: 14, color: ADMIN.oscuro, fontWeight: 700 }}>
          Vista de concepto — reportes agregados para el ministerio.
        </span>
      </div>

      <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 6px' }}>
        Exportaciones para el ministerio
      </h1>
      <p style={{ fontFamily: NUNITO, fontSize: 15.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 18px', maxWidth: 720, lineHeight: 1.5 }}>
        Lo que hoy muestra el Observatorio en pantalla, mañana sale en el formato que cada organismo necesite,
        sin exponer jamás el dato de un alumno individual.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, maxWidth: 900 }}>
        {CARACTERISTICAS.map(([titulo, linea]) => (
          <div key={titulo} style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22 }}>
            <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16, color: ADMIN.ink }}>{titulo}</div>
            <div style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>{linea}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
