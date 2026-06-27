'use client';
// Practicar (portado de scPracticar). Saludo de SOL; la práctica real con SOL
// llega en una etapa posterior.
import { sol } from '@/lib/art';
import { LENGUA } from '@/lib/lengua';
import { useMe } from '@/lib/me-context';

export default function Practicar() {
  const me = useMe();
  const greeting = me?.nombre
    ? `¡Hola ${me.nombre}! ${LENGUA.greeting.replace('¡Hola! ', '')}`
    : LENGUA.greeting;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 22px',
        textAlign: 'center',
        animation: 'edFade .3s ease',
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          animation: 'edBob 4.5s ease-in-out infinite',
          background: `${sol('cheer')} center/contain no-repeat`,
        }}
      />
      <div
        style={{
          maxWidth: 520,
          margin: '18px 0 0',
          background: '#FFFCF5',
          border: '2px solid #EFE3CE',
          borderRadius: 20,
          borderBottomLeftRadius: 6,
          padding: '16px 20px',
          boxShadow: '0 4px 12px rgba(120,90,40,.08)',
        }}
      >
        <p style={{ margin: 0, fontFamily: 'var(--font-nunito)', fontWeight: 700, fontSize: 18, color: '#3A332A', lineHeight: 1.35 }}>
          {greeting}
        </p>
      </div>
      <p style={{ margin: '22px 0 0', color: '#7A6F5F', fontWeight: 600 }}>
        Muy pronto vas a practicar de verdad con SOL.
      </p>
    </div>
  );
}
