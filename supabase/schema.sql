-- =====================================================================
--  GESTÃO DE ATIVIDADES DE ENGENHARIA — Banco de dados (Supabase)
--  Cole este arquivo inteiro no Supabase > SQL Editor > New query > Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. EQUIPE (colaboradores autorizados a usar o app)
-- ---------------------------------------------------------------------
create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique check (email = lower(email)),
  name        text not null,
  role        text not null default 'member' check (role in ('admin', 'member')),
  active      boolean not null default true,
  job_title   text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.team_members add column if not exists job_title text not null default '';

-- E-mail de quem está logado (vem do token de login)
create or replace function public.current_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members
                 where email = public.current_email() and active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members
                 where email = public.current_email() and active and role = 'admin');
$$;

-- Usado na tela de login para dizer se o e-mail foi cadastrado pelo gestor
create or replace function public.is_email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members
                 where email = lower(trim(p_email)) and active);
$$;
grant execute on function public.is_email_allowed(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. PROJETOS
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text default '',
  color        text not null default '#4f46e5',
  archived     boolean not null default false,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. ATIVIDADES
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  title        text not null,
  description  text default '',
  assignee_id  uuid references public.team_members(id) on delete set null,
  due_date     date,
  status       text not null default 'nao_iniciado'
               check (status in ('nao_iniciado','iniciando','em_andamento','finalizando','em_revisao','aguardando','bloqueado','concluido')),
  progress     int  not null default 0 check (progress between 0 and 100),
  priority     text not null default 'media' check (priority in ('baixa','media','alta','urgente')),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists tasks_project_idx  on public.tasks(project_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);
create index if not exists tasks_due_idx      on public.tasks(due_date);

-- Colaborador que não é admin só pode mudar status e porcentagem
create or replace function public.tasks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.project_id  is distinct from old.project_id
  or new.title       is distinct from old.title
  or new.description is distinct from old.description
  or new.assignee_id is distinct from old.assignee_id
  or new.due_date    is distinct from old.due_date
  or new.priority    is distinct from old.priority then
    raise exception 'Somente administradores podem alterar esses campos da atividade.';
  end if;
  return new;
end $$;

drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before update on public.tasks
  for each row execute function public.tasks_guard();

-- ---------------------------------------------------------------------
-- 4. ATUALIZAÇÕES / COMENTÁRIOS NAS ATIVIDADES
-- ---------------------------------------------------------------------
create table if not exists public.task_comments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  author_email text not null default public.current_email(),
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments(task_id);

-- ---------------------------------------------------------------------
-- 5. ANOTAÇÕES PESSOAIS (privadas — só o dono vê)
-- ---------------------------------------------------------------------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default 'Sem título',
  icon        text default '📄',
  content     text not null default '',
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists notes_owner_idx on public.notes(owner);

-- ---------------------------------------------------------------------
-- 6. SEGURANÇA (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.team_members  enable row level security;
alter table public.projects      enable row level security;
alter table public.tasks         enable row level security;
alter table public.task_comments enable row level security;
alter table public.notes         enable row level security;

-- Limpa políticas antigas (permite rodar o script de novo)
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('team_members','projects','tasks','task_comments','notes')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Equipe: todos da equipe veem; só admin cadastra/edita/remove
create policy "equipe_ver"     on public.team_members for select using (public.is_member());
create policy "equipe_inserir" on public.team_members for insert with check (public.is_admin());
create policy "equipe_editar"  on public.team_members for update using (public.is_admin());
create policy "equipe_apagar"  on public.team_members for delete using (public.is_admin());

-- Projetos: todos da equipe veem; só admin cria/edita/apaga
create policy "proj_ver"     on public.projects for select using (public.is_member());
create policy "proj_inserir" on public.projects for insert with check (public.is_admin());
create policy "proj_editar"  on public.projects for update using (public.is_admin());
create policy "proj_apagar"  on public.projects for delete using (public.is_admin());

-- Atividades: todos veem; admin cria/apaga; admin ou o responsável atualiza
create policy "tar_ver"     on public.tasks for select using (public.is_member());
create policy "tar_inserir" on public.tasks for insert with check (public.is_admin());
create policy "tar_apagar"  on public.tasks for delete using (public.is_admin());
create policy "tar_editar"  on public.tasks for update using (
  public.is_admin() or exists (
    select 1 from public.team_members m
    where m.id = tasks.assignee_id and m.email = public.current_email() and m.active)
);

-- Comentários: todos da equipe leem e escrevem; cada um apaga o seu (admin apaga qualquer)
create policy "com_ver"     on public.task_comments for select using (public.is_member());
create policy "com_inserir" on public.task_comments for insert
  with check (public.is_admin() or (public.is_member() and author_email = public.current_email()));
create policy "com_editar" on public.task_comments for update
  using (public.is_admin());
create policy "com_apagar"  on public.task_comments for delete
  using (author_email = public.current_email() or public.is_admin());

-- Anotações: SOMENTE o dono (nem o admin vê)
create policy "notas_dono" on public.notes for all
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Permissões básicas de acesso pela API (as regras acima decidem O QUE cada um vê)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.team_members, public.projects, public.tasks,
  public.task_comments, public.notes to authenticated;
revoke all on public.team_members, public.projects, public.tasks, public.task_comments, public.notes from anon;
grant execute on function public.current_email(), public.is_member(), public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 7. TEMPO REAL (a tela atualiza sozinha quando alguém muda algo)
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.tasks;         exception when others then null; end;
  begin alter publication supabase_realtime add table public.projects;      exception when others then null; end;
  begin alter publication supabase_realtime add table public.task_comments; exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 8. (Opcional, recomendado) BLOQUEAR CADASTRO DE QUEM NÃO É DA EQUIPE
--    Depois de rodar, ative em: Authentication > Hooks > "Before User Created"
--    > Postgres > função public.hook_before_user_created
-- ---------------------------------------------------------------------
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if exists (select 1 from public.team_members where email = v_email and active) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Este e-mail não foi cadastrado pelo gestor da equipe.'));
end $$;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;

-- ---------------------------------------------------------------------
-- 9. CADASTRE VOCÊ COMO ADMINISTRADOR (troque e-mail e nome e rode)
-- ---------------------------------------------------------------------
-- insert into public.team_members (email, name, role)
-- values ('seu.email@empresa.com.br', 'Seu Nome', 'admin');


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

-- Quem gerencia a atividade (prazo, prioridade, responsável, etapas, confirmações):
--  qualquer administrador ativo, em qualquer atividade
--  colaborador: só a própria solicitação enquanto não for aprovada
create or replace function public.is_task_manager(p_created_by_email text, p_approval text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (coalesce(p_approval, 'aprovada') <> 'aprovada'
          and coalesce(p_created_by_email, '') = public.current_email());
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


-- =====================================================================
--  ATUALIZAÇÃO 6 — fluxo por etapas
--  - Modelos de etapas (tipos de atividade) cadastrados pelos administradores
--  - Cada atividade guarda a CÓPIA das etapas do modelo (pode ser ajustada só nela)
--  - Progresso = % da última etapa concluída (calculado pelo banco)
--  - Etapas marcadas "confirmar" precisam da confirmação de quem passou a atividade
--  - Prazo sugerido (combinado em reunião) x prazo aprovado; origem da atividade
--  - Impedimento (aguardando cliente/fornecedor...), tamanho P/M/G, "já iniciei"
--  - Pedido de novo prazo (aprovado por quem passou)
--  - Histórico automático de alterações
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- ---------- modelos de etapas ----------
create table if not exists public.activity_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#1d4ed8',
  stages      jsonb not null default '[]',   -- [{name, pct, confirm}]
  active      boolean not null default true,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.activity_types enable row level security;
drop policy if exists "tipos_ver"     on public.activity_types;
drop policy if exists "tipos_inserir" on public.activity_types;
drop policy if exists "tipos_editar"  on public.activity_types;
drop policy if exists "tipos_apagar"  on public.activity_types;
create policy "tipos_ver"     on public.activity_types for select using (public.is_member());
create policy "tipos_inserir" on public.activity_types for insert with check (public.is_admin());
create policy "tipos_editar"  on public.activity_types for update using (public.is_admin());
create policy "tipos_apagar"  on public.activity_types for delete using (public.is_admin());
grant select, insert, update, delete on public.activity_types to authenticated;

insert into public.activity_types (name, color, position, stages)
select * from (values
  ('Documentação / Liberação', '#0ea5e9', 1, '[{"name":"Coleta de dados","pct":20,"confirm":false},{"name":"Preenchimento","pct":50,"confirm":false},{"name":"Envio em plataforma","pct":80,"confirm":false},{"name":"Aprovação","pct":100,"confirm":false}]'::jsonb),
  ('Projeto / Detalhamento',   '#1d4ed8', 2, '[{"name":"Levantamento / 3D","pct":30,"confirm":false},{"name":"Detalhamento 2D","pct":65,"confirm":false},{"name":"Revisão interna","pct":85,"confirm":false},{"name":"Liberado p/ fabricação","pct":100,"confirm":false}]'::jsonb),
  ('Fabricação / Caldeiraria', '#ff642e', 3, '[{"name":"Corte / Dobra","pct":25,"confirm":false},{"name":"Solda / Montagem","pct":60,"confirm":false},{"name":"Acabamento / Pintura","pct":85,"confirm":false},{"name":"Inspeção / Expedição","pct":100,"confirm":false}]'::jsonb),
  ('Cotação / Suprimentos',    '#00a862', 4, '[{"name":"Especificação","pct":20,"confirm":false},{"name":"Cotação enviada","pct":50,"confirm":false},{"name":"Análise técnica / comercial","pct":80,"confirm":false},{"name":"Pedido emitido","pct":100,"confirm":false}]'::jsonb)
) as v(name, color, position, stages)
where not exists (select 1 from public.activity_types);

-- ---------- novos campos da atividade ----------
alter table public.tasks add column if not exists type_id            uuid references public.activity_types(id) on delete set null;
alter table public.tasks add column if not exists stages             jsonb;   -- [{name,pct,confirm,done_at,done_by,requested_at,requested_by}]
alter table public.tasks add column if not exists size               text not null default 'M';
alter table public.tasks add column if not exists suggested_due_date date;
alter table public.tasks add column if not exists origin             text not null default '';
alter table public.tasks add column if not exists started_early      boolean not null default false;
alter table public.tasks add column if not exists hold               text not null default '';
alter table public.tasks add column if not exists hold_note          text not null default '';
do $$ begin
  alter table public.tasks add constraint tasks_size_chk check (size in ('P', 'M', 'G'));
exception when duplicate_object then null; end $$;

-- estrutura das etapas (nome, % e confirmação), sem o andamento
create or replace function public.stages_structure(s jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('n', e->>'name', 'p', (e->>'pct')::int,
                                               'c', coalesce((e->>'confirm')::boolean, false)) order by i), '[]'::jsonb)
    from jsonb_array_elements(coalesce(s, '[]'::jsonb)) with ordinality as t(e, i);
$$;

-- aplica as regras das etapas: progresso e status
create or replace function public.tasks_apply_stages(t public.tasks)
returns public.tasks language plpgsql stable as $$
declare n int := coalesce(jsonb_array_length(t.stages), 0); pend boolean;
begin
  if t.stages is null or n = 0 then
    return t;
  end if;
  select coalesce(max((e->>'pct')::int) filter (where e->>'done_at' is not null), 0),
         bool_or(e->>'requested_at' is not null and e->>'done_at' is null)
    into t.progress, pend
    from jsonb_array_elements(t.stages) e;
  t.progress := least(greatest(t.progress, 0), 100);
  if t.progress >= 100 then
    t.status := 'concluido';
  elsif coalesce(pend, false) then
    t.status := 'em_revisao';
  elsif t.progress > 0 then
    t.status := 'em_andamento';
  else
    t.status := 'nao_iniciado';
  end if;
  return t;
end $$;

-- ao criar
create or replace function public.tasks_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_me text := public.current_email();
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' or auth.uid() is null then
    return public.tasks_apply_stages(new);
  end if;
  new.created_by_email := v_me;
  if public.is_admin() then
    new.approval := 'aprovada';
    new.approved_at := now();
  else
    -- colaborador: solicitação dele mesmo; prazo combinado fica como "sugerido"
    new.approval := 'pendente';
    new.requested_by_email := v_me;
    new.assignee_id := (select id from public.team_members where email = v_me);
    new.due_date := null;
    new.priority := 'media';
    new.size := 'M';
    new.approved_at := null;
    new.review_note := '';
  end if;
  return public.tasks_apply_stages(new);
end $$;
drop trigger if exists tasks_before_insert on public.tasks;
create trigger tasks_before_insert before insert on public.tasks
  for each row execute function public.tasks_before_insert();

-- ao alterar
create or replace function public.tasks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_admin boolean := public.is_admin(); v_mgr boolean; i int;
begin
  new.updated_at := now();
  if coalesce(current_setting('app.restoring', true), '') = 'on' or auth.uid() is null then
    return public.tasks_apply_stages(new);
  end if;
  new.created_by_email   := old.created_by_email;
  new.requested_by_email := old.requested_by_email;
  new.suggested_due_date := old.suggested_due_date;   -- o que foi combinado fica registrado
  if not v_admin then
    new.origin := old.origin;
  end if;

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
    return public.tasks_apply_stages(new);
  end if;

  -- solicitação ainda não aprovada, mexida por colaborador
  if old.approval <> 'aprovada' and not v_admin then
    if new.assignee_id is distinct from old.assignee_id
    or new.due_date    is distinct from old.due_date
    or new.priority    is distinct from old.priority
    or new.project_id  is distinct from old.project_id
    or new.size        is distinct from old.size
    or new.review_note is distinct from old.review_note then
      raise exception 'Prazo, prioridade e responsável são definidos pelo administrador na aprovação.';
    end if;
    for i in 0 .. coalesce(jsonb_array_length(new.stages), 0) - 1 loop
      if coalesce((new.stages->i->>'confirm')::boolean, false)
         and (new.stages->i->>'done_at') is distinct from (old.stages->i->>'done_at') then
        raise exception 'A etapa "%" precisa ser confirmada por um administrador.', new.stages->i->>'name';
      end if;
    end loop;
    return public.tasks_apply_stages(new);
  end if;

  v_mgr := public.is_task_manager(old.created_by_email, old.approval);
  if not v_mgr then
    -- responsável: avança etapas, status/progresso (sem etapas), impedimento
    if new.project_id  is distinct from old.project_id
    or new.title       is distinct from old.title
    or new.description is distinct from old.description
    or new.assignee_id is distinct from old.assignee_id
    or new.due_date    is distinct from old.due_date
    or new.priority    is distinct from old.priority
    or new.size        is distinct from old.size
    or new.type_id     is distinct from old.type_id
    or new.review_note is distinct from old.review_note then
      raise exception 'Somente quem passou a atividade pode alterar prazo, prioridade, responsável, tipo e descrição.';
    end if;
    if public.stages_structure(new.stages) is distinct from public.stages_structure(old.stages) then
      raise exception 'Somente quem passou a atividade pode alterar as etapas.';
    end if;
    for i in 0 .. coalesce(jsonb_array_length(new.stages), 0) - 1 loop
      if coalesce((new.stages->i->>'confirm')::boolean, false)
         and (new.stages->i->>'done_at') is distinct from (old.stages->i->>'done_at') then
        raise exception 'A etapa "%" precisa ser confirmada por quem passou a atividade.', new.stages->i->>'name';
      end if;
    end loop;
  end if;
  return public.tasks_apply_stages(new);
end $$;
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before update on public.tasks
  for each row execute function public.tasks_guard();

-- ---------- histórico automático ----------
create table if not exists public.task_history (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  actor_email text,
  action      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists task_history_task_idx on public.task_history(task_id);
alter table public.task_history enable row level security;
drop policy if exists "hist_ver" on public.task_history;
create policy "hist_ver" on public.task_history for select using (public.is_member() and public.can_see_task(task_id));
grant select on public.task_history to authenticated;

create or replace function public.fmt_date(d date) returns text language sql immutable as $$
  select coalesce(to_char(d, 'DD/MM/YYYY'), 'sem prazo');
$$;

create or replace function public.tasks_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_me text := nullif(public.current_email(), ''); i int; o jsonb; n jsonb;
  hold_lbl jsonb := '{"":"nenhum","cliente":"aguardando cliente","fornecedor":"aguardando fornecedor","interno":"aguardando informação interna","bloqueado":"bloqueado"}';
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.task_history(task_id, actor_email, action) values (new.id, v_me,
      case when new.approval = 'pendente'
        then 'solicitou a atividade' || case when new.suggested_due_date is not null then ' (prazo combinado: ' || public.fmt_date(new.suggested_due_date) || ')' else '' end
        else 'criou a atividade' || case when new.due_date is not null then ' (prazo: ' || public.fmt_date(new.due_date) || ')' else '' end end);
    return new;
  end if;
  if new.approval is distinct from old.approval then
    insert into public.task_history(task_id, actor_email, action) values (new.id, v_me,
      case new.approval when 'aprovada' then 'aprovou a atividade (prazo: ' || public.fmt_date(new.due_date) ||
             case when old.suggested_due_date is not null and old.suggested_due_date is distinct from new.due_date
                  then ', sugerido era ' || public.fmt_date(old.suggested_due_date) else '' end || ')'
           when 'recusada' then 'recusou a solicitação' || case when new.review_note <> '' then ': ' || new.review_note else '' end
           else 'reabriu a solicitação' end);
  elsif new.due_date is distinct from old.due_date then
    insert into public.task_history(task_id, actor_email, action) values (new.id, v_me,
      'alterou o prazo: ' || public.fmt_date(old.due_date) || ' → ' || public.fmt_date(new.due_date));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.task_history(task_id, actor_email, action) values (new.id, v_me,
      'trocou o responsável para ' || coalesce((select name from public.team_members where id = new.assignee_id), 'ninguém'));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.task_history(task_id, actor_email, action) values (new.id, v_me, 'alterou a prioridade para ' || new.priority);
  end if;
  if new.hold is distinct from old.hold then
    insert into public.task_history(task_id, actor_email, action) values (new.id, v_me,
      case when new.hold = '' then 'removeu o impedimento'
           else 'marcou impedimento: ' || coalesce(hold_lbl->>new.hold, new.hold) || case when new.hold_note <> '' then ' — ' || new.hold_note else '' end end);
  end if;
  if public.stages_structure(new.stages) is distinct from public.stages_structure(old.stages) then
    insert into public.task_history(task_id, actor_email, action) values (new.id, v_me, 'alterou as etapas da atividade');
  else
    for i in 0 .. coalesce(jsonb_array_length(new.stages), 0) - 1 loop
      o := old.stages->i; n := new.stages->i;
      if (n->>'done_at') is not null and (o->>'done_at') is null then
        insert into public.task_history(task_id, actor_email, action) values (new.id, v_me,
          case when coalesce((n->>'confirm')::boolean, false) then 'confirmou a conclusão da etapa "' else 'concluiu a etapa "' end
          || (n->>'name') || '" (' || (n->>'pct') || '%)');
      elsif (n->>'done_at') is null and (o->>'done_at') is not null then
        insert into public.task_history(task_id, actor_email, action) values (new.id, v_me, 'desfez a etapa "' || (n->>'name') || '"');
      elsif (n->>'requested_at') is not null and (o->>'requested_at') is null then
        insert into public.task_history(task_id, actor_email, action) values (new.id, v_me, 'pediu confirmação da etapa "' || (n->>'name') || '"');
      elsif (n->>'requested_at') is null and (o->>'requested_at') is not null and (n->>'done_at') is null then
        insert into public.task_history(task_id, actor_email, action) values (new.id, v_me, 'devolveu a etapa "' || (n->>'name') || '" para ajustes');
      end if;
    end loop;
  end if;
  if new.started_early and not old.started_early then
    insert into public.task_history(task_id, actor_email, action) values (new.id, v_me, 'marcou que já iniciou antes da aprovação');
  end if;
  return new;
end $$;
drop trigger if exists tasks_log on public.tasks;
create trigger tasks_log after insert or update on public.tasks
  for each row execute function public.tasks_log();

-- ---------- pedidos de novo prazo ----------
create table if not exists public.due_requests (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid not null references public.tasks(id) on delete cascade,
  requested_by_email text,
  old_due            date,
  new_due            date not null,
  reason             text not null default '',
  status             text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  decided_by_email   text,
  decided_at         timestamptz,
  decision_note      text not null default '',
  created_at         timestamptz not null default now()
);
create index if not exists due_requests_task_idx on public.due_requests(task_id);
alter table public.due_requests enable row level security;

create or replace function public.can_manage_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = p_task_id
                   and public.is_task_manager(t.created_by_email, t.approval));
$$;
grant execute on function public.can_manage_task(uuid) to authenticated;

drop policy if exists "prazo_ver"      on public.due_requests;
drop policy if exists "prazo_inserir"  on public.due_requests;
drop policy if exists "prazo_decidir"  on public.due_requests;
drop policy if exists "prazo_cancelar" on public.due_requests;
create policy "prazo_ver"      on public.due_requests for select using (public.is_member() and public.can_see_task(task_id));
create policy "prazo_inserir"  on public.due_requests for insert with check (public.can_touch_task(task_id));
create policy "prazo_decidir"  on public.due_requests for update using (public.can_manage_task(task_id));
create policy "prazo_cancelar" on public.due_requests for delete
  using (status = 'pendente' and requested_by_email = public.current_email());
grant select, insert, update, delete on public.due_requests to authenticated;

create or replace function public.due_requests_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if not public.can_touch_task(new.task_id) then
      raise exception 'Somente o responsável ou quem passou a atividade pode pedir novo prazo.';
    end if;
    new.requested_by_email := public.current_email();
    new.old_due := (select due_date from public.tasks where id = new.task_id);
    new.status := 'pendente';
    new.decided_by_email := null; new.decided_at := null; new.decision_note := '';
    if exists (select 1 from public.due_requests where task_id = new.task_id and status = 'pendente') then
      raise exception 'Já existe um pedido de novo prazo aguardando decisão.';
    end if;
    insert into public.task_history(task_id, actor_email, action) values (new.task_id, new.requested_by_email,
      'pediu novo prazo: ' || public.fmt_date(new.old_due) || ' → ' || public.fmt_date(new.new_due) ||
      case when new.reason <> '' then ' — ' || new.reason else '' end);
    return new;
  end if;
  -- decisão
  if old.status <> 'pendente' then
    raise exception 'Este pedido já foi decidido.';
  end if;
  new.task_id := old.task_id; new.requested_by_email := old.requested_by_email;
  new.old_due := old.old_due; new.reason := old.reason;
  if new.status <> 'pendente' then
    new.decided_by_email := public.current_email();
    new.decided_at := now();
    if new.status = 'aprovado' then
      update public.tasks set due_date = new.new_due where id = new.task_id;
    else
      insert into public.task_history(task_id, actor_email, action) values (new.task_id, new.decided_by_email,
        'recusou o novo prazo ' || public.fmt_date(new.new_due) || case when new.decision_note <> '' then ' — ' || new.decision_note else '' end);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists due_requests_guard on public.due_requests;
create trigger due_requests_guard before insert or update on public.due_requests
  for each row execute function public.due_requests_guard();

-- tempo real
do $$ begin
  begin alter publication supabase_realtime add table public.activity_types; exception when others then null; end;
  begin alter publication supabase_realtime add table public.due_requests;   exception when others then null; end;
end $$;

-- ---------- restaurar backup (com os campos novos) ----------
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

  insert into public.activity_types (id, name, color, stages, active, position, created_at)
  select a.id, a.name, coalesce(a.color, '#1d4ed8'), coalesce(a.stages, '[]'), coalesce(a.active, true), coalesce(a.position, 0), coalesce(a.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'activity_types', '[]')) as a(id uuid, name text, color text, stages jsonb, active boolean, position int, created_at timestamptz)
  on conflict (id) do update set name = excluded.name, color = excluded.color, stages = excluded.stages,
                                 active = excluded.active, position = excluded.position;

  insert into public.projects (id, name, description, color, archived, created_at)
  select p.id, p.name, coalesce(p.description, ''), coalesce(p.color, '#1d4ed8'), coalesce(p.archived, false), coalesce(p.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'projects', '[]')) as p(id uuid, name text, description text, color text, archived boolean, created_at timestamptz)
  on conflict (id) do update set name = excluded.name, description = excluded.description,
                                 color = excluded.color, archived = excluded.archived;
  get diagnostics n_p = row_count;

  insert into public.tasks (id, project_id, title, description, assignee_id, due_date, status, progress, priority,
                            created_by_email, approval, requested_by_email, approved_at, review_note,
                            type_id, stages, size, suggested_due_date, origin, started_early, hold, hold_note, created_at)
  select t.id, t.project_id, t.title, coalesce(t.description, ''),
         (select nm.id from public.team_members nm where nm.email = old_m.email),
         t.due_date, t.status, t.progress, t.priority, t.created_by_email,
         coalesce(t.approval, 'aprovada'), t.requested_by_email, t.approved_at, coalesce(t.review_note, ''),
         (select at.id from public.activity_types at where at.id = t.type_id), t.stages, coalesce(t.size, 'M'),
         t.suggested_due_date, coalesce(t.origin, ''), coalesce(t.started_early, false), coalesce(t.hold, ''), coalesce(t.hold_note, ''),
         coalesce(t.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'tasks', '[]')) as t(id uuid, project_id uuid, title text, description text, assignee_id uuid,
         due_date date, status text, progress int, priority text, created_by_email text, approval text,
         requested_by_email text, approved_at timestamptz, review_note text, type_id uuid, stages jsonb, size text,
         suggested_due_date date, origin text, started_early boolean, hold text, hold_note text, created_at timestamptz)
    left join jsonb_to_recordset(coalesce(d -> 'team_members', '[]')) as old_m(id uuid, email text) on old_m.id = t.assignee_id
  on conflict (id) do update set project_id = excluded.project_id, title = excluded.title, description = excluded.description,
         assignee_id = excluded.assignee_id, due_date = excluded.due_date, status = excluded.status, progress = excluded.progress,
         priority = excluded.priority, created_by_email = coalesce(excluded.created_by_email, public.tasks.created_by_email),
         approval = excluded.approval, requested_by_email = excluded.requested_by_email,
         approved_at = excluded.approved_at, review_note = excluded.review_note, type_id = excluded.type_id,
         stages = excluded.stages, size = excluded.size, suggested_due_date = excluded.suggested_due_date,
         origin = excluded.origin, started_early = excluded.started_early, hold = excluded.hold, hold_note = excluded.hold_note;
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

  insert into public.due_requests (id, task_id, requested_by_email, old_due, new_due, reason, status, decided_by_email, decided_at, decision_note, created_at)
  select r.id, r.task_id, r.requested_by_email, r.old_due, r.new_due, coalesce(r.reason, ''), coalesce(r.status, 'pendente'),
         r.decided_by_email, r.decided_at, coalesce(r.decision_note, ''), coalesce(r.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'due_requests', '[]')) as r(id uuid, task_id uuid, requested_by_email text, old_due date, new_due date,
         reason text, status text, decided_by_email text, decided_at timestamptz, decision_note text, created_at timestamptz)
   where exists (select 1 from public.tasks tt where tt.id = r.task_id)
  on conflict (id) do nothing;

  insert into public.task_history (id, task_id, actor_email, action, created_at)
  select h.id, h.task_id, h.actor_email, h.action, coalesce(h.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'task_history', '[]')) as h(id uuid, task_id uuid, actor_email text, action text, created_at timestamptz)
   where exists (select 1 from public.tasks tt where tt.id = h.task_id)
  on conflict (id) do nothing;

  insert into public.task_comments (id, task_id, author_email, body, created_at)
  select c.id, c.task_id, c.author_email, c.body, coalesce(c.created_at, now())
    from jsonb_to_recordset(coalesce(d -> 'task_comments', '[]')) as c(id uuid, task_id uuid, author_email text, body text, created_at timestamptz)
  on conflict (id) do nothing;
  get diagnostics n_c = row_count;

  return jsonb_build_object('projetos', n_p, 'atividades', n_t, 'subatividades', n_s, 'comentarios', n_c);
