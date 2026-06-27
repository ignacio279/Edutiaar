'use client';
// Mapa de Lengua (portado de scMapa). Contenido estático de muestra; los nodos
// reales (estado por alumno) llegan con SOL en una etapa posterior.
import { useRouter } from 'next/navigation';
import { alpha, catmull, nodeIcon, starBadge, lockBadge } from '@/lib/art';
import { LENGUA, SC, COORDS, LEGEND } from '@/lib/lengua';

const BALOO = 'var(--font-baloo), cursive';

export default function Mapa() {
  const router = useRouter();

  return (
    <div style={{ flex: 1, width: '100%', maxWidth: 1000, margin: '0 auto', padding: '24px clamp(16px,4vw,40px) 48px', animation: 'edFade .3s ease' }}>
      <h1
        style={{
          fontFamily: BALOO,
          fontWeight: 800,
          fontSize: 'clamp(26px,4.5vw,40px)',
          margin: 0,
          color: '#3A332A',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ width: 22, height: 22, borderRadius: 8, background: LENGUA.color }} />
        Tu mapa de Lengua
      </h1>
      <p style={{ fontSize: 16, color: '#7A6F5F', margin: '6px 0 0', fontWeight: 600 }}>
        Seguí el camino. Tocá una parada para practicar.
      </p>

      <div style={{ position: 'relative', width: 'min(920px,100%)', aspectRatio: '920/540', margin: '18px auto 0' }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
        >
          <path
            d={catmull(COORDS)}
            fill="none"
            stroke="#E2C9A0"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="0.5 9"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {LENGUA.labels.map((label, i) => {
          const st = LENGUA.states[i];
          const color = SC[st];
          const badge = st === 'domina' ? starBadge() : st === 'bloqueado' ? lockBadge() : null;
          const [x, y] = COORDS[i];
          return (
            <button
              key={label}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%,-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                width: 'clamp(92px,12vw,118px)',
                padding: 0,
              }}
            >
              <span
                style={{
                  position: 'relative',
                  width: 'clamp(74px,9.5vw,94px)',
                  height: 'clamp(74px,9.5vw,94px)',
                  borderRadius: '50%',
                  background: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 8px 18px ${alpha(color, 0.34)}`,
                  border: '5px solid #FFFCF5',
                }}
              >
                <div style={{ width: '48%', height: '48%', background: `${nodeIcon(LENGUA.icons[i])} center/contain no-repeat` }} />
                {badge && (
                  <div style={{ position: 'absolute', top: -5, right: -5, width: 24, height: 24, background: `${badge} center/contain no-repeat` }} />
                )}
              </span>
              <span
                style={{
                  fontFamily: BALOO,
                  fontWeight: 700,
                  fontSize: 'clamp(12px,1.5vw,15px)',
                  color: '#4A3B32',
                  background: '#FFFCF5',
                  border: '1.5px solid #EFE3CE',
                  borderRadius: 999,
                  padding: '4px 13px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 6px rgba(120,90,40,.08)',
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', marginTop: 24 }}>
        {LEGEND.map((l) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: l.c, display: 'inline-block', boxShadow: `0 2px 5px ${alpha(l.c, 0.4)}` }} />
            <span style={{ fontSize: 14, color: '#7A6F5F', fontWeight: 700 }}>{l.label}</span>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: 28 }}>
        <button
          onClick={() => router.push('/alumno/practicar')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: '#F4A93B',
            color: '#fff',
            border: 'none',
            borderRadius: 999,
            padding: '16px 34px',
            fontFamily: BALOO,
            fontWeight: 700,
            fontSize: 20,
            cursor: 'pointer',
            boxShadow: '0 8px 22px rgba(244,169,59,.32)',
          }}
        >
          Practicar Lengua con SOL
        </button>
      </div>
    </div>
  );
}
