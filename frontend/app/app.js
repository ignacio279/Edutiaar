// EDUTIA — front conectado a Supabase (Etapa 1, login endurecido).
// Docente: email+pass directo. Alumno: aula (secreto) → avatares de SU aula
// (vía Edge Function) → PIN → Edge Function valida (secreto+PIN+lockout) y
// devuelve la sesión. El browser nunca ve las credenciales del chico.

const cfg = window.EDUTIA_CONFIG;
if (!cfg) throw new Error('Falta ../config.js (window.EDUTIA_CONFIG)');
if (!window.supabase) throw new Error('Falta vendor/supabase.js');
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

// Arte SVG puro (testeable) — ver frontend/app/art.js
import { alpha, catmull, sol, animal, nodeIcon, starBadge, lockBadge } from './art.js';

const ARROW = '‹';
const solHappy = sol('happy');

// ---------- arte/data del mapa (verbatim del mockup, solo Lengua) ----------
const SC = { domina: '#7FB069', camino: '#E89B42', reforzar: '#D46A5A', bloqueado: '#C9BCA6' };
const COORDS = [[14, 22], [36, 40], [58, 25], [81, 44], [60, 68], [33, 80]];

// Una materia (Lengua) — contenido estático de muestra (los nodos reales vienen en etapa 2)
const LENGUA = {
  nombre: 'Lengua', color: '#F4A93B',
  labels: ['Vocales', 'Sílabas', 'Palabras', 'Oraciones', 'Lectura', 'Cuento'],
  icons: ['vocales', 'silabas', 'palabras', 'oraciones', 'lectura', 'cuento'],
  states: ['domina', 'domina', 'reforzar', 'camino', 'bloqueado', 'bloqueado'],
  greeting: '¡Hola! Soy SOL. Cuando esté listo, vamos a practicar Lengua juntos: te voy a mostrar un dibujo y vos tocás la respuesta.',
};
const LEGEND = [
  { label: 'Lo domina', c: '#7FB069' },
  { label: 'En camino', c: '#E89B42' },
  { label: 'A reforzar', c: '#D46A5A' },
  { label: 'Bloqueado', c: '#C9BCA6' },
];

// ---------- aula en el device (localStorage) ----------
const AULA_LS = 'edutia_aula';
const getAula = () => { try { return JSON.parse(localStorage.getItem(AULA_LS)) || null; } catch { return null; } };
const setAula = (a) => localStorage.setItem(AULA_LS, JSON.stringify(a));
const clearAula = () => localStorage.removeItem(AULA_LS);

