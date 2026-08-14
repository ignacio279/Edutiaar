// Catálogo NAP (Núcleos de Aprendizajes Prioritarios, Nivel Primario) — la vara
// fija contra la que el observatorio mide el aprendizaje.
//
// OJO: el catálogo se llena TRANSCRIBIENDO de las resoluciones del Consejo
// Federal de Educación, con la fuente a la vista — NUNCA generado por un
// modelo ni de memoria. Un catálogo inventado invalida todo lo que se
// construya encima.
//
// `nombre` (de eje y de tema) es una ETIQUETA CORTA NUESTRA, para que la UI
// se lea. `textoOficial` es la cita textual del bloque en el documento — esa
// es la fuente de autoridad. Los NAP no traen nombres cortos de tema: traen
// objetivos redactados como oraciones largas ("El reconocimiento y uso de
// los números naturales... en situaciones problemáticas que requieran:").
//
// Primer Ciclo (1°, 2° y 3° grado) transcripto de:
// Núcleos de Aprendizajes Prioritarios — Primer Ciclo EGB / Nivel Primario
// (Ministerio de Educación, Ciencia y Tecnología; Resolución N° 214/04 del
// Consejo Federal de Cultura y Educación, 13/10/2004).
// https://bnm.me.gov.ar/giga1/documentos/EL000977.pdf
// El número de página en `fuente` es el de los marcadores del PDF (el que
// imprime la hoja puede diferir).
//
// Espejado en web/lib/admin/nap.ts (test de paridad en
// tests/unit/nap-catalogo.test.mjs), mismo patrón que provincias.ts y planes.ts.

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
    ],
  },
];
