// admin-costos (WP6 — Dashboard admin v3): costos de la API y salud técnica.
// Solo LECTURAS (por eso no audita: "toda mutación audita" no aplica acá).
// Guard verificarAdmin (plataforma_admin) + service_role para leer uso_api
// (server-only, insert-only — la llenan las fns Claude vía _shared/uso.ts).
// MVP (D6): trae las filas crudas del rango acotado y agrega on-demand en TS
// puro (./agregar.ts, testeable desde Node). Si uso_api todavía está vacía
// (la instrumentación llega en la Fase final), todo devuelve ceros.
import { cors, json } from '../_shared/cors.ts';
import { verificarAdmin } from '../_shared/admin.ts';
import {
  agruparUso, metricasSalud, rangoValido, saludPorFuncion, serieSemanal, totalizar,
  SIN_COLEGIO, type FilaUso,
} from './agregar.ts';

// Tope de filas por consulta (MVP): con el tope diario de ejercicios (240) y
// los topes de LUNA, 90 días de una escuela piloto entran cómodos. Si algún
// día se queda corto, el paso siguiente es agregar en SQL, no subir el tope.
const MAX_FILAS = 10000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await verificarAdmin(req);
    if (ctx instanceof Response) return ctx;
    const { sb } = ctx;

    const body = await req.json();
    const accion = body?.accion;
    const rango = rangoValido(body?.rango_dias);
    const desde = new Date(Date.now() - rango * 86400000).toISOString();

    const traerFilas = async (escuelaId?: string): Promise<FilaUso[]> => {
      let q = sb
        .from('uso_api')
        .select('escuela_id, funcion, costo_usd, ok, latencia_ms, tokens_entrada, tokens_salida, created_at')
        .gte('created_at', desde)
        .order('created_at', { ascending: false }) // orden que exige la racha de errores
        .limit(MAX_FILAS);
      if (escuelaId) q = q.eq('escuela_id', escuelaId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as FilaUso[]).map((f) => ({ ...f, costo_usd: Number(f.costo_usd) || 0 }));
    };

    switch (accion) {
      // Costos del rango agrupados por colegio o por función.
      case 'costos': {
        const agrupar = body?.agrupar;
        if (agrupar !== 'colegio' && agrupar !== 'funcion') return json({ error: 'agrupar_invalido' }, 400);
        const filas = await traerFilas();
        const grupos = agruparUso(filas, agrupar === 'colegio' ? 'escuela_id' : 'funcion');
        if (agrupar === 'colegio') {
          const ids = grupos.map((g) => g.clave).filter((c) => c !== SIN_COLEGIO);
          const nombres = new Map<string, string>();
          if (ids.length) {
            const { data: escs } = await sb.from('escuela').select('id, nombre').in('id', ids);
            for (const e of (escs ?? []) as { id: string; nombre: string }[]) nombres.set(e.id, e.nombre);
          }
          for (const g of grupos) {
            g.nombre = g.clave === SIN_COLEGIO ? 'Sin colegio' : (nombres.get(g.clave) ?? 'Colegio borrado');
          }
        }
        return json({ rango_dias: rango, grupos, total: totalizar(filas) });
      }

      // Salud técnica por función: llamadas, tasa de error, p50/p95, racha
      // actual de errores. `global` resume todas las funciones juntas.
      case 'salud': {
        const filas = await traerFilas();
        return json({ rango_dias: rango, funciones: saludPorFuncion(filas), global: metricasSalud(filas) });
      }

      // Costos de UN colegio: total, desglose por función y serie semanal.
      case 'detalle_colegio': {
        const escuelaId = body?.escuela_id;
        if (typeof escuelaId !== 'string' || !escuelaId.trim()) return json({ error: 'falta_escuela_id' }, 400);
        const filas = await traerFilas(escuelaId);
        const { data: esc } = await sb.from('escuela').select('nombre').eq('id', escuelaId).maybeSingle();
        return json({
          rango_dias: rango,
          nombre: (esc as { nombre?: string } | null)?.nombre ?? null,
          total: totalizar(filas),
          por_funcion: agruparUso(filas, 'funcion'),
          serie: serieSemanal(filas, rango, Date.now()),
        });
      }

      default:
        return json({ error: 'accion_desconocida' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
