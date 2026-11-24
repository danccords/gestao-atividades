-- =====================================================================
--  ATUALIZAÇÃO 8 — etapas sem confirmação do gestor
--  Quem conclui a etapa, concluiu. Remove a marcação "confirmar" dos modelos
--  e das atividades e limpa pedidos de confirmação em aberto.
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
update public.activity_types
   set stages = (select coalesce(jsonb_agg(e || '{"confirm":false}'::jsonb order by i), '[]'::jsonb)
                   from jsonb_array_elements(stages) with ordinality as x(e, i))
 where stages::text like '%"confirm": true%' or stages::text like '%"confirm":true%';

update public.tasks
   set stages = (select jsonb_agg(((e - 'requested_at') - 'requested_by') || '{"confirm":false}'::jsonb order by i)
                   from jsonb_array_elements(stages) with ordinality as x(e, i))
 where stages is not null and jsonb_array_length(stages) > 0
   and (stages::text like '%"confirm": true%' or stages::text like '%requested_at%');

select (select count(*) from public.activity_types where stages::text like '%"confirm": true%') as modelos_com_confirmacao,
       (select count(*) from public.tasks where stages::text like '%"confirm": true%' or stages::text like '%requested_at%') as atividades_com_confirmacao;
