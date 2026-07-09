// Tests unitarios de la carga de PDF en autoría (web/lib/autoria.ts).
// Sin DOM ni red: validación del archivo y base64 chunked corren con `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDF_MAX_BYTES, bytesABase64, validarArchivoPdf, mensajeErrorSol } from '../../web/lib/autoria.ts';

test('validarArchivoPdf: acepta PDF por mime type', () => {
  assert.equal(validarArchivoPdf('plan.pdf', 'application/pdf', 1024), null);
});

test('validarArchivoPdf: acepta por extensión cuando el mime viene vacío', () => {
  assert.equal(validarArchivoPdf('Plan Anual.PDF', '', 1024), null);
});

test('validarArchivoPdf: rechaza lo que no es PDF', () => {
  assert.match(validarArchivoPdf('plan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1024), /PDF/);
  assert.match(validarArchivoPdf('foto.jpg', 'image/jpeg', 1024), /PDF/);
});

test('validarArchivoPdf: rechaza vacío y muy grande', () => {
  assert.match(validarArchivoPdf('plan.pdf', 'application/pdf', 0), /vacío/);
  assert.equal(validarArchivoPdf('plan.pdf', 'application/pdf', PDF_MAX_BYTES), null);
  assert.match(validarArchivoPdf('plan.pdf', 'application/pdf', PDF_MAX_BYTES + 1), /grande/);
});

test('bytesABase64: coincide con Buffer.toString(base64)', () => {
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 0, 255, 128]);
  assert.equal(bytesABase64(bytes.buffer), Buffer.from(bytes).toString('base64'));
});

test('bytesABase64: buffer vacío → cadena vacía', () => {
  assert.equal(bytesABase64(new ArrayBuffer(0)), '');
});

test('bytesABase64: archivo grande (cruza varios chunks) sin reventar el stack', () => {
  const grande = new Uint8Array(300_000);
  for (let i = 0; i < grande.length; i++) grande[i] = i % 256;
  assert.equal(bytesABase64(grande.buffer), Buffer.from(grande).toString('base64'));
});

test('mensajeErrorSol: traduce códigos crudos a algo legible (nunca filtra el código)', () => {
  assert.doesNotMatch(mensajeErrorSol('falta_anthropic_api_key'), /anthropic|key/i);
  assert.match(mensajeErrorSol('division_sin_nodos'), /plan|PDF/i);
  assert.match(mensajeErrorSol('claude_529'), /ratito|pedido/i);
  assert.match(mensajeErrorSol('claude_503'), /ratito|pedido/i);
  assert.match(mensajeErrorSol(undefined), /de nuevo/i);
  assert.match(mensajeErrorSol('lo_que_sea'), /de nuevo/i);
});
