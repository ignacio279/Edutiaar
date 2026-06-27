'use client';
// Inicio (portado de scInicio). Elegir rol: alumno → /login/alumno, seño → /login/docente.
import { useRouter } from 'next/navigation';
import { sol } from '@/lib/art';

const BALOO = 'var(--font-baloo), cursive';

export default function Inicio() {
  const router = useRouter();

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 22px',
        animation: 'edFade .3s ease',
      }}
    >
      {/* paisaje decorativo */}
      <svg
        viewBox="0 0 1200 300"
        preserveAspectRatio="xMidYMax slice"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: 'min(46vh,360px)',
          pointerEvents: 'none',
        }}
      >
        <path d="M0 160 Q300 100 600 150 T1200 140 V300 H0 Z" fill="#D9E8CB" />
        <path
          d="M0 205 Q260 150 540 200 T1080 200 Q1150 208 1200 196 V300 H0 Z"
          fill="#A8CE93"
        />
        <circle cx="980" cy="118" r="34" fill="#FFC24B" opacity=".5" />
        <g>
          <rect x="146" y="205" width="8" height="30" fill="#9C6B43" />
          <circle cx="150" cy="203" r="20" fill="#6FA058" />
          <circle cx="136" cy="209" r="14" fill="#7FB069" />
          <circle cx="164" cy="209" r="14" fill="#5E9049" />
        </g>
        <g>
          <rect x="1056" y="210" width="8" height="28" fill="#9C6B43" />
          <circle cx="1060" cy="208" r="18" fill="#6FA058" />
          <circle cx="1047" cy="214" r="12.6" fill="#7FB069" />
          <circle cx="1073" cy="214" r="12.6" fill="#5E9049" />
        </g>
        <g>
          <rect x="296" y="225" width="8" height="25" fill="#9C6B43" />
          <circle cx="300" cy="223" r="15" fill="#6FA058" />
          <circle cx="289" cy="229" r="10.5" fill="#7FB069" />
          <circle cx="311" cy="229" r="10.5" fill="#5E9049" />
        </g>
        <path d="M0 250 Q320 205 660 250 T1200 244 V300 H0 Z" fill="#7FB069" />
      </svg>

      <div style={{ position: 'relative', textAlign: 'center', maxWidth: 600 }}>
        {/* SOL (sol del art module, animado) */}
        <div
          style={{
            width: 'clamp(124px,18vw,176px)',
            height: 'clamp(124px,18vw,176px)',
            margin: '0 auto',
            background: `${sol('happy')} center/contain no-repeat`,
            animation: 'edBob 4.5s ease-in-out infinite',
            filter: 'drop-shadow(0 10px 22px rgba(244,169,59,.3))',
          }}
        />
        <h1
          style={{
            fontFamily: BALOO,
            fontWeight: 800,
            fontSize: 'clamp(56px,10vw,92px)',
            margin: '10px 0 4px',
            letterSpacing: '-1.5px',
            color: '#3A332A',
            lineHeight: 1,
          }}
        >
          EDUTIA
        </h1>
        <p
          style={{
            fontSize: 'clamp(16px,2.4vw,20px)',
            color: '#7A6F5F',
            margin: '0 0 42px',
            fontWeight: 700,
          }}
        >
          Aprender, de a poquito, con SOL
        </p>
        <div
          style={{
            display: 'flex',
            gap: 22,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={() => router.push('/login/alumno')}
            className="ed-role ed-role--alumno"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 15,
              width: 236,
              padding: '30px 24px',
              background: '#FFFCF5',
              border: '2px solid #EFE3CE',
              borderRadius: 30,
              cursor: 'pointer',
              boxShadow: '0 8px 22px rgba(120,90,40,.13)',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 92,
                height: 92,
                borderRadius: '50%',
                background: '#FBEFD9',
              }}
            >
              <svg viewBox="0 0 100 100" style={{ width: 52, height: 52 }}>
                <path
                  d="M34 28 q-5 0 -5 9 M66 28 q5 0 5 9"
                  fill="none"
                  stroke="#C77E3A"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <rect x="24" y="30" width="52" height="58" rx="21" fill="#F4A93B" />
                <path d="M24 56 V50 a26 24 0 0 1 52 0 V56 Z" fill="#E89B42" />
                <rect x="45" y="47" width="10" height="21" rx="3" fill="#E08C39" />
                <rect x="42" y="62" width="16" height="8" rx="3" fill="#FBEFD9" />
                <rect x="33" y="73" width="34" height="14" rx="6" fill="#FFFCF5" />
              </svg>
            </span>
            <span
              style={{
                fontFamily: BALOO,
                fontWeight: 700,
                fontSize: 23,
                color: '#3A332A',
              }}
            >
              Soy alumno
            </span>
          </button>

          <button
            onClick={() => router.push('/login/docente')}
            className="ed-role ed-role--sena"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 15,
              width: 236,
              padding: '30px 24px',
              background: '#FFFCF5',
              border: '2px solid #EFE3CE',
              borderRadius: 30,
              cursor: 'pointer',
              boxShadow: '0 8px 22px rgba(120,90,40,.13)',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 92,
                height: 92,
                borderRadius: '50%',
                background: '#E3EEF4',
              }}
            >
              <svg viewBox="0 0 100 100" style={{ width: 50, height: 50 }}>
                <path
                  d="M50 36 c-12 -9 -32 -3 -32 19 c0 21 15 33 23 33 c5 0 5 -2 9 -2 c4 0 4 2 9 2 c8 0 23 -12 23 -33 c0 -22 -20 -28 -32 -19 z"
                  fill="#D46A5A"
                />
                <path
                  d="M50 36 c0 -9 7 -16 17 -16 c-1 10 -7 16 -17 16 z"
                  fill="#7FB069"
                />
                <rect x="47" y="22" width="6" height="16" rx="3" fill="#7A5A38" />
              </svg>
            </span>
            <span
              style={{
                fontFamily: BALOO,
                fontWeight: 700,
                fontSize: 23,
                color: '#3A332A',
              }}
            >
              Soy la seño
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
