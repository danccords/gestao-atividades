-- =====================================================================
--  ATUALIZAÇÃO 14 — atividade concluída fica travada
--  Depois de Concluída, o colaborador não altera mais nada nela
--  (status, subatividades, atualizações/comentários, pedido de prazo).
--  Só um administrador pode reabrir ou mexer.
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
create or replace function public.task_is_locked(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and coalesce(current_setting('app.restoring', true), '') <> 'on'
     and not public.is_admin()
     and exists (select 1 from public.tasks where id = p_task_id and status = 'concluido');
$$;

create or replace function public.tasks_lock_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'concluido' and auth.uid() is not null and not public.is_admin()
     and coalesce(current_setting('app.restoring', true), '') <> 'on' then
    raise exception 'Atividade concluída: só um administrador pode reabrir ou alterar.';
  end if;
  return new;
end $$;
drop trigger if exists tasks_lock_done on public.tasks;
create trigger tasks_lock_done before update on public.tasks
  for each row execute function public.tasks_lock_done();

create or replace function public.child_lock_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.task_is_locked(coalesce(new.task_id, old.task_id)) then
    raise exception 'Atividade concluída: só um administrador pode reabrir ou alterar.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists subtasks_lock_done on public.subtasks;
create trigger subtasks_lock_done before insert or update or delete on public.subtasks
  for each row execute function public.child_lock_done();
drop trigger if exists comments_lock_done on public.task_comments;
create trigger comments_lock_done before insert on public.task_comments
  for each row execute function public.child_lock_done();
drop trigger if exists due_requests_lock_done on public.due_requests;
create trigger due_requests_lock_done before insert on public.due_requests
  for each row execute function public.child_lock_done();

select 'ok' as resultado;
