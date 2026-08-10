'use client';
// Pantalla de VISIÓN — Capacitación docente (fase Observatorio y avisos, WP-D;
// restyle 2026-08 al mock Admin.dc.html: banner "Próximamente" + tarjetas de
// curso con barra de avance). Pieza de venta: cuenta a dónde va EDUTIA, sin
// datos ni Edge Functions (cero estado). Vive en el grupo VISIÓN del sidebar.
import { ADMIN } from '@/lib/admin/tema';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

// Contenido ilustrativo: así se va a ver cuando existan los trayectos reales.
const CURSOS: readonly { tipo: string; titulo: string; desc: string; avance: string; pct: number }[] = [
  { tipo: 'Curso · 4 módulos', titulo: 'Primeros pasos con SOL', desc: 'Cómo arrancar la práctica diaria con los chicos.', avance: '3 de 4 colegios', pct: 75 },
  { tipo: 'Curso · 6 módulos', titulo: 'LUNA para boletines', desc: 'Revisar, ajustar y aprobar boletines en minutos.', avance: '2 de 4 colegios', pct: 50 },
  { tipo: 'Recurso · guía', titulo: 'Plurigrado con EDUTIA', desc: 'Estrategias para aulas de varios grados a la vez.', avance: '1 de 4 colegios', pct: 25 },
];

export default function CapacitacionPage() {
  return (
    <div>
      <div style={{ background: ADMIN.burbuja, border: `2px solid ${ADMIN.borde}`, borderRadius: 18, padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <span style={{ background: ADMIN.base, color: '#fff', borderRadius: 999, padding: '5px 14px', fontFamily: QUICK, fontWeight: 700, fontSize: 12.5 }}>
          Próximamente
        </span>
        <span style={{ fontSize: 14, color: ADMIN.oscuro, fontWeight: 700 }}>
          Vista de concepto — cursos y recursos para maestras.
        </span>
      </div>

      <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(26px, 3.6vw, 34px)', color: ADMIN.ink, margin: '0 0 6px' }}>
        Capacitación docente
      </h1>
      <p style={{ fontFamily: NUNITO, fontSize: 15.5, color: ADMIN.tinta2, fontWeight: 600, margin: '0 0 18px', maxWidth: 720, lineHeight: 1.5 }}>
        La seño que sostiene un aula plurigrado también merece su propio recorrido de aprendizaje: cursos a su
        ritmo y evidencia de avance que le sirva ante la supervisión y el ministerio.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, maxWidth: 900 }}>
        {CURSOS.map((c) => (
          <div key={c.titulo} style={{ background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 22, padding: 22 }}>
            <span style={{ background: ADMIN.hover, border: `1px solid ${ADMIN.chipBorde}`, color: ADMIN.tinta2, borderRadius: 999, padding: '3px 11px', fontSize: 11.5, fontWeight: 800 }}>
              {c.tipo}
            </span>
            <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 17, color: ADMIN.ink, marginTop: 10 }}>{c.titulo}</div>
            <div style={{ fontFamily: NUNITO, fontSize: 13.5, color: ADMIN.tinta2, fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>{c.desc}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, color: ADMIN.tinta2, margin: '14px 0 6px' }}>
              <span>Avance de los colegios</span>
              <span style={{ color: ADMIN.oscuro }}>{c.avance}</span>
            </div>
            <div style={{ height: 10, background: ADMIN.divisor, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${c.pct}%`, height: '100%', background: ADMIN.base, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
