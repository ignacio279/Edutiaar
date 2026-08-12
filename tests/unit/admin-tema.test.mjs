// Tests del tema ADMIN y la navegación congelada del panel de administración
// (Fase 0, Dashboard admin v3). Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN, CAMPO, ETIQUETA, ESTADO_COLEGIO, ESTADO_MAESTRA, NIVEL_ADMIN, TIPO_COLEGIO,
  ESTADO_PASE, ESTADO_LICENCIA_PILL, ESTADO_INSTITUCION_PILL, ESTADO_ALUMNO_PILL,
  ESTADO_ARCO_PILL, TIPO_ARCO_PILL,
} from '../../web/lib/admin/tema.ts';
import { ESTADO_TRANSFERENCIA, ESTADO_ALUMNO_COPY } from '../../web/lib/transferencias.ts';
import { ESTADOS_LICENCIA, ESTADOS_INSTITUCION } from '../../web/lib/admin/licencias.ts';
import { ESTADO_ARCO, TIPOS_ARCO } from '../../web/lib/arco.ts';
import { VIOLETA } from '../../web/lib/luna-tema.ts';
import { ADMIN_NAV, navActivo } from '../../web/app/admin/nav.ts';
import { uiIcon } from '../../web/lib/art.ts';

test('ADMIN cubre todas las claves de VIOLETA (paridad estructural)', () => {
  for (const clave of Object.keys(VIOLETA)) {
    assert.ok(clave in ADMIN, `falta la clave ${clave} en ADMIN`);
    assert.ok(typeof ADMIN[clave] === 'string' && ADMIN[clave].length > 0, `clave ${clave} vacía`);
  }
});

