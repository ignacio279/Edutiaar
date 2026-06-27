// Toast simple (portado de app.js). Inyecta un nodo en <body>; clase .ed-toast
// definida en globals.css. Solo cliente.
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(msg: string) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.ed-toast').forEach((n) => n.remove());
  const t = document.createElement('div');
  t.className = 'ed-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2800);
}
