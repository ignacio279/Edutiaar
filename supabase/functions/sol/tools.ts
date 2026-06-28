// Definiciones (schema) de las tools que SOL le ofrece a Claude. Data pura,
// importable por los tests. La implementación (las MANOS sobre Supabase) vive en
// index.ts; acá solo el contrato que ve Claude.
import type { Tool } from '../_shared/loop.ts';

export const TOOLS: Tool[] = [
  {
    name: 'leer_programa',
    description:
      'Devuelve el programa (materia, grado y temario/contenido) para el programa_id dado. ' +
      'Usala para saber qué temas hay que enseñar antes de responder.',
    input_schema: {
      type: 'object',
      properties: {
        programa_id: { type: 'string', description: 'UUID del programa a leer' },
      },
      required: ['programa_id'],
    },
  },
];