end $$;
revoke execute on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;

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
-- =====================================================================
--  ATUALIZAÇÃO 9 — subatividades pesam no progresso
--  - Cada subatividade pertence a uma etapa (stage_name)
--  - Progresso = % da última etapa concluída + avanço das subatividades
--    da etapa atual dentro do intervalo até a próxima etapa
--    (ex.: etapa 30% → 65% com 2 de 4 subatividades feitas = 47%)
--  - Uma etapa só pode ser concluída quando todas as subatividades dela estiverem feitas
--  - Atividade sem etapas (Livre) com subatividades: % = feitas / total (até 99%; concluir é manual)
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
alter table public.subtasks add column if not exists stage_name text;

create or replace function public.tasks_apply_stages(t public.tasks)
returns public.tasks language plpgsql stable as $$
declare n int := coalesce(jsonb_array_length(t.stages), 0); pend boolean; base int; nx jsonb; tot int; dn int;
begin
  if t.stages is null or n = 0 then
    -- Livre: com subatividades o % vem delas; sem subatividades fica manual
    if t.id is not null then
      select count(*), count(*) filter (where done) into tot, dn from public.subtasks where task_id = t.id;
      if tot > 0 then
        -- subatividades levam até 99%; "Concluído" é marcado pelo responsável
        if t.status = 'concluido' then
          t.progress := 100;
        else
          t.progress := least(round(100.0 * dn / tot)::int, 99);
          if t.status = 'nao_iniciado' and t.progress > 0 then t.status := 'em_andamento'; end if;
        end if;
      end if;
    end if;
    return t;
  end if;

  select coalesce(max((e->>'pct')::int) filter (where e->>'done_at' is not null), 0),
         bool_or(e->>'requested_at' is not null and e->>'done_at' is null)
    into base, pend
    from jsonb_array_elements(t.stages) e;
  t.progress := least(greatest(base, 0), 100);

  -- avanço dentro da etapa atual pelas subatividades dela
  select e into nx from jsonb_array_elements(t.stages) with ordinality as x(e, i)
   where e->>'done_at' is null order by i limit 1;
  if nx is not null and t.id is not null then
    select count(*), count(*) filter (where done) into tot, dn
      from public.subtasks where task_id = t.id and stage_name = nx->>'name';
    if tot > 0 and dn > 0 and (nx->>'pct')::int > base then
      t.progress := least(base + floor(((nx->>'pct')::int - base) * dn::numeric / tot)::int, (nx->>'pct')::int - 1);
    end if;
  end if;

  if base >= 100 then
    t.status := 'concluido';
  elsif coalesce(pend, false) then
    t.status := 'em_revisao';
  elsif t.progress > 0 then
    t.status := 'em_andamento';
  else
    t.status := 'nao_iniciado';
  end if;
  return t;
