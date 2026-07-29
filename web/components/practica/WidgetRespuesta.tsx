'use client';
// Widget de respuesta de la práctica: ramifica por ej.formato hacia el input adecuado
// (botones de opción múltiple, campo de texto, y —próximos slices— fichas para ordenar y
// columnas para unir). Todo TAP (nada de drag&drop: son tablets/celulares de escuela). La
// corrección NO vive acá: el widget construye la RespuestaDada y se la pasa a onResponder
// (page.tsx → esCorrecta). Se remonta por ejercicio (key={idx}), así su estado transitorio
// arranca limpio en cada pregunta.
import { useState } from 'react';
import { uiIcon } from '@/lib/art';
import { hablar, textoEjercicio } from '@/lib/voz';
import { formatoDe, mezclarDeterminista, type RespuestaDada } from '@/lib/correccion';
import type { Ejercicio } from '@/lib/practica';

const BALOO = 'var(--font-baloo), cursive';
const QUICK = 'var(--font-quicksand), sans-serif';

type ResultadoResp = { correcto: boolean; revelado: boolean };
type Props = {
  ej: Ejercicio;
  temaColor: string;
  ttsOk: boolean;
  onResponder: (dada: RespuestaDada, ts: number) => ResultadoResp;
};

// Botón "Escuchar la pregunta" (idéntico al histórico). El texto a leer sale de textoEjercicio,
// que para 'escribir' lee SOLO la consigna (no la respuesta).
function BotonEscuchar({ leer }: { leer: () => string }) {
  return (
    <button
      onClick={() => hablar(leer())}
      aria-label="Escuchar la pregunta"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 12, background: '#FBEFD9', border: '1.5px solid #F4D9A6', borderRadius: 999, padding: '8px 16px', cursor: 'pointer', color: '#C77E3A', fontFamily: QUICK, fontWeight: 700, fontSize: 15 }}
    >
      <span style={{ width: 20, height: 20, background: `${uiIcon('speaker')} center/contain no-repeat` }} />
      Escuchar la pregunta
    </button>
  );
}

