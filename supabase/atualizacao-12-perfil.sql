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
