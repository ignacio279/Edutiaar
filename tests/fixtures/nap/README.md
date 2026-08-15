# Fixtures NAP — fuente de autoridad del catálogo

Estos dos archivos son el texto de los documentos oficiales de los Núcleos de
Aprendizajes Prioritarios (NAP), extraído directamente de los PDF del
Ministerio de Educación con `pypdf`. Son la **fuente de autoridad** del
catálogo (`supabase/functions/_shared/nap.ts` y su espejo
`web/lib/admin/nap.ts`): el test `tests/unit/nap-catalogo.test.mjs` compara
cada `textoOficial` del catálogo contra este texto para garantizar que el
catálogo no se apartó de los documentos reales.

**No se editan a mano nunca.** Si algo del catálogo está mal, se corrige el
catálogo — no el fixture. Si el fixture necesitara actualizarse (por ejemplo,
porque el Ministerio publicó una versión nueva del documento), se regenera
desde el PDF original con `pypdf`, no se toca a mano.

| Fixture | PDF de origen | Grados |
|---|---|---|
| `primer-ciclo.txt` | https://bnm.me.gov.ar/giga1/documentos/EL000977.pdf | 1° a 3° |
| `segundo-ciclo.txt` | https://bnm.me.gov.ar/giga1/documentos/EL001229.pdf | 4° a 7° |

Cada archivo conserva marcadores `########## PÁGINA N ##########` que
`pypdf` intercala entre el texto de cada página del PDF original — son parte
de la extracción, no se limpian. El test que los usa (`normalizar()` en
`tests/unit/nap-catalogo.test.mjs`) empareja únicamente diferencias de
maquetación del PDF (guiones de corte de fin de renglón, espacios antes de
puntuación, dígitos de nota al pie pegados a una palabra); el contenido — 
incluidos números sueltos como años o rangos — se conserva tal cual salió
de la extracción.
