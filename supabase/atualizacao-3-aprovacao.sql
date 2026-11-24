-- =====================================================================
--  ATUALIZAÇÃO 3 — colaborador solicita atividades, administrador aprova
--  - Colaborador cria a atividade para ele mesmo: ela fica "pendente"
--  - Enquanto pendente: só quem pediu e os administradores veem
--  - Um administrador aprova definindo prazo e prioridade (ou recusa com motivo)
--  - Quem aprovou passa a ser "quem passou a atividade" (gerencia prazo, prioridade...)
--  - Depois de aprovada: só quem aprovou/criou e o responsável alteram
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================

alter table public.tasks add column if not exists approval text not null default 'aprovada';
alter table public.tasks add column if not exists requested_by_email text;
alter table public.tasks add column if not exists approved_at timestamptz;
alter table public.tasks add column if not exists review_note text not null default '';
do $$ begin
  alter table public.tasks add constraint tasks_approval_chk check (approval in ('pendente', 'aprovada', 'recusada'));
exception when duplicate_object then null; end $$;

-- as políticas antigas dependem da função antiga: removo e recrio tudo
drop policy if exists "tar_ver"     on public.tasks;
drop policy if exists "tar_inserir" on public.tasks;
drop policy if exists "tar_apagar"  on public.tasks;
drop policy if exists "tar_editar"  on public.tasks;
drop policy if exists "com_inserir" on public.task_comments;
drop policy if exists "com_ver"     on public.task_comments;
drop function if exists public.is_task_manager(text);
drop function if exists public.is_task_manager(text, text);

-- Quem gerencia a atividade:
--  aprovada: quem criou/aprovou (se ainda for admin ativo); se não for mais, qualquer admin
--  pendente/recusada: quem pediu e qualquer admin
create or replace function public.is_task_manager(p_created_by_email text, p_approval text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_approval, 'aprovada') <> 'aprovada' then
      public.is_admin() or coalesce(p_created_by_email, '') = public.current_email()
    else
      (coalesce(p_created_by_email, '') = public.current_email() and public.is_admin())
      or (public.is_admin() and not exists (
            select 1 from public.team_members
             where email = p_created_by_email and role = 'admin' and active))
  end;
$$;

create or replace function public.can_touch_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t
                  where t.id = p_task_id
                    and (public.is_task_manager(t.created_by_email, t.approval) or public.is_task_assignee(t.assignee_id)));
$$;

create or replace function public.can_see_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t
                  where t.id = p_task_id
                    and (t.approval = 'aprovada' or public.is_admin()
                         or t.created_by_email = public.current_email()
                         or t.requested_by_email = public.current_email()));
$$;
grant execute on function public.is_task_manager(text, text), public.can_touch_task(uuid), public.can_see_task(uuid) to authenticated;

-- ao criar
create or replace function public.tasks_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_me text := public.current_email();
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' or auth.uid() is null then
    return new;
  end if;
  new.created_by_email := v_me;
  if public.is_admin() then
    new.approval := 'aprovada';
    new.approved_at := now();
  else
    -- colaborador: vira uma solicitação dele mesmo, sem prazo e com prioridade padrão
    new.approval := 'pendente';
    new.requested_by_email := v_me;
    new.assignee_id := (select id from public.team_members where email = v_me);
    new.due_date := null;
    new.priority := 'media';
    new.approved_at := null;
    new.review_note := '';
  end if;
  return new;
end $$;
drop trigger if exists tasks_before_insert on public.tasks;
create trigger tasks_before_insert before insert on public.tasks
  for each row execute function public.tasks_before_insert();

