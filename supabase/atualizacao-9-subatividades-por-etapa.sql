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
