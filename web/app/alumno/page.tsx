// El alumno logueado va directo al mapa (como en el front viejo: loadMeAndRoute
// rutea alumno → mapa). /alumno redirige a /alumno/mapa.
import { redirect } from 'next/navigation';

export default function Alumno() {
  redirect('/alumno/mapa');
}