end $$;

-- etapa só conclui com todas as subatividades dela feitas
create or replace function public.tasks_stage_subs_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare i int; nm text; falta int;
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return new; end if;
  for i in 0 .. coalesce(jsonb_array_length(new.stages), 0) - 1 loop
    if (new.stages->i->>'done_at') is not null and (old.stages->i->>'done_at') is null then
      nm := new.stages->i->>'name';
      select count(*) into falta from public.subtasks where task_id = new.id and stage_name = nm and not done;
      if falta > 0 then
        raise exception 'Conclua as subatividades da etapa "%" antes de finalizá-la (falta%: %).', nm, case when falta > 1 then 'm' else '' end, falta;
      end if;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists tasks_stage_subs_check on public.tasks;
create trigger tasks_stage_subs_check before update on public.tasks
  for each row execute function public.tasks_stage_subs_check();

-- nova subatividade sem etapa definida vai para a etapa atual
create or replace function public.subtasks_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage_name is null then
    select e->>'name' into new.stage_name
      from public.tasks t, jsonb_array_elements(coalesce(t.stages, '[]'::jsonb)) with ordinality as x(e, i)
     where t.id = new.task_id and e->>'done_at' is null
     order by i limit 1;
  end if;
  return new;
end $$;
drop trigger if exists subtasks_before_insert on public.subtasks;
create trigger subtasks_before_insert before insert on public.subtasks
  for each row execute function public.subtasks_before_insert();

