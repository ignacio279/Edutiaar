// Registro de uso de la API de Claude → tabla uso_api (WP6 — Costos y salud).
// ESTE ES EL CONTRATO que la Fase final cablea en las 7 Edge Functions que
// llaman a Claude (sol, sol-chat, dividir-nodos, evaluar-sesion,
// generador-ejercicios, luna-chat, luna-boletin) SIN diseñar nada nuevo:
//
//   const t0 = Date.now();
//   const r = await fetch('https://api.anthropic.com/v1/messages', ...);
//   // éxito (después de r.json()):
//   registrarUso(sb, { escuela_id: escuelaId, perfil_id: user.id,
//     funcion: 'luna-chat', modelo: MODELO, usage: data.usage,
//     latencia_ms: Date.now() - t0, ok: true });
//   // error (!r.ok o catch):
//   registrarUso(sb, { escuela_id: escuelaId, perfil_id: user.id,
//     funcion: 'luna-chat', modelo: MODELO, latencia_ms: Date.now() - t0,
//     ok: false, error_codigo: `claude_${r.status}` });
//
// Reglas del contrato: UN evento por llamada a la Messages API (éxito o error);
// `sb` tiene que ser el cliente service_role (uso_api es server-only);
// fire-and-forget: nunca se awaitea ni se propaga un error — un fallo del
// registro JAMÁS rompe la función que atiende al usuario (solo console.error).
// El costo se calcula acá con _shared/precios.ts (único archivo de precios).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calcularCostoUsd } from './precios.ts';

export type EventoUso = {
  escuela_id?: string | null;
  perfil_id?: string | null;
  funcion: string;
  modelo?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
  latencia_ms?: number | null;
  ok: boolean;
  error_codigo?: string | null;
};

export function registrarUso(sb: SupabaseClient, ev: EventoUso): void {
  const entrada = ev.usage?.input_tokens ?? 0;
  const salida = ev.usage?.output_tokens ?? 0;
  sb.from('uso_api')
    .insert({
      escuela_id: ev.escuela_id ?? null,
      perfil_id: ev.perfil_id ?? null,
      funcion: ev.funcion,
      modelo: ev.modelo ?? null,
      tokens_entrada: entrada,
      tokens_salida: salida,
      costo_usd: calcularCostoUsd(ev.modelo ?? '', entrada, salida),
      ok: ev.ok,
      latencia_ms: ev.latencia_ms ?? null,
      error_codigo: ev.error_codigo ?? null,
    })
    .then(({ error }) => {
      if (error) console.error('uso_api_fallo', ev.funcion, error.message);
    });
}
