-- EDUTIA — Tope de reintentos del backfill NAP (Task 6, hallazgo de review).
--
-- La selección de pendientes del backfill (`nap_tema_id is null and
-- nap_revisado = false`) no alcanza sola: un nodo que Claude clasifica como
-- "sin tema" se queda con `nap_tema_id` en null para siempre (a propósito —
-- nap_revisado es cosa de una persona, no del backfill), así que nunca sale
-- del conjunto de pendientes por sí mismo. Hoy eso lo tapa `sinExcluidos`
-- (el CALLER acumula lo que ya intentó), pero un caller nuevo que se olvide
-- de acumular (por ejemplo, un botón "reclasificar" en la cola de revisión
-- del panel admin) reproduce el mismo loop. Este corte vive en la base, no
-- en la memoria de quien llama.
alter table nodo add column nap_intentos int not null default 0;

comment on column nodo.nap_intentos is
  'Cuántas veces el backfill (u otro proceso de clasificación NAP) intentó clasificar este nodo, mapeara o no. La selección deja de tomarlo al llegar a 3 — de regalo, un nodo con 3 intentos y sin tema es una señal de que ninguna máquina lo va a resolver sola y hace falta una persona.';
