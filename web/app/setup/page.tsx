'use client';
// Configurar aula (portado de scAulaSetup + enterSetup/selectColegio/submitSetup).
// La seño elige colegio → aula → código. Valida contra la Edge Function
// aula-students; si ok, guarda el aula en el device y va a los avatares.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { callFn } from '@/lib/edge';
import { setAula } from '@/lib/aula';
import { toast } from '@/lib/toast';
import { sol } from '@/lib/art';

const BALOO = 'var(--font-baloo), cursive';
const NUNITO = 'var(--font-nunito)';

type Escuela = { id: string; nombre: string };
type Aula = { id: string; nombre: string; codigo: string };

const field: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  border: '2px solid #EFE3CE',
  borderRadius: 14,
  fontFamily: NUNITO,
  fontSize: 16,
  color: '#3A332A',
  background: '#FBF4E6',
  marginBottom: 16,
  outline: 'none',
};

export default function Setup() {
  const router = useRouter();
  const supabase = createClient();
  const [escuelas, setEscuelas] = useState<Escuela[]>([]);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [escuelaId, setEscuelaId] = useState('');
  const [aulaId, setAulaId] = useState('');
  const [secreto, setSecreto] = useState('aula2026');
  const [busy, setBusy] = useState(false);

  async function loadAulas(eid: string) {
    const { data } = await supabase
      .from('aula')
      .select('id,nombre,codigo')
      .eq('escuela_id', eid)
      .order('nombre');
    const list = (data as Aula[]) || [];
    setAulas(list);
    setAulaId(list[0]?.id || '');
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('escuela')
        .select('id,nombre')
        .order('nombre');
      const list = (data as Escuela[]) || [];
      setEscuelas(list);
      if (list.length) {
        setEscuelaId(list[0].id);
        await loadAulas(list[0].id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitSetup() {
    if (busy) return;
    const aula = aulas.find((a) => a.id === aulaId);
    if (!aula) {
      toast('Elegí un aula');
      return;
    }
    setBusy(true);
    const { ok, data } = await callFn<{ alumnos?: unknown[] }>('aula-students', {
      codigo: aula.codigo,
      secreto,
    });
    setBusy(false);
    if (ok && data.alumnos) {
      setAula({ codigo: aula.codigo, secreto });
      router.push('/login/alumno');
    } else {
      toast('El código del aula no es correcto');
    }
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
          width: '100%',
          maxWidth: 392,
          background: '#FFFCF5',
          border: '2px solid #EFE3CE',
          borderRadius: 30,
          padding: '34px 34px',
          boxShadow: '0 12px 34px rgba(120,90,40,.14)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            margin: '0 auto 6px',
            background: `${sol('happy')} center/contain no-repeat`,
          }}
        />
        <h1
          style={{
            fontFamily: BALOO,
            fontWeight: 800,
            fontSize: 26,
            color: '#3A332A',
            margin: '0 0 4px',
          }}
        >
          Configurar el aula
        </h1>
        <p
          style={{
            fontSize: 15,
            color: '#7A6F5F',
            margin: '0 0 22px',
            fontWeight: 600,
          }}
        >
          Lo hace la seño, una sola vez en la compu.
        </p>

        <div style={{ textAlign: 'left' }}>
          <label style={labelStyle}>Colegio</label>
          <select
            value={escuelaId}
            onChange={(e) => {
              setEscuelaId(e.target.value);
              loadAulas(e.target.value);
            }}
            style={field}
          >
            {escuelas.length ? (
              escuelas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))
            ) : (
              <option>Cargando…</option>
            )}
          </select>

          <label style={labelStyle}>Aula</label>
          <select
            value={aulaId}
            onChange={(e) => setAulaId(e.target.value)}
            style={field}
          >
            {aulas.length ? (
              aulas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))
            ) : (
              <option>—</option>
            )}
          </select>

          <label style={labelStyle}>Código del aula</label>
          <input
            type="password"
            value={secreto}
            onChange={(e) => setSecreto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSetup();
            }}
            style={{ ...field, marginBottom: 24 }}
          />
        </div>

        <button
          onClick={submitSetup}
          className="ed-primary"
          style={{
            width: '100%',
            background: '#F4A93B',
            color: '#fff',
            border: 'none',
            borderRadius: 14,
            padding: 15,
            fontFamily: BALOO,
            fontWeight: 700,
            fontSize: 18,
            cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(244,169,59,.3)',
          }}
        >
          {busy ? 'Abriendo…' : 'Abrir el aula'}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 700,
  color: '#7A6F5F',
  marginBottom: 7,
};
