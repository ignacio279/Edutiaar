'use client';
// Banner de anuncios de la plataforma (Dashboard admin v3, WP8). Autónomo:
// lo montan las páginas docente (Fase final) sin props. Lee `anuncio` con el
// cliente del navegador — la RLS (anuncio_select_docente, 0020) ya resuelve
// vigencia, alcance y rol, así que lo que llega se puede mostrar tal cual.
// Muestra el más reciente no descartado; el ✕ persiste el descarte por id en
// localStorage (edutia_anuncio_visto_<id>) y pasa al siguiente si hay.
// Paleta cálida general de la app (aviso), NO la del admin.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const QUICK = 'var(--font-quicksand), sans-serif';
const NUNITO = 'var(--font-nunito), sans-serif';

type Anuncio = { id: string; titulo: string; cuerpo: string };

const claveVisto = (id: string) => `edutia_anuncio_visto_${id}`;

export default function AnuncioBanner() {
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [descartados, setDescartados] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('anuncio')
          .select('id,titulo,cuerpo')
          .order('created_at', { ascending: false });
        if (error || !data) return; // sin anuncios o error → null silencioso
        const filas = data as Anuncio[];
        const vistos = new Set<string>();
        for (const a of filas) {
          if (typeof localStorage !== 'undefined' && localStorage.getItem(claveVisto(a.id))) {
            vistos.add(a.id);
          }
        }
        setAnuncios(filas);
        setDescartados(vistos);
      } catch {
        /* red caída o storage bloqueado → no se muestra nada */
      }
    })();
  }, []);

  const visible = anuncios.find((a) => !descartados.has(a.id));
  if (!visible) return null;

  function descartar(id: string) {
    try {
      localStorage.setItem(claveVisto(id), '1');
    } catch {
      /* storage lleno o bloqueado: se descarta solo en esta vista */
    }
    setDescartados((prev) => new Set(prev).add(id));
  }

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        background: '#FBEFD9', border: '2px solid #F4D9A6', borderRadius: 16,
        padding: '13px 16px', marginBottom: 18, animation: 'edFade .3s ease',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: QUICK, fontWeight: 700, fontSize: 14.5, color: '#8A6215', marginBottom: 2 }}>
          {visible.titulo}
        </div>
        <div style={{ fontFamily: NUNITO, fontSize: 14, color: '#8A6215', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
          {visible.cuerpo}
        </div>
      </div>
      <button
        onClick={() => descartar(visible.id)}
        aria-label="Cerrar anuncio"
        title="Cerrar"
        style={{
          background: 'none', border: 'none', color: '#8A6215', fontFamily: QUICK,
          fontWeight: 700, fontSize: 17, lineHeight: 1, cursor: 'pointer', padding: '2px 4px', flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
