// Tests del tema ADMIN y la navegación congelada del panel de administración
// (Fase 0, Dashboard admin v3). Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, ESTADO_COLEGIO, ESTADO_MAESTRA, NIVEL_ADMIN, TIPO_COLEGIO } from '../../web/lib/admin/tema.ts';
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
});