// ── Opción múltiple (comportamiento histórico) ───────────────────────────────
function WidgetOpciones({ ej, ttsOk, onResponder }: Props) {
  const [selWrong, setSelWrong] = useState<number | null>(null);
  return (
    <>
      {ttsOk && <BotonEscuchar leer={() => textoEjercicio({ enunciado: ej.enunciado, formato: 'opciones', opciones: ej.opciones })} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(108px,1fr))', gap: 12 }}>
        {ej.opciones.map((op, i) => {
          const big = op.length <= 2;
          const wrong = selWrong === i;
          return (
            <button
              key={op + i}
              onClick={(e) => {
                const res = onResponder({ formato: 'opciones', opcion: op }, e.timeStamp);
                setSelWrong(!res.correcto && !res.revelado ? i : null);
              }}
              style={{
                minHeight: 66, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                fontFamily: BALOO, fontWeight: 800, fontSize: big ? 'clamp(32px,7vw,46px)' : 'clamp(16px,3vw,21px)',
                color: wrong ? '#BB4F3F' : '#3A332A', background: wrong ? '#F7E2DD' : '#FFFCF5',
                border: `2.5px solid ${wrong ? '#D46A5A' : '#EFE3CE'}`, borderRadius: 18, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(120,90,40,.07)', padding: '8px 12px', transition: 'transform .1s ease',
                animation: wrong ? 'edShake .4s ease' : undefined,
              }}
            >
              {op}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── Escribir la respuesta (tipos completar/producir en grados medianos+) ─────
function WidgetEscribir({ ej, temaColor, ttsOk, onResponder }: Props) {
  const [texto, setTexto] = useState('');
  const [shake, setShake] = useState(false);
  const enviar = (ts: number) => {
    const t = texto.trim();
    if (!t) return;
    const res = onResponder({ formato: 'escribir', texto: t }, ts);
    if (!res.correcto && !res.revelado) { setShake(true); setTexto(''); } // reintento: sacudir y limpiar
  };
  return (
    <>
      {ttsOk && <BotonEscuchar leer={() => textoEjercicio({ enunciado: ej.enunciado, formato: 'escribir' })} />}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar(e.timeStamp); }}
          onAnimationEnd={() => setShake(false)}
          placeholder="Escribí tu respuesta…"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Tu respuesta"
          style={{
            flex: 1, minWidth: 0, border: '2.5px solid #EFE3CE', borderRadius: 16, padding: '14px 16px',
            fontFamily: BALOO, fontWeight: 700, fontSize: 'clamp(18px,3.4vw,24px)', color: '#3A332A',
            background: '#FFFCF5', outline: 'none', animation: shake ? 'edShake .4s ease' : undefined,
          }}
        />
        <button
          onClick={(e) => enviar(e.timeStamp)}
          disabled={!texto.trim()}
          style={{
            minHeight: 56, background: temaColor, color: '#fff', border: 'none', borderRadius: 16, padding: '0 22px',
            fontFamily: QUICK, fontWeight: 800, fontSize: 17, cursor: texto.trim() ? 'pointer' : 'default', opacity: texto.trim() ? 1 : 0.5,
          }}
        >
          Responder
        </button>
      </div>
    </>
  );
}

// Estilo compartido de las fichas tocables (ordenar / unir). Targets grandes (tap en tablet).
const chip = (activo: boolean, color: string): React.CSSProperties => ({
  minHeight: 56, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '10px 18px',
  fontFamily: BALOO, fontWeight: 800, fontSize: 'clamp(17px,3.2vw,22px)', borderRadius: 16, cursor: 'pointer',
  background: activo ? color : '#FFFCF5', color: activo ? '#fff' : '#3A332A',
  border: `2.5px solid ${activo ? color : '#EFE3CE'}`, boxShadow: '0 4px 12px rgba(120,90,40,.07)',
});
const botonListo = (habil: boolean, color: string): React.CSSProperties => ({
  minHeight: 54, marginTop: 14, width: '100%', background: habil ? color : '#EFE3CE', color: '#fff', border: 'none',
  borderRadius: 16, fontFamily: QUICK, fontWeight: 800, fontSize: 17, cursor: habil ? 'pointer' : 'default', opacity: habil ? 1 : 0.7,
});

// ── Ordenar fichas para armar una oración ────────────────────────────────────
function WidgetOrdenar({ ej, temaColor, ttsOk, onResponder }: Props) {
  // Fichas mostradas MEZCLADAS (determinista por id → estable al retomar). Trabajamos con
  // índices en `mezcladas`, no con el texto, para tolerar fichas repetidas ("la ... la").
  const [mezcladas] = useState(() => mezclarDeterminista(ej.opciones, ej.id));
  const [orden, setOrden] = useState<number[]>([]); // índices ya colocados, en orden
  const [shake, setShake] = useState(false);
  const enBandeja = mezcladas.map((_, i) => i).filter((i) => !orden.includes(i));
  const completo = orden.length === mezcladas.length && mezcladas.length > 0;
  const listo = (e: React.MouseEvent) => {
    if (!completo) return;
    const res = onResponder({ formato: 'ordenar', orden: orden.map((i) => mezcladas[i]) }, e.timeStamp);
    if (!res.correcto && !res.revelado) { setShake(true); setOrden([]); } // reintento: sacudir y devolver todo
  };
  return (
    <>
      {ttsOk && <BotonEscuchar leer={() => textoEjercicio({ enunciado: ej.enunciado, formato: 'ordenar', fichas: mezcladas })} />}
      {/* tira de respuesta (lo que va armando; tocar una ficha la devuelve a la bandeja) */}
      <div onAnimationEnd={() => setShake(false)}
        style={{ minHeight: 60, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 10, marginBottom: 12,
          border: '2px dashed #EFE3CE', borderRadius: 14, animation: shake ? 'edShake .4s ease' : undefined }}>
        {orden.length === 0
          ? <span style={{ color: '#A99', fontFamily: QUICK, fontWeight: 600, fontSize: 14, padding: '0 6px' }}>Tocá las fichas en orden…</span>
          : orden.map((i, pos) => (
              <button key={`o${pos}`} onClick={() => setOrden(orden.filter((_, p) => p !== pos))} style={chip(true, temaColor)}>{mezcladas[i]}</button>
            ))}
      </div>
      {/* bandeja de fichas disponibles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {enBandeja.map((i) => (
          <button key={`b${i}`} onClick={() => setOrden([...orden, i])} style={chip(false, temaColor)}>{mezcladas[i]}</button>
        ))}
      </div>
      <button onClick={listo} disabled={!completo} style={botonListo(completo, temaColor)}>¡Listo!</button>
    </>
  );
}

// ── Unir pares tocando (izquierda → derecha) ─────────────────────────────────
const PARES_COLORES = ['#6FB7D4', '#7FB069', '#D98E5A', '#C88AC0', '#E0B84B'];

function WidgetUnir({ ej, temaColor, ttsOk, onResponder }: Props) {
  const paresEj = ej.datos?.pares ?? [];
  const izqList = paresEj.map((p) => p.izq);
  // Columna derecha MEZCLADA (semilla distinta de la izquierda) para que no queden alineados.
  const [derList] = useState(() => mezclarDeterminista(paresEj.map((p) => p.der), `${ej.id}|d`));
  const [emparejado, setEmparejado] = useState<Record<number, number>>({}); // izqIdx → derIdx
  const [selIzq, setSelIzq] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const usadoPor = (j: number) => Object.keys(emparejado).map(Number).find((i) => emparejado[i] === j);
  const completo = Object.keys(emparejado).length === izqList.length && izqList.length > 0;

  const tapIzq = (i: number) => {
    if (i in emparejado) { const n = { ...emparejado }; delete n[i]; setEmparejado(n); setSelIzq(null); } // desarmar
    else setSelIzq(i);
  };
  const tapDer = (j: number) => {
    if (usadoPor(j) !== undefined) return; // der ya usada
    if (selIzq === null) return;
    setEmparejado({ ...emparejado, [selIzq]: j });
    setSelIzq(null);
  };
  const listo = (e: React.MouseEvent) => {
    if (!completo) return;
    const paresDados = izqList.map((izq, i) => ({ izq, der: derList[emparejado[i]] }));
    const res = onResponder({ formato: 'unir', pares: paresDados }, e.timeStamp);
    if (!res.correcto && !res.revelado) { setShake(true); setEmparejado({}); setSelIzq(null); }
  };
  return (
    <>
      {ttsOk && <BotonEscuchar leer={() => textoEjercicio({ enunciado: ej.enunciado, formato: 'unir', izq: izqList, der: derList })} />}
      <div onAnimationEnd={() => setShake(false)} style={{ display: 'flex', gap: 14, animation: shake ? 'edShake .4s ease' : undefined }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {izqList.map((t, i) => {
            const color = i in emparejado ? PARES_COLORES[i % PARES_COLORES.length] : (selIzq === i ? temaColor : '');
            return <button key={`i${i}`} onClick={() => tapIzq(i)} style={chip(color !== '', color || temaColor)}>{t}</button>;
          })}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {derList.map((t, j) => {
            const dueno = usadoPor(j);
            const color = dueno !== undefined ? PARES_COLORES[dueno % PARES_COLORES.length] : '';
            return <button key={`d${j}`} onClick={() => tapDer(j)} style={chip(color !== '', color || temaColor)}>{t}</button>;
          })}
        </div>
      </div>
      <button onClick={listo} disabled={!completo} style={botonListo(completo, temaColor)}>¡Listo!</button>
    </>
  );
}

export function WidgetRespuesta(props: Props) {
  switch (formatoDe(props.ej)) {
    case 'escribir':
      return <WidgetEscribir {...props} />;
    case 'ordenar':
      return <WidgetOrdenar {...props} />;
    case 'unir':
      return <WidgetUnir {...props} />;
    case 'opciones':
    default:
      return <WidgetOpciones {...props} />;
  }
}