// ---------- llamada a Edge Functions ----------
async function callFn(name, body) {
  const r = await fetch(`${cfg.SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await r.json(); } catch { /* vacío */ }
  return { ok: r.ok, status: r.status, data };
}

// ---------- estado ----------
const state = {
  screen: 'inicio', // inicio | aulaSetup | alumnoLogin | alumnoPin | docenteLogin | homeAlumno | homeDocente
  setup: { escuelas: [], aulas: [], escuelaId: '', aulaId: '' }, // selección colegio→aula
  alumnosAula: [],   // grilla de avatares del aula (de la Edge Function)
  pinPerfil: null,   // alumno elegido {id,nombre,avatar}
  pin: '',
  shake: false,
  busy: false,
  me: null,
  escuela: null,
  alumnos: [],
};
const root = document.getElementById('root');

// ---------- pantallas ----------
function scInicio() {
  return `
  <div style="position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 22px;animation:edFade .3s ease">
    <svg viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" style="position:absolute;left:0;right:0;bottom:0;width:100%;height:min(46vh,360px);pointer-events:none"><path d="M0 160 Q300 100 600 150 T1200 140 V300 H0 Z" fill="#D9E8CB"/><path d="M0 205 Q260 150 540 200 T1080 200 Q1150 208 1200 196 V300 H0 Z" fill="#A8CE93"/><circle cx="980" cy="118" r="34" fill="#FFC24B" opacity=".5"/><g><rect x="146" y="205" width="8" height="30" fill="#9C6B43"/><circle cx="150" cy="203" r="20" fill="#6FA058"/><circle cx="136" cy="209" r="14" fill="#7FB069"/><circle cx="164" cy="209" r="14" fill="#5E9049"/></g><g><rect x="1056" y="210" width="8" height="28" fill="#9C6B43"/><circle cx="1060" cy="208" r="18" fill="#6FA058"/><circle cx="1047" cy="214" r="12.6" fill="#7FB069"/><circle cx="1073" cy="214" r="12.6" fill="#5E9049"/></g><g><rect x="296" y="225" width="8" height="25" fill="#9C6B43"/><circle cx="300" cy="223" r="15" fill="#6FA058"/><circle cx="289" cy="229" r="10.5" fill="#7FB069"/><circle cx="311" cy="229" r="10.5" fill="#5E9049"/></g><path d="M0 250 Q320 205 660 250 T1200 244 V300 H0 Z" fill="#7FB069"/></svg>
    <div style="position:relative;text-align:center;max-width:600px">
      <svg viewBox="0 0 120 120" style="width:clamp(124px,18vw,176px);height:auto;animation:edBob 4.5s ease-in-out infinite;filter:drop-shadow(0 10px 22px rgba(244,169,59,.3))"><g stroke="#F4A93B" stroke-width="5.5" stroke-linecap="round"><line x1="100" y1="60" x2="113" y2="60"/><line x1="94.64" y1="80" x2="105.9" y2="86.5"/><line x1="80" y1="94.64" x2="86.5" y2="105.9"/><line x1="60" y1="100" x2="60" y2="113"/><line x1="40" y1="94.64" x2="33.5" y2="105.9"/><line x1="25.36" y1="80" x2="14.1" y2="86.5"/><line x1="20" y1="60" x2="7" y2="60"/><line x1="25.36" y1="40" x2="14.1" y2="33.5"/><line x1="40" y1="25.36" x2="33.5" y2="14.1"/><line x1="60" y1="20" x2="60" y2="7"/><line x1="80" y1="25.36" x2="86.5" y2="14.1"/><line x1="94.64" y1="40" x2="105.9" y2="33.5"/></g><circle cx="60" cy="60" r="39" fill="#FFC24B"/><circle cx="60" cy="60" r="39" fill="none" stroke="#F4A93B" stroke-width="4.5"/><circle cx="44" cy="68" r="6.5" fill="#E78F6B" opacity=".5"/><circle cx="76" cy="68" r="6.5" fill="#E78F6B" opacity=".5"/><circle cx="53" cy="57" r="3.4" fill="#3A332A"/><circle cx="67" cy="57" r="3.4" fill="#3A332A"/><path d="M50 65 q10 11 20 0" stroke="#3A332A" stroke-width="3.6" fill="none" stroke-linecap="round"/></svg>
      <h1 style="font-family:'Baloo 2',cursive;font-weight:800;font-size:clamp(56px,10vw,92px);margin:10px 0 4px;letter-spacing:-1.5px;color:#3A332A;line-height:1">EDUTIA</h1>
      <p style="font-size:clamp(16px,2.4vw,20px);color:#7A6F5F;margin:0 0 42px;font-weight:700">Aprender, de a poquito, con SOL</p>
      <div style="display:flex;gap:22px;flex-wrap:wrap;justify-content:center">
        <button data-action="goAlumno" class="ed-role ed-role--alumno" style="display:flex;flex-direction:column;align-items:center;gap:15px;width:236px;padding:30px 24px;background:#FFFCF5;border:2px solid #EFE3CE;border-radius:30px;cursor:pointer;box-shadow:0 8px 22px rgba(120,90,40,.13)">
          <span style="display:flex;align-items:center;justify-content:center;width:92px;height:92px;border-radius:50%;background:#FBEFD9"><svg viewBox="0 0 100 100" style="width:52px;height:52px"><path d="M34 28 q-5 0 -5 9 M66 28 q5 0 5 9" fill="none" stroke="#C77E3A" stroke-width="6" stroke-linecap="round"/><rect x="24" y="30" width="52" height="58" rx="21" fill="#F4A93B"/><path d="M24 56 V50 a26 24 0 0 1 52 0 V56 Z" fill="#E89B42"/><rect x="45" y="47" width="10" height="21" rx="3" fill="#E08C39"/><rect x="42" y="62" width="16" height="8" rx="3" fill="#FBEFD9"/><rect x="33" y="73" width="34" height="14" rx="6" fill="#FFFCF5"/></svg></span>
          <span style="font-family:'Baloo 2',cursive;font-weight:700;font-size:23px;color:#3A332A">Soy alumno</span>
        </button>
        <button data-action="goDocenteLogin" class="ed-role ed-role--sena" style="display:flex;flex-direction:column;align-items:center;gap:15px;width:236px;padding:30px 24px;background:#FFFCF5;border:2px solid #EFE3CE;border-radius:30px;cursor:pointer;box-shadow:0 8px 22px rgba(120,90,40,.13)">
          <span style="display:flex;align-items:center;justify-content:center;width:92px;height:92px;border-radius:50%;background:#E3EEF4"><svg viewBox="0 0 100 100" style="width:50px;height:50px"><path d="M50 36 c-12 -9 -32 -3 -32 19 c0 21 15 33 23 33 c5 0 5 -2 9 -2 c4 0 4 2 9 2 c8 0 23 -12 23 -33 c0 -22 -20 -28 -32 -19 z" fill="#D46A5A"/><path d="M50 36 c0 -9 7 -16 17 -16 c-1 10 -7 16 -17 16 z" fill="#7FB069"/><rect x="47" y="22" width="6" height="16" rx="3" fill="#7A5A38"/></svg></span>
          <span style="font-family:'Baloo 2',cursive;font-weight:700;font-size:23px;color:#3A332A">Soy la seño</span>
        </button>
      </div>
    </div>
  </div>`;
}

function scAulaSetup() {
  const s = state.setup;
  const fieldStyle = "width:100%;padding:14px 16px;border:2px solid #EFE3CE;border-radius:14px;font-family:'Nunito';font-size:16px;color:#3A332A;background:#FBF4E6;margin-bottom:16px;outline:none";
  const colOpts = s.escuelas.length
    ? s.escuelas.map((e) => `<option value="${e.id}" ${e.id === s.escuelaId ? 'selected' : ''}>${e.nombre}</option>`).join('')
    : '<option>Cargando…</option>';
  const aulaOpts = s.aulas.length
    ? s.aulas.map((a) => `<option value="${a.id}" ${a.id === s.aulaId ? 'selected' : ''}>${a.nombre}</option>`).join('')
    : '<option>—</option>';
  return `
  <div style="position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 22px;animation:edFade .3s ease">
    <button data-action="goInicio" style="position:absolute;top:24px;left:24px;display:inline-flex;align-items:center;gap:7px;background:none;border:none;color:#7A6F5F;font-weight:700;font-size:16px;cursor:pointer">${ARROW} Volver</button>
    <div style="width:100%;max-width:392px;background:#FFFCF5;border:2px solid #EFE3CE;border-radius:30px;padding:34px 34px;box-shadow:0 12px 34px rgba(120,90,40,.14);text-align:center">
      <div style="width:72px;height:72px;margin:0 auto 6px;background:${solHappy} center/contain no-repeat"></div>
      <h1 style="font-family:'Baloo 2',cursive;font-weight:800;font-size:26px;color:#3A332A;margin:0 0 4px">Configurar el aula</h1>
      <p style="font-size:15px;color:#7A6F5F;margin:0 0 22px;font-weight:600">Lo hace la seño, una sola vez en la compu.</p>
      <div style="text-align:left">
        <label style="display:block;font-size:14px;font-weight:700;color:#7A6F5F;margin-bottom:7px">Colegio</label>
        <select id="ed-colegio" style="${fieldStyle}">${colOpts}</select>
        <label style="display:block;font-size:14px;font-weight:700;color:#7A6F5F;margin-bottom:7px">Aula</label>
        <select id="ed-aula" style="${fieldStyle}">${aulaOpts}</select>
        <label style="display:block;font-size:14px;font-weight:700;color:#7A6F5F;margin-bottom:7px">Código del aula</label>
        <input id="ed-secreto" type="password" value="aula2026" style="${fieldStyle};margin-bottom:24px"/>
      </div>
      <button data-action="submitSetup" class="ed-primary" style="width:100%;background:#F4A93B;color:#fff;border:none;border-radius:14px;padding:15px;font-family:'Baloo 2',cursive;font-weight:700;font-size:18px;cursor:pointer;box-shadow:0 8px 20px rgba(244,169,59,.3)">${state.busy ? 'Abriendo…' : 'Abrir el aula'}</button>
    </div>
  </div>`;
}

function scAlumnoLogin() {
  if (state.busy && state.alumnosAula.length === 0) {
    return `<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;animation:edFade .3s ease">
      <div style="width:74px;height:74px;animation:edBob 1.6s ease-in-out infinite;background:${solHappy} center/contain no-repeat"></div>
      <p style="font-family:'Baloo 2',cursive;font-weight:700;font-size:19px;color:#7A6F5F">Entrando al aula…</p>
    </div>`;
  }
  const cards = state.alumnosAula.map((s) => `
    <button data-action="pickStudent" data-id="${s.id}" class="ed-student" style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:22px 14px 18px;background:#FFFCF5;border:2.5px solid #EFE3CE;border-radius:28px;cursor:pointer;box-shadow:0 6px 18px rgba(120,90,40,.1)">
      <div style="width:clamp(96px,13vw,120px);height:clamp(96px,13vw,120px);background:${animal(s.avatar)} center/contain no-repeat"></div>
      <span style="font-family:'Baloo 2',cursive;font-weight:700;font-size:22px;color:#3A332A">${s.nombre}</span>
    </button>`).join('');
  return `
  <div style="min-height:100vh;padding:40px 24px 64px;animation:edFade .3s ease">
    <div style="max-width:880px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <button data-action="goInicio" style="display:inline-flex;align-items:center;gap:7px;background:none;border:none;color:#7A6F5F;font-weight:700;font-size:16px;cursor:pointer;padding:8px 4px">${ARROW} Volver</button>
        <button data-action="changeAula" style="background:none;border:none;color:#C77E3A;font-weight:800;font-size:14px;cursor:pointer">Cambiar aula</button>
      </div>
      <div style="text-align:center;margin-top:8px">
        <div style="width:84px;height:84px;margin:0 auto;animation:edBob 4.5s ease-in-out infinite;background:${solHappy} center/contain no-repeat"></div>
        <h1 style="font-family:'Baloo 2',cursive;font-weight:800;font-size:clamp(32px,5.5vw,48px);margin:8px 0 4px;color:#3A332A">¡Hola! Tocá tu carita</h1>
        <p style="font-size:18px;color:#7A6F5F;margin:0;font-weight:600">Elegí tu animal para entrar</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:22px;margin-top:38px">${cards}</div>
    </div>
  </div>`;
}

function scAlumnoPin() {
  const s = state.pinPerfil || { nombre: '', avatar: 'fox' };
  const dots = Array.from({ length: 4 }).map((_, i) => {
    const on = i < state.pin.length;
    return `<span style="width:18px;height:18px;border-radius:50%;border:2.5px solid #E2C9A0;background:${on ? '#F4A93B' : 'transparent'};${on ? 'border-color:#F4A93B;' : ''}"></span>`;
  }).join('');
  const keyBtn = (label, action, extra = '') =>
    `<button data-action="${action}" ${extra} class="ed-key" style="height:64px;border:2px solid #EFE3CE;background:#FFFCF5;border-radius:18px;font-family:'Baloo 2',cursive;font-weight:700;font-size:28px;color:#3A332A;cursor:pointer;display:flex;align-items:center;justify-content:center">${label}</button>`;
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => keyBtn(d, 'digit', `data-d="${d}"`)).join('');
  return `
  <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 22px;animation:edFade .3s ease">
    <button data-action="goAlumno" style="position:absolute;top:24px;left:24px;display:inline-flex;align-items:center;gap:7px;background:none;border:none;color:#7A6F5F;font-weight:700;font-size:16px;cursor:pointer">${ARROW} Volver</button>
    <div style="width:120px;height:120px;background:${animal(s.avatar)} center/contain no-repeat"></div>
    <h1 style="font-family:'Baloo 2',cursive;font-weight:800;font-size:clamp(26px,5vw,38px);margin:10px 0 2px;color:#3A332A">Hola, ${s.nombre}</h1>
    <p style="font-size:17px;color:#7A6F5F;margin:0 0 22px;font-weight:600">Tocá tu número secreto</p>
    <div style="display:flex;gap:14px;margin-bottom:26px;${state.shake ? 'animation:edShake .4s ease' : ''}">${dots}</div>
    <div style="display:grid;grid-template-columns:repeat(3,72px);gap:12px;max-width:260px">
      ${digits}
      ${keyBtn('⌫', 'del')}
      ${keyBtn(0, 'digit', 'data-d="0"')}
      <span></span>
    </div>
  </div>`;
}

function scDocenteLogin() {
  return `
  <div style="position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 22px;animation:edFade .3s ease">
    <button data-action="goInicio" style="position:absolute;top:24px;left:24px;display:inline-flex;align-items:center;gap:7px;background:none;border:none;color:#7A6F5F;font-weight:700;font-size:16px;cursor:pointer">${ARROW} Volver</button>
    <div style="position:absolute;top:28px;right:36px;width:60px;height:60px;opacity:.9;background:${solHappy} center/contain no-repeat"></div>
    <div style="width:100%;max-width:392px;background:#FFFCF5;border:2px solid #EFE3CE;border-radius:30px;padding:38px 34px;box-shadow:0 12px 34px rgba(120,90,40,.14)">
      <h1 style="font-family:'Quicksand',sans-serif;font-weight:700;font-size:30px;color:#3A332A;margin:0 0 4px">Hola, seño</h1>
      <p style="font-size:16px;color:#7A6F5F;margin:0 0 26px;font-weight:600">Ingresá a tu panel</p>
      <label style="display:block;font-size:14px;font-weight:700;color:#7A6F5F;margin-bottom:7px">Email</label>
      <input id="ed-email" type="email" value="ana@edutia.ar" style="width:100%;padding:14px 16px;border:2px solid #EFE3CE;border-radius:14px;font-family:'Nunito';font-size:16px;color:#3A332A;background:#FBF4E6;margin-bottom:18px;outline:none"/>
      <label style="display:block;font-size:14px;font-weight:700;color:#7A6F5F;margin-bottom:7px">Contraseña</label>
      <input id="ed-pass" type="password" value="edutia123" style="width:100%;padding:14px 16px;border:2px solid #EFE3CE;border-radius:14px;font-family:'Nunito';font-size:16px;color:#3A332A;background:#FBF4E6;margin-bottom:26px;outline:none"/>
      <button data-action="loginDocente" class="ed-primary" style="width:100%;background:#6FB7D4;color:#fff;border:none;border-radius:14px;padding:15px;font-family:'Quicksand',sans-serif;font-weight:700;font-size:18px;cursor:pointer;box-shadow:0 8px 20px rgba(111,183,212,.3)">${state.busy ? 'Entrando…' : 'Entrar'}</button>
    </div>
  </div>`;
}

function scHomeAlumno() {
  const me = state.me || {};
  const e = state.escuela || {};
  return `
  <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 22px;animation:edFade .3s ease">
    <div style="width:110px;height:110px;animation:edBob 4.5s ease-in-out infinite;background:${animal(me.avatar || 'fox')} center/contain no-repeat"></div>
    <h1 style="font-family:'Baloo 2',cursive;font-weight:800;font-size:clamp(30px,6vw,46px);margin:10px 0 6px;color:#3A332A">¡Hola, ${me.nombre || ''}!</h1>
    <p style="font-size:18px;color:#7A6F5F;margin:0 0 26px;font-weight:600">Ya entraste. Pronto vas a ver tu mapa con SOL.</p>
    <div style="background:#FFFCF5;border:1.5px solid #EFE3CE;border-radius:22px;padding:22px 26px;max-width:420px;width:100%;box-shadow:0 6px 18px rgba(120,90,40,.08)">
      <div style="font-size:14px;color:#7A6F5F;font-weight:700;margin-bottom:4px">Tu escuela</div>
      <div style="font-family:'Baloo 2',cursive;font-weight:700;font-size:20px;color:#3A332A;margin-bottom:14px">${e.nombre || '—'}<div style="font-family:'Nunito';font-weight:600;font-size:15px;color:#7A6F5F">${e.zona || ''}</div></div>
      <div style="font-size:14px;color:#7A6F5F;font-weight:700;margin-bottom:4px">Vas a practicar</div>
      <div style="display:inline-flex;align-items:center;gap:9px;background:#FBEFD9;border:1.5px solid #F4D9A6;border-radius:999px;padding:7px 16px"><span style="width:14px;height:14px;border-radius:5px;background:#F4A93B"></span><span style="font-family:'Baloo 2',cursive;font-weight:700;font-size:17px;color:#3A332A">Lengua · ${me.grado || 3}° grado</span></div>
    </div>
    <button data-action="signOut" class="ed-signout" style="margin-top:26px;background:#FFFCF5;color:#7A6F5F;border:2px solid #EFE3CE;border-radius:999px;padding:12px 28px;font-family:'Baloo 2',cursive;font-weight:700;font-size:17px;cursor:pointer">Cerrar sesión</button>
  </div>`;
}

function scHomeDocente() {
  const me = state.me || {};
  const rows = state.alumnos.map((a) => `
    <div style="display:flex;align-items:center;gap:14px;background:#FFFCF5;border:1.5px solid #EFE3CE;border-radius:18px;padding:13px 18px">
      <div style="width:48px;height:48px;flex-shrink:0;background:${animal(a.avatar)} center/contain no-repeat"></div>
      <div style="flex:1;min-width:0"><div style="font-family:'Quicksand';font-weight:700;font-size:17px;color:#3A332A">${a.nombre}</div><div style="font-size:13.5px;color:#7A6F5F;font-weight:600">${a.grado || 3}° grado</div></div>
    </div>`).join('');
  return `
  <div style="min-height:100vh;padding:clamp(28px,5vw,52px) 22px;animation:edFade .3s ease">
    <div style="max-width:560px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:8px">
        <div style="width:54px;height:54px;background:${solHappy} center/contain no-repeat"></div>
        <div><h1 style="font-family:'Quicksand',sans-serif;font-weight:700;font-size:clamp(26px,4.5vw,34px);color:#3A332A;margin:0">Hola, seño ${me.nombre || ''}</h1><p style="font-size:15px;color:#7A6F5F;margin:3px 0 0;font-weight:600">Estos son tus alumnos</p></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:22px">${rows || '<p style="color:#7A6F5F;font-weight:600">Todavía no tenés alumnos.</p>'}</div>
      <button data-action="signOut" class="ed-signout" style="margin-top:26px;background:#FFFCF5;color:#7A6F5F;border:2px solid #EFE3CE;border-radius:999px;padding:12px 28px;font-family:'Quicksand';font-weight:700;font-size:16px;cursor:pointer">Cerrar sesión</button>
    </div>
  </div>`;
}

// Header compartido del alumno (avatar + nombre + toggle Mi mapa / Practicar + Salir)
function alumnoHeader(active) {
  const me = state.me || {};
  const pill = (label, action, on) =>
    `<button data-action="${action}" style="display:flex;align-items:center;gap:8px;border:none;cursor:pointer;border-radius:999px;padding:10px 20px;font-family:'Baloo 2',cursive;font-weight:700;font-size:16px;background:${on ? '#F4A93B' : 'transparent'};color:${on ? '#fff' : '#7A6F5F'}">${label}</button>`;
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:14px clamp(16px,4vw,40px);background:#FFFCF5;border-bottom:2px solid #EFE3CE;position:sticky;top:0;z-index:6">
    <div style="display:flex;align-items:center;gap:12px"><div style="width:48px;height:48px;background:${animal(me.avatar || 'fox')} center/contain no-repeat"></div><div style="line-height:1.15"><div style="font-family:'Baloo 2',cursive;font-weight:700;font-size:19px;color:#3A332A">Hola, ${me.nombre || ''}</div><div style="font-size:13px;color:#7A6F5F;font-weight:700">Lengua</div></div></div>
    <div style="display:flex;gap:6px;background:#FBEFD9;border-radius:999px;padding:5px">${pill('Mi mapa', 'goMapa', active === 'mapa')}${pill('Practicar', 'goPracticar', active === 'practicar')}</div>
    <button data-action="signOut" style="background:none;border:none;color:#7A6F5F;font-weight:700;font-size:15px;cursor:pointer">Salir</button>
  </div>`;
}

function scMapa() {
  const nodes = LENGUA.labels.map((label, i) => {
    const st = LENGUA.states[i], color = SC[st];
    const badge = st === 'domina' ? starBadge() : st === 'bloqueado' ? lockBadge() : null;
    const [x, y] = COORDS[i];
    return `
    <button style="position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:10px;background:none;border:none;cursor:pointer;width:clamp(92px,12vw,118px);padding:0">
      <span style="position:relative;width:clamp(74px,9.5vw,94px);height:clamp(74px,9.5vw,94px);border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px ${alpha(color, .34)};border:5px solid #FFFCF5">
        <div style="width:48%;height:48%;background:${nodeIcon(LENGUA.icons[i])} center/contain no-repeat"></div>
        ${badge ? `<div style="position:absolute;top:-5px;right:-5px;width:24px;height:24px;background:${badge} center/contain no-repeat"></div>` : ''}
      </span>
      <span style="font-family:'Baloo 2',cursive;font-weight:700;font-size:clamp(12px,1.5vw,15px);color:#4A3B32;background:#FFFCF5;border:1.5px solid #EFE3CE;border-radius:999px;padding:4px 13px;white-space:nowrap;box-shadow:0 2px 6px rgba(120,90,40,.08)">${label}</span>
    </button>`;
  }).join('');
  const legend = LEGEND.map((l) => `<div style="display:flex;align-items:center;gap:8px"><span style="width:16px;height:16px;border-radius:50%;background:${l.c};display:inline-block;box-shadow:0 2px 5px ${alpha(l.c, .4)}"></span><span style="font-size:14px;color:#7A6F5F;font-weight:700">${l.label}</span></div>`).join('');
  return `
  <div style="min-height:100vh;display:flex;flex-direction:column;animation:edFade .3s ease">
    ${alumnoHeader('mapa')}
    <div style="flex:1;width:100%;max-width:1000px;margin:0 auto;padding:24px clamp(16px,4vw,40px) 48px">
      <h1 style="font-family:'Baloo 2',cursive;font-weight:800;font-size:clamp(26px,4.5vw,40px);margin:0;color:#3A332A;display:flex;align-items:center;gap:12px"><span style="width:22px;height:22px;border-radius:8px;background:${LENGUA.color}"></span>Tu mapa de Lengua</h1>
      <p style="font-size:16px;color:#7A6F5F;margin:6px 0 0;font-weight:600">Seguí el camino. Tocá una parada para practicar.</p>
      <div style="position:relative;width:min(920px,100%);aspect-ratio:920/540;margin:18px auto 0">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible"><path d="${catmull(COORDS)}" fill="none" stroke="#E2C9A0" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.5 9" vector-effect="non-scaling-stroke"/></svg>
        ${nodes}
      </div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;justify-content:center;margin-top:24px">${legend}</div>
      <div style="text-align:center;margin-top:28px">
        <button data-action="goPracticar" style="display:inline-flex;align-items:center;gap:10px;background:#F4A93B;color:#fff;border:none;border-radius:999px;padding:16px 34px;font-family:'Baloo 2',cursive;font-weight:700;font-size:20px;cursor:pointer;box-shadow:0 8px 22px rgba(244,169,59,.32)">Practicar Lengua con SOL</button>
      </div>
    </div>
  </div>`;
}

function scPracticar() {
  const me = state.me || {};
  const greeting = me.nombre ? `¡Hola ${me.nombre}! ${LENGUA.greeting.replace('¡Hola! ', '')}` : LENGUA.greeting;
  return `
  <div style="min-height:100vh;display:flex;flex-direction:column;animation:edFade .3s ease">
    ${alumnoHeader('practicar')}
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 22px;text-align:center">
      <div style="width:120px;height:120px;animation:edBob 4.5s ease-in-out infinite;background:${sol('cheer')} center/contain no-repeat"></div>
      <div style="max-width:520px;margin:18px 0 0;background:#FFFCF5;border:2px solid #EFE3CE;border-radius:20px;border-bottom-left-radius:6px;padding:16px 20px;box-shadow:0 4px 12px rgba(120,90,40,.08)">
        <p style="margin:0;font-family:'Nunito';font-weight:700;font-size:18px;color:#3A332A;line-height:1.35">${greeting}</p>
      </div>
      <p style="margin:22px 0 0;color:#7A6F5F;font-weight:600">Muy pronto vas a practicar de verdad con SOL.</p>
    </div>
  </div>`;
}

const SCREENS = {
  inicio: scInicio, aulaSetup: scAulaSetup, alumnoLogin: scAlumnoLogin, alumnoPin: scAlumnoPin,
  docenteLogin: scDocenteLogin, mapa: scMapa, practicar: scPracticar, homeDocente: scHomeDocente,
};

function render() { root.innerHTML = (SCREENS[state.screen] || scInicio)(); }
function go(screen) { state.screen = screen; render(); try { window.scrollTo(0, 0); } catch {} }

let toastTimer = null;
function toast(msg) {
  document.querySelectorAll('.ed-toast').forEach((n) => n.remove());
  const t = document.createElement('div');
  t.className = 'ed-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2800);
}

// ---------- carga de datos / ruteo ----------
async function loadMeAndRoute() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { go('inicio'); return; }
  const { data: me, error } = await supabase.from('perfil').select('*').eq('id', user.id).single();
  if (error || !me) { await supabase.auth.signOut(); go('inicio'); toast('No encontramos tu perfil'); return; }
  state.me = me;
  if (me.rol === 'docente') {
    const { data: alumnos } = await supabase.from('perfil').select('nombre,avatar,grado').eq('rol', 'alumno').order('nombre');
    state.alumnos = alumnos || [];
    go('homeDocente');
  } else {
    go('mapa');
  }
}

