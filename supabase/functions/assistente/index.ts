// =====================================================================
//  Edge Function: assistente  (IA do app, usando Google Gemini)
//
//  - Só responde para quem está logado e cadastrado na equipe
//  - Lê os dados COM O LOGIN DA PESSOA: as mesmas regras do app valem aqui
//    (ela só "enxerga" o que já pode ver no app; anotações privadas nunca são enviadas)
//  - A chave do Gemini fica só aqui no servidor (secret GEMINI_API_KEY)
//
//  Secrets (Supabase > Edge Functions > Secrets):
//    GEMINI_API_KEY   chave criada em https://aistudio.google.com/apikey
//    GEMINI_MODEL     (opcional) modelo preferido, ex.: gemini-3.6-flash
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const STATUS: Record<string, string> = {
  nao_iniciado: 'Não iniciado (0%)', iniciando: 'Iniciando (1-19%)', em_andamento: 'Em andamento (20-74%)',
  finalizando: 'Finalizando (75-99%)', concluido: 'Concluída (100%)',
};
const PRIORITY: Record<string, string> = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const MODELS = [
  Deno.env.get('GEMINI_MODEL'),
  'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash',
].filter(Boolean) as string[];

function todayBR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function diffDays(a: string, b: string): number {
  return Math.round((new Date(a + 'T12:00:00Z').getTime() - new Date(b + 'T12:00:00Z').getTime()) / 86400000);
}
function fmt(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return json({ error: 'not_configured' }, 503);

    const auth = req.headers.get('Authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: userData } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    const email = userData?.user?.email?.toLowerCase();
    if (!email) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const history = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: { role?: string; text?: string }) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
      .slice(-12)
      .map((m: { role: string; text: string }) => ({ role: m.role, text: clip(m.text, 2000) }));
    if (!history.length || history[history.length - 1].role !== 'user') return json({ error: 'bad_request' }, 400);

    // ---------- dados que ESSA pessoa pode ver ----------
    const [meR, membersR, projectsR, tasksR, subsR, typesR, dueR] = await Promise.all([
      sb.from('team_members').select('*').eq('email', email).maybeSingle(),
      sb.from('team_members').select('id, name, email, role, active, job_title'),
      sb.from('projects').select('id, name, description, archived'),
      sb.from('tasks').select('*'),
      sb.from('subtasks').select('task_id, title, done, assignee_id, due_date, position').order('position'),
      sb.from('activity_types').select('id, name'),
      sb.from('due_requests').select('task_id, requested_by_email, new_due, reason, status').eq('status', 'pendente'),
    ]);
    const typeName: Record<string, string> = Object.fromEntries((typesR.data || []).map((x) => [x.id, x.name]));
    const dueReq: Record<string, { requested_by_email: string; new_due: string; reason: string }> =
      Object.fromEntries((dueR.data || []).map((x) => [x.task_id, x]));
    const subsByTask: Record<string, { title: string; done: boolean; assignee_id: string | null; due_date: string | null }[]> = {};
    for (const x of subsR.data || []) (subsByTask[x.task_id] ||= []).push(x);
    const me = meR.data;
    if (!me || !me.active) return json({ error: 'forbidden' }, 403);
    const members = membersR.data || [];
    const projects = (projectsR.data || []).filter((p) => !p.archived);
    const projById = Object.fromEntries(projects.map((p) => [p.id, p]));
    const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
    const memberByEmail = Object.fromEntries(members.map((m) => [m.email, m]));

    let last: Record<string, { body: string; author_email: string; created_at: string }> = {};
    const lu = await sb.from('task_last_update').select('task_id, body, author_email, created_at');
    if (!lu.error) {
      last = Object.fromEntries((lu.data || []).map((r) => [r.task_id, r]));
    } else {
      const cm = await sb.from('task_comments').select('task_id, body, author_email, created_at').order('created_at', { ascending: false }).limit(2000);
      for (const r of cm.data || []) if (!last[r.task_id]) last[r.task_id] = r;
    }

    const today = todayBR();
    const recentLimit = new Date(Date.now() - 30 * 86400000).toISOString();
    const tasks = (tasksR.data || [])
      .filter((t) => projById[t.project_id])
      .filter((t) => t.status !== 'concluido' || (t.updated_at || '') >= recentLimit)
      .slice(0, 400);

    const lines = tasks.map((t) => {
      const p = projById[t.project_id];
      const resp = memberById[t.assignee_id];
      const approval = t.approval || 'aprovada';
      const parts = [
        `projeto: ${p.name}`,
        `atividade: ${t.title}`,
        `responsável: ${resp ? `${resp.name}${resp.job_title ? ` (${resp.job_title})` : ''}` : 'ninguém'}`,
        `status: ${STATUS[t.status] || t.status}`,
        `progresso: ${t.progress}%`,
        `prioridade: ${PRIORITY[t.priority] || t.priority}`,
      ];
      if (t.due_date) {
        const d = diffDays(t.due_date, today);
        const rel = t.status === 'concluido' ? '' : d < 0 ? ` (ATRASADA ${-d} dia(s))` : d === 0 ? ' (vence HOJE)' : ` (vence em ${d} dia(s))`;
        parts.push(`prazo: ${fmt(t.due_date)}${rel}`);
      } else parts.push('prazo: sem prazo');
      if (approval !== 'aprovada') {
        const who = memberByEmail[t.requested_by_email]?.name || t.requested_by_email || '';
        parts.push(approval === 'pendente' ? `SOLICITAÇÃO AGUARDANDO APROVAÇÃO (pedida por ${who})` : `SOLICITAÇÃO RECUSADA${t.review_note ? `: ${t.review_note}` : ''}`);
      } else {
        const by = memberByEmail[t.created_by_email]?.name;
        if (by) parts.push(`passada por: ${by}`);
      }
      const st = Array.isArray(t.stages) ? t.stages : [];
      if (st.length) {
        const done = st.filter((e: { done_at?: string }) => e.done_at);
        const next = st.find((e: { done_at?: string }) => !e.done_at);
        const tn = t.type_id ? typeName[t.type_id] : '';
        let txt = `etapas${tn ? ` (${tn})` : ''}: ${st.map((e: { name: string; pct: number; done_at?: string }) => `${e.done_at ? '[feita]' : '[falta]'} ${e.name} ${e.pct}%`).join(' > ')}`;
        if (next) {
          txt += ` | etapa atual: ${next.name}`;
          if (next.requested_at && !next.done_at) txt += ` (AGUARDANDO CONFIRMAÇÃO de ${memberByEmail[t.created_by_email]?.name || 'quem passou'} desde ${fmt(next.requested_at)})`;
        }
        if (!done.length) txt += ' | nenhuma etapa concluída';
        parts.push(txt);
      }
      if (t.size) parts.push(`tamanho: ${t.size}`);
      if (t.hold) {
        const H: Record<string, string> = { cliente: 'aguardando cliente', fornecedor: 'aguardando fornecedor', interno: 'aguardando informação interna', bloqueado: 'bloqueado' };
        parts.push(`IMPEDIMENTO: ${H[t.hold] || t.hold}${t.hold_note ? ` — ${clip(t.hold_note, 120)}` : ''}`);
      }
      if (t.suggested_due_date) parts.push(`prazo combinado/sugerido: ${fmt(t.suggested_due_date)}`);
      if (t.origin) parts.push(`origem: ${clip(t.origin, 100)}`);
      if (t.started_early && approval === 'pendente') parts.push('já iniciada antes da aprovação');
      const dr = dueReq[t.id];
      if (dr) parts.push(`PEDIDO DE NOVO PRAZO pendente (${memberByEmail[dr.requested_by_email]?.name || dr.requested_by_email}): ${fmt(dr.new_due)}${dr.reason ? ` — ${clip(dr.reason, 120)}` : ''}`);
      const l = last[t.id];
      if (l) {
        const who = memberByEmail[l.author_email]?.name || l.author_email;
        parts.push(`última atualização (${who}, ${fmt(l.created_at)}): ${clip(String(l.body).replace(/\s+/g, ' '), 220)}`);
      } else if (t.status !== 'concluido') parts.push('última atualização: nenhuma');
      const subs = subsByTask[t.id];
      if (subs?.length) {
        const doneN = subs.filter((x) => x.done).length;
        const items = subs.slice(0, 12).map((x) => {
          const r = x.assignee_id ? memberById[x.assignee_id]?.name : '';
          return `${x.done ? '[feito]' : '[falta]'} ${clip(x.title, 60)}${r ? ` (${r})` : ''}${x.due_date && !x.done ? ` até ${fmt(x.due_date)}` : ''}`;
        });
        parts.push(`checklist ${doneN}/${subs.length} feitas: ${items.join('; ')}${subs.length > 12 ? '; …' : ''}`);
      }
      if (t.description) parts.push(`descrição: ${clip(String(t.description).replace(/\s+/g, ' '), 160)}`);
      return '- ' + parts.join(' | ');
    });

    const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' }).format(new Date());
    const team = members.filter((m) => m.active)
      .map((m) => `- ${m.name}${m.job_title ? ` (${m.job_title})` : ''}${m.role === 'admin' ? ' [administrador]' : ''}`).join('\n');

    const system = `Você é o assistente do app de gestão de atividades de engenharia da ALLOS Engenharia e Projetos.
Responda SEMPRE em português do Brasil, de forma curta, direta e organizada (como numa conversa no celular).

Quem está perguntando: ${me.name}${me.job_title ? ` (${me.job_title})` : ''} — ${me.role === 'admin' ? 'ADMINISTRADOR/gestor' : 'colaborador'}.
Hoje é ${weekday}, ${fmt(today)}.

Regras:
- Use SOMENTE os dados abaixo. Nunca invente atividades, prazos, pessoas ou números. Se a informação não estiver nos dados, diga isso.
- "Minhas atividades" = atividades em que o responsável é ${me.name}.
- Urgência: primeiro as ATRASADAS, depois as que vencem hoje e nos próximos dias; em empate, prioridade Urgente > Alta > Média > Baixa.
- "O que tem que ser feito hoje": atrasadas, vencendo hoje ou nos próximos 2 dias, e as em andamento/bloqueadas que precisam de atenção.${me.role === 'admin' ? ' Para administradores, inclua também solicitações aguardando aprovação e quem está sem atualização há mais de 1 dia.' : ''}
- Cada status corresponde a uma faixa de %: Não iniciado 0%, Iniciando 1-19%, Em andamento 20-74%, Finalizando 75-99%, Concluída 100%. Com subatividades, a % vem delas.
- Pendências de decisão de um gestor = solicitações aguardando aprovação e PEDIDOS DE NOVO PRAZO das atividades que ele passou.
- Atividades com IMPEDIMENTO: mencione o motivo ao falar delas.
- Ignore atividades concluídas, a menos que perguntem sobre elas.
- Cite sempre o nome da atividade, o projeto, o responsável e o prazo. Use listas curtas e **negrito** para o nome da atividade.
- Você não altera nada no app: se pedirem para mudar algo, explique onde fazer no app.
- Perguntas fora do assunto: responda brevemente e volte ao trabalho.

EQUIPE:
${team}

ATIVIDADES (${lines.length}):
${lines.join('\n') || '(nenhuma atividade visível)'}`;

    const contents = history.map((m: { role: string; text: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));

    let lastErr = '';
    for (const model of MODELS) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const reply = (data?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('').trim();
        if (reply) return json({ reply, model });
        lastErr = 'resposta vazia';
        continue;
      }
      lastErr = `${model}: ${r.status} ${(await r.text()).slice(0, 300)}`;
      // modelo inexistente/sem acesso ou limite atingido: tenta o próximo
      if ([400, 403, 404, 429, 500, 503].includes(r.status)) continue;
      break;
    }
    console.error(lastErr);
    return json({ error: 'ai_failed', detail: lastErr }, 502);
  } catch (e) {
    console.error(e);
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});
