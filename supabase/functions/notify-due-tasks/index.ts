// =====================================================================
//  Edge Function: notify-due-tasks
//  Envia, uma vez por dia, um e-mail para cada colaborador com as
//  atividades dele que estão ATRASADAS ou VENCENDO nos próximos dias.
//
//  Variáveis (Supabase > Edge Functions > Secrets):
//    RESEND_API_KEY   chave da conta Resend (https://resend.com)
//    MAIL_FROM        remetente, ex.: "Atividades <avisos@suaempresa.com.br>"
//    APP_URL          endereço do app, ex.: https://atividades-eng.netlify.app
//    CRON_SECRET      uma senha qualquer, a mesma usada no agendamento (cron.sql)
//    DUE_SOON_DAYS    (opcional) dias de antecedência. Padrão: 3
//  SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const STATUS: Record<string, string> = {
  nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', em_revisao: 'Em revisão',
  aguardando: 'Aguardando', bloqueado: 'Bloqueado', concluido: 'Concluído',
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function todayBR(): string {
  // data de hoje no fuso de Brasília
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDays(a: string, b: string): number {
  return Math.round((new Date(a + 'T12:00:00Z').getTime() - new Date(b + 'T12:00:00Z').getTime()) / 86400000);
}
function fmt(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const soonDays = Number(Deno.env.get('DUE_SOON_DAYS') ?? '3');
  const appUrl = Deno.env.get('APP_URL') ?? '';
  const from = Deno.env.get('MAIL_FROM') ?? 'Atividades <onboarding@resend.dev>';
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const today = todayBR();
  const limit = addDays(today, soonDays);

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, due_date, status, progress, assignee_id, project:projects(name, archived), assignee:team_members(name, email, active)')
    .neq('status', 'concluido')
    .not('assignee_id', 'is', null)
    .not('due_date', 'is', null)
    .lte('due_date', limit)
    .order('due_date');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // agrupa por pessoa
  // deno-lint-ignore no-explicit-any
  const byPerson = new Map<string, { name: string; email: string; items: any[] }>();
  // deno-lint-ignore no-explicit-any
  for (const t of (tasks ?? []) as any[]) {
    if (!t.assignee?.active || t.project?.archived) continue;
    const k = t.assignee.email;
    if (!byPerson.has(k)) byPerson.set(k, { name: t.assignee.name, email: k, items: [] });
    byPerson.get(k)!.items.push(t);
  }

  const results: unknown[] = [];
  for (const p of byPerson.values()) {
    const late = p.items.filter((t) => t.due_date < today);
    const soon = p.items.filter((t) => t.due_date >= today);
    const row = (t: { title: string; due_date: string; status: string; progress: number; project?: { name: string } }) => {
      const d = diffDays(t.due_date, today);
      const when = d < 0 ? `atrasada ${-d} dia(s)` : d === 0 ? 'vence HOJE' : d === 1 ? 'vence amanhã' : `vence em ${d} dias`;
      const color = d < 0 ? '#dc2645' : '#d97706';
      return `<tr>
        <td style="padding:10px 8px;border-bottom:1px solid #eee"><b>${esc(t.title)}</b><br><span style="color:#888;font-size:12px">${esc(t.project?.name)}</span></td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;white-space:nowrap">${fmt(t.due_date)}<br><span style="color:${color};font-size:12px;font-weight:bold">${when}</span></td>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;white-space:nowrap">${esc(STATUS[t.status] ?? t.status)}<br><span style="color:#888;font-size:12px">${t.progress}%</span></td>
      </tr>`;
    };
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2430">
        <h2 style="margin:0 0 8px">Olá, ${esc(p.name.split(' ')[0])}!</h2>
        <p style="margin:0 0 16px">Você tem ${late.length ? `<b style="color:#dc2645">${late.length} atividade(s) atrasada(s)</b>` : ''}${late.length && soon.length ? ' e ' : ''}${soon.length ? `<b style="color:#d97706">${soon.length} vencendo nos próximos ${soonDays} dias</b>` : ''}.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="background:#f5f6fa;text-align:left"><th style="padding:8px">Atividade</th><th style="padding:8px">Prazo</th><th style="padding:8px">Status</th></tr>
          ${[...late, ...soon].map(row).join('')}
        </table>
        ${appUrl ? `<p style="margin:22px 0"><a href="${esc(appUrl)}#/minhas" style="background:#1d4ed8;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Abrir minhas atividades</a></p>` : ''}
        <p style="color:#999;font-size:12px">Aviso automático do app de Gestão de Atividades.</p>
      </div>`;
    const subject = late.length
      ? `⚠️ ${late.length} atividade(s) atrasada(s)${soon.length ? ` e ${soon.length} vencendo` : ''}`
      : `⏰ ${soon.length} atividade(s) vencendo nos próximos dias`;

    if (!resendKey) { results.push({ to: p.email, skipped: 'RESEND_API_KEY não configurada' }); continue; }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [p.email], subject, html }),
    });
    results.push({ to: p.email, ok: r.ok, status: r.status });
  }

  return new Response(JSON.stringify({ date: today, people: byPerson.size, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