// ---------- flujos alumno ----------
// Tap "Soy alumno": si el aula ya está configurada en el device → directo a
// los avatares; si no → setup colegio→aula→código.
async function openAlumnoFlow() {
  const aula = getAula();
  if (!aula) { enterSetup(); return; }
  state.alumnosAula = []; state.busy = true; go('alumnoLogin');
  const { ok, data } = await callFn('aula-students', aula);
  state.busy = false;
  if (ok && data.alumnos) { state.alumnosAula = data.alumnos; render(); }
  else { clearAula(); enterSetup(); }
}

// Setup: cargar colegios (REST anon, rápido) → elegir aula → código.
async function enterSetup() {
  state.setup = { escuelas: [], aulas: [], escuelaId: '', aulaId: '' };
  go('aulaSetup');
  const { data: escuelas } = await supabase.from('escuela').select('id,nombre').order('nombre');
  state.setup.escuelas = escuelas || [];
  if (state.setup.escuelas.length) await selectColegio(state.setup.escuelas[0].id);
  else render();
}

async function selectColegio(id) {
  state.setup.escuelaId = id;
  const { data: aulas } = await supabase.from('aula').select('id,nombre,codigo').eq('escuela_id', id).order('nombre');
  state.setup.aulas = aulas || [];
  state.setup.aulaId = state.setup.aulas[0]?.id || '';
  render();
}

