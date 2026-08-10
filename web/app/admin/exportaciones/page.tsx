'use client';
// Pantalla de VISIÓN — Exportaciones para el ministerio (fase Observatorio y
// avisos, WP-D; restyle 2026-08 al mock Admin.dc.html: banner "Próximamente" +
// filas de reporte con chips PDF/CSV deshabilitados). Pieza de venta: cuenta a
// dónde va EDUTIA, sin datos ni Edge Functions. Vive en el grupo VISIÓN.
import { ADMIN } from '@/lib/admin/tema';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

// Contenido ilustrativo: así se van a ver los reportes cuando se puedan bajar.
const REPORTES: readonly { titulo: string; periodo: string; jurisdiccion: string }[] = [
  { titulo: 'Avance de aprendizaje por zona', periodo: 'Julio 2026', jurisdiccion: 'Misiones' },
  { titulo: 'Adopción y uso de la plataforma', periodo: '2° trimestre 2026', jurisdiccion: 'Todas' },
  { titulo: 'Temas con mayor dificultad', periodo: 'Marzo–Julio 2026', jurisdiccion: 'Corrientes' },
];

const chipFormato: React.CSSProperties = {
  background: ADMIN.hover, border: `1.5px solid ${ADMIN.chipBorde}`, color: ADMIN.tinta3,
  borderRadius: 999, padding: '8px 16px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5,
};

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
        {REPORTES.map((r) => (
          <div key={r.titulo} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 20, padding: '18px 20px' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 16, color: ADMIN.ink }}>{r.titulo}</div>
              <div style={{ fontFamily: NUNITO, fontSize: 13, color: ADMIN.tinta2, fontWeight: 600, marginTop: 2 }}>
                {r.periodo} · {r.jurisdiccion} · datos agregados y anónimos
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={chipFormato}>PDF</span>
              <span style={chipFormato}>CSV</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
