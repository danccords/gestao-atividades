-- =====================================================================
--  ATUALIZAÇÃO 10 — solicitação do colaborador sem tipo/etapas
--  O colaborador só informa o que precisa ser feito, o que foi conversado
--  e a data acordada. Tipo e etapas são definidos pelo administrador.
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
create or replace function public.tasks_request_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' or auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.type_id := null;
    new.stages := null;
    new.progress := 0;
    new.status := 'nao_iniciado';
  elsif old.approval <> 'aprovada'
    and (new.type_id is distinct from old.type_id
         or public.stages_structure(new.stages) is distinct from public.stages_structure(old.stages)) then
    raise exception 'O tipo e as etapas são definidos pelo administrador na aprovação.';
  end if;
  return new;
end $$;
drop trigger if exists tasks_request_guard on public.tasks;
create trigger tasks_request_guard before insert or update on public.tasks
  for each row execute function public.tasks_request_guard();

select 'ok' as resultado;
