'use client';
// Login docente (portado de scDocenteLogin + loginDocente). Email + pass directo
// contra Supabase Auth. La sesión queda en cookies (@supabase/ssr) → el server
// la ve y puede proteger /docente.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import { sol } from '@/lib/art';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito)';

const field: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  border: '2px solid #EFE3CE',
  borderRadius: 14,
  fontFamily: NUNITO,
  fontSize: 16,
  color: '#3A332A',
  background: '#FBF4E6',
  outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 700,
  color: '#7A6F5F',
  marginBottom: 7,
};

export default function LoginDocente() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('ana@edutia.ar');
  const [password, setPassword] = useState('edutia123');
  const [busy, setBusy] = useState(false);

  async function loginDocente() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      toast('Email o contraseña incorrectos');
      return;
    }
    router.push('/docente');
    router.refresh();
  }

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 22px',
        animation: 'edFade .3s ease',
      }}
    >
      <button
        onClick={() => router.push('/')}
        style={{
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
        }}
      >
        ‹ Volver
      </button>
      <div
        style={{
          position: 'absolute',
          top: 28,
          right: 36,
          width: 60,
          height: 60,
          opacity: 0.9,
          background: `${sol('happy')} center/contain no-repeat`,
        }}
      />
      <div
        style={{
          width: '100%',
          maxWidth: 392,
          background: '#FFFCF5',
          border: '2px solid #EFE3CE',
          borderRadius: 30,
          padding: '38px 34px',
          boxShadow: '0 12px 34px rgba(120,90,40,.14)',
        }}
      >
        <h1
          style={{
            fontFamily: QUICK,
            fontWeight: 700,
            fontSize: 30,
            color: '#3A332A',
            margin: '0 0 4px',
          }}
        >
          Hola, seño
        </h1>
        <p style={{ fontSize: 16, color: '#7A6F5F', margin: '0 0 26px', fontWeight: 600 }}>
          Ingresá a tu panel
        </p>

        <label style={labelStyle}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loginDocente()}
          style={{ ...field, marginBottom: 18 }}
        />

        <label style={labelStyle}>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loginDocente()}
          style={{ ...field, marginBottom: 26 }}
        />

        <button
          onClick={loginDocente}
          className="ed-primary"
          style={{
            width: '100%',
            background: '#6FB7D4',
            color: '#fff',
            border: 'none',
            borderRadius: 14,
            padding: 15,
            fontFamily: QUICK,
            fontWeight: 700,
            fontSize: 18,
            cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(111,183,212,.3)',
          }}
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}