-- mudou subatividade → recalcula o progresso da atividade
create or replace function public.subtasks_touch_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return null; end if;
  update public.tasks set updated_at = now() where id = coalesce(new.task_id, old.task_id);
  return null;
end $$;
drop trigger if exists subtasks_touch_task on public.subtasks;
create trigger subtasks_touch_task after insert or update or delete on public.subtasks
  for each row execute function public.subtasks_touch_task();

-- subatividades que já existem: entram na etapa atual da atividade
update public.subtasks s set stage_name = (
  select e->>'name' from public.tasks t, jsonb_array_elements(t.stages) with ordinality as x(e, i)
   where t.id = s.task_id and e->>'done_at' is null order by i limit 1)
 where s.stage_name is null
   and exists (select 1 from public.tasks t where t.id = s.task_id and jsonb_array_length(coalesce(t.stages, '[]'::jsonb)) > 0);

-- recalcula as atividades com etapas (as Livres recalculam quando mexerem numa subatividade)
update public.tasks set updated_at = updated_at where jsonb_array_length(coalesce(stages, '[]'::jsonb)) > 0;

select 'ok' as resultado;
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
-- =====================================================================
--  ATUALIZAÇÃO 11 — modelos de anotação pessoais
--  Uma anotação marcada como modelo não aparece na lista; aparece em "Nova página".
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
alter table public.notes add column if not exists is_template boolean not null default false;
select 'ok' as resultado;
-- =====================================================================
--  ATUALIZAÇÃO 12 — perfil do usuário
--  Cada pessoa edita o próprio nome, cor, foto e telefone.
--  Cargo, papel (admin/colaborador), e-mail e ativo: só administradores.
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
alter table public.team_members add column if not exists avatar_color text;
alter table public.team_members add column if not exists avatar_url   text;
alter table public.team_members add column if not exists phone        text not null default '';

