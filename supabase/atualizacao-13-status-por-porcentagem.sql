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
