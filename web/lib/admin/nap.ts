// Espejo del catálogo NAP para el front. La fuente de verdad es
// supabase/functions/_shared/nap.ts — este archivo se replica de ahí.
//
// Catálogo NAP (Núcleos de Aprendizajes Prioritarios, Nivel Primario) — la vara
// fija contra la que el observatorio mide el aprendizaje.
//
// OJO: el catálogo se llena TRANSCRIBIENDO de las resoluciones del Consejo
// Federal de Educación, con la fuente a la vista — NUNCA generado por un
// modelo ni de memoria. Un catálogo inventado invalida todo lo que se
// construya encima.
//
// Primer Ciclo (1°, 2° y 3° grado) transcripto de:
// Núcleos de Aprendizajes Prioritarios — Primer Ciclo EGB / Nivel Primario
// (Ministerio de Educación, Ciencia y Tecnología; Resolución N° 214/04 del
// Consejo Federal de Cultura y Educación, 13/10/2004).
// https://bnm.me.gov.ar/giga1/documentos/EL000977.pdf
//
// Test de paridad en tests/unit/nap-catalogo.test.mjs, mismo patrón que
// provincias.ts y planes.ts.

export const MATERIAS_NAP = ['Lengua', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales'] as const;

export type TemaNap = {
  nombre: string; // etiqueta corta NUESTRA, para la UI
  textoOficial: string; // cita textual del documento
  fuente: string; // URL + página
  grado: number;
  orden: number;
};
export type EjeNap = { materia: string; nombre: string; orden: number; temas: TemaNap[] };

const NAP1 = 'https://bnm.me.gov.ar/giga1/documentos/EL000977.pdf';
const NAP2 = 'https://bnm.me.gov.ar/giga1/documentos/EL001229.pdf';

export const CATALOGO_NAP: EjeNap[] = [
  // ============================== MATEMÁTICA ==============================
  {
    materia: 'Matemática',
    nombre: 'Número y operaciones',
    orden: 0,
    temas: [
      {
        nombre: 'Sistema decimal de numeración',
        textoOficial:
          'El reconocimiento y uso de los números naturales, de su designación oral y representación escrita y de la organización del sistema decimal de numeración en situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.14`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Adición y sustracción',
        textoOficial:
          'El reconocimiento y uso de las operaciones de adición y sustracción en situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.14`,
        grado: 1,
        orden: 1,
      },
      {
        nombre: 'Sistema decimal de numeración',
        textoOficial:
          'El reconocimiento y uso de los números naturales, de su designación oral y representación escrita y de la organización del sistema decimal de numeración en situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.16`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Las cuatro operaciones',
        textoOficial:
          'El reconocimiento y uso de las operaciones de adición, sustracción, multiplicación y división en situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.16`,
        grado: 2,
        orden: 1,
      },
      {
        nombre: 'Sistema decimal de numeración',
        textoOficial:
          'El reconocimiento y uso de los números naturales, de su designación oral y representación escrita y de la organización del sistema decimal de numeración en situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.18`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Las cuatro operaciones',
        textoOficial:
          'El reconocimiento y uso de las operaciones de adición y sustracción, multiplicación y división en situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.18`,
        grado: 3,
        orden: 1,
      },
      {
        nombre: 'Sistema decimal y números naturales',
        textoOficial:
          'El reconocimiento y uso de los números naturales, de la organización del sistema decimal de numeración y la explicitación de sus características, en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.19`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Fracciones y decimales de uso social',
        textoOficial:
          'El reconocimiento y uso de fracciones y expresiones decimales de uso social habitual en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.19`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Operaciones entre naturales',
        textoOficial:
          'El reconocimiento y uso de las operaciones entre números naturales y la explicitación de sus propiedades en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.19`,
        grado: 4,
        orden: 2,
      },
      {
        nombre: 'Operaciones entre fracciones y decimales',
        textoOficial:
          'El reconocimiento y uso de las operaciones entre fracciones y expresiones decimales de uso social habitual en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.20`,
        grado: 4,
        orden: 3,
      },
      {
        nombre: 'Sistema decimal y números naturales',
        textoOficial:
          'El reconocimiento y uso de los números naturales y de la organización del sistema decimal de numeración, y la explicitación de sus características en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.22`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Fracciones y expresiones decimales',
        textoOficial:
          'El reconocimiento y uso de fracciones y expresiones decimales en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.22`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Operaciones entre naturales',
        textoOficial:
          'El reconocimiento y uso de las operaciones entre números naturales y la explicitación de sus propiedades en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.22`,
        grado: 5,
        orden: 2,
      },
      {
        nombre: 'Operaciones entre fracciones y decimales',
        textoOficial:
          'El reconocimiento y uso de las operaciones entre fracciones y expresiones decimales en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.23`,
        grado: 5,
        orden: 3,
      },
      {
        nombre: 'Números naturales, fracciones y decimales',
        textoOficial:
          'El reconocimiento y uso de los números naturales, de expresiones decimales y fraccionarias, de la organización del sistema decimal de numeración, y la explicitación de sus características, en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.26`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Operaciones entre naturales, fracciones y decimales',
        textoOficial:
          'El reconocimiento y el uso de las operaciones entre números naturales, fracciones y expresiones decimales, y la explicitación de sus propiedades en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.26`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Números naturales, fracciones y decimales',
        textoOficial:
          'El reconocimiento y el uso de los números naturales, de expresiones fraccionarias y decimales y la explicitación de la organización del sistema decimal de numeración en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.29`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Operaciones entre naturales, fracciones y decimales',
        textoOficial:
          'El reconocimiento y el uso de las operaciones entre números naturales, fracciones y expresiones decimales y la explicitación de sus propiedades en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.29`,
        grado: 7,
        orden: 1,
      },
    ],
  },
  {
    materia: 'Matemática',
    nombre: 'Geometría y medida',
    orden: 1,
    temas: [
      {
        nombre: 'Relaciones espaciales',
        textoOficial:
          'El reconocimiento y uso de relaciones espaciales en espacios explorables o que puedan ser explorados efectivamente en la resolución de situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.14`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Figuras y cuerpos geométricos',
        textoOficial:
          'El reconocimiento de figuras y cuerpos geométricos a partir de distintas características en situaciones problemáticas que requieran (**):',
        fuente: `${NAP1} p.14`,
        grado: 1,
        orden: 1,
      },
      {
        nombre: 'Magnitudes y medición',
        textoOficial:
          'La diferenciación de distintas magnitudes y la elaboración de estrategias de medición con distintas unidades en situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.15`,
        grado: 1,
        orden: 2,
      },
      {
        nombre: 'Relaciones espaciales',
        textoOficial:
          'El reconocimiento y uso de relaciones espaciales en espacios explorables o que puedan ser explorados efectivamente en la resolución de situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.16`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Figuras y cuerpos geométricos',
        textoOficial:
          'El reconocimiento de figuras y cuerpos geométricos a partir de distintas características en situaciones problemáticas que requieran (**):',
        fuente: `${NAP1} p.16`,
        grado: 2,
        orden: 1,
      },
      {
        nombre: 'Magnitudes y medición',
        textoOficial:
          'La diferenciación de distintas magnitudes y la elaboración de estrategias de medición con distintas unidades en situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.17`,
        grado: 2,
        orden: 2,
      },
      {
        nombre: 'Relaciones espaciales',
        textoOficial:
          'El reconocimiento y uso de relaciones espaciales en espacios explorables o que puedan ser explorados efectivamente en la resolución de situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.18`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Figuras y cuerpos geométricos',
        textoOficial:
          'El reconocimiento de figuras y cuerpos geométricos a partir de distintas características en situaciones problemáticas que requieran (**):',
        fuente: `${NAP1} p.19`,
        grado: 3,
        orden: 1,
      },
      {
        nombre: 'Magnitudes y medición',
        textoOficial:
          'La diferenciación de distintas magnitudes y la elaboración de estrategias de medición con distintas unidades en situaciones problemáticas que requieran:',
        fuente: `${NAP1} p.19`,
        grado: 3,
        orden: 2,
      },
      {
        nombre: 'Relaciones espaciales',
        textoOficial:
          'El reconocimiento y uso de relaciones espaciales en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.21`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Figuras y cuerpos geométricos',
        textoOficial:
          'El reconocimiento de figuras y cuerpos geométricos y la producción y análisis de construcciones considerando las propiedades involucradas en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.21`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Proceso de medir',
        textoOficial:
          'La comprensión del proceso de medir, considerando diferentes expresiones posibles para una misma cantidad en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.21`,
        grado: 4,
        orden: 2,
      },
      {
        nombre: 'Estimar y calcular medidas',
        textoOficial:
          'El análisis y uso reflexivo de distintos procedimientos para estimar y calcular medidas en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.21`,
        grado: 4,
        orden: 3,
      },
      {
        nombre: 'Relaciones espaciales y sistemas de referencia',
        textoOficial:
          'El reconocimiento y uso de relaciones espaciales y de sistemas de referencia en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.24`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Figuras y cuerpos geométricos',
        textoOficial:
          'El reconocimiento de figuras y cuerpos geométricos y la producción y el análisis de construcciones, considerando las propiedades involucradas, en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.24`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Proceso de medir',
        textoOficial:
          'La comprensión del proceso de medir, considerando diferentes expresiones posibles para una misma cantidad, en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.24`,
        grado: 5,
        orden: 2,
      },
      {
        nombre: 'Estimar y calcular medidas',
        textoOficial:
          'El análisis y uso reflexivo de distintos procedimientos para estimar y calcular medidas en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.25`,
        grado: 5,
        orden: 3,
      },
      {
        nombre: 'Relaciones espaciales y sistemas de referencia',
        textoOficial:
          'El reconocimiento y uso de relaciones espaciales y de sistemas de referencia en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.27`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Figuras y cuerpos geométricos',
        textoOficial:
          'El reconocimiento de figuras y cuerpos geométricos y la producción y el análisis de construcciones, considerando las propiedades involucradas en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.27`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Proceso de medir',
        textoOficial:
          'La comprensión del proceso de medir, considerando diferentes expresiones posibles para una misma cantidad en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.28`,
        grado: 6,
        orden: 2,
      },
      {
        nombre: 'Estimar y calcular medidas',
        textoOficial:
          'El análisis y uso reflexivo de distintos procedimientos para estimar y calcular medidas en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.28`,
        grado: 6,
        orden: 3,
      },
      {
        nombre: 'Figuras y cuerpos geométricos',
        textoOficial:
          'El reconocimiento de figuras y cuerpos geométricos y la producción y el análisis de construcciones explicitando las propiedades involucradas en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.30`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Medir con distintas unidades y sistemas',
        textoOficial:
          'La comprensión del proceso de medir, considerando diferentes unidades y sistemas en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.31`,
        grado: 7,
        orden: 1,
      },
      {
        nombre: 'Estimar y calcular medidas',
        textoOficial:
          'El análisis y el uso reflexivo de distintos procedimientos para estimar y calcular medidas en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.31`,
        grado: 7,
        orden: 2,
      },
    ],
  },
  {
    materia: 'Matemática',
    nombre: 'Álgebra y funciones',
    orden: 2,
    temas: [
      {
        nombre: 'Análisis de variaciones',
        textoOficial: 'El análisis de variaciones en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.30`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Expresiones simbólicas',
        textoOficial:
          'El uso de distintas expresiones simbólicas en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.30`,
        grado: 7,
        orden: 1,
      },
    ],
  },
  {
    materia: 'Matemática',
    nombre: 'Probabilidad y estadística',
    orden: 3,
    temas: [
      {
        nombre: 'Información estadística',
        textoOficial:
          'La interpretación y elaboración de información estadística en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.31`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Probabilidad e incertidumbre',
        textoOficial:
          'El reconocimiento y uso de la probabilidad como un modo de cuantificar la incertidumbre en situaciones problemáticas que requieran:',
        fuente: `${NAP2} p.32`,
        grado: 7,
        orden: 1,
      },
    ],
  },

  // ================================ LENGUA =================================
  {
    materia: 'Lengua',
    nombre: 'Comprensión y producción oral',
    orden: 0,
    temas: [
      {
        nombre: 'Participación en conversaciones',
        textoOficial:
          'La participación asidua en conversaciones acerca de experiencias personales y lecturas, realizando aportes que se ajusten al contenido y al propósito de la comunicación, en el momento oportuno (solicitar aclaraciones, narrar, describir, pedir, entre otros).',
        fuente: `${NAP1} p.21`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Escucha comprensiva de textos',
        textoOficial:
          'La escucha comprensiva de textos leídos o expresados en forma oral por el docente y otros adultos asiduamente: narraciones (textos ficcionales y experiencias personales), descripciones de objetos, animales y personas.',
        fuente: `${NAP1} p.21`,
        grado: 1,
        orden: 1,
      },
      {
        nombre: 'Producción de narraciones orales',
        textoOficial:
          'La producción asidua de narraciones de experiencias personales, de anécdotas familiares y de descripciones, y la escucha atenta de textos similares producidos por los compañeros.',
        fuente: `${NAP1} p.21`,
        grado: 1,
        orden: 2,
      },
      {
        nombre: 'Renarración de textos literarios',
        textoOficial:
          'La renarración, con distintos propósitos, de cuentos, fábulas y otros textos narrativos literarios leídos o narrados en forma oral por el docente y otros adultos.',
        fuente: `${NAP1} p.21`,
        grado: 1,
        orden: 3,
      },
      {
        nombre: 'Poesía y géneros poéticos orales',
        textoOficial:
          'La escucha, comprensión y disfrute de poesías, coplas, canciones, adivinanzas, etc. y otros géneros poéticos orales.',
        fuente: `${NAP1} p.21`,
        grado: 1,
        orden: 4,
      },
      {
        nombre: 'Comprensión de consignas escolares',
        textoOficial:
          'La escucha comprensiva de consignas de tarea escolar expresadas de manera clara y pertinente en el marco de las propuestas desarrolladas en el aula.',
        fuente: `${NAP1} p.21`,
        grado: 1,
        orden: 5,
      },
      {
        nombre: 'Participación en conversaciones',
        textoOficial:
          'La participación asidua en conversaciones acerca de experiencias personales, de lecturas compartidas y para planificar diversas tareas conjuntas, realizando aportes que se ajusten al contenido y al propósito de la comunicación, en el momento oportuno (solicitar aclaraciones, narrar, describir, pedir, dar su opinión y justificarla, entre otros).',
        fuente: `${NAP1} p.23`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Escucha comprensiva de textos',
        textoOficial:
          'La escucha comprensiva de textos leídos o expresados en forma oral por el docente y otros adultos asiduamente: narraciones (textos ficcionales y experiencias personales), descripciones de objetos, animales y personas.',
        fuente: `${NAP1} p.23`,
        grado: 2,
        orden: 1,
      },
      {
        nombre: 'Producción de narraciones orales',
        textoOficial:
          'La producción asidua de narraciones de experiencias personales, de anécdotas familiares y de descripciones, y la escucha atenta de textos similares producidos por los compañeros.',
        fuente: `${NAP1} p.23`,
        grado: 2,
        orden: 2,
      },
      {
        nombre: 'Renarración de textos literarios',
        textoOficial:
          'La renarración, con distintos propósitos, de cuentos, fábulas y otros textos narrativos literarios leídos o narrados en forma oral por el docente y otros adultos.',
        fuente: `${NAP1} p.23`,
        grado: 2,
        orden: 3,
      },
      {
        nombre: 'Poesía y géneros poéticos orales',
        textoOficial:
          'La escucha, comprensión y disfrute de poesías, coplas, canciones, adivinanzas, etc. y otros géneros poéticos orales.',
        fuente: `${NAP1} p.23`,
        grado: 2,
        orden: 4,
      },
      {
        nombre: 'Comprensión de consignas escolares',
        textoOficial:
          'La escucha comprensiva de consignas de tarea escolar expresadas de manera clara y pertinente en el marco de las propuestas desarrolladas en el aula.',
        fuente: `${NAP1} p.23`,
        grado: 2,
        orden: 5,
      },
      {
        nombre: 'Participación en conversaciones',
        textoOficial:
          'La participación asidua en conversaciones acerca de experiencias personales, de lecturas compartidas y para planificar diversas tareas conjuntas, realizando aportes que se ajusten al contenido y al propósito de la comunicación, en el momento oportuno (solicitar aclaraciones, narrar, describir, pedir, dar su opinión y justificarla, entre otros; complementar, ampliar, refutar o aportar nuevas justificaciones a lo dicho por otro, reformulándolo en estilo directo o indirecto).',
        fuente: `${NAP1} p.25`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Escucha comprensiva de textos',
        textoOficial:
          'La escucha comprensiva de textos leídos o expresados asiduamente en forma oral por el docente y otros adultos: narraciones, descripciones de objetos, animales y personas; instrucciones (consignas de tarea escolar, entre otras) para llevar a cabo distintas tareas y exposiciones sobre temas del mundo social y natural.',
        fuente: `${NAP1} p.25`,
        grado: 3,
        orden: 1,
      },
      {
        nombre: 'Producción y renarración de narraciones',
        textoOficial:
          'La producción asidua de narraciones (con inclusión de descripciones y diálogos) y descripciones, y la renarración, con distintos propósitos, de cuentos, fábulas y otros textos narrativos literarios leídos o narrados en forma oral por el docente y otros adultos.',
        fuente: `${NAP1} p.25`,
        grado: 3,
        orden: 2,
      },
      {
        nombre: 'Poesía y géneros poéticos orales',
        textoOficial:
          'La escucha, comprensión y disfrute de poesías, coplas, canciones, adivinanzas, etc. y otros géneros poéticos orales.',
        fuente: `${NAP1} p.25`,
        grado: 3,
        orden: 3,
      },
      {
        nombre: 'Conversación sobre temas de estudio',
        textoOficial:
          'La participación asidua en conversaciones sobre temas de estudio, de interés general y sobre lecturas compartidas, sosteniendo el tema de conversación, realizando aportes que se ajusten al contenido y al propósito (narrar, describir, pedir y dar su opinión, formular preguntas y respuestas, entre otros), incluyendo un vocabulario acorde al contenido tratado y recuperando, al finalizar, el o los temas sobre los que se ha estado conversando. Esto supone informarse previamente (a través de la exposición del maestro, de la lectura seleccionada por el docente y/o de la información aportada por el alumno).',
        fuente: `${NAP2} p.35`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Escucha comprensiva de narraciones y descripciones',
        textoOficial:
          'La escucha comprensiva de textos expresados en forma oral por el docente, sus compañeros y otros adultos. Esto requiere, en el caso de la narración, identificar las personas, el tiempo y el espacio en los que ocurren los hechos, así como las acciones, su orden y las relaciones causales, incorporando –para emplear en situaciones de producción– las palabras que hacen referencia al transcurso del tiempo y a las acciones realizadas (verbos). En el caso de la descripción, identificar aquello que se describe, las partes, sus características básicas, incorporando –para emplear en situaciones de producción– las palabras que hacen referencia a características básicas de aquello que se describe. En las instrucciones seriadas (consignas de tarea escolar, reglas de juego, entre otras), el objetivo, el orden y la jerarquía de las acciones. En todos los casos, solicitar información adicional y aclaraciones sobre las palabras o expresiones desconocidas y, con ayuda del docente, recuperar la información relevante.',
        fuente: `${NAP2} p.35`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Escucha comprensiva de exposiciones',
        textoOficial:
          'La escucha comprensiva de exposiciones orales realizadas por el docente y sus compañeros, lo que implica identificar, con ayuda del docente, el tema, los subtemas, los ejemplos y las comparaciones incluidos; solicitar aclaraciones, reiteraciones y ampliaciones que necesiten; registrar por escrito, con la ayuda del docente y/o de sus compañeros, en el pizarrón y de manera colectiva, lo esencial de lo que se ha escuchado. Recuperar en forma oral la información relevante de lo que se ha escuchado a partir de lo registrado por escrito.',
        fuente: `${NAP2} p.35`,
        grado: 4,
        orden: 2,
      },
      {
        nombre: 'Producción de narraciones y descripciones',
        textoOficial:
          'La producción de narraciones y renarraciones de historias no ficcionales que presenten el tiempo y el espacio en los que ocurren los hechos, el orden de las acciones y las relaciones causales que se establecen entre ellas; que incluyan diálogos y descripciones de lugares, objetos y personas; y descripciones de personas, personajes, lugares, objetos y procesos. Requiere, en ambos casos, la utilización de un vocabulario apropiado, incluyendo palabras y expresiones que se refieran a las características de aquello que se nombra, que den cuenta del transcurso del tiempo y de las acciones.',
        fuente: `${NAP2} p.35`,
        grado: 4,
        orden: 3,
      },
      {
        nombre: 'Producción de exposiciones individuales',
        textoOficial:
          'La producción, con la ayuda del docente, de exposiciones individuales referidas a contenidos estudiados y a temas de interés tratados en el aula, a partir de la lectura de textos y/o de otras fuentes de información, teniendo en cuenta las partes de la exposición (presentación del tema, desarrollo, cierre), realizando la selección y el ordenamiento de la información, con inclusión de vocabulario acorde al tema tratado. Elaboración, con la ayuda del docente, de materiales de apoyo para la exposición.',
        fuente: `${NAP2} p.36`,
        grado: 4,
        orden: 4,
      },
      {
        nombre: 'Conversación sobre temas de estudio',
        textoOficial:
          'La participación asidua en conversaciones sobre temas de estudio, de interés general y sobre lecturas compartidas, sosteniendo el tema de conversación, realizando aportes que se ajusten al contenido y al propósito (narrar, describir, ejemplificar, dar su opinión y justificarla, solicitar aclaraciones, formular preguntas y respuestas, entre otros), incluyendo ejemplos, explicaciones y un repertorio léxico acorde al tema de conversación, como también las expresiones lingüísticas pertinentes para manifestar opiniones, acuerdos, desacuerdos o justificar las afirmaciones realizadas. Recuperar el o los temas sobre los que se ha escuchado, a partir de lo registrado por escrito. Esto supone informarse previamente (a través de la exposición del maestro, de la lectura seleccionada por el docente y/o de la información aportada por el alumno).',
        fuente: `${NAP2} p.40`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Participación en entrevistas',
        textoOficial:
          'La participación en entrevistas para profundizar un tema de estudio o de interés general, en compañía de sus pares y con la colaboración del docente, lo que supone prepararse para ese momento (elegir el tema y la persona a entrevistar, informarse; elaborar el cuestionario previendo fórmulas de tratamiento, apertura y cierre y pautando el orden de las intervenciones) y realizarla teniendo en cuenta que podrá tener adaptaciones o reajustes; utilizar un vocabulario acorde al tema tratado. Recuperar, luego de la entrevista, la información más relevante y reflexionar acerca del proceso llevado a cabo.',
        fuente: `${NAP2} p.40`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Escucha comprensiva de narraciones y descripciones',
        textoOficial:
          'La escucha comprensiva de textos expresados en forma oral por el docente, sus compañeros y otros adultos. Esto requiere, en el caso de la narración, identificar las personas, el tiempo y el espacio en los que ocurren los hechos, así como las acciones, su orden y las relaciones causales, incorporando –para emplear en situaciones de producción– las palabras que hacen referencia al transcurso del tiempo y a las acciones realizadas (verbos). En el caso de la descripción, identificar aquello que se describe, las partes, sus características básicas, incorporando –para emplear en situaciones de producción– las palabras que hacen referencia a esos aspectos. En las instrucciones seriadas (consignas de la tarea escolar, reglas de juego, reglamentos, entre otras), el objetivo, el orden y la jerarquía de las acciones. En todos los casos, solicitar información adicional y aclaraciones sobre las palabras o expresiones desconocidas, y recuperar, con la colaboración del docente, la información relevante.',
        fuente: `${NAP2} p.40`,
        grado: 5,
        orden: 2,
      },
      {
        nombre: 'Escucha comprensiva de exposiciones',
        textoOficial:
          'La escucha comprensiva de exposiciones orales realizadas por el docente y sus compañeros, lo que implica identificar, con la colaboración del docente, el tema, los subtemas y recursos propios de la exposición tales como ejemplos, definiciones y comparaciones; solicitar aclaraciones, reiteraciones y ampliaciones que necesiten; registrar por escrito, con la ayuda del docente y/o de sus compañeros, en el pizarrón y de manera colectiva, lo esencial de lo que se ha escuchado. Recuperar en forma oral la información relevante de lo que se ha escuchado, a partir de lo registrado por escrito.',
        fuente: `${NAP2} p.40`,
        grado: 5,
        orden: 3,
      },
      {
        nombre: 'Producción de narraciones y descripciones',
        textoOficial:
          'La producción de narraciones y renarraciones de historias no ficcionales, caracterizando el tiempo y el espacio en los que ocurren los hechos, el orden de las acciones y las relaciones causales que se establecen entre ellos, y que incluyan diálogos directos e indirectos y descripciones de lugares, objetos y personas; y descripciones de personas, lugares, objetos y procesos. Requiere, en ambos casos, la utilización de un vocabulario apropiado, incluyendo palabras y expresiones que se refieran a las características de aquello que se nombra, que den cuenta del transcurso del tiempo y de las acciones.',
        fuente: `${NAP2} p.41`,
        grado: 5,
        orden: 4,
      },
      {
        nombre: 'Producción de exposiciones individuales',
        textoOficial:
          'La producción, con la colaboración del docente o de manera autónoma, de exposiciones individuales referidas a contenidos estudiados y a temas de interés tratados en el aula, a partir de la lectura de varios textos, teniendo en cuenta las partes de la exposición (presentación del tema, desarrollo, cierre), realizando la selección y el ordenamiento de la información; con inclusión de recursos propios de la exposición, tales como definición, ejemplo, comparación, y con un vocabulario acorde al tema tratado. Elaboración, con la ayuda del docente, de materiales de apoyo para la exposición.',
        fuente: `${NAP2} p.41`,
        grado: 5,
        orden: 5,
      },
      {
        nombre: 'Conversación sobre temas de estudio',
        textoOficial:
          'La participación asidua en conversaciones sobre temas de estudio, de interés general y sobre lecturas compartidas, sosteniendo el tema de conversación, realizando aportes que se ajusten al contenido y al propósito (narrar, describir, ejemplificar, dar su opinión y defenderla, solicitar aclaraciones, formular preguntas y respuestas, pedir opiniones, entre otros), incluyendo ejemplos, explicaciones y un repertorio léxico acorde al tema de conversación, como así también las expresiones lingüísticas pertinentes para manifestar opiniones, acuerdos, desacuerdos o justificar las afirmaciones realizadas. Recuperar el o los temas sobre los que se ha estado conversando. Esto supone informarse previamente a través de la exposición del maestro y de otros adultos, de las lecturas seleccionadas o de la información aportada por el alumno.',
        fuente: `${NAP2} p.46`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Participación en entrevistas',
        textoOficial:
          'La participación en entrevistas para profundizar un tema de estudio o de interés general, en compañía de sus pares y con la colaboración del docente, lo que supone prepararse para ese momento (elegir el tema y la persona a entrevistar, informarse; elaborar el cuestionario previendo fórmulas de tratamiento, apertura y cierre y pautando el orden de las intervenciones) y realizarla teniendo en cuenta que podrá tener adaptaciones o reajustes; utilizar un vocabulario acorde al tema tratado. Tomar notas durante la entrevista (en lo posible grabarla), recuperar luego la información más relevante y reflexionar acerca del proceso llevado a cabo.',
        fuente: `${NAP2} p.46`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Escucha comprensiva de narraciones y descripciones',
        textoOficial:
          'La escucha comprensiva de textos expresados en forma oral por el docente, sus compañeros y otros adultos. Esto requiere, en el caso de la narración, identificar las personas, el tiempo y el espacio en los que ocurren los hechos, así como las acciones, su orden y las relaciones causales, incorporando –para emplear en situaciones de producción– las palabras que hacen referencia al transcurso del tiempo y a las acciones realizadas (verbos). En el caso de la descripción, identificar aquello que se describe, las partes, sus características básicas y los momentos del proceso que se describe, incorporando –para emplear en situaciones de producción– las palabras que hacen referencia a esas características básicas; en las instrucciones seriadas, el objetivo, el orden y la jerarquía de las acciones. En todos los casos, solicitar información adicional y aclaraciones sobre las palabras o expresiones desconocidas y recuperar la información relevante.',
        fuente: `${NAP2} p.46`,
        grado: 6,
        orden: 2,
      },
      {
        nombre: 'Escucha comprensiva de exposiciones',
        textoOficial:
          'La escucha comprensiva de exposiciones orales realizadas por el docente y sus compañeros, lo que implica identificar, con la colaboración del docente cuando la situación lo requiera, el tema, los subtemas y los recursos propios de la exposición tales como ejemplos, definiciones y comparaciones; solicitar aclaraciones, reiteraciones y ampliaciones que necesiten; registrar por escrito, con la colaboración del docente y/o con sus compañeros, lo esencial de lo que se ha escuchado. Recuperar en forma oral la información relevante de lo que se ha escuchado, a partir de lo registrado por escrito.',
        fuente: `${NAP2} p.46`,
        grado: 6,
        orden: 3,
      },
      {
        nombre: 'Producción de narraciones y descripciones',
        textoOficial:
          'La producción de narraciones y renarraciones de historias no ficcionales, caracterizando el tiempo y el espacio en los que ocurren los hechos, que presenten el orden de las acciones y las relaciones causales que se establecen entre ellas, y que incluyan diálogos directos e indirectos –empleando adecuadamente los pronombres y los tiempos verbales–, y descripciones de lugares, objetos y personas (si el texto elegido y la situación comunicativa lo requieren); y descripciones de personas, lugares, objetos y procesos. Requiere, en ambos casos, la utilización de un vocabulario apropiado, incluyendo palabras y expresiones que se refieran a las características de aquello que se nombra y que den cuenta del transcurso del tiempo y de las acciones.',
        fuente: `${NAP2} p.47`,
        grado: 6,
        orden: 4,
      },
      {
        // La fuente trae "a| tiem-po" (glifo corrupto): se leyó "al tiempo",
        // única lectura gramaticalmente coherente. Reparación interpretativa,
        // no normalización (no es guion de corte ni espacio de más).
        nombre: 'Producción de exposiciones individuales y grupales',
        textoOficial:
          'La producción, con la colaboración del docente o de manera autónoma, de exposiciones individuales y grupales referidas a contenidos estudiados y a temas de interés tratados en el aula, a partir de la lectura de diversos textos provenientes de distintas fuentes (enciclopedias, internet, documentales, entre otras), teniendo en cuenta las partes de la exposición (presentación del tema, desarrollo, cierre), realizando la selección, análisis, contrastación de distintas perspectivas y ordenamiento de la información, y atendiendo a la distribución de los subtemas y al tiempo de la exposición del que se dispone. Empleo de un vocabulario acorde al tema tratado que incluya vocabulario específico. Elaboración de materiales de apoyo.',
        fuente: `${NAP2} p.47`,
        grado: 6,
        orden: 5,
      },
      {
        nombre: 'Conversación y discusión sobre el área',
        textoOficial:
          'La participación asidua en conversaciones y discusiones sobre temas propios del área y del mundo de la cultura, a partir de informaciones y opiniones provenientes de diversas fuentes (exposiciones orales, libros, audiovisuales, medios de comunicación orales y escritos, entre otros). Esto supone:',
        fuente: `${NAP2} p.53`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Escucha comprensiva y crítica de textos',
        textoOficial:
          'La escucha comprensiva y crítica de textos referidos a contenidos estudiados y a temas de interés general expresados por el docente, los compañeros, otros adultos y en programas radiales y televisivos (entrevistas, documentales, películas). Esto supone:',
        fuente: `${NAP2} p.53`,
        grado: 7,
        orden: 1,
      },
      {
        nombre: 'Producción de textos orales',
        textoOficial:
          'La producción de textos orales referidos a contenidos estudiados y a temas de interés general, en pequeños grupos y/o de manera individual. Esto supone:',
        fuente: `${NAP2} p.54`,
        grado: 7,
        orden: 2,
      },
    ],
  },
  {
    materia: 'Lengua',
    nombre: 'Lectura',
    orden: 1,
    temas: [
      {
        nombre: 'Frecuentación de materiales escritos',
        textoOficial:
          'La frecuentación y exploración asidua de variados materiales escritos, en distintos escenarios y circuitos de lectura (bibliotecas de aula, escolares y populares, ferias del libro, entre otros).',
        fuente: `${NAP1} p.21`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Textos literarios y no literarios',
        textoOficial:
          'La lectura (comprensión y el disfrute) de textos literarios (cuentos, fábulas, leyendas y otros géneros narrativos y poesías, coplas, adivinanzas, y otros géneros poéticos) y textos no literarios (notas de enciclopedia sobre diferentes contenidos que se están estudiando o sobre temas de interés para los niños, entre otros) leídos de manera habitual y sistemática por el docente y otros adultos.',
        fuente: `${NAP1} p.21`,
        grado: 1,
        orden: 1,
      },
      {
        nombre: 'Lectura de palabras y fragmentos',
        textoOficial:
          'La lectura de palabras, de oraciones que conforman textos con abundantes ilustraciones y de fragmentos de textos (títulos de cuentos, diálogos de un cuento leído por el docente, parlamentos de un personaje en una historieta, respuestas a adivinanzas).',
        fuente: `${NAP1} p.21`,
        grado: 1,
        orden: 2,
      },
      {
        nombre: 'Frecuentación de materiales escritos',
        textoOficial:
          'La frecuentación y exploración asidua de variados materiales escritos, en distintos escenarios y circuitos de lectura (bibliotecas de aula, escolares y populares, ferias del libro, entre otros).',
        fuente: `${NAP1} p.23`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Lectura compartida de textos literarios',
        textoOficial:
          'La lectura compartida con los compañeros, el docente y otros adultos (de manera habitual y sistemática) de cuentos, fábulas, leyendas y otros textos narrativos literarios; poesías, coplas, adivinanzas, y otros géneros poéticos; y de textos no literarios como descubrimientos, historias de vida, notas de enciclopedia sobre diferentes contenidos que se están estudiando o sobre temas de interés para los niños, entre otros.',
        fuente: `${NAP1} p.23`,
        grado: 2,
        orden: 1,
      },
      {
        nombre: 'Comprensión de textos instruccionales',
        textoOficial:
          'La comprensión de textos instruccionales accesibles para los niños (recetas, instrucciones para elaborar un objeto, consignas escolares, etc.).',
        fuente: `${NAP1} p.23`,
        grado: 2,
        orden: 2,
      },
      {
        nombre: 'Lectura autónoma de palabras y fragmentos',
        textoOficial:
          'La lectura autónoma de palabras, de oraciones que conforman textos (en distinto tipo de letra) con abundantes ilustraciones y de fragmentos de textos (títulos de cuentos, diálogos de un cuento leído por el docente, parlamentos de un personaje en una historieta, respuestas a adivinanzas).',
        fuente: `${NAP1} p.23`,
        grado: 2,
        orden: 3,
      },
      {
        nombre: 'Frecuentación de materiales escritos',
        textoOficial:
          'La frecuentación y exploración asidua de variados materiales escritos, en distintos escenarios y circuitos de lectura (bibliotecas de aula, escolares y populares, ferias del libro, entre otros), localizando materiales de lectura en la biblioteca y orientándose a partir de los índices de los libros.',
        fuente: `${NAP1} p.25`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Textos literarios y no literarios',
        textoOficial:
          'La lectura asidua de textos leídos por ellos (en silencio o en voz alta) o por el docente y otros adultos en voz alta (de manera habitual y sistemática): cuentos, fábulas, leyendas y otros textos narrativos literarios; poesías, coplas, adivinanzas, y otros géneros poéticos; y de textos no literarios como descubrimientos, historias de vida, descripciones de objetos, animales, personas, lugares y procesos, notas de enciclopedia sobre diferentes contenidos que se están estudiando o sobre temas de interés para los niños, entre otros.',
        fuente: `${NAP1} p.25`,
        grado: 3,
        orden: 1,
      },
      {
        nombre: 'Comprensión de textos explicativos',
        textoOficial: 'La comprensión de textos explicativos leídos en colaboración con el docente.',
        fuente: `${NAP1} p.25`,
        grado: 3,
        orden: 2,
      },
      {
        nombre: 'Comprensión de textos instruccionales',
        textoOficial:
          'La comprensión de textos instruccionales accesibles para los niños (recetas, instrucciones para elaborar un objeto, consignas escolares, etc.).',
        fuente: `${NAP1} p.25`,
        grado: 3,
        orden: 3,
      },
    ],
  },
  {
    materia: 'Lengua',
    nombre: 'Escritura',
    orden: 2,
    temas: [
      {
        nombre: 'Escritura en colaboración con el docente',
        textoOficial:
          'La escritura asidua de textos en colaboración con el docente, en condiciones que permitan discutir y consensuar el propósito, idear y redactar el texto conjuntamente con el maestro -dictándole el texto completo o realizando una escritura compartida-, releer el borrador del texto con el maestro y reformularlo conjuntamente a partir de sus orientaciones.',
        fuente: `${NAP1} p.21`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Escritura autónoma de palabras y oraciones',
        textoOficial:
          'La escritura de palabras y de oraciones que conforman un texto (afiches, epígrafes para una foto o ilustración, mensajes, invitaciones, respuestas a preguntas sobre temas conocidos, etc.), que puedan ser comprendidas por ellos y por otros, así como la revisión de las propias escrituras para evaluar lo que falta escribir, proponer modificaciones y realizarlas.',
        fuente: `${NAP1} p.22`,
        grado: 1,
        orden: 1,
      },
      {
        nombre: 'Escritura autónoma y en colaboración',
        textoOficial:
          'La escritura asidua de textos (narraciones de experiencias personales, cuentos, descripciones, cartas personales, esquelas) en forma autónoma o en colaboración con el docente (discutir y consensuar el propósito, idear y redactar el texto conjuntamente con el maestro -dictándole el texto completo o realizando una escritura compartida-, releer el borrador del texto con el maestro y reformularlo conjuntamente a partir de sus orientaciones).',
        fuente: `${NAP1} p.24`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Escritura de palabras y puntuación básica',
        textoOficial:
          'La escritura autónoma de palabras y oraciones que conforman textos (afiches, epígrafes para una foto o ilustración, mensajes, invitaciones, respuestas a preguntas sobre temas conocidos, etc.), respetando las correspondencias entre sonidos y letras, trazando letras de distinto tipo, separando las palabras en la oración e iniciándose en el uso del punto y la mayúscula después del punto.',
        fuente: `${NAP1} p.24`,
        grado: 2,
        orden: 1,
      },
      {
        nombre: 'Revisión de las propias escrituras',
        textoOficial:
          'La participación frecuente en situaciones de revisión de las propias escrituras para evaluar lo que falta escribir, proponer modificaciones y realizarlas.',
        fuente: `${NAP1} p.24`,
        grado: 2,
        orden: 2,
      },
      {
        nombre: 'Escritura de textos diversos',
        textoOficial:
          'La escritura asidua de diversos textos -narraciones que incluyan descripción de personajes o ambientes y diálogos, cartas personales y esquelas, notas de enciclopedia, etc.- que puedan ser comprendidos por ellos y por otros (lo que supone: separar la mayoría de las oraciones en los textos por medio del punto y la mayúscula; respetar las convenciones propias de la puesta en página -renglón y margen-, colocar títulos), en el marco de condiciones que permitan discutir y consensuar el propósito, idear el contenido con el maestro, redactar y releer borradores del texto (revisando su organización, la ortografía y la puntuación) y reformularlo conjuntamente a partir de las orientaciones del docente.',
        fuente: `${NAP1} p.26`,
        grado: 3,
        orden: 0,
      },
    ],
  },
  {
    materia: 'Lengua',
    nombre: 'Reflexión sobre la lengua',
    orden: 3,
    temas: [
      {
        nombre: 'Red semántica de los textos',
        textoOficial:
          'El reconocimiento de la red semántica de los textos leídos y escuchados: palabras o frases con las que se nombran (¿qué o quién es?) o califican (¿cómo es?) algunos elementos de los textos, y la reflexión sobre las palabras y expresiones para ampliar el vocabulario.',
        fuente: `${NAP1} p.24`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Familias de palabras',
        textoOficial:
          'La reflexión sobre el vocabulario: formación de familias de palabras (palabras derivadas de una raíz común), en colaboración con el docente.',
        fuente: `${NAP1} p.24`,
        grado: 2,
        orden: 1,
      },
      {
        nombre: 'Uso del punto',
        textoOficial:
          'El uso de signos de puntuación para la lectura y la escritura de textos: el punto. El uso de mayúsculas después de punto.',
        fuente: `${NAP1} p.24`,
        grado: 2,
        orden: 2,
      },
      {
        nombre: 'Convenciones ortográficas básicas',
        textoOficial:
          'La duda sobre la correcta escritura de palabras y el descubrimiento, el reconocimiento y la aplicación de convenciones ortográficas propias del sistema (Ej.: bl, mp, que – qui, gue - gui, etc.).',
        fuente: `${NAP1} p.24`,
        grado: 2,
        orden: 3,
      },
      {
        nombre: 'Red semántica de los textos',
        textoOficial:
          'El reconocimiento de la red semántica de los textos leídos y escuchados: palabras o frases con las que se nombran (¿qué o quién es?) o califican (¿cómo es?) algunos elementos de los textos; palabras que dan cuenta de las acciones y aquellas que indican el lugar y el paso del tiempo en los textos narrativos; relaciones de sinonimia y antonimia entre las palabras; y la reflexión sobre las palabras y expresiones para ampliar el vocabulario.',
        fuente: `${NAP1} p.26`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Familias de palabras',
        textoOficial:
          'La reflexión sobre el vocabulario: formación de familias de palabras (palabras derivadas de una raíz común) para realizar reformulaciones en los textos escritos y para inferir significados en la comprensión.',
        fuente: `${NAP1} p.26`,
        grado: 3,
        orden: 1,
      },
      {
        nombre: 'Sustantivos, adjetivos y verbos',
        textoOficial:
          'El reconocimiento de sustantivos comunes (concretos) y propios, adjetivos (calificativos) y verbos de acción.',
        fuente: `${NAP1} p.26`,
        grado: 3,
        orden: 2,
      },
      {
        nombre: 'Signos de puntuación ampliados',
        textoOficial:
          'El uso de signos de puntuación para la lectura y la escritura de textos: punto (y uso de mayúsculas después del punto), coma en enumeración y signos de interrogación y exclamación.',
        fuente: `${NAP1} p.26`,
        grado: 3,
        orden: 3,
      },
      {
        nombre: 'Convenciones y reglas ortográficas',
        textoOficial:
          'La duda sobre la correcta escritura de palabras y el descubrimiento, el reconocimiento y la aplicación de algunas convenciones ortográficas propias del sistema (Ej: mb, nr) y reglas sin excepciones (Ej: -z -ces, -aba del pretérito imperfecto) y uso de mayúsculas.',
        fuente: `${NAP1} p.26`,
        grado: 3,
        orden: 4,
      },
      {
        nombre: 'Sílaba tónica',
        textoOficial: 'La identificación de la sílaba tónica de las palabras.',
        fuente: `${NAP1} p.26`,
        grado: 3,
        orden: 5,
      },
    ],
  },
  {
    materia: 'Lengua',
    nombre: 'Lectura y producción escrita',
    orden: 4,
    temas: [
      {
        nombre: 'Lectura con propósitos diversos',
        textoOficial:
          'La participación asidua en situaciones de lectura con propósitos diversos (leer para aprender, para hacer, para informarse, para averiguar un dato, para compartir con otros lo leído, por goce estético) de distintos textos presentes en diversos portadores, en variados escenarios y circuitos de lectura (bibliotecas de aula, escolares y populares; ferias del libro, entre otros). Esto requiere poner en juego, con ayuda del docente, estrategias de lectura adecuadas a la clase de texto y al propósito de la lectura (consultar algunos elementos del paratexto; relacionar los datos del texto con sus conocimientos; realizar inferencias; detectar la información relevante; establecer relaciones entre el texto, las ilustraciones y/o los esquemas que puedan acompañarlo; inferir el significado de las palabras desconocidas a través de las pistas que el propio texto brinda –por ejemplo, campos semánticos o familias de palabras– y la consulta del diccionario) y la recuperación de la información relevante de manera resumida. Monitorear, con ayuda del docente, los propios procesos de comprensión, recuperando lo que se entiende e identificando y buscando mejorar la comprensión de lo que no se ha entendido, a través de preguntas al docente y de la relectura.',
        fuente: `${NAP2} p.36`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Búsqueda en la biblioteca',
        textoOficial:
          'La búsqueda y consulta de materiales en la biblioteca de aula, escolar, popular y de otras instituciones, con asiduidad y variedad de propósitos. Búsqueda y localización de la información, con la colaboración del docente y/o el bibliotecario, utilizando los índices y otros elementos paratextuales (solapas, tapas y contratapas de los libros, primera página, entre otros).',
        fuente: `${NAP2} p.36`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Proceso de escritura de textos',
        textoOficial:
          'La escritura de textos con un propósito comunicativo determinado, en el marco de condiciones que permitan, conjuntamente con el docente, sus pares y de manera individual, planificar el texto en función de los parámetros de la situación comunicativa y del texto elegido y, de ser necesario, consultar material bibliográfico; redactar realizando por lo menos un borrador del texto previamente planificado; revisar el texto, concentrándose selectivamente en algunos aspectos (organización de las ideas, empleo de conectores, respeto de la forma, empleo del vocabulario, organización de las oraciones, puntuación, ortografía). Reformular el escrito, conjuntamente con el docente, con sus pares y/o de manera individual, a partir de las orientaciones del primero.',
        fuente: `${NAP2} p.36`,
        grado: 4,
        orden: 2,
      },
      {
        nombre: 'Escritura de textos no ficcionales',
        textoOficial:
          'La escritura de textos no ficcionales, con un propósito comunicativo determinado: narraciones presentando las personas, respetando el orden temporal y causal de las acciones e incluyendo descripciones (si el texto elegido y la situación comunicativa lo requieren); diálogos encabezados por un breve marco narrativo; descripciones en las que se respete un orden de presentación y se utilice un campo léxico adecuado para designar procesos, partes, forma, color, tamaño; exposiciones que incluyan presentación del tema, desarrollo y cierre; cartas personales respetando el formato propio de la carta e incluyendo rutinas convencionales (fórmulas de apertura y cierre). En todos los casos, supone mantener el tema, utilizar los signos de puntuación correspondientes (punto y seguido, punto y aparte, coma para la aclaración y para encerrar la aposición, dos puntos), controlar la ortografía, emplear los conectores apropiados, ajustarse a la organización propia del texto e incluir un vocabulario adecuado que refiera al tema tratado evitando repeticiones innecesarias.',
        fuente: `${NAP2} p.37`,
        grado: 4,
        orden: 3,
      },
      {
        nombre: 'Lectura con propósitos diversos',
        textoOficial:
          'La participación asidua en situaciones de lectura con propósitos diversos (leer para aprender, para hacer, para informarse, para averiguar un dato, para compartir con otros lo leído, por goce estético), de distintos textos presentes en diversos portadores, en variados escenarios y circuitos de lectura (bibliotecas de aula, escolares y populares, ferias del libro, entre otros). Esto requiere poner en juego, con la colaboración del docente, estrategias de lectura adecuadas a la clase de texto y al propósito de la lectura (consultar algunos elementos del paratexto; reconocer la intencionalidad del texto; relacionar los datos del texto con sus conocimientos; realizar inferencias; detectar la información relevante; establecer relaciones entre el texto, las ilustraciones y/o los esquemas que puedan acompañarlo; inferir el significado de las palabras desconocidas a través de las pistas que el propio texto brinda –por ejemplo, campos semánticos o familias de palabras– y la consulta del diccionario, entre otras); reconocer algunos procedimientos propios del texto leído (ejemplos, definiciones y comparaciones, en el expositivo; secuencialidad, en el narrativo; turnos de intercambio, en la conversación; partes y características, en el descriptivo; sucesión del proceso, en el instructivo) y emplear, con la colaboración del docente, diversas estrategias para recuperar posteriormente la información importante de manera resumida. Monitorear, con la colaboración del docente, los propios procesos de comprensión, recuperando lo que se entiende e identificando y buscando mejorar la comprensión de lo que no se ha entendido, a través de preguntas al docente y la relectura. Leer frente a un auditorio en situaciones que le den sentido a esta práctica, con fluidez.',
        fuente: `${NAP2} p.41`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Búsqueda en la biblioteca',
        textoOficial:
          'La búsqueda y consulta de materiales en la biblioteca de aula, escolar, popular y de otras instituciones, con asiduidad y variedad de propósitos. Búsqueda y localización de la información, con la colaboración del docente y/o el bibliotecario, utilizando los índices y otros elementos paratextuales (solapas, tapas y contratapas de los libros, primera página, entre otros).',
        fuente: `${NAP2} p.42`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Proceso de escritura de textos',
        textoOficial:
          'La escritura de textos con un propósito comunicativo determinado, en el marco de condiciones que permitan, conjuntamente con el docente, sus pares y de manera individual, planificar el texto en función de los parámetros de la situación comunicativa y del texto elegido y, de ser necesario, consultar material bibliográfico; tomar notas identificando las fuentes de consulta; seleccionar y jerarquizar la información; redactar realizando por lo menos un borrador del texto previamente planificado; revisar el texto, concentrándose selectivamente en algunos aspectos (organización de las ideas, empleo de conectores, respeto de la forma, empleo del vocabulario, organización de las oraciones, puntuación, ortografía). Reformular el escrito, conjuntamente con el docente, con sus pares y/o de manera individual, a partir de las orientaciones del primero.',
        fuente: `${NAP2} p.42`,
        grado: 5,
        orden: 2,
      },
      {
        nombre: 'Escritura de textos no ficcionales',
        textoOficial:
          'La escritura de textos no ficcionales con un propósito comunicativo determinado: narraciones, presentando las personas, respetando el orden temporal y causal de las acciones e incluyendo descripciones y diálogos (si el texto elegido y la situación comunicativa lo requieren); diálogos encabezados por un breve marco narrativo; descripciones en las que se respete un orden de presentación y utilice un campo léxico adecuado para designar procesos, partes, forma, color, tamaño; exposiciones de al menos tres párrafos que incluyan presentación del tema, desarrollo y cierre, ejemplos, comparaciones; cartas personales respetando el formato propio de la carta e incluyendo rutinas convencionales (fórmulas de apertura y cierre). En todos los casos, supone mantener el tema, controlar la ortografía, utilizar los signos de puntuación correspondientes (punto y seguido, punto y aparte, coma para la aclaración y para encerrar la aposición, dos puntos para el estilo directo y para los textos epistolares, paréntesis para las aclaraciones, raya de diálogo), emplear los conectores apropiados, ajustarse a la organización propia del texto e incluir el vocabulario aprendido que refiera al tema tratado, evitando repeticiones innecesarias.',
        fuente: `${NAP2} p.42`,
        grado: 5,
        orden: 3,
      },
      {
        nombre: 'Lectura con propósitos diversos',
        textoOficial:
          'La participación asidua en situaciones de lectura con propósitos diversos (leer para aprender, para informarse, para hacer, para averiguar un dato, para compartir con otros lo leído, para confrontar datos, por goce estético) de distintos textos presentes en diversos portadores, en variados escenarios y circuitos de lectura (bibliotecas de aula, escolares y populares, ferias del libro, entre otros). Esto requiere poner en juego, con la colaboración del docente, estrategias de lectura adecuadas a la clase de texto y al propósito de la lectura (consultar algunos elementos del paratexto; reconocer la intencionalidad del texto, relacionar los datos del texto con sus conocimientos; realizar inferencias; detectar la información relevante; establecer relaciones entre el texto, las ilustraciones y/o los esquemas que puedan acompañarlo; inferir el significado de las palabras desconocidas a través de las pistas que el propio texto brinda –por ejemplo, campos semánticos o familias de palabras– y la consulta del diccionario, determinando, la acepción correspondiente); reconocer procedimientos propios del texto leído y emplear diversas estrategias para recuperar posteriormente la información relevante de manera resumida según el propósito. Reformular el texto utilizando expresiones más generales y conectando adecuadamente las ideas. Monitorear los propios procesos de comprensión, recuperando lo que se entiende e identificando y buscando mejorar la comprensión de lo que no se ha entendido, a través de preguntas al docente y la relectura. Leer con fluidez frente a un auditorio en situaciones que le den sentido a esta práctica.',
        fuente: `${NAP2} p.47`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Búsqueda en la biblioteca',
        textoOficial:
          'La búsqueda y consulta de materiales en la biblioteca de aula, escolar, popular y de otras instituciones, con asiduidad y variedad de propósitos. Búsqueda y localización de la información, con la colaboración del docente y/o el bibliotecario, utilizando los índices y otros elementos paratextuales (solapas, tapas y contratapas de los libros, primera página, entre otros), del manejo de los criterios básicos de clasificación o catalogación y de la consulta de fichas bibliográficas.',
        fuente: `${NAP2} p.48`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Proceso de escritura de textos',
        textoOficial:
          'La escritura de textos en el marco de condiciones que permitan conjuntamente con el docente, sus pares y/o de manera individual, planificar el texto en función de los parámetros de la situación comunicativa y del texto elegido y, de ser necesario, consultar material bibliográfico, vincular la información presente en los textos de consulta, seleccionando de cada uno lo relevante o distintivo, tomar notas jerarquizando la información e identificando las fuentes de consulta; redactar realizando por lo menos un borrador del texto previamente planificado; revisar el texto, concentrándose selectivamente en algunos aspectos (organización de las ideas, desarrollo del/de los tema/s, respeto de la forma, empleo del vocabulario, organización de la oración, puntuación, ortografía, empleo de conectores). Reformular el escrito, conjuntamente con el docente, sus pares o en forma individual, a partir de las orientaciones del primero.',
        fuente: `${NAP2} p.48`,
        grado: 6,
        orden: 2,
      },
      {
        nombre: 'Escritura de textos no ficcionales',
        textoOficial:
          'La escritura de textos no ficcionales con un propósito comunicativo determinado: narraciones, presentando las personas, respetando o alterando intencionalmente el orden cronológico (temporal), presentando causalidad de las acciones e incluyendo, si el texto elegido y la situación comunicativa lo requieren, diálogos y descripciones que permitan caracterizar animales, lugares, personas a través de sus atributos más significativos y que den cuenta de las cualidades de objetos atendiendo a forma, color, tamaño, textura, brillo; exposiciones de más de tres párrafos que incluyan presentación del tema, desarrollo y cierre, ejemplos, comparaciones, definiciones, como así también que integren cuadros, esquemas, organizadores gráficos al texto escrito; cartas formales con distintos propósitos y destinatarios, respetando el registro formal y utilizando las frases de apertura y cierre adecuadas al mismo. Para todos los textos, supone mantener la idea expresada, controlar la ortografía, utilizar los signos de puntuación correspondientes (punto y seguido, punto y aparte, coma para la aclaración y para encerrar la aposición, dos puntos para el estilo directo y para los textos epistolares, paréntesis para las aclaraciones, guión con valor de paréntesis, puntos supensivos), emplear los conectores apropiados, ajustarse a la organización propia del texto e incluir el vocabulario aprendido que refiera al tema tratado, evitando repeticiones innecesarias.',
        fuente: `${NAP2} p.49`,
        grado: 6,
        orden: 3,
      },
      {
        nombre: 'Taller de lectura del área',
        textoOficial:
          'La participación asidua en taller de lectura de textos que divulguen temas específicos del área y del mundo de la cultura, que desarrollen información y opinión sobre el o los temas de manera ampliada (capítulos de libros, enciclopedias, textos en soporte electrónico, suplementos de diarios, revistas, entre otros) con propósitos diversos (leer para informarse, para construir opinión, para hacer, para averiguar un dato, para compartir con otros lo leído, para confrontar datos y opiniones). Esto supone:',
        fuente: `${NAP2} p.55`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Taller de textos no ficcionales',
        textoOficial:
          'La participación asidua en taller de escritura de textos no ficcionales, en situaciones comunicativas reales o simuladas (en pequeños grupos y/o de manera individual), referidos a temas específicos del área, del mundo de la cultura y de la vida ciudadana, experiencias personales, entre otras posibilidades, previendo diversos destinatarios, lo que supone:',
        fuente: `${NAP2} p.57`,
        grado: 7,
        orden: 1,
      },
    ],
  },
  {
    materia: 'Lengua',
    nombre: 'Literatura',
    orden: 5,
    temas: [
      {
        nombre: 'Literatura de tradición oral y autor',
        textoOficial:
          'La lectura (comprensión y disfrute) de obras literarias de tradición oral (relatos, cuentos, fábulas, leyendas, coplas, rondas, entre otras) y de obras literarias de autor (novela breve, cuentos, relatos, poesías, canciones, obras de teatro, de títeres, entre otras) para descubrir y explorar –con ayuda del docente– el mundo creado y recursos del discurso literario, realizar interpretaciones personales, construir significados compartidos con otros lectores (sus pares, el docente, otros adultos), expresar emociones y sentimientos; formarse como lector de literatura.',
        fuente: `${NAP2} p.37`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Relatos y textos de invención',
        textoOficial:
          'La producción de textos orales y escritos, de manera colectiva, en pequeños grupos y/o en forma individual: relatos ficcionales y nuevas versiones de narraciones literarias leídas o escuchadas, modificando la línea argumental, incluyendo diálogos, descripciones, personajes, entre otras posibilidades; textos de invención orientados a la desautomatización de la percepción y del lenguaje, priorizando el juego con la palabra y los sonidos. En todos los casos, supone la inclusión de recursos propios del discurso literario.',
        fuente: `${NAP2} p.37`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Literatura de tradición oral y autor',
        textoOficial:
          'La lectura (comprensión y disfrute) de obras literarias de tradición oral (relatos, cuentos, fábulas, leyendas, romances, coplas, rondas, entre otras) y de obras literarias de autor (novelas, cuentos, relatos, poesías, canciones, obras de teatro, de títeres, entre otras) para descubrir y explorar –con la colaboración del docente– el mundo creado y recursos del discurso literario, realizar interpretaciones personales teniendo en cuenta los indicios que da el texto y las características del género al que pertenece la obra, expresar las emociones, construir significados con otros lectores (sus pares, el docente, otros adultos); formarse como lector de literatura.',
        fuente: `${NAP2} p.43`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Relatos y textos de invención',
        textoOficial:
          'La producción de textos orales y escritos, de manera colectiva, en pequeños grupos y/o en forma individual: relatos ficcionales y nuevas versiones de narraciones literarias leídas o escuchadas, modificando la línea argumental, las características de los personajes, el tiempo y/o el espacio del mundo narrado, incluyendo diálogos, descripciones, personajes y/o sus características, entre otras posibilidades; textos de invención orientados a la desautomatización de la percepción y del lenguaje, priorizando el juego con la palabra y los sonidos. En todos los casos, supone la inclusión de recursos propios del discurso literario.',
        fuente: `${NAP2} p.43`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Literatura de tradición oral y autor',
        textoOficial:
          'La lectura (comprensión y disfrute) de obras literarias de tradición oral (relatos, cuentos, mitos, fábulas, leyendas, parábolas, romances, coplas, entre otras) y de obras literarias de autor (novelas, cuentos, relatos, poesías, canciones, obras de teatro, entre otras) para descubrir y explorar –con la colaboración del docente– el vínculo entre el mundo creado y los recursos del discurso literario y entre el texto y otros textos conocidos (del mismo autor, del mismo género, la misma temática, adaptaciones en otros códigos –historietas, cine–), realizar interpretaciones personales teniendo en cuenta los indicios que da el texto y las características del género al que pertenece, como también expresar las emociones y sentimientos que genera la obra y compartir significados con otros lectores (sus pares, el docente, otros adultos); formarse como lector de literatura.',
        fuente: `${NAP2} p.49`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Relatos y textos de invención',
        textoOficial:
          'La producción de textos orales y escritos, de manera colectiva, en pequeños grupos y/o en forma individual: relatos ficcionales y nuevas versiones de narraciones literarias leídas o escuchadas, modificando la línea argumental, las características de los personajes, el tiempo y/o el espacio del mundo narrado, incluyendo diálogos, descripciones, personajes y/o sus características, entre otras posibilidades; textos de invención orientados a la desautomatización de la percepción y del lenguaje, priorizando el juego con la palabra y los sonidos. En todos los casos, supone la inclusión de recursos propios del discurso literario.',
        fuente: `${NAP2} p.50`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Literatura de tradición oral y autor',
        textoOficial:
          'Escucha atenta y lectura frecuente de textos literarios de la tradición oral y de autores regionales, nacionales y universales e incorporación paulatina de procedimientos del discurso literario y de las reglas de los distintos géneros para ampliar su interpretación, disfrutar, confrontar con otros su opinión, recomendar, definir sus preferencias, iniciar un itinerario personal de lectura con la orientación del docente y otros mediadores (familia, bibliotecarios, los pares, entre otros).',
        fuente: `${NAP2} p.59`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Textos de invención y relatos',
        textoOficial:
          'Producción sostenida de textos de invención, que los ayude a desnaturalizar su relación con el lenguaje, y de relatos, que pongan en juego las convenciones propias de los géneros de las obras leídas, para posibilitar experiencias de pensamiento, de interpretación y de escritura. Esto supone, en situaciones de taller:',
        fuente: `${NAP2} p.59`,
        grado: 7,
        orden: 1,
      },
    ],
  },
  {
    materia: 'Lengua',
    nombre: 'Reflexión sobre la lengua (sistema, norma y uso) y los textos',
    orden: 6,
    temas: [
      {
        nombre: 'Lenguas y variedades de la comunidad',
        textoOficial:
          'El reconocimiento de las lenguas y variedades lingüísticas que se hablan en la comunidad.',
        fuente: `${NAP2} p.38`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Reflexión gramatical y textual',
        textoOficial:
          'La reflexión a través de la identificación, con ayuda del docente, de unidades y relaciones gramaticales y textuales distintivas de los textos leídos y producidos en el año, lo que supone reconocer y emplear:',
        fuente: `${NAP2} p.38`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Ortografía y signos de puntuación',
        textoOficial:
          'El conocimiento de la ortografía correspondiente al vocabulario de uso, de reglas ortográficas (tildación y uso de letras) y de algunos signos de puntuación, lo que supone reconocer y emplear:',
        fuente: `${NAP2} p.38`,
        grado: 4,
        orden: 2,
      },
      {
        nombre: 'Lenguas y variedades de la comunidad',
        textoOficial:
          'El reconocimiento de las lenguas y variedades lingüísticas que se hablan en la comunidad y están presentes en la literatura y en los medios de comunicación.',
        fuente: `${NAP2} p.43`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Reflexión gramatical y textual',
        textoOficial:
          'La reflexión a través de la identificación, con ayuda del docente, de unidades y relaciones gramaticales y textuales distintivas de los textos leídos y producidos en el año, lo que supone reconocer y emplear:',
        fuente: `${NAP2} p.43`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Ortografía y signos de puntuación',
        textoOficial:
          'El conocimiento de la ortografía correspondiente al vocabulario de uso, de reglas ortográficas (tildación y uso de letras) y de algunos signos de puntuación, lo que supone reconocer y emplear:',
        fuente: `${NAP2} p.44`,
        grado: 5,
        orden: 2,
      },
      {
        nombre: 'Lenguas y variedades de la comunidad',
        textoOficial:
          'El reconocimiento de las lenguas y variedades lingüísticas que se hablan en la comunidad y están presentes en la literatura y en los medios de comunicación.',
        fuente: `${NAP2} p.50`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Reflexión gramatical y textual',
        textoOficial:
          'La reflexión a través de la identificación, con ayuda del docente, de unidades y relaciones gramaticales y textuales distintivas de los textos leídos y producidos en el año, lo que supone reconocer y emplear:',
        fuente: `${NAP2} p.50`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Reglas de acentuación, letras y puntuación',
        textoOficial:
          'El conocimiento de reglas de acentuación, uso de letras y puntuación, y de la ortografía correspondiente al vocabulario de uso, lo que supone reconocer y emplear:',
        fuente: `${NAP2} p.51`,
        grado: 6,
        orden: 2,
      },
      {
        nombre: 'Lenguas y variedades de la comunidad',
        textoOficial:
          'El reconocimiento y la valoración de las lenguas y variedades lingüísticas presentes en la comunidad, en los textos escritos y en los medios de comunicación audiovisuales para, con la orientación del docente, comprender las nociones de dialecto (geográfico y social) y registro y reflexionar sobre algunos usos locales, indagando las razones del prestigio o desprestigio de los dialectos y las lenguas.',
        fuente: `${NAP2} p.60`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Reflexión gramatical y textual sistemática',
        textoOficial:
          'La reflexión sistemática, con ayuda del docente, sobre distintas unidades y relaciones gramaticales y textuales distintivas de los textos trabajados en el año, así como en situaciones específicas que permitan resolver problemas, explorar, formular hipótesis y discutirlas, analizar, generalizar, formular ejemplos y contraejemplos, comparar, clasificar, aplicar pruebas, usando un metalenguaje compartido en relación con:',
        fuente: `${NAP2} p.60`,
        grado: 7,
        orden: 1,
      },
      {
        nombre: 'Reglas ortográficas del vocabulario cotidiano',
        textoOficial:
          'El conocimiento de algunas reglas ortográficas y de la ortografía correspondiente al vocabulario cotidiano y escolar, lo que supone conocer y emplear:',
        fuente: `${NAP2} p.62`,
        grado: 7,
        orden: 2,
      },
      {
        nombre: 'Uso correcto de signos de puntuación',
        textoOficial:
          'La reflexión acerca de los usos correctos y del sentido de algunos signos de puntuación:',
        fuente: `${NAP2} p.62`,
        grado: 7,
        orden: 3,
      },
    ],
  },

  // ============================ CIENCIAS SOCIALES ============================
  {
    materia: 'Ciencias Sociales',
    nombre: 'Sociedades y espacios geográficos',
    orden: 0,
    temas: [
      {
        nombre: 'Elementos de los espacios rurales',
        textoOficial:
          'El conocimiento de diversos elementos de la naturaleza y elementos construidos por la sociedad en diferentes espacios rurales, analizando especialmente las transformaciones de la naturaleza que las sociedades realizan para la producción de algún bien primario (tomando ejemplos de espacios cercanos y lejanos).',
        fuente: `${NAP1} p.28`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Características de los espacios urbanos',
        textoOficial:
          'El conocimiento de las principales características de los espacios urbanos, analizando especialmente la forma en que se presta algún servicio, por ejemplo alguna actividad comercial, el abastecimiento de agua o el alumbrado público, etc., (en espacios cercanos y lejanos).',
        fuente: `${NAP1} p.28`,
        grado: 1,
        orden: 1,
      },
      {
        nombre: 'Actividades industriales',
        textoOficial:
          'El conocimiento de las principales características de las actividades industriales, analizando las distintas formas en que se organizan los espacios para producir bienes secundarios.',
        fuente: `${NAP1} p.29`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Sistema de transporte',
        textoOficial:
          'El conocimiento de las principales características de un sistema de transporte, analizando las principales relaciones entre el espacio rural y el espacio urbano, entre las actividades rurales y urbanas.',
        fuente: `${NAP1} p.29`,
        grado: 2,
        orden: 1,
      },
      {
        nombre: 'Circuito productivo',
        textoOficial:
          'El conocimiento de las principales relaciones que se establecen entre áreas urbanas y rurales (cercanas y lejanas, locales y regionales) a través del análisis de las distintas etapas que componen un circuito productivo (agrario, comercial e industrial), enfatizando en la identificación de los principales actores intervinientes.',
        fuente: `${NAP1} p.30`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Áreas rurales y ciudades',
        textoOficial:
          'El conocimiento de las principales características de las áreas rurales (elementos naturales, tipos de asentamiento, trabajos, etc.) y de ciudades (de distinto tamaño y función) a través de ejemplos contrastantes de nuestro país.',
        fuente: `${NAP1} p.30`,
        grado: 3,
        orden: 1,
      },
      {
        nombre: 'División política de la Argentina',
        textoOficial:
          'El conocimiento de la división política de la República Argentina, la localización de la provincia en el contexto nacional y su representación cartográfica.',
        fuente: `${NAP2} p.65`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Condiciones naturales y recursos',
        textoOficial:
          'La identificación de las condiciones naturales como oferta de recursos y de sus distintos modos de aprovechamiento y conservación en la Argentina, con especial énfasis en la provincia.',
        fuente: `${NAP2} p.65`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Áreas protegidas',
        textoOficial:
          'La valoración de la existencia y el conocimiento de las particularidades de las áreas protegidas en la Argentina, con especial énfasis en la provincia.',
        fuente: `${NAP2} p.65`,
        grado: 4,
        orden: 2,
      },
      {
        nombre: 'Problemas ambientales locales y regionales',
        textoOficial:
          'El reconocimiento de los principales problemas ambientales a escala local, provincial y/o regional, teniendo en cuenta el modo en que afectan a la población y al territorio.',
        fuente: `${NAP2} p.65`,
        grado: 4,
        orden: 3,
      },
      {
        nombre: 'Espacios rurales de la Argentina',
        textoOficial:
          'El conocimiento de diferentes espacios rurales de la Argentina, en particular de la provincia, reconociendo los principales recursos naturales valorados, las actividades económicas, la tecnología aplicada y los diferentes actores sociales, sus condiciones de trabajo y de vida, utilizando material cartográfico pertinente.',
        fuente: `${NAP2} p.65`,
        grado: 4,
        orden: 4,
      },
      {
        nombre: 'Espacios urbanos de la Argentina',
        textoOficial:
          'El conocimiento de los espacios urbanos de la Argentina, en particular de la provincia, reconociendo los distintos usos del suelo en ciudades pequeñas y grandes, las actividades económicas, los diferentes actores sociales y sus condiciones de trabajo y de vida, utilizando material cartográfico pertinente.',
        fuente: `${NAP2} p.65`,
        grado: 4,
        orden: 5,
      },
      {
        nombre: 'Mapa político del mundo actual',
        textoOficial:
          'El conocimiento del mapa político del mundo actual teniendo en cuenta sus cambios recientes y los distintos tipos de relaciones entre países.',
        fuente: `${NAP2} p.71`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Ambientes y recursos naturales del mundo',
        textoOficial:
          'El conocimiento de diferentes ambientes del mundo, así como la identificación de los distintos tipos de recursos naturales y sus variadas formas de aprovechamiento.',
        fuente: `${NAP2} p.71`,
        grado: 7,
        orden: 1,
      },
      {
        nombre: 'Problemas ambientales a distintas escalas',
        textoOficial:
          'La comprensión y explicación de las principales causas y consecuencias de los problemas ambientales más importantes a diferentes escalas, así como de las políticas ambientales de mayor relevancia.',
        fuente: `${NAP2} p.71`,
        grado: 7,
        orden: 2,
      },
      {
        nombre: 'Población mundial',
        textoOficial:
          'El conocimiento de las características de la población mundial y la comprensión y explicación de sus principales problemáticas, particularmente las vinculadas con la distribución, las migraciones y las condiciones de vida.',
        fuente: `${NAP2} p.71`,
        grado: 7,
        orden: 3,
      },
      {
        nombre: 'Procesos productivos urbanos y rurales',
        textoOficial:
          'El conocimiento de los procesos productivos en espacios urbanos y rurales seleccionados, teniendo en cuenta los actores sociales implicados y sus intencionalidades, así como el impacto diferencial de las tecnologías de producción, información y comunicación en las formas de organización territorial.',
        fuente: `${NAP2} p.71`,
        grado: 7,
        orden: 4,
      },
    ],
  },
  {
    materia: 'Ciencias Sociales',
    nombre: 'Organización de los espacios geográficos',
    orden: 3,
    temas: [
      {
        nombre: 'Organización y delimitación política del territorio',
        textoOficial:
          'El conocimiento de la organización y delimitación política del territorio argentino (municipio, provincia, país) y su representación cartográfica.',
        fuente: `${NAP2} p.67`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Recursos naturales de la Argentina',
        textoOficial:
          'El conocimiento de las condiciones naturales y la comprensión de la importancia socio-económica de los principales recursos naturales de la Argentina.',
        fuente: `${NAP2} p.67`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Problemas ambientales de la Argentina',
        textoOficial:
          'El conocimiento de las múltiples causas y consecuencias de los principales problemas ambientales de la Argentina y el análisis de alternativas de solución.',
        fuente: `${NAP2} p.67`,
        grado: 5,
        orden: 2,
      },
      {
        nombre: 'Circuitos agroindustriales regionales',
        textoOficial:
          'El conocimiento de diferentes espacios rurales de la Argentina a través del estudio de las distintas etapas productivas de los circuitos agroindustriales regionales.',
        fuente: `${NAP2} p.67`,
        grado: 5,
        orden: 3,
      },
      {
        nombre: 'Funciones urbanas en distintas ciudades',
        textoOficial:
          'El conocimiento de diferentes espacios urbanos de la Argentina a través de la descripción y comparación de distintas funciones urbanas en ciudades pequeñas, medianas y grandes.',
        fuente: `${NAP2} p.67`,
        grado: 5,
        orden: 4,
      },
      {
        nombre: 'Modos de satisfacer necesidades sociales',
        textoOficial:
          'El conocimiento de los diferentes modos de satisfacer necesidades sociales (trabajo, salud, vivienda, educación, transporte, entre otras) para caracterizar las condiciones de vida de la población.',
        fuente: `${NAP2} p.67`,
        grado: 5,
        orden: 5,
      },
      {
        nombre: 'Integración regional y MERCOSUR',
        textoOficial:
          'El conocimiento del mapa político de América Latina y de los procesos de integración regional, en especial el MERCOSUR, considerando distintos tipos de relaciones con el resto del mundo.',
        fuente: `${NAP2} p.69`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Condiciones ambientales argentinas y latinoamericanas',
        textoOficial:
          'El conocimiento de las principales condiciones ambientales de la Argentina y de América Latina y el establecimiento de relaciones entre los principales usos y funciones de los recursos naturales con la producción de materias primas y energía.',
        fuente: `${NAP2} p.69`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Problemas ambientales argentinos y latinoamericanos',
        textoOficial:
          'La identificación y comparación de las múltiples causas y consecuencias de los principales problemas ambientales de la Argentina y de América Latina que afectan al territorio y a la población, atendiendo a las distintas escalas geográficas implicadas.',
        fuente: `${NAP2} p.69`,
        grado: 6,
        orden: 2,
      },
      {
        nombre: 'Dinámica demográfica de la población argentina',
        textoOficial:
          'El conocimiento de la composición y la dinámica demográfica de la población argentina, sus condiciones de trabajo y calidad de vida a través del análisis de distintos indicadores demográficos y socio-económicos (fuentes censales, periodísticas, testimoniales, entre otras).',
        fuente: `${NAP2} p.69`,
        grado: 6,
        orden: 3,
      },
      {
        nombre: 'Espacios rurales argentinos y latinoamericanos',
        textoOficial:
          'El análisis y la comparación de diferentes espacios rurales de la Argentina y América Latina a través del tratamiento de distintos sistemas agrarios y tipos de productores.',
        fuente: `${NAP2} p.69`,
        grado: 6,
        orden: 4,
      },
      {
        nombre: 'Espacio urbano argentino y latinoamericano',
        textoOficial:
          'El análisis y la comparación del espacio urbano argentino y latinoamericano a través de la identificación de las principales funciones urbanas, las actividades económicas y las condiciones de vida de la población de las ciudades latinoamericanas.',
        fuente: `${NAP2} p.69`,
        grado: 6,
        orden: 5,
      },
    ],
  },
  {
    materia: 'Ciencias Sociales',
    nombre: 'Sociedades a través del tiempo',
    orden: 1,
    temas: [
      {
        nombre: 'Vida cotidiana en el pasado',
        textoOficial:
          'El conocimiento de la vida cotidiana (organización familiar, roles de hombres, mujeres y niños, formas de crianza, cuidado de la salud, educación y recreación, trabajo, etc.) de familias representativas de distintos grupos sociales en diferentes sociedades del pasado*, contrastando con la sociedad del presente.',
        fuente: `${NAP1} p.28`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Vida cotidiana y conflictos del pasado',
        textoOficial:
          'El conocimiento de la vida cotidiana de familias representativas de distintos grupos sociales en diversas sociedades del pasado*, enfatizando en los conflictos más característicos de las sociedades estudiadas.',
        fuente: `${NAP1} p.29`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Procesos sociales y políticos del pasado',
        textoOficial:
          'El conocimiento del impacto de los principales procesos sociales y políticos sobre la vida cotidiana de distintos grupos sociales, en diversas sociedades del pasado*.',
        fuente: `${NAP1} p.30`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Sociedades indígenas antes de la conquista',
        textoOficial:
          'El conocimiento de las diferentes formas en que las sociedades indígenas cazadoras-recolectoras y agricultoras se relacionaron con la naturaleza para resolver sus problemas de supervivencia, distribuyeron los bienes producidos, constituyeron distintas formas de autoridad y elaboraron distintos sistemas de creencias, previo a la llegada de los europeos.',
        fuente: `${NAP2} p.65`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Conquista europea de América',
        textoOficial:
          'El reconocimiento de las principales motivaciones que impulsaron a los europeos, desde el siglo XV, a explorar y conquistar el continente americano y del impacto de su acción sobre las formas de vida de las sociedades indígenas, atendiendo especialmente a las particularidades regionales.',
        fuente: `${NAP2} p.65`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Organización y conflictos de la colonia',
        textoOficial:
          'El conocimiento de la organización de la sociedad colonial y de sus conflictos con particular énfasis en las actividades productivas y comerciales, en la organización del espacio y en las formas de vida, las creencias y los derechos y obligaciones de los diferentes actores sociales, atendiendo especialmente a las particularidades regionales.',
        fuente: `${NAP2} p.66`,
        grado: 4,
        orden: 2,
      },
      {
        nombre: 'Causas de la Revolución de Mayo',
        textoOficial:
          'El conocimiento de las múltiples causas de la Revolución de Mayo y de los conflictos derivados de la ruptura del sistema colonial en el ex-virreinato.',
        fuente: `${NAP2} p.67`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Impacto de las guerras de independencia',
        textoOficial:
          'La comprensión del impacto de las guerras de independencia sobre la vida cotidiana de los distintos grupos sociales.',
        fuente: `${NAP2} p.67`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Producción y comercio criollos',
        textoOficial:
          'El conocimiento de las formas de producir y comerciar de los diferentes grupos sociales en la sociedad criolla entre 1820 y 1850.',
        fuente: `${NAP2} p.67`,
        grado: 5,
        orden: 2,
      },
      {
        nombre: 'Confrontaciones por proyectos de país',
        textoOficial:
          'El conocimiento de las confrontaciones por distintos proyectos de país entre diferentes grupos y provincias.',
        fuente: `${NAP2} p.67`,
        grado: 5,
        orden: 3,
      },
      {
        nombre: 'Organización del Estado nacional (1853-1880)',
        textoOficial:
          'El reconocimiento de los principales conflictos y acuerdos que llevaron a la organización del Estado nacional argentino durante el período 1853-1880.',
        fuente: `${NAP2} p.69`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Políticas del modelo agroexportador',
        textoOficial:
          'El análisis de las políticas implementadas durante la segunda mitad del siglo XIX y comienzos del siglo XX para favorecer el desarrollo de una economía agraria para la exportación (conquista de las tierras aborígenes, aliento a la inmigración ultramarina e importación de capitales extranjeros).',
        fuente: `${NAP2} p.69`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Sociedad aluvional (1860-1930)',
        textoOficial:
          'El conocimiento de la sociedad aluvional (1860-1930), con particular énfasis en los cambios sociales, políticos y demográficos, así como en las características de la producción agropecuaria, de la infraestructura de transportes y comunicaciones y de la urbanización.',
        fuente: `${NAP2} p.70`,
        grado: 6,
        orden: 2,
      },
      {
        nombre: 'Impacto regional del modelo agroexportador',
        textoOficial: 'El conocimiento del impacto del modelo agroexportador en las distintas realidades regionales.',
        fuente: `${NAP2} p.70`,
        grado: 6,
        orden: 3,
      },
      {
        nombre: 'Sociedades paleolíticas y Revolución Neolítica',
        textoOficial:
          'El reconocimiento de los cambios que se producen en ciertas sociedades paleolíticas a partir de la Revolución Neolítica, enfatizando en el modo en que se organizaron (división del trabajo, organización social y formas de autoridad) para satisfacer sus necesidades básicas.',
        fuente: `${NAP2} p.71`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Organización de Estados en la Antigüedad',
        textoOficial:
          'El conocimiento de las formas en que se organizaron los Estados en las sociedades antiguas, en relación con la organización de los trabajos, la distribución del excedente, la legitimación del poder a través del culto y la jerarquización social, a partir del estudio de dos casos.',
        fuente: `${NAP2} p.71`,
        grado: 7,
        orden: 1,
      },
      {
        nombre: 'Crisis del imperio romano',
        textoOficial:
          'La comprensión de las múltiples e interrelacionadas consecuencias de la crisis del imperio romano y el análisis del pasaje del predominio económico, político y cultural del mundo romano a la fragmentación del occidente europeo.',
        fuente: `${NAP2} p.72`,
        grado: 7,
        orden: 2,
      },
      {
        nombre: 'Sociedades hebrea, bizantina, musulmana y cristiana',
        textoOficial:
          'El análisis de las creencias, valores y costumbres de las sociedades hebrea, bizantina, musulmana y cristiana en relación con las formas de organización de la economía, la sociedad y la política, estableciendo similitudes y diferencias.',
        fuente: `${NAP2} p.72`,
        grado: 7,
        orden: 3,
      },
      {
        nombre: 'Ciudades y sociedad feudoburguesa',
        textoOficial:
          'El conocimiento del proceso de surgimiento y desarrollo de las ciudades en el mundo feudal a partir del siglo XI, y el reconocimiento de las principales características de la sociedad feudoburguesa (actividades económicas, formas de pensar, vivir y sentir, grupos sociales, distribución del poder y conflictos) en estos nuevos espacios urbanos.',
        fuente: `${NAP2} p.72`,
        grado: 7,
        orden: 4,
      },
    ],
  },
  {
    materia: 'Ciencias Sociales',
    nombre: 'Actividades humanas y organización social',
    orden: 2,
    temas: [
      {
        nombre: 'Instituciones sociales',
        textoOficial:
          'El conocimiento de que en las sociedades existen instituciones que dan distinto tipo de respuestas a las necesidades, deseos, elecciones e intereses de la vida en común (por ejemplo escuelas, hospitales, sociedades de fomento, clubes, O.N.Gs., centros culturales, cooperativas, etc.).',
        fuente: `${NAP1} p.28`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Diversidad y desigualdad social',
        textoOficial:
          'El conocimiento de que en el mundo actual conviven grupos de personas con diferentes costumbres, intereses, orígenes, que acceden de modo desigual a los bienes materiales y simbólicos (tomando ejemplos de nuestro país y de otros países del mundo).',
        fuente: `${NAP1} p.29`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Instituciones políticas',
        textoOficial:
          'El conocimiento de las principales instituciones y organizaciones políticas del medio local, provincial y nacional y sus principales funciones.',
        fuente: `${NAP1} p.30`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Conflictos y resolución democrática',
        textoOficial:
          'El conocimiento de la existencia de conflictos entre diversos grupos sociales y los distintos modos en que los mismos pueden resolverse en una sociedad democrática.',
        fuente: `${NAP1} p.30`,
        grado: 3,
        orden: 1,
      },
      {
        nombre: 'Niveles político-administrativos',
        textoOficial:
          'El reconocimiento de la forma de organización política de la Argentina y de los distintos niveles político-administrativos (nacional, provincial y municipal).',
        fuente: `${NAP2} p.66`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Instituciones sociales y políticas',
        textoOficial:
          'El conocimiento de distintas instituciones sociales y políticas (locales, provinciales y nacionales), sus ámbitos de actuación y las relaciones que se establecen entre ellas, con la sociedad y los distintos niveles de gobierno.',
        fuente: `${NAP2} p.66`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Derechos y obligaciones del ciudadano',
        textoOficial:
          'La comprensión de los diferentes derechos y obligaciones del ciudadano y de las normas básicas de convivencia social.',
        fuente: `${NAP2} p.66`,
        grado: 4,
        orden: 2,
      },
      {
        nombre: 'Costumbres y tradiciones de la comunidad',
        textoOficial:
          'El conocimiento de costumbres, sistemas de creencias, valores y tradiciones de la propia comunidad y de otras, para favorecer el respeto hacia modos de vida de culturas diferentes.',
        fuente: `${NAP2} p.66`,
        grado: 4,
        orden: 3,
      },
      {
        nombre: 'Carácter republicano y federal',
        textoOficial:
          'El reconocimiento del carácter republicano y federal de la Argentina y de la división de poderes, analizando sus respectivas funciones y atribuciones.',
        fuente: `${NAP2} p.68`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Desigualdad en el acceso a bienes',
        textoOficial:
          'El conocimiento y el desarrollo de una actitud crítica frente al hecho de que en la Argentina conviven grupos de personas que acceden de modo desigual a los bienes materiales y simbólicos.',
        fuente: `${NAP2} p.68`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Participación ciudadana',
        textoOficial:
          'La identificación de los distintos modos de participación ciudadana en el marco de una sociedad democrática, atendiendo a las nuevas formas de organización social y política (ONGs, comedores comunitarios, centros culturales, etc.).',
        fuente: `${NAP2} p.68`,
        grado: 5,
        orden: 2,
      },
      {
        nombre: 'Derechos del Niño y del Adolescente',
        textoOficial:
          'El conocimiento de la Convención Internacional de los Derechos del Niño y del Adolescente y el análisis de su vigencia en la Argentina.',
        fuente: `${NAP2} p.68`,
        grado: 5,
        orden: 3,
      },
      {
        nombre: 'Manifestaciones culturales del pasado y presente',
        textoOficial:
          'La identificación de diferentes manifestaciones culturales del pasado y del presente en la Argentina, analizando cambios y continuidades, así como reflexionando sobre el carácter histórico de dichas manifestaciones.',
        fuente: `${NAP2} p.68`,
        grado: 5,
        orden: 4,
      },
      {
        nombre: 'Relaciones entre niveles del Estado',
        textoOficial:
          'El análisis de las relaciones entre distintos niveles político-administrativos del Estado (nacional, provincial, municipal) para identificar acuerdos así como conflictos inter-jurisdiccionales.',
        fuente: `${NAP2} p.70`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Vínculos entre Estados y MERCOSUR',
        textoOficial:
          'El reconocimiento de los vínculos entre Estados nacionales en el marco de los procesos de integración regional, en especial el MERCOSUR.',
        fuente: `${NAP2} p.70`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Constituciones nacional y provincial',
        textoOficial:
          'El conocimiento de las constituciones nacional, provincial y/o de la Ciudad Autónoma de Buenos Aires (estructura, principios, declaraciones, derechos y garantías) y de su vigencia en el pasado y en el presente.',
        fuente: `${NAP2} p.70`,
        grado: 6,
        orden: 2,
      },
      {
        nombre: 'Declaración Universal de los Derechos Humanos',
        textoOficial:
          'El conocimiento de la Declaración Universal de los Derechos Humanos y el análisis de su vigencia en la Argentina y en América Latina.',
        fuente: `${NAP2} p.70`,
        grado: 6,
        orden: 3,
      },
      {
        nombre: 'Derechos de las minorías',
        textoOficial:
          'El conocimiento de los derechos de las minorías y de la responsabilidad del Estado frente a situaciones de discriminación y violación de derechos.',
        fuente: `${NAP2} p.70`,
        grado: 6,
        orden: 4,
      },
      {
        nombre: 'Manifestaciones culturales latinoamericanas',
        textoOficial:
          'La reflexión y la comparación entre diversas manifestaciones culturales en las sociedades latinoamericanas, promoviendo el respeto y la valoración de la diversidad.',
        fuente: `${NAP2} p.70`,
        grado: 6,
        orden: 5,
      },
      {
        nombre: 'Vida en sociedad: normas e instituciones',
        textoOficial:
          'El conocimiento de las principales características de la vida en sociedad, atendiendo especialmente al papel de las normas e instituciones, a las nociones de cooperación y solidaridad; a la diversidad y a las múltiples formas de desigualdad.',
        fuente: `${NAP2} p.72`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'División del trabajo y la producción',
        textoOficial:
          'El conocimiento de diferentes formas de organización y división del trabajo, así como de las distintas modalidades de producción, distribución y consumo.',
        fuente: `${NAP2} p.72`,
        grado: 7,
        orden: 1,
      },
      {
        nombre: 'Relaciones familiares y de parentesco',
        textoOficial:
          'El conocimiento de las principales características de las relaciones familiares y de parentesco, considerando distintos tipos de organización familiar y diferentes formas de socialización.',
        fuente: `${NAP2} p.72`,
        grado: 7,
        orden: 2,
      },
      {
        nombre: 'Instituciones y formas de acción política',
        textoOficial:
          'El reconocimiento de las principales instituciones y formas de acción política, caracterizando diferentes sistemas políticos y las formas de ejercicio del poder y la autoridad.',
        fuente: `${NAP2} p.72`,
        grado: 7,
        orden: 3,
      },
      {
        nombre: 'Construcción social de las normas',
        textoOficial:
          'El conocimiento del proceso de construcción social de las normas y de las bases para la construcción de un sistema legal, atendiendo especialmente a la relación entre las normas, los contextos históricos y las acciones sociales.',
        fuente: `${NAP2} p.72`,
        grado: 7,
        orden: 4,
      },
      {
        nombre: 'Sistemas de conocimientos y creencias',
        textoOficial:
          'La comprensión de aspectos centrales de los sistemas de conocimientos y creencias como parte del contexto social.',
        fuente: `${NAP2} p.72`,
        grado: 7,
        orden: 5,
      },
    ],
  },

  // ============================ CIENCIAS NATURALES ============================
  {
    materia: 'Ciencias Naturales',
    nombre: 'Seres vivos: diversidad, unidad, interrelaciones y cambios',
    orden: 0,
    temas: [
      {
        nombre: 'Diversidad de seres vivos',
        textoOficial:
          'La comprensión de que existe una gran diversidad de seres vivos que poseen algunas características comunes y otras diferentes y que estas características sirven para agruparlos.',
        fuente: `${NAP1} p.32`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Hábitos saludables',
        textoOficial:
          'El conocimiento y desarrollo de acciones que promuevan hábitos saludables, reconociendo las posibilidades y ventajas de estas conductas.',
        fuente: `${NAP1} p.32`,
        grado: 1,
        orden: 1,
      },
      {
        nombre: 'Diversidad y modos de vida',
        textoOficial:
          'La comprensión de que existe una gran diversidad de seres vivos que poseen características, formas de comportamiento y modos de vida relacionados con el ambiente en que viven, identificando algunas de sus necesidades básicas y nuevos criterios para agruparlos.',
        fuente: `${NAP1} p.33`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Cambios corporales y prevención',
        textoOficial:
          'El reconocimiento de los principales cambios en su cuerpo y sus posibilidades, como resultado de los procesos de crecimiento y desarrollo y el conocimiento de algunas acciones básicas de prevención primaria de enfermedades.',
        fuente: `${NAP1} p.33`,
        grado: 2,
        orden: 1,
      },
      {
        nombre: 'Estructuras y funciones de seres vivos',
        textoOficial:
          'La comprensión de que los seres vivos poseen estructuras, funciones y comportamientos específicos y de las interacciones de las plantas, animales y personas entre sí y con su ambiente.',
        fuente: `${NAP1} p.34`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Órganos y medidas de prevención',
        textoOficial:
          'La localización básica de algunos órganos en el cuerpo humano, iniciando el conocimiento de sus estructuras y funciones y la identificación de algunas medidas de prevención vinculadas con la higiene y la conservación de los alimentos y el consumo de agua potable.',
        fuente: `${NAP1} p.34`,
        grado: 3,
        orden: 1,
      },
      {
        nombre: 'Ambientes aeroterrestres y sus interacciones',
        textoOficial:
          'La caracterización de los ambientes aero-terrestres cercanos, comparándolos con otros lejanos y de otras épocas, estableciendo relaciones con los ambientes acuáticos y de transición.',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Grupos de organismos e interacciones',
        textoOficial:
          'La diferenciación de los grupos de organismos (animales, plantas, hongos y microorganismos), algunas características climáticas y edáficas y el reconocimiento de sus interacciones.',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Adaptaciones morfo-fisiológicas',
        textoOficial:
          'La identificación y clasificación de las principales adaptaciones morfo-fisiológicas (absorción, sostén y locomoción, cubiertas corporales, comportamiento social y reproducción) que presentan los seres vivos en relación al ambiente.',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 2,
      },
      {
        nombre: 'Ser humano como agente modificador',
        textoOficial:
          'El reconocimiento del hombre como agente modificador del ambiente y el reconocimiento de la importancia del mismo en su preservación.',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 3,
      },
      {
        nombre: 'Funciones de sostén y locomoción',
        textoOficial: 'La caracterización de las funciones de sostén y de locomoción en el hombre.',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 4,
      },
      {
        nombre: 'Cuidado del sistema osteo-artro-muscular',
        textoOficial: 'El reconocimiento de la importancia del cuidado del sistema osteo-artro-muscular.',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 5,
      },
      {
        nombre: 'Ambientes acuáticos y grupos de organismos',
        textoOficial:
          'La caracterización de los ambientes acuáticos y de transición cercanos, comparándolos con otros lejanos y de otras épocas, estableciendo relaciones con los ambientes aeroterrestres, y la clasificación de los grupos de organismos (animales, plantas, hongos y microorganismos), reconociendo las principales interacciones entre ellos.',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Adaptaciones morfo-fisiológicas al ambiente',
        textoOficial:
          'La identificación de las relaciones entre las características morfo-fisiológicas (absorción, sostén y locomoción, cubiertas corporales, comportamiento social y reproducción) de los seres vivos, sus adaptaciones al ambiente donde viven.',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Ser humano como agente modificador',
        textoOficial: 'El reconocimiento del hombre como agente modificador del ambiente y de su importancia en su preservación.',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 2,
      },
      {
        nombre: 'Funciones de nutrición en el hombre',
        textoOficial:
          'La identificación de las funciones de nutrición en el hombre (digestión, respiración, circulación y excreción), sus principales estructuras y relaciones, comparándolas con otros seres vivos.',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 3,
      },
      {
        nombre: 'Alimentación y salud',
        textoOficial:
          'El reconocimiento de la importancia de la alimentación para la salud, en base a la composición de los alimentos y sus funciones en el organismo. El mejoramiento de la dieta atendiendo al contexto socio cultural.',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 4,
      },
      {
        nombre: 'Modelos de nutrición en el ecosistema',
        textoOficial:
          'El reconocimiento de diferentes modelos de nutrición en un ecosistema, y de las relaciones que se establecen entre los organismos representativos de cada modelo.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Seres vivos como sistemas abiertos',
        textoOficial:
          'El reconocimiento de los seres vivos como sistemas abiertos, destacando las principales relaciones que se establecen con el medio.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Ser humano como agente modificador',
        textoOficial: 'El reconocimiento del hombre como agente modificador del ambiente y de su importancia en su preservación.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 2,
      },
      {
        nombre: 'Noción de célula',
        textoOficial:
          'El acercamiento a la noción de célula como unidad estructural y funcional desde la perspectiva de los niveles de organización de los seres vivos.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 3,
      },
      {
        nombre: 'Funciones de relación y reproducción',
        textoOficial: 'La identificación de las funciones de relación y reproducción en el hombre.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 4,
      },
      {
        nombre: 'Prevención de enfermedades',
        textoOficial:
          'El reconocimiento de la importancia de la prevención de enfermedades relacionadas con los sistemas estudiados.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 5,
      },
      {
        nombre: 'Nutrición como conjunto integrado de funciones',
        textoOficial:
          'La caracterización de la nutrición y su interpretación como conjunto integrado de funciones en los seres vivos.',
        fuente: `${NAP2} p.78`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Nutrición autótrofa y heterótrofa',
        textoOficial:
          'La caracterización de las estructuras involucradas en la nutrición y su relación con las funciones que desempeñan para explicar los modelos de nutrición autótrofa y heterótrofa, reconocerlos en diversos ejemplos y profundizar la noción de ser vivo como sistema abierto.',
        fuente: `${NAP2} p.78`,
        grado: 7,
        orden: 1,
      },
      {
        nombre: 'Nutrición a nivel celular',
        textoOficial:
          'La aproximación a la función de nutrición a nivel celular, focalizando en los intercambios de materiales y energía, para establecer relaciones con la función de las estructuras involucradas en los organismos pluricelulares y el papel de los alimentos en los seres vivos.',
        fuente: `${NAP2} p.78`,
        grado: 7,
        orden: 2,
      },
      {
        nombre: 'Nutrición en el organismo humano',
        textoOficial:
          'El estudio de la nutrición en el organismo humano, como caso particular de ser vivo heterótrofo, para interpretar la integración de las funciones de digestión, respiración, circulación y excreción y construir la noción de organismo como sistema integrado y abierto.',
        fuente: `${NAP2} p.78`,
        grado: 7,
        orden: 3,
      },
      {
        nombre: 'Nutrientes y funciones en el organismo',
        textoOficial:
          'La caracterización de los diferentes nutrientes que se obtienen de los alimentos y la identificación de las funciones que cumplen en el organismo humano, para interpretar su relación con la salud.',
        fuente: `${NAP2} p.78`,
        grado: 7,
        orden: 4,
      },
      {
        nombre: 'Problemáticas de la alimentación humana',
        textoOficial:
          'La discusión de algunas problemáticas relacionadas con la alimentación humana, entendida en su complejidad, y el reconocimiento de la importancia de la toma de decisiones responsables.',
        fuente: `${NAP2} p.78`,
        grado: 7,
        orden: 5,
      },
      {
        nombre: 'Intercambio de materiales y energía',
        textoOficial:
          'La identificación de los intercambios de materiales y energía en los ecosistemas, estableciendo relaciones con la función de nutrición, por ejemplo, los que ocurren en el ciclo del carbono.',
        fuente: `${NAP2} p.78`,
        grado: 7,
        orden: 6,
      },
      {
        nombre: 'Relaciones tróficas y cadenas alimentarias',
        textoOficial:
          'La interpretación de las relaciones tróficas, su representación en redes y cadenas alimentarias y el reconocimiento del papel de productores, consumidores y descomponedores, vinculado con los distintos modelos de nutrición.',
        fuente: `${NAP2} p.78`,
        grado: 7,
        orden: 7,
      },
      {
        nombre: 'Modificaciones en la dinámica de ecosistemas',
        textoOficial:
          'La explicación de algunas modificaciones en la dinámica de los ecosistemas provocadas por la desaparición y/o introducción de especies en las tramas tróficas.',
        fuente: `${NAP2} p.78`,
        grado: 7,
        orden: 8,
      },
    ],
  },
  {
    materia: 'Ciencias Naturales',
    nombre: 'Materiales y sus cambios',
    orden: 1,
    temas: [
      {
        nombre: 'Variedad de materiales',
        textoOficial:
          'La comprensión de que existe una gran variedad de materiales, y que éstos se utilizan para distintos fines, según sus propiedades.',
        fuente: `${NAP1} p.32`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Características ópticas de materiales',
        textoOficial:
          'La comprensión de las características ópticas de algunos materiales y de su comportamiento frente a la luz, estableciendo relaciones con sus usos.',
        fuente: `${NAP1} p.33`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Separación y cambios de materiales',
        textoOficial:
          'La identificación de separaciones de mezclas de materiales y la distinción de distintos tipos de cambios de los materiales, reconociendo algunas transformaciones donde un material se convierte en otro distinto.',
        fuente: `${NAP1} p.34`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Materiales naturales y producidos',
        textoOficial:
          'El reconocimiento de la existencia de materiales naturales (por ejemplo, minerales) y materiales producidos por el hombre (por ejemplo, cerámicos y plásticos).',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Propiedades y usos de los materiales',
        textoOficial:
          'La identificación de las propiedades de los materiales, estableciendo relaciones con sus usos y sus estados de agregación.',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Tipos de mezclas',
        textoOficial: 'La caracterización de los diferentes tipos de mezclas entre materiales.',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Disolución de materiales',
        textoOficial:
          'El reconocimiento de la acción disolvente del agua y de otros líquidos sobre diversos materiales y de los factores que influyen en los procesos de disolución.',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Transformaciones de los materiales',
        textoOficial: 'La identificación de diferentes transformaciones de los materiales, en particular la combustión y la corrosión.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'El aire y el modelo corpuscular',
        textoOficial:
          'La caracterización del aire y de otros gases, y el acercamiento al modelo de partículas o corpuscular, para la explicación de sus principales propiedades.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Modelo cinético corpuscular',
        textoOficial:
          'La utilización del modelo cinético corpuscular para explicar algunas características de los estados de agregación.',
        fuente: `${NAP2} p.79`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Propiedades de materiales de uso masivo',
        textoOficial:
          'El reconocimiento de algunas propiedades de los materiales presentes en los alimentos y de otros de uso masivo y/o de aplicación tecnológica.',
        fuente: `${NAP2} p.79`,
        grado: 7,
        orden: 1,
      },
      {
        nombre: 'Reactivos para reconocer sustancias',
        textoOficial:
          'El uso de reactivos para reconocer la presencia de sustancias relacionadas con la nutrición, por ejemplo, el agua de cal para el dióxido de carbono, el yodo para el almidón.',
        fuente: `${NAP2} p.79`,
        grado: 7,
        orden: 2,
      },
      {
        nombre: 'Métodos mecánicos de separación de mezclas',
        textoOficial:
          'La utilización del conocimiento de propiedades de los materiales para la identificación de los métodos mecánicos más apropiados para separar mezclas, por ejemplo, en procesos industriales y/o artesanales.',
        fuente: `${NAP2} p.79`,
        grado: 7,
        orden: 3,
      },
      {
        nombre: 'Materiales que causan deterioro ambiental',
        textoOficial: 'El reconocimiento de materiales que pueden causar deterioro ambiental, a escala local y regional.',
        fuente: `${NAP2} p.79`,
        grado: 7,
        orden: 4,
      },
    ],
  },
  {
    materia: 'Ciencias Naturales',
    nombre: 'Fenómenos del mundo físico',
    orden: 2,
    temas: [
      {
        nombre: 'Efectos de la acción mecánica',
        textoOficial:
          'La comprensión de que una acción mecánica puede producir distintos efectos en un objeto, y que éste resiste a las mismas de diferente modo, de acuerdo al material del que está conformado.',
        fuente: `${NAP1} p.32`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Movimiento de los cuerpos',
        textoOficial:
          'La comprensión de los fenómenos de movimiento de los cuerpos y sus causas, clasificando sus movimientos de acuerdo a la trayectoria que describen.',
        fuente: `${NAP1} p.33`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Fuentes lumínicas y comportamiento',
        textoOficial:
          'La identificación de fuentes lumínicas y de materiales de acuerdo a su comportamiento frente a la luz y del comportamiento de los cuerpos iluminados en relación con su movimiento, al movimiento de la fuente luminosa, o al de ambos.',
        fuente: `${NAP1} p.33`,
        grado: 2,
        orden: 1,
      },
      {
        nombre: 'Fenómenos sonoros y térmicos',
        textoOficial:
          'La comprensión de algunos fenómenos sonoros y térmicos, interpretando que una acción mecánica puede producir sonido y que la temperatura es una propiedad de los cuerpos que se puede medir.',
        fuente: `${NAP1} p.34`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'Fuerzas que actúan a distancia',
        textoOficial:
          'La identificación y explicación de ciertos fenómenos como la acción de fuerzas que actúan a distancia, reconociendo acciones de atracción y de repulsión a partir de la exploración de fenómenos magnéticos y electrostáticos.',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'Propagación y reflexión de la luz',
        textoOficial: 'El reconocimiento de características de la luz, como su propagación y reflexión.',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Caracterización del sonido',
        textoOficial: 'La caracterización del sonido (por ejemplo, el timbre y la altura).',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 1,
      },
      {
        nombre: 'Peso, caída libre y flotación',
        textoOficial:
          'El reconocimiento de la acción del peso en el movimiento de caída libre y, junto con el empuje, en el fenómeno de flotación.',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 2,
      },
      {
        nombre: 'Circuitos eléctricos simples',
        textoOficial:
          'El acercamiento a la noción de corriente eléctrica a través de la exploración de circuitos eléctricos simples y su vinculación con las instalaciones domiciliarias.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Fuentes y clases de energía',
        textoOficial: 'La tipificación de diversas fuentes y clases de energía.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'El calor como transferencia de energía',
        textoOficial: 'El reconocimiento del calor como una forma de transferencia de energía.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 2,
      },
      {
        nombre: 'Cambios de temperatura',
        textoOficial: 'La interpretación y exploración de fenómenos relacionados con los cambios de temperatura.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 3,
      },
      {
        nombre: 'Energía cinética y potencial',
        textoOficial:
          'El empleo del concepto de energía para la interpretación de una gran variedad de procesos asociados a fenómenos físicos, por ejemplo, el uso del intercambio entre energías cinética y potencial para interpretar los cambios asociados a procesos mecánicos.',
        fuente: `${NAP2} p.79`,
        grado: 7,
        orden: 0,
      },
      {
        nombre: 'Transformación y conservación de la energía',
        textoOficial: 'La aproximación a las nociones de transformación y conservación de la energía.',
        fuente: `${NAP2} p.79`,
        grado: 7,
        orden: 1,
      },
      {
        nombre: 'Trabajo y calor como variación energética',
        textoOficial:
          'La interpretación del trabajo y del calor como variación de la energía, enfatizando algunos procesos de transferencia y disipación.',
        fuente: `${NAP2} p.79`,
        grado: 7,
        orden: 2,
      },
    ],
  },
  {
    materia: 'Ciencias Naturales',
    nombre: 'Tierra, el universo y sus cambios',
    orden: 3,
    temas: [
      {
        nombre: 'Concepto de paisaje',
        textoOficial:
          'La aproximación al concepto de paisaje como el conjunto de elementos observables del ambiente (incluyendo el agua, el aire, la tierra, el cielo, los seres vivos), reconociendo su diversidad, algunos de sus cambios y posibles causas, así como los usos que las personas hacen de ellos.',
        fuente: `${NAP1} p.32`,
        grado: 1,
        orden: 0,
      },
      {
        nombre: 'Geoformas y cambios del paisaje',
        textoOficial:
          'El reconocimiento de la diversidad de geoformas presentes en los paisajes y la comprensión de los cambios, los ciclos y los aspectos constantes del paisaje y el cielo.',
        fuente: `${NAP1} p.33`,
        grado: 2,
        orden: 0,
      },
      {
        nombre: 'Fenómenos atmosféricos y astros',
        textoOficial:
          'La comprensión acerca de algunos fenómenos atmosféricos y de que los astros se encuentran fuera de la Tierra, identificando los movimientos aparentes del Sol y la Luna y su frecuencia, y el uso de los puntos cardinales como método de orientación espacial.',
        fuente: `${NAP1} p.34`,
        grado: 3,
        orden: 0,
      },
      {
        nombre: 'La Tierra como cuerpo cósmico',
        textoOficial:
          'La caracterización de la Tierra como cuerpo cósmico: forma y movimiento de rotación. Acercamiento a la noción de las dimensiones del planeta.',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 0,
      },
      {
        nombre: 'La Tierra como sistema material',
        textoOficial:
          'El reconocimiento del planeta Tierra como sistema material y de los subsistemas en que puede dividirse para su estudio.',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 1,
      },
      {
        nombre: 'Características de la geósfera',
        textoOficial:
          'La identificación de las principales características de la geósfera y los principales procesos que se dan en ella (por ejemplo, terremotos y volcanes).',
        fuente: `${NAP2} p.75`,
        grado: 4,
        orden: 2,
      },
      {
        nombre: 'Hidrósfera y ciclo del agua',
        textoOficial:
          'La descripción de las principales características de la hidrósfera, sus relaciones con los otros subsistemas terrestres y de los principales fenómenos que se dan en la misma (por ejemplo, corrientes y mareas). La caracterización del ciclo del agua.',
        fuente: `${NAP2} p.76`,
        grado: 5,
        orden: 0,
      },
      {
        nombre: 'Atmósfera y sus fenómenos',
        textoOficial:
          'La descripción de las principales características de la atmósfera, sus relaciones con los otros subsistemas terrestres y de algunos fenómenos que se dan en la misma (meteoros).',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 0,
      },
      {
        nombre: 'Tiempo atmosférico y clima',
        textoOficial: 'La construcción de la idea de tiempo atmosférico como introducción a la noción de clima.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 1,
      },
      {
        nombre: 'Sistema Solar',
        textoOficial:
          'La descripción de los cuerpos que integran el Sistema Solar; movimiento de traslación de los planetas en torno al Sol.',
        fuente: `${NAP2} p.77`,
        grado: 6,
        orden: 2,
      },
      {
        nombre: 'Renovación de los recursos naturales',
        textoOficial:
          'La comprensión de que la posibilidad de renovación-reutilización de los recursos naturales (energéticos y materiales) condiciona la obtención y uso de los mismos, y de la diversidad de las consecuencias de las decisiones y acciones humanas sobre el ambiente y la salud.',
        fuente: `${NAP2} p.79`,
        grado: 7,
        orden: 0,
      },
    ],
  },
];