drop policy if exists "equipe_editar_proprio" on public.team_members;
create policy "equipe_editar_proprio" on public.team_members for update
  using (email = public.current_email()) with check (email = public.current_email());

create or replace function public.team_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' or auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.job_title is distinct from old.job_title then
    raise exception 'O cargo é definido pelo administrador.';
  end if;
  if new.email is distinct from old.email or new.role is distinct from old.role or new.active is distinct from old.active then
    raise exception 'Somente administradores alteram e-mail, papel e acesso.';
  end if;
  if length(coalesce(new.avatar_url, '')) > 300000 then
    raise exception 'Foto muito grande.';
  end if;
  if length(trim(new.name)) < 2 then
    raise exception 'Informe seu nome.';
  end if;
  return new;
end $$;
drop trigger if exists team_members_guard on public.team_members;
create trigger team_members_guard before update on public.team_members
  for each row execute function public.team_members_guard();

-- equipe em tempo real (foto/nome novos aparecem para todos)
do $$ begin
  begin alter publication supabase_realtime add table public.team_members; exception when others then null; end;
end $$;

select 'ok' as resultado;
-- =====================================================================
--  ATUALIZAÇÃO 13 — status pela porcentagem (sem etapas)
--    0%        Não iniciado
--    1–19%     Iniciando
--    20–74%    Em andamento
--    75–99%    Finalizando
--    100%      Concluída
--  - Mudou a %: o status acompanha. Escolheu um status: a % vai para a faixa dele.
--  - Com subatividades: % = feitas ÷ total (até 99%); 100% só marcando Concluída.
--  - Etapas desativadas: as atividades deixam de usar tipo/etapas.
--  Pode rodar mais de uma vez sem problema.
-- =====================================================================
create or replace function public.status_for_progress(p int)
returns text language sql immutable as $$
  select case when p >= 100 then 'concluido'
              when p >= 75  then 'finalizando'
              when p >= 20  then 'em_andamento'
              when p >= 1   then 'iniciando'
              else 'nao_iniciado' end;
