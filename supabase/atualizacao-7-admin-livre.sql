-- =====================================================================
--  ATUALIZAÇÃO 7 — administradores têm acesso livre a todas as atividades
--  (prazo, prioridade, responsável, etapas, confirmações e pedidos de prazo),
--  mesmo que outro administrador tenha passado a atividade.
--  Colaboradores continuam só com as atividades em que são responsáveis.
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
-- Quem gerencia a atividade (prazo, prioridade, responsável, etapas, confirmações):
--  qualquer administrador ativo, em qualquer atividade
--  colaborador: só a própria solicitação enquanto não for aprovada
create or replace function public.is_task_manager(p_created_by_email text, p_approval text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (coalesce(p_approval, 'aprovada') <> 'aprovada'
          and coalesce(p_created_by_email, '') = public.current_email());
$$;

select 'ok' as resultado;