async function submitSetup() {
  if (state.busy) return;
  const aula = state.setup.aulas.find((a) => a.id === state.setup.aulaId);
  const secreto = (document.getElementById('ed-secreto') || {}).value || '';
  if (!aula) { toast('Elegí un aula'); return; }
  state.busy = true; render();
  const { ok, data } = await callFn('aula-students', { codigo: aula.codigo, secreto });
  state.busy = false;
  if (ok && data.alumnos) {
    setAula({ codigo: aula.codigo, secreto });
    state.alumnosAula = data.alumnos;
    go('alumnoLogin');
  } else { render(); toast('El código del aula no es correcto'); }
}

async function loginAlumno() {
  if (state.busy) return;
  state.busy = true;
  const aula = getAula() || {};
  const { ok, data } = await callFn('alumno-login', {
    codigo: aula.codigo, secreto: aula.secreto, perfilId: state.pinPerfil.id, pin: state.pin,
  });
  state.busy = false;
  if (ok && data.session) {
    await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    await loadMeAndRoute();
    return;
  }
  state.pin = '';
  if (data.error === 'aula_invalida') { clearAula(); toast('El aula cambió. Avisale a la seño.'); enterSetup(); return; }
  state.shake = true; render();
  setTimeout(() => { state.shake = false; if (state.screen === 'alumnoPin') render(); }, 450);
  if (data.error === 'bloqueado') toast(`Demasiados intentos. Esperá ${Math.ceil((data.dato || 900) / 60)} min`);
  else toast(`Ese no era tu número. Te quedan ${data.dato ?? '—'} intentos`);
}