-- ao alterar
create or replace function public.tasks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_admin boolean := public.is_admin();
begin
  new.updated_at := now();
  if coalesce(current_setting('app.restoring', true), '') = 'on' or auth.uid() is null then
    return new;
  end if;
  new.created_by_email   := old.created_by_email;
  new.requested_by_email := old.requested_by_email;

  -- aprovar / recusar: só administrador
  if new.approval is distinct from old.approval then
    if not v_admin then
      raise exception 'Somente administradores aprovam ou recusam atividades.';
    end if;
    if new.approval = 'aprovada' then
      if new.due_date is null then
        raise exception 'Defina a data de entrega para aprovar a atividade.';
      end if;
      new.created_by_email := public.current_email();   -- quem aprovou passa a gerenciar
      new.approved_at := now();
    end if;
    return new;
  end if;

  -- colaborador com atividade pendente/recusada: não define prazo, prioridade nem responsável
  if old.approval <> 'aprovada' and not v_admin then
    if new.assignee_id is distinct from old.assignee_id
    or new.due_date    is distinct from old.due_date
    or new.priority    is distinct from old.priority
    or new.project_id  is distinct from old.project_id
    or new.review_note is distinct from old.review_note then
      raise exception 'Prazo e prioridade são definidos pelo administrador na aprovação.';
    end if;
    return new;
  end if;

  if public.is_task_manager(old.created_by_email, old.approval) then
    return new;
  end if;

  -- responsável: só status e progresso
  if new.project_id  is distinct from old.project_id
  or new.title       is distinct from old.title
  or new.description is distinct from old.description
  or new.assignee_id is distinct from old.assignee_id
  or new.due_date    is distinct from old.due_date
  or new.priority    is distinct from old.priority
  or new.review_note is distinct from old.review_note then
    raise exception 'Somente quem passou a atividade pode alterar prazo, prioridade, responsável e descrição.';
  end if;
  return new;
end $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before update on public.tasks
  for each row execute function public.tasks_guard();

-- políticas das atividades
create policy "tar_ver" on public.tasks for select using (
  public.is_member() and (approval = 'aprovada' or public.is_admin()
                          or created_by_email = public.current_email()
                          or requested_by_email = public.current_email()));
create policy "tar_inserir" on public.tasks for insert with check (
  public.is_member() and exists (select 1 from public.projects p where p.id = project_id and not p.archived));
create policy "tar_apagar" on public.tasks for delete using (public.is_task_manager(created_by_email, approval));
create policy "tar_editar" on public.tasks for update
  using (public.is_task_manager(created_by_email, approval) or public.is_task_assignee(assignee_id))
  with check (public.is_task_manager(created_by_email, approval) or public.is_task_assignee(assignee_id) or public.is_admin());

-- comentários: só de atividades que a pessoa enxerga; escreve quem passou e quem recebeu
create policy "com_ver" on public.task_comments for select using (public.is_member() and public.can_see_task(task_id));
create policy "com_inserir" on public.task_comments for insert
  with check (author_email = public.current_email() and public.can_touch_task(task_id));

-- restaurar backup com os campos novos
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

  insert into public.tasks (id, project_id, title, description, assignee_id, due_date, status, progress, priority,
                            created_by_email, approval, requested_by_email, approved_at, review_note, created_at)
  select t.id, t.project_id, t.title, coalesce(t.description, ''),
         (select nm.id from public.team_members nm where nm.email = old_m.email),
         t.due_date, t.status, t.progress, t.priority, t.created_by_email,
         coalesce(t.approval, 'aprovada'), t.requested_by_email, t.approved_at, coalesce(t.review_note, ''),
         coalesce(t.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'tasks', '[]')) as t(id uuid, project_id uuid, title text, description text, assignee_id uuid,
         due_date date, status text, progress int, priority text, created_by_email text, approval text,
         requested_by_email text, approved_at timestamptz, review_note text, created_at timestamptz)
    left join jsonb_to_recordset(coalesce(d -> 'team_members', '[]')) as old_m(id uuid, email text) on old_m.id = t.assignee_id
  on conflict (id) do update set project_id = excluded.project_id, title = excluded.title, description = excluded.description,
         assignee_id = excluded.assignee_id, due_date = excluded.due_date, status = excluded.status, progress = excluded.progress,
         priority = excluded.priority, created_by_email = coalesce(excluded.created_by_email, public.tasks.created_by_email),
         approval = excluded.approval, requested_by_email = excluded.requested_by_email,
         approved_at = excluded.approved_at, review_note = excluded.review_note;
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
