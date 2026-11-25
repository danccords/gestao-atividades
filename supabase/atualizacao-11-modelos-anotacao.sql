-- =====================================================================
--  ATUALIZAÇÃO 11 — modelos de anotação pessoais
--  Uma anotação marcada como modelo não aparece na lista; aparece em "Nova página".
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
alter table public.notes add column if not exists is_template boolean not null default false;
select 'ok' as resultado;
