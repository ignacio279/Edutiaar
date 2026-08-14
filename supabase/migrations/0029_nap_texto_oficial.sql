-- EDUTIA — El tema del marco guarda su texto oficial.
-- Los NAP no traen nombres cortos de tema: traen objetivos redactados como
-- oraciones largas. Entonces `nombre` es una etiqueta NUESTRA (corta, para que
-- la tabla del observatorio se lea) y `texto_oficial` es la cita textual del
-- documento, que es lo que le da autoridad al agregado.
alter table nap_tema add column texto_oficial text;
alter table nap_tema add column fuente text;

comment on column nap_tema.nombre is
  'Etiqueta corta REDACTADA POR NOSOTROS para la UI. No es texto oficial.';
comment on column nap_tema.texto_oficial is
  'Cita textual del bloque en el documento NAP. Esta es la fuente de autoridad.';
comment on column nap_tema.fuente is
  'URL del documento oficial y página de donde salió el texto.';
