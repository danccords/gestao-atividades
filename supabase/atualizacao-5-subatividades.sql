-- =====================================================================
--  ATUALIZAÇÃO 5 — subatividades (etapas dentro de uma atividade)
--  - Quem vê a atividade vê as subatividades
--  - Quem pode mexer na atividade (quem passou e quem recebeu) cria, marca e edita
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
create table if not exists public.subtasks (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.tasks(id) on delete cascade,
  title            text not null,
  done             boolean not null default false,
  done_at          timestamptz,
  assignee_id      uuid references public.team_members(id) on delete set null,
  due_date         date,
  position         int not null default 0,
  created_by_email text default public.current_email(),
  created_at       timestamptz not null default now()
);
create index if not exists subtasks_task_idx on public.subtasks(task_id);
alter table public.subtasks enable row level security;

drop policy if exists "sub_ver"     on public.subtasks;
drop policy if exists "sub_inserir" on public.subtasks;
drop policy if exists "sub_editar"  on public.subtasks;
drop policy if exists "sub_apagar"  on public.subtasks;
create policy "sub_ver"     on public.subtasks for select using (public.is_member() and public.can_see_task(task_id));
create policy "sub_inserir" on public.subtasks for insert with check (public.can_touch_task(task_id));
create policy "sub_editar"  on public.subtasks for update using (public.can_touch_task(task_id)) with check (public.can_touch_task(task_id));
create policy "sub_apagar"  on public.subtasks for delete using (public.can_touch_task(task_id));

grant select, insert, update, delete on public.subtasks to authenticated;
revoke all on public.subtasks from anon;

do $$ begin
  begin alter publication supabase_realtime add table public.subtasks; exception when others then null; end;
end $$;

-- restaurar backup: agora inclui as subatividades
create or replace function public.restore_backup(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb := payload -> 'data'; n_p int; n_t int; n_c int; n_s int := 0;
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

  insert into public.subtasks (id, task_id, title, done, done_at, assignee_id, due_date, position, created_by_email, created_at)
  select s.id, s.task_id, s.title, coalesce(s.done, false), s.done_at,
         (select nm.id from public.team_members nm where nm.email = old_m.email),
         s.due_date, coalesce(s.position, 0), s.created_by_email, coalesce(s.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'subtasks', '[]')) as s(id uuid, task_id uuid, title text, done boolean, done_at timestamptz,
         assignee_id uuid, due_date date, position int, created_by_email text, created_at timestamptz)
    left join jsonb_to_recordset(coalesce(d -> 'team_members', '[]')) as old_m(id uuid, email text) on old_m.id = s.assignee_id
   where exists (select 1 from public.tasks tt where tt.id = s.task_id)
  on conflict (id) do update set title = excluded.title, done = excluded.done, done_at = excluded.done_at,
         assignee_id = excluded.assignee_id, due_date = excluded.due_date, position = excluded.position;
  get diagnostics n_s = row_count;

  insert into public.task_comments (id, task_id, author_email, body, created_at)
  select c.id, c.task_id, c.author_email, c.body, coalesce(c.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'task_comments', '[]')) as c(id uuid, task_id uuid, author_email text, body text, created_at timestamptz)
  on conflict (id) do nothing;
  get diagnostics n_c = row_count;

  return jsonb_build_object('projetos', n_p, 'atividades', n_t, 'subatividades', n_s, 'comentarios', n_c);
end $$;
revoke execute on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;
