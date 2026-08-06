'use client';
// Login del panel de administración (Dashboard admin v3). Link aparte: no hay
// ningún acceso desde la app principal. Si la cuenta no es admin (RPC
// admin_nivel null), se cierra la sesión y se muestra un error genérico — no
// se revela si el email existe ni si es de docente.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN } from '@/lib/admin/tema';

const BALOO = 'var(--font-baloo), cursive';
const NUNITO = 'var(--font-nunito)';

const field: React.CSSProperties = {
  width: '100%', padding: '14px 16px', border: `2px solid ${ADMIN.bordeCalido}`,
  borderRadius: 14, fontFamily: NUNITO, fontSize: 16, color: ADMIN.ink,
  background: ADMIN.suave, marginBottom: 16, outline: 'none',
};

export default function AdminLogin() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function entrar() {
    if (busy) return;
    setBusy(true);
    setError('');
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (e) {
      setBusy(false);
      setError('Credenciales inválidas.');
      return;
    }
    const { data: nivel } = await supabase.rpc('admin_nivel');
    if (nivel !== 'super' && nivel !== 'operativo') {
      await supabase.auth.signOut();
      setBusy(false);
      setError('Credenciales inválidas.');
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 22px', animation: 'edFade .3s ease' }}>
      <div style={{ width: '100%', maxWidth: 392, background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 30, padding: '34px 34px', boxShadow: `0 12px 34px ${ADMIN.sombraFuerte}`, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 10px', borderRadius: 16, background: ADMIN.base, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: BALOO, fontWeight: 800, fontSize: 28 }}>E</div>
        <h1 style={{ fontFamily: BALOO, fontWeight: 800, fontSize: 25, color: ADMIN.ink, margin: '0 0 2px' }}>Administración</h1>
        <p style={{ fontSize: 14.5, color: ADMIN.tinta2, margin: '0 0 22px', fontWeight: 600 }}>Panel de operación de EDUTIA.</p>

        <div style={{ textAlign: 'left' }}>
          <label style={label}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={field} autoComplete="username" />
          <label style={label}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') entrar(); }}
            style={{ ...field, marginBottom: error ? 10 : 24 }}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p style={{ color: ADMIN.danger, fontWeight: 700, fontSize: 14, margin: '0 0 14px' }}>{error}</p>
        )}

        <button
          onClick={entrar}
          className="ed-primary"
          style={{ width: '100%', background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 14, padding: 15, fontFamily: BALOO, fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: `0 8px 20px ${ADMIN.sombraFuerte}` }}
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}

const label: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 7,
};
