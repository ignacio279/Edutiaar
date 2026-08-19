'use client';
// Login del panel de administración (Dashboard admin v3). Link aparte: no hay
// ningún acceso desde la app principal. Si la cuenta no es admin (RPC
// admin_nivel null), se cierra la sesión y se muestra un error genérico — no
// se revela si el usuario existe ni si es de docente.
//
// El campo es "Usuario", no "Email": quien opera el panel tipea `admin` y
// `emailDeUsuario` le completa el dominio (Auth solo entiende emails). Un
// email completo pasa tal cual, así las cuentas nominales siguen andando.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN } from '@/lib/admin/tema';
import { emailDeUsuario } from '@/lib/admin/login';

const BALOO = 'var(--font-baloo), cursive';
const NUNITO = 'var(--font-nunito)';
const QUICK = 'var(--font-quicksand), sans-serif';

const field: React.CSSProperties = {
  width: '100%', padding: '14px 16px', border: `2px solid ${ADMIN.bordeCalido}`,
  borderRadius: 14, fontFamily: NUNITO, fontSize: 16, color: ADMIN.ink,
  background: ADMIN.suave, marginBottom: 18, outline: 'none',
};

export default function AdminLogin() {
  const router = useRouter();
  const supabase = createClient();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function entrar() {
    if (busy) return;
    const email = emailDeUsuario(usuario);
    if (!email || !password) { setError('Credenciales inválidas.'); return; }
    setBusy(true);
    setError('');
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
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
      <div style={{ width: '100%', maxWidth: 392, background: ADMIN.carta, border: `2px solid ${ADMIN.bordeCalido}`, borderRadius: 26, padding: '38px 34px', boxShadow: '0 12px 34px rgba(120,90,40,.12)' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: ADMIN.base, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: BALOO, fontWeight: 800, fontSize: 28, marginBottom: 18 }}>E</div>
        <h1 style={{ fontFamily: BALOO, fontWeight: 700, fontSize: 30, color: ADMIN.ink, margin: '0 0 4px' }}>Administración</h1>
        <p style={{ fontSize: 15.5, color: ADMIN.tinta2, margin: '0 0 26px', fontWeight: 600 }}>Panel de operación de EDUTIA</p>

        <label style={label}>Usuario</label>
        <input
          type="text"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') entrar(); }}
          style={field}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <label style={label}>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') entrar(); }}
          style={{ ...field, marginBottom: 8 }}
          autoComplete="current-password"
        />

        {error && (
          <div style={{ background: ADMIN.dangerFondo, border: `1.5px solid ${ADMIN.dangerBorde}`, color: ADMIN.danger, borderRadius: 12, padding: '11px 14px', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{error}</div>
        )}

        <button
          onClick={entrar}
          className="ed-primary"
          style={{ width: '100%', background: ADMIN.base, color: '#fff', border: 'none', borderRadius: 14, padding: 15, fontFamily: QUICK, fontWeight: 700, fontSize: 17, cursor: 'pointer', boxShadow: `0 8px 20px ${ADMIN.sombraCTA}`, marginTop: 14 }}
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <Link href="/" style={{ display: 'block', textAlign: 'center', marginTop: 18, fontSize: 13.5, fontWeight: 700, color: ADMIN.tinta2, textDecoration: 'none' }}>‹ Volver a EDUTIA</Link>
      </div>
    </div>
  );
}

const label: React.CSSProperties = {
  display: 'block', fontSize: 14, fontWeight: 700, color: ADMIN.tinta2, marginBottom: 7,
};
