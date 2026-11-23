-- =====================================================================
--  ATUALIZAÇÃO 2 — permissões por atividade
--  - Só administradores criam atividades
--  - Cada atividade só pode ser alterada por QUEM CRIOU e por QUEM RECEBEU
--    * quem criou (admin): tudo (prazo, prioridade, responsável, título...)
--    * quem recebeu (responsável): só status e progresso
--  - Se quem criou deixar de ser admin ativo, qualquer admin assume a atividade
--  - Atualizações/comentários: só quem criou e quem recebeu escrevem
--  - Restaurar backup: função própria, só para admin
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- quem criou a atividade (e-mail de quem estava logado)
alter table public.tasks add column if not exists created_by_email text;
update public.tasks t
   set created_by_email = coalesce(
         (select email from public.team_members where role = 'admin' and active order by created_at limit 1),
         t.created_by_email)
 where t.created_by_email is null;

-- quem "gerencia" a atividade: quem criou, ou qualquer admin se quem criou não for mais admin ativo
create or replace function public.is_task_manager(p_created_by_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_created_by_email, '') = public.current_email()
      or (public.is_admin() and not exists (
            select 1 from public.team_members
             where email = p_created_by_email and role = 'admin' and active));
$$;

create or replace function public.is_task_assignee(p_assignee_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members
                  where id = p_assignee_id and email = public.current_email() and active);
$$;

-- pode mexer na atividade (gerente ou responsável)
create or replace function public.can_touch_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t
                  where t.id = p_task_id
                    and (public.is_task_manager(t.created_by_email) or public.is_task_assignee(t.assignee_id)));
$$;

grant execute on function public.is_task_manager(text), public.is_task_assignee(uuid), public.can_touch_task(uuid) to authenticated;

-- ao criar: grava quem criou
create or replace function public.tasks_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' or auth.uid() is null then
    return new;
  end if;
  new.created_by_email := public.current_email();
  return new;
end $$;
drop trigger if exists tasks_before_insert on public.tasks;
create trigger tasks_before_insert before insert on public.tasks
  for each row execute function public.tasks_before_insert();

-- ao alterar: responsável só mexe em status/progresso; ninguém troca "quem criou"
create or replace function public.tasks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if coalesce(current_setting('app.restoring', true), '') = 'on' or auth.uid() is null then
    return new;
  end if;
  new.created_by_email := old.created_by_email;
  if public.is_task_manager(old.created_by_email) then
    return new;
  end if;
  if new.project_id  is distinct from old.project_id
  or new.title       is distinct from old.title
  or new.description is distinct from old.description
  or new.assignee_id is distinct from old.assignee_id
  or new.due_date    is distinct from old.due_date
  or new.priority    is distinct from old.priority then
    raise exception 'Somente quem criou a atividade pode alterar prazo, prioridade, responsável e descrição.';
  end if;
  return new;
end $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before update on public.tasks
  for each row execute function public.tasks_guard();

-- políticas das atividades
drop policy if exists "tar_inserir" on public.tasks;
drop policy if exists "tar_apagar"  on public.tasks;
drop policy if exists "tar_editar"  on public.tasks;
create policy "tar_inserir" on public.tasks for insert with check (public.is_admin());
create policy "tar_apagar"  on public.tasks for delete using (public.is_task_manager(created_by_email));
create policy "tar_editar"  on public.tasks for update
  using (public.is_task_manager(created_by_email) or public.is_task_assignee(assignee_id))
  with check (public.is_task_manager(created_by_email) or public.is_task_assignee(assignee_id));

-- políticas das atualizações/comentários
drop policy if exists "com_inserir" on public.task_comments;
drop policy if exists "com_editar"  on public.task_comments;
drop policy if exists "com_apagar"  on public.task_comments;
create policy "com_inserir" on public.task_comments for insert
  with check (author_email = public.current_email() and public.can_touch_task(task_id));
create policy "com_apagar"  on public.task_comments for delete
  using (author_email = public.current_email());

-- restaurar backup (só admin) — ignora as regras acima porque recoloca dados de todos
create or replace function public.restore_backup(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb := payload -> 'data'; n_p int; n_t int; n_c int;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem restaurar backup.';
  end if;
  perform set_config('app.restoring', 'on', true);

  insert into public.team_members (email, name, role, active, job_title)
  select lower(m.email), m.name, coalesce(m.role, 'member'), coalesce(m.active, true), coalesce(m.job_title, '')
    from jsonb_to_recordset(coalesce(d -> 'team_members', '[]')) as m(email text, name text, role text, active boolean, job_title text)
  on conflict (email) do update set name = excluded.name, role = excluded.role,
                                    active = excluded.active, job_title = excluded.job_title;

  insert into public.projects (id, name, description, color, archived, created_at)
  select p.id, p.name, coalesce(p.description, ''), coalesce(p.color, '#1d4ed8'), coalesce(p.archived, false), coalesce(p.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'projects', '[]')) as p(id uuid, name text, description text, color text, archived boolean, created_at timestamptz)
  on conflict (id) do update set name = excluded.name, description = excluded.description,
                                 color = excluded.color, archived = excluded.archived;
  get diagnostics n_p = row_count;

  -- o responsável é encontrado pelo e-mail (o código da pessoa pode mudar num projeto novo)
  insert into public.tasks (id, project_id, title, description, assignee_id, due_date, status, progress, priority, created_by_email, created_at)
  select t.id, t.project_id, t.title, coalesce(t.description, ''),
         (select nm.id from public.team_members nm where nm.email = old_m.email),
         t.due_date, t.status, t.progress, t.priority, t.created_by_email, coalesce(t.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'tasks', '[]')) as t(id uuid, project_id uuid, title text, description text, assignee_id uuid,
         due_date date, status text, progress int, priority text, created_by_email text, created_at timestamptz)
    left join jsonb_to_recordset(coalesce(d -> 'team_members', '[]')) as old_m(id uuid, email text) on old_m.id = t.assignee_id
  on conflict (id) do update set project_id = excluded.project_id, title = excluded.title, description = excluded.description,
         assignee_id = excluded.assignee_id, due_date = excluded.due_date, status = excluded.status, progress = excluded.progress,
         priority = excluded.priority, created_by_email = coalesce(excluded.created_by_email, public.tasks.created_by_email);
  get diagnostics n_t = row_count;

  insert into public.task_comments (id, task_id, author_email, body, created_at)
  select c.id, c.task_id, c.author_email, c.body, coalesce(c.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'task_comments', '[]')) as c(id uuid, task_id uuid, author_email text, body text, created_at timestamptz)
  on conflict (id) do nothing;
  get diagnostics n_c = row_count;

  return jsonb_build_object('projetos', n_p, 'atividades', n_t, 'comentarios', n_c);
end $$;
revoke execute on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;