async function loginDocente() {
  if (state.busy) return;
  const email = ((document.getElementById('ed-email') || {}).value || '').trim();
  const password = (document.getElementById('ed-pass') || {}).value || '';
  state.busy = true; render();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  state.busy = false;
  if (error) { render(); toast('Email o contraseña incorrectos'); return; }
  await loadMeAndRoute();
}

async function signOut() {
  await supabase.auth.signOut();
  state.me = null; state.escuela = null; state.alumnos = []; state.pin = ''; state.pinPerfil = null;
  go('inicio');
}

// ---------- eventos ----------
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  switch (a) {
    case 'goAlumno': state.pin = ''; openAlumnoFlow(); break;
    case 'goDocenteLogin': go('docenteLogin'); break;
    case 'goInicio': go('inicio'); break;
    case 'submitSetup': submitSetup(); break;
    case 'changeAula': clearAula(); state.alumnosAula = []; enterSetup(); break;
    case 'pickStudent': {
      const s = state.alumnosAula.find((x) => x.id === el.dataset.id);
      if (s) { state.pinPerfil = s; state.pin = ''; go('alumnoPin'); }
      break;
    }
    case 'digit':
      if (state.busy || state.pin.length >= 4) break;
      state.pin += el.dataset.d;
      render();
      if (state.pin.length === 4) loginAlumno();
      break;
    case 'del': state.pin = state.pin.slice(0, -1); render(); break;
    case 'goMapa': go('mapa'); break;
    case 'goPracticar': go('practicar'); break;
    case 'loginDocente': loginDocente(); break;
    case 'signOut': signOut(); break;
  }
});
root.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'ed-email' || e.target.id === 'ed-pass') { e.preventDefault(); loginDocente(); }
  if (e.target.id === 'ed-secreto') { e.preventDefault(); submitSetup(); }
});
// selects del setup (colegio / aula)
root.addEventListener('change', (e) => {
  if (e.target.id === 'ed-colegio') selectColegio(e.target.value);
  else if (e.target.id === 'ed-aula') state.setup.aulaId = e.target.value;
});

// ---------- init: ¿sesión activa? ----------
render();
(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await loadMeAndRoute();
})();