test('los colores del tema son hex o rgba válidos', () => {
  for (const [clave, valor] of Object.entries(ADMIN)) {
    assert.match(valor, /^(#[0-9A-Fa-f]{6}|rgba?\(.+\))$/, `valor raro en ADMIN.${clave}: ${valor}`);
  }
});

test('las pills cubren todos los estados del dominio', () => {
  assert.deepEqual(Object.keys(ESTADO_COLEGIO).sort(), ['activo', 'archivado', 'suspendido', 'trial']);
  assert.deepEqual(Object.keys(ESTADO_MAESTRA).sort(), ['activo', 'suspendido']);
  assert.deepEqual(Object.keys(NIVEL_ADMIN).sort(), ['operativo', 'super']);
  assert.deepEqual(Object.keys(TIPO_COLEGIO).sort(), ['plurigrado', 'rural', 'unidocente']);
  for (const tupla of [...Object.values(ESTADO_COLEGIO), ...Object.values(ESTADO_MAESTRA), ...Object.values(NIVEL_ADMIN)]) {
    assert.equal(tupla.length, 3, 'cada pill es [bg, color, label]');
  }
});

test('ADMIN_NAV: rutas únicas bajo /admin y solo Administradores es soloSuper', () => {
  const rutas = ADMIN_NAV.map((it) => it.ruta);
  assert.equal(new Set(rutas).size, rutas.length, 'rutas duplicadas');
  for (const it of ADMIN_NAV) assert.ok(it.ruta.startsWith('/admin'), `ruta fuera de /admin: ${it.ruta}`);
  assert.deepEqual(ADMIN_NAV.filter((it) => it.soloSuper).map((it) => it.key), ['config']);
});

test('los íconos del nav existen en art.ts (no caen al fallback chevron)', () => {
  const fallback = uiIcon('__clave_inexistente__');
  for (const it of ADMIN_NAV) {
    assert.notEqual(uiIcon(it.icono), fallback, `ícono inexistente: ${it.icono} (${it.key})`);
  }
});

test('navActivo resuelve por prefijo, con ver-como → maestras', () => {
  assert.equal(navActivo('/admin'), 'inicio');
  assert.equal(navActivo('/admin/colegios'), 'colegios');
  assert.equal(navActivo('/admin/colegios/abc-123/features'), 'colegios');
  assert.equal(navActivo('/admin/maestras'), 'maestras');
  assert.equal(navActivo('/admin/ver-como/xyz'), 'maestras');
  assert.equal(navActivo('/admin/costos'), 'costos');
  assert.equal(navActivo('/admin/config'), 'config');
  // Las pantallas nuevas de la fase golondrina, incluida la ficha de una
  // institución (subruta) y la hoja del legajo.
  assert.equal(navActivo('/admin/instituciones'), 'instituciones');
  assert.equal(navActivo('/admin/instituciones/abc-123'), 'instituciones');
  assert.equal(navActivo('/admin/licencias'), 'licencias');
  assert.equal(navActivo('/admin/transferencias'), 'transferencias');
  assert.equal(navActivo('/admin/arco'), 'arco');
});

// ── Sidebar en tres grupos (restyle 2026-08 al mock Admin.dc.html) ──────────

test('ADMIN_NAV: los tres grupos del sidebar están completos y sin sobras', () => {
  const claves = (g) => ADMIN_NAV.filter((it) => it.grupo === g).map((it) => it.key);
  assert.deepEqual(claves('custodia'), ['transferencias', 'arco', 'auditoria']);
  assert.deepEqual(claves('vision'), ['observatorio', 'capacitacion', 'exportaciones']);
  // Todo lo demás cae en el bloque operativo de arriba: ningún ítem queda
  // huérfano con un grupo que el layout no pinta.
  const grupos = new Set(ADMIN_NAV.map((it) => it.grupo));
  assert.deepEqual([...grupos].sort(), [undefined, 'custodia', 'vision'].sort());
  assert.ok(claves(undefined).length >= 8, 'el bloque operativo no puede quedar vacío');
});

test('CAMPO y ETIQUETA usan los neutros cálidos del mock, no el borde petróleo', () => {
  assert.equal(CAMPO.border, `2px solid ${ADMIN.bordeCalido}`);
  assert.equal(CAMPO.background, ADMIN.suave);
  assert.equal(ETIQUETA.color, ADMIN.tinta2);
});

// ── Pills de las secciones de custodia ─────────────────────────────────────
// El punto del test: que ningún estado del dominio se quede sin pill y termine
// pintando un hueco en pantalla.

test('las pills de custodia cubren todos los estados de su dominio', () => {
  assert.deepEqual(Object.keys(ESTADO_PASE).sort(), Object.keys(ESTADO_TRANSFERENCIA).sort());
  assert.deepEqual(Object.keys(ESTADO_LICENCIA_PILL).sort(), [...ESTADOS_LICENCIA].sort());
  assert.deepEqual(Object.keys(ESTADO_INSTITUCION_PILL).sort(), [...ESTADOS_INSTITUCION].sort());
  assert.deepEqual(Object.keys(ESTADO_ALUMNO_PILL).sort(), Object.keys(ESTADO_ALUMNO_COPY).sort());
  assert.deepEqual(Object.keys(ESTADO_ARCO_PILL).sort(), Object.keys(ESTADO_ARCO).sort());
  assert.deepEqual(Object.keys(TIPO_ARCO_PILL).sort(), [...TIPOS_ARCO].sort());

  const todas = [
    ESTADO_PASE, ESTADO_LICENCIA_PILL, ESTADO_INSTITUCION_PILL,
    ESTADO_ALUMNO_PILL, ESTADO_ARCO_PILL, TIPO_ARCO_PILL,
  ];
  for (const mapa of todas) {
    for (const [clave, tupla] of Object.entries(mapa)) {
      assert.equal(tupla.length, 3, `${clave}: cada pill es [bg, color, label]`);
      assert.match(tupla[0], /^#[0-9A-Fa-f]{6}$/, `${clave}: fondo inválido`);
      assert.match(tupla[1], /^#[0-9A-Fa-f]{6}$/, `${clave}: color inválido`);
      assert.ok(tupla[2].length > 0, `${clave}: sin label`);
    }
  }
});

test('la cancelación es la única pill de tipo ARCO en rojo (es el único borrado real)', () => {
  const rojos = Object.entries(TIPO_ARCO_PILL).filter(([, t]) => t[1] === ADMIN.danger).map(([k]) => k);
  assert.deepEqual(rojos, ['cancelacion']);
});
