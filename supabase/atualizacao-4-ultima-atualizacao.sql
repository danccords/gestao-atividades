-- =====================================================================
--  ATUALIZAÇÃO 4 — última atualização de cada atividade (aparece na lista)
-- =====================================================================
create or replace view public.task_last_update with (security_invoker = true) as
select distinct on (c.task_id)
       c.task_id, c.body, c.author_email, c.created_at,
       count(*) over (partition by c.task_id) as total
  from public.task_comments c
 order by c.task_id, c.created_at desc;
grant select on public.task_last_update to authenticated;
