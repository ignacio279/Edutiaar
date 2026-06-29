// Modo prototipo — para entregar la Etapa 1 (arquitectura + diseño + login).
// Deja TODO visible y navegable, y el login real funcionando, pero apaga las
// acciones que dependen de SOL (practicar, chat con SOL, generar nodos en
// autoría): en vez de ejecutar, muestran un cartel cálido "Próximamente".
//
// Se prende con la variable de entorno NEXT_PUBLIC_MODO_PROTOTIPO=1 (en Vercel
// o en .env.local). Cuando SOL esté listo, se apaga el flag (o se borra la var)
// y todo vuelve a funcionar solo — sin tocar una línea de este código.
import { toast } from './toast';

export const MODO_PROTOTIPO = process.env.NEXT_PUBLIC_MODO_PROTOTIPO === '1';

export const MSG_PROXIMAMENTE = 'SOL está en camino 🌞 ¡Muy pronto vas a poder usar esto!';

// Si el modo prototipo está prendido: muestra el cartel y devuelve true (para
// cortar la acción → `if (proximamente()) return;`). Si está apagado: no hace
// nada y devuelve false, así la app sigue su curso normal.
export function proximamente(msg: string = MSG_PROXIMAMENTE): boolean {
  if (!MODO_PROTOTIPO) return false;
  toast(msg);
  return true;
}
