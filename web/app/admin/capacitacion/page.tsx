'use client';
// Pantalla de VISIÓN — Capacitación docente (fase Observatorio y avisos, WP-D).
// Pieza de venta: cuenta a dónde va EDUTIA, sin datos ni Edge Functions.
// Vive en el grupo VISIÓN del sidebar.
// A propósito NO lista cursos con barras de avance: el resto del panel muestra
// datos reales y un "3 de 4 colegios" inventado se lee como si lo fuera.
import { ADMIN } from '@/lib/admin/tema';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

const CARACTERISTICAS: readonly [string, string][] = [
  ['Trayectos por nivel', 'Cursos cortos pensados para plurigrado.'],
  ['Certificados', 'Constancias descargables para presentar en supervisión.'],
  ['Seguimiento por jurisdicción', 'Avance agregado por provincia.'],
  ['Contenido co-creado', 'Materiales armados junto a ministerios y ONGs.'],
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