$$;

-- etapas desativadas: não calcula mais nada por etapa
create or replace function public.tasks_apply_stages(t public.tasks)
returns public.tasks language plpgsql stable as $$
begin
  return t;
end $$;

-- sincroniza status e porcentagem (roda por último, depois das outras regras)
create or replace function public.tasks_zz_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare tot int := 0; dn int := 0;
begin
  if new.id is not null then
    select count(*), count(*) filter (where done) into tot, dn from public.subtasks where task_id = new.id;
  end if;
  new.progress := least(greatest(coalesce(new.progress, 0), 0), 100);
  if tot > 0 then
    -- subatividades mandam na %; Concluída é marcada pela pessoa
    if new.status = 'concluido' and (tg_op = 'INSERT' or old.status is distinct from 'concluido' or old.progress = 100) then
      new.progress := 100;
    else
      new.progress := least(round(100.0 * dn / tot)::int, 99);
    end if;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status and new.progress is not distinct from old.progress then
    -- escolheu um status: leva a % para a faixa dele (se estiver fora)
    new.progress := case new.status
      when 'nao_iniciado' then 0
      when 'iniciando'    then case when new.progress between 1 and 19 then new.progress else 10 end
      when 'em_andamento' then case when new.progress between 20 and 74 then new.progress else 50 end
      when 'finalizando'  then case when new.progress between 75 and 99 then new.progress else 85 end
      when 'concluido'    then 100
      else new.progress end;
  end if;
  new.status := public.status_for_progress(new.progress);
  return new;
end $$;
drop trigger if exists tasks_zz_status on public.tasks;
create trigger tasks_zz_status before insert or update on public.tasks
  for each row execute function public.tasks_zz_status();

-- item novo ou desmarcado numa atividade concluída: ela reabre
create or replace function public.subtasks_touch_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then return null; end if;
  if (tg_op = 'INSERT' and not new.done) or (tg_op = 'UPDATE' and old.done and not new.done) then
    update public.tasks set status = 'em_andamento', updated_at = now()
     where id = new.task_id and status = 'concluido';
  end if;
  update public.tasks set updated_at = now() where id = coalesce(new.task_id, old.task_id);
  return null;
end $$;

-- novos status permitidos
alter table public.tasks drop constraint if exists tasks_status_check;
update public.tasks set stages = null, type_id = null;   -- o gatilho acima recalcula o status pela %
alter table public.tasks add constraint tasks_status_check
  check (status in ('nao_iniciado', 'iniciando', 'em_andamento', 'finalizando', 'concluido'));

select status, count(*) from public.tasks group by status order by 1;
