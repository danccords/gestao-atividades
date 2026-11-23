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
  created_at  timestamptz not null default now()
);

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
               check (status in ('nao_iniciado','em_andamento','em_revisao','aguardando','bloqueado','concluido')),
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
  with check (public.is_member() and author_email = public.current_email());
create policy "com_apagar"  on public.task_comments for delete
  using (author_email = public.current_email() or public.is_admin());

-- Anotações: SOMENTE o dono (nem o admin vê)
create policy "notas_dono" on public.notes for all
  using (owner = auth.uid()) with check (owner = auth.uid());

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
