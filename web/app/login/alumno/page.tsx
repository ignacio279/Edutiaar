'use client';
// Login alumno (portado de scAlumnoLogin + scAlumnoPin + openAlumnoFlow + loginAlumno).
// Paso 1: avatares del aula (Edge Function aula-students con el secreto guardado).
// Paso 2: PIN → Edge Function alumno-login valida (secreto+PIN+lockout) y
// devuelve la sesión. El browser nunca ve las credenciales del chico.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { callFn } from '@/lib/edge';
import { getAula, clearAula } from '@/lib/aula';
import { toast } from '@/lib/toast';
import { animal, sol } from '@/lib/art';

const BALOO = 'var(--font-baloo), cursive';
const solHappy = `${sol('happy')} center/contain no-repeat`;

type Alumno = { id: string; nombre: string; avatar: string };

export default function LoginAlumno() {
  const router = useRouter();
  const supabase = createClient();
  const [alumnos, setAlumnos] = useState<Alumno[]>([]);
  const [busy, setBusy] = useState(true);
  const [step, setStep] = useState<'pick' | 'pin'>('pick');
  const [pinPerfil, setPinPerfil] = useState<Alumno | null>(null);
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const aula = getAula();
    if (!aula) {
      router.replace('/setup');
      return;
    }
    (async () => {
      const { ok, data } = await callFn<{ alumnos?: Alumno[] }>(
        'aula-students',
        aula,
      );
      setBusy(false);
      if (ok && data.alumnos) {
        setAlumnos(data.alumnos);
      } else {
        clearAula();
        router.replace('/setup');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loginAlumno(pinValue: string) {
    setBusy(true);
    const aula = getAula() || { codigo: '', secreto: '' };
    const { ok, data } = await callFn<{
      session?: { access_token: string; refresh_token: string };
      error?: string;
      dato?: number;
    }>('alumno-login', {
      codigo: aula.codigo,
      secreto: aula.secreto,
      perfilId: pinPerfil!.id,
      pin: pinValue,
    });
    setBusy(false);

    if (ok && data.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      router.push('/alumno');
      router.refresh();
      return;
    }

    setPin('');
    if (data.error === 'aula_invalida') {
      clearAula();
      toast('El aula cambió. Avisale a la seño.');
      router.replace('/setup');
      return;
    }
    setShake(true);
    setTimeout(() => setShake(false), 450);
    if (data.error === 'bloqueado') {
      toast(`Demasiados intentos. Esperá ${Math.ceil((data.dato || 900) / 60)} min`);
    } else {
      toast(`Ese no era tu número. Te quedan ${data.dato ?? '—'} intentos`);
    }
  }

  function pressDigit(d: string) {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) loginAlumno(next);
  }

  // ----- loading -----
  if (busy && alumnos.length === 0) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          animation: 'edFade .3s ease',
        }}
      >
        <div
          style={{
            width: 74,
            height: 74,
            animation: 'edBob 1.6s ease-in-out infinite',
            background: solHappy,
          }}
        />
        <p style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 19, color: '#7A6F5F' }}>
          Entrando al aula…
        </p>
      </div>
    );
  }

  // ----- paso PIN -----
  if (step === 'pin') {
    const s = pinPerfil || { nombre: '', avatar: 'fox', id: '' };
    const keyBtn = (label: React.ReactNode, onClick: () => void, keyVal: string) => (
      <button
        key={keyVal}
        onClick={onClick}
        className="ed-key"
        style={{
          width: '100%',
          height: 64,
          border: '2px solid #EFE3CE',
          background: '#FFFCF5',
          borderRadius: 18,
          fontFamily: BALOO,
          fontWeight: 700,
          fontSize: 28,
          color: '#3A332A',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {label}
      </button>
    );
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 22px',
          animation: 'edFade .3s ease',
        }}
      >
        <button
          onClick={() => {
            setStep('pick');
            setPin('');
          }}
          style={backBtn}
        >
          ‹ Volver
        </button>
        <div
          style={{
            width: 120,
            height: 120,
            background: `${animal(s.avatar)} center/contain no-repeat`,
          }}
        />
        <h1
          style={{
            fontFamily: BALOO,
            fontWeight: 800,
            fontSize: 'clamp(26px,5vw,38px)',
            margin: '10px 0 2px',
            color: '#3A332A',
          }}
        >
          Hola, {s.nombre}
        </h1>
        <p style={{ fontSize: 17, color: '#7A6F5F', margin: '0 0 22px', fontWeight: 600 }}>
          Tocá tu número secreto
        </p>
        <div
          style={{
            display: 'flex',
            gap: 14,
            marginBottom: 26,
            animation: shake ? 'edShake .4s ease' : undefined,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => {
            const on = i < pin.length;
            return (
              <span
                key={i}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: `2.5px solid ${on ? '#F4A93B' : '#E2C9A0'}`,
                  background: on ? '#F4A93B' : 'transparent',
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,72px)',
            gap: 12,
            maxWidth: 260,
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) =>
            keyBtn(d, () => pressDigit(String(d)), `d${d}`),
          )}
          {keyBtn('⌫', () => setPin((p) => p.slice(0, -1)), 'del')}
          {keyBtn(0, () => pressDigit('0'), 'd0')}
          <span key="spacer" />
        </div>
      </div>
    );
  }

  // ----- paso avatares -----
  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px 64px', animation: 'edFade .3s ease' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => router.push('/')} style={{ ...backBtn, position: 'static', padding: '8px 4px' }}>
            ‹ Volver
          </button>
          <button
            onClick={() => {
              clearAula();
              router.push('/setup');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#C77E3A',
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Cambiar aula
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <div style={{ width: 84, height: 84, margin: '0 auto', animation: 'edBob 4.5s ease-in-out infinite', background: solHappy }} />
          <h1
            style={{
              fontFamily: BALOO,
              fontWeight: 800,
              fontSize: 'clamp(32px,5.5vw,48px)',
              margin: '8px 0 4px',
              color: '#3A332A',
            }}
          >
            ¡Hola! Tocá tu carita
          </h1>
          <p style={{ fontSize: 18, color: '#7A6F5F', margin: 0, fontWeight: 600 }}>
            Elegí tu animal para entrar
          </p>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
            gap: 22,
            marginTop: 38,
          }}
        >
          {alumnos.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setPinPerfil(s);
                setPin('');
                setStep('pin');
              }}
              className="ed-student"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '22px 14px 18px',
                background: '#FFFCF5',
                border: '2.5px solid #EFE3CE',
                borderRadius: 28,
                cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(120,90,40,.1)',
              }}
            >
              <div
                style={{
                  width: 'clamp(96px,13vw,120px)',
                  height: 'clamp(96px,13vw,120px)',
                  background: `${animal(s.avatar)} center/contain no-repeat`,
                }}
              />
              <span style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 22, color: '#3A332A' }}>
                {s.nombre}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = {
  position: 'absolute',
  top: 24,
  left: 24,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  background: 'none',
  border: 'none',
  color: '#7A6F5F',
  fontWeight: 700,
  fontSize: 16,
  cursor: 'pointer',
};
