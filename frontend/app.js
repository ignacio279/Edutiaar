// Cliente Supabase + prueba de conexión contra la base REMOTA.
// supabase-js por CDN (sin build, sin node_modules).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.EDUTIA_CONFIG;
if (!cfg) throw new Error("Falta config.js — copiá config.example.js a config.js");

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

// --- Prueba de conexión (smoke test) ---
const $ = (id) => document.getElementById(id);
const row = (label, ok, detail) =>
  `<li><b>${ok ? "✅" : "❌"} ${label}</b>${detail ? ` — ${detail}` : ""}</li>`;

async function probar() {
  const out = [];

  // 1) Cliente inicializado + endpoint alcanzable (auth siempre responde).
  try {
    const { error } = await supabase.auth.getSession();
    out.push(row("Conexión a Supabase", !error, error?.message || cfg.SUPABASE_URL));
  } catch (e) {
    out.push(row("Conexión a Supabase", false, e.message));
  }

  // 2) Lectura de una tabla de contenido como anon.
  //    Con RLS y sin sesión, anon NO ve filas → debe devolver 0 sin error.
  //    Eso prueba conexión Y que el RLS está cerrando bien.
  try {
    const { data, error } = await supabase.from("materia").select("*");
    if (error) {
      out.push(row("Query a 'materia'", false, error.message));
    } else {
      out.push(row("Query a 'materia' (anon)", true,
        `${data.length} filas visibles — RLS ${data.length === 0 ? "bloqueando ✔" : "abierto ⚠"}`));
    }
  } catch (e) {
    out.push(row("Query a 'materia'", false, e.message));
  }

  $("status").innerHTML = `<ul>${out.join("")}</ul>`;
}

probar();
