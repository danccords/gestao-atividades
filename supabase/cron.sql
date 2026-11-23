-- =====================================================================
--  AGENDAMENTO DO AVISO POR E-MAIL (roda de segunda a sexta às 8h de Brasília)
--  Antes de rodar: troque SEU-PROJETO e SUA-SENHA-DO-CRON (a mesma do secret CRON_SECRET)
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove o agendamento antigo, se existir
select cron.unschedule(jobid) from cron.job where jobname = 'aviso-prazos';

-- 11:00 UTC = 08:00 em Brasília
select cron.schedule(
  'aviso-prazos',
  '0 11 * * 1-5',
  $$
  select net.http_post(
    url     := 'https://SEU-PROJETO.supabase.co/functions/v1/notify-due-tasks',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', 'SUA-SENHA-DO-CRON'),
    body    := '{}'::jsonb
  );
  $$
);

-- Para testar agora (sem esperar o horário), rode só o bloco abaixo:
-- select net.http_post(
--   url     := 'https://SEU-PROJETO.supabase.co/functions/v1/notify-due-tasks',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','SUA-SENHA-DO-CRON'),
--   body    := '{}'::jsonb);
