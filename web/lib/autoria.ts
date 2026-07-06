// Autoría docente — lógica PURA de la carga de PDF (sin DOM, sin red → unit-testeable
// desde Node): validación del archivo y conversión a base64 por chunks.

// El request a la Edge Function aguanta ~20 MB y base64 infla +33% → tope 10 MB.
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

// Devuelve un mensaje de error legible para la seño, o null si el archivo sirve.
export function validarArchivoPdf(nombre: string, tipo: string, bytes: number): string | null {
  const esPdf = tipo === 'application/pdf' || /\.pdf$/i.test(nombre ?? '');
  if (!esPdf) return 'Solo se pueden subir archivos PDF';
  if (bytes <= 0) return 'El archivo está vacío';
  if (bytes > PDF_MAX_BYTES) return 'El PDF es muy grande (máximo 10 MB)';
  return null;
}

// btoa(String.fromCharCode(...bytes)) revienta el stack con archivos grandes; de a chunks.
export function bytesABase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binario += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binario);
}
