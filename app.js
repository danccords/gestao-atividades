// =====================================================================
//  Gestão de Atividades de Engenharia — app (JavaScript puro + Supabase)
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, APP_NAME, COMPANY_NAME, DUE_SOON_DAYS } from './config.js';

// "Manter conectado": guarda o login no aparelho (localStorage) até a pessoa clicar em Sair.
// Desmarcado: o login vale só enquanto o navegador estiver aberto (sessionStorage).
const REMEMBER_KEY = 'ga-remember';
const remember = () => { try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; } };
const authStorage = {
  getItem: (k) => { try { return (remember() ? localStorage : sessionStorage).getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { (remember() ? localStorage : sessionStorage).setItem(k, v); } catch { /* ignore */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ } },
};
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage },
});

// ---------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------
const STATUS = {
  nao_iniciado: { label: 'Não iniciado', color: '#a8adba' },
  em_andamento: { label: 'Em andamento', color: '#fdab3d' },
  em_revisao:   { label: 'Em revisão',   color: '#a25ddc' },
  aguardando:   { label: 'Aguardando',   color: '#579bfc' },
  bloqueado:    { label: 'Bloqueado',    color: '#e2445c' },
  concluido:    { label: 'Concluído',    color: '#00c875' },
};
const STATUS_ORDER = ['em_andamento', 'aguardando', 'em_revisao', 'bloqueado', 'nao_iniciado', 'concluido'];
const PRIORITY = {
  urgente: { label: 'Urgente', color: '#e2445c' },
  alta:    { label: 'Alta',    color: '#fdab3d' },
  media:   { label: 'Média',   color: '#579bfc' },
  baixa:   { label: 'Baixa',   color: '#a8adba' },
};
const PROJECT_COLORS = ['#1d4ed8', '#00a862', '#fdab3d', '#e2445c', '#a25ddc', '#0ea5e9', '#ff642e', '#037f4c', '#784bd1', '#475569'];
const PERSON_COLORS = ['#e2445c', '#00a862', '#f59e0b', '#2563eb', '#a25ddc', '#ff7575', '#037f4c', '#0ea5e9', '#ff642e', '#784bd1', '#bb3354', '#175a63'];
const JOB_TITLES = ['CEO', 'Diretor', 'Gerente de projetos', 'Coordenador', 'Engenheiro', 'Engenheiro civil', 'Engenheiro eletricista', 'Engenheiro mecânico', 'Arquiteto', 'Projetista', 'Desenhista', 'Orçamentista', 'Técnico', 'Auxiliar', 'Estagiário', 'Administrativo'];
const jobDatalist = () => `<datalist id="job-titles">${JOB_TITLES.map((j) => `<option value="${esc(j)}"></option>`).join('')}</datalist>`;
const EMOJIS = ['📄', '📝', '📌', '✅', '💡', '📐', '📏', '🏗️', '🔧', '⚙️', '🔩', '🧱', '📊', '📈', '🗂️', '📅', '⚡', '🔥', '⭐', '🚧', '🧪', '🖊️', '📎', '🔒', '🎯', '🧭', '🛠️', '🏭', '🚀', '❗', '💬', '🧾'];

// ---------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------
const S = {
  session: null, me: null, started: false, recovery: false,
  members: [], projects: [], tasks: [], commentCounts: {},
  notes: null, channel: null, pop: null, leaveHook: null,
  ui: { projects: {}, mine: { who: 'me', q: '' }, showArchived: false, collapsed: {} },
  prefs: loadPrefs(),
};

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('ga-prefs') || '{}'); } catch { return {}; }
}
function savePrefs() {
  try { localStorage.setItem('ga-prefs', JSON.stringify(S.prefs)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------
// Ícones
// ---------------------------------------------------------------------
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
  kanban: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="8" rx="1"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  open: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  pin: '<path d="M12 17v5M9 10.8V4h6v6.8l3 3.2H6z"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  ul: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  ol: '<path d="M10 6h11M10 12h11M10 18h11M4 4h1v5M4 9h2M6 19H4c0-1.2 2-1.8 2-3a1 1 0 0 0-2-.3"/>',
  checksq: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
  quote: '<path d="M4 21c3 0 6-1 6-7V6H4v7h4c0 3-1 5-4 5zM14 21c3 0 6-1 6-7V6h-6v7h4c0 3-1 5-4 5z"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  minus: '<path d="M5 12h14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};
const ic = (name, cls = '') =>
  `<svg class="${cls}" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>`;
const LOGO = `<div class="logo-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h10M3 12h7M3 17h10"/><path d="m14 12 3 3 5-6"/></svg></div>`;

// ---------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const root = () => document.getElementById('root');
const appUrl = () => location.origin + location.pathname;
const isAdmin = () => S.me?.role === 'admin';
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function daysUntil(s) {
  if (!s) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((parseDate(s) - t) / 86400000);
}
function dueState(t) {
  if (t.status === 'concluido') return 'done';
  const n = daysUntil(t.due_date);
  if (n === null) return 'none';
  if (n < 0) return 'late';
  if (n <= DUE_SOON_DAYS) return 'soon';
  return 'ok';
}
function fmtDate(s, withYear = false) {
  if (!s) return '';
  const d = parseDate(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', ...(withYear || !sameYear ? { year: 'numeric' } : {}) }).replace('.', '');
}
function dueText(t) {
  const n = daysUntil(t.due_date);
  if (n === null) return 'Sem prazo';
  if (t.status === 'concluido') return fmtDate(t.due_date);
  if (n < -1) return `Atrasada ${-n} dias`;
  if (n === -1) return 'Venceu ontem';
  if (n === 0) return 'Vence hoje';
  if (n === 1) return 'Vence amanhã';
  if (n <= DUE_SOON_DAYS) return `Vence em ${n} dias`;
  return fmtDate(t.due_date);
}
function relTime(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `há ${Math.floor(diff / 86400)} d`;
  return new Date(ts).toLocaleDateString('pt-BR');
}
function hashColor(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PERSON_COLORS[h % PERSON_COLORS.length];
}
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
const member = (id) => S.members.find((m) => m.id === id);
const memberByEmail = (e) => S.members.find((m) => m.email === String(e || '').toLowerCase());
const project = (id) => S.projects.find((p) => p.id === id);
const task = (id) => S.tasks.find((t) => t.id === id);

function avatar(m, cls = '') {
  if (!m) return `<span class="avatar avatar-empty ${cls}" title="Sem responsável">${ic('user')}</span>`;
  return `<span class="avatar ${cls}" style="background:${hashColor(m.email)}" title="${esc(m.name)}">${esc(initials(m.name))}</span>`;
}
// Aprovação: atividades criadas por colaboradores ficam "pendente" até um admin aprovar
const approvalOf = (t) => t.approval || 'aprovada';
const isApproved = (t) => approvalOf(t) === 'aprovada';
// Quem gerencia a atividade (nome, descrição, prazo, prioridade, responsável):
//  aprovada: o admin que criou/aprovou; se ele não for mais admin ativo, qualquer admin
//  pendente/recusada: quem pediu (só nome/descrição) e os admins
function isTaskManager(t) {
  if (!S.me) return false;
  if (!t.id) return true;
  if (!isApproved(t)) return isAdmin() || t.created_by_email === S.me.email;
  if (t.created_by_email === S.me.email && isAdmin()) return true;
  return isAdmin() && !S.members.some((m) => m.email === t.created_by_email && m.role === 'admin' && m.active);
}
// Prazo, prioridade, responsável e projeto
function canPlanTask(t) {
  return isApproved(t) ? isTaskManager(t) : isAdmin();
}
// Status, progresso e atualizações: quem passou e quem recebeu
function canEditTask(t) {
  return isTaskManager(t) || (!!S.me && t.assignee_id === S.me.id);
}
function activeProject(t) {
  const p = project(t.project_id);
  return p && !p.archived;
}
function pendingRequests() {
  return S.tasks.filter((t) => approvalOf(t) === 'pendente' && activeProject(t)).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
function myTasks() {
  return S.tasks.filter((t) => isApproved(t) && t.assignee_id === S.me?.id && activeProject(t));
}
function alertsFor(list) {
  const late = list.filter((t) => dueState(t) === 'late');
  const soon = list.filter((t) => dueState(t) === 'soon');
  return { late, soon };
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 5000 : 2800);
}
function toastErr(e) {
  console.error(e);
  toast(translateError(e?.message || String(e)), 'error');
}
function translateError(m) {
  const map = [
    [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/email not confirmed/i, 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).'],
    [/user already registered/i, 'Esse e-mail já tem cadastro. Use "Entrar" ou "Esqueci a senha".'],
    [/password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
    [/rate limit|too many/i, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'],
    [/row-level security|permission denied/i, 'Você não tem permissão para fazer isso.'],
    [/duplicate key.*email/i, 'Esse e-mail já está cadastrado na equipe.'],
    [/failed to fetch|network/i, 'Sem conexão com o servidor. Verifique a internet.'],
  ];
  for (const [re, txt] of map) if (re.test(m)) return txt;
  return m;
}

// ---------------------------------------------------------------------
// Popover / modal / confirmação
// ---------------------------------------------------------------------
function closePopover() {
  if (S.pop) { S.pop.remove(); S.pop = null; }
  document.removeEventListener('pointerdown', onOutsidePop, true);
}
function onOutsidePop(e) {
  if (S.pop && !S.pop.contains(e.target) && !e.target.closest('[data-pop-anchor]')) closePopover();
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.pop) { closePopover(); e.stopImmediatePropagation(); }
});
function openPopover(anchor, html, onMount, { width } = {}) {
  closePopover();
  const el = document.createElement('div');
  el.className = 'popover';
  if (width) el.style.width = width + 'px';
  el.innerHTML = html;
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  S.pop = el;
  setTimeout(() => document.addEventListener('pointerdown', onOutsidePop, true), 0);
  onMount?.(el);
  return el;
}

function openModal({ title, body, foot = '', drawer = false, onMount, onClose }) {
  closePopover();
  const bd = document.createElement('div');
  bd.className = 'backdrop' + (drawer ? ' drawer' : '');
  bd.innerHTML = drawer
    ? `<div class="drawer-panel" role="dialog">${body}</div>`
    : `<div class="modal" role="dialog">
         <div class="modal-head"><h3>${title}</h3><button class="btn btn-ghost btn-icon" data-close>${ic('x')}</button></div>
         <div class="modal-body">${body}</div>
         ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
       </div>`;
  $('#overlay-root').appendChild(bd);
  const close = () => {
    bd.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && !S.pop && $('#overlay-root').lastElementChild === bd) close(); };
  document.addEventListener('keydown', onKey);
  bd.addEventListener('mousedown', (e) => { if (e.target === bd) close(); });
  bd.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  const ctx = { el: bd, close };
  onMount?.(ctx);
  return ctx;
}

function confirmDialog(message, { okText = 'Confirmar', danger = false, title = 'Confirmar' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    openModal({
      title: esc(title),
      body: `<p style="margin:0 0 8px;line-height:1.5">${message}</p>`,
      foot: `<button class="btn" data-close>Cancelar</button>
             <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>`,
      onMount: ({ el, close }) => {
        $('[data-ok]', el).onclick = () => { done = true; close(); resolve(true); };
      },
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

// ---------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------
sb.auth.onAuthStateChange((event, session) => {
  // não fazer chamadas ao Supabase dentro do callback (recomendação da lib)
  setTimeout(() => handleAuth(event, session), 0);
});

// Link de "esqueci a senha" abre o app com type=recovery na URL
if (/type=recovery/.test(location.hash + location.search)) S.recovery = true;

function handleAuth(event, session) {
  if (event === 'PASSWORD_RECOVERY') S.recovery = true;
  if (S.recovery) {
    if (session && !S.recoveryShown) { S.recoveryShown = true; S.session = session; renderRecovery(); }
    else if (!session && event === 'INITIAL_SESSION') {
      S.recovery = false; S.started = true;
      renderAuth('forgot');
      setTimeout(() => { const e = $('#auth-err'); if (e) e.textContent = 'O link expirou ou já foi usado. Peça um novo.'; }, 0);
    }
    return;
  }
  if (!session) {
    if (S.session || !S.started) {
      S.session = null; S.me = null; S.started = true; S.notes = null;
      teardownRealtime();
      renderAuth();
    }
    return;
  }
  const wasLogged = S.started && !!S.session;
  S.session = session;
  if (!wasLogged) { S.started = true; afterLogin(); }
}

function renderBoot() {
  root().innerHTML = '<div class="boot"><div class="spinner"></div></div>';
}

function renderAuth(mode = 'login', notice = '') {
  document.title = APP_NAME;
  const tab = (m, label) => `<button type="button" class="${mode === m ? 'active' : ''}" data-mode="${m}">${label}</button>`;
  let form = '';
  if (mode === 'login') {
    form = `
      <div class="field"><label>E-mail</label><input class="input" type="email" name="email" autocomplete="email" required /></div>
      <div class="field"><label>Senha</label><input class="input" type="password" name="password" autocomplete="current-password" required /></div>
      <label style="display:flex;align-items:center;gap:8px;margin:-4px 0 12px;cursor:pointer;font-size:13.5px;color:var(--text-2)">
        <input type="checkbox" name="remember" ${remember() ? 'checked' : ''} style="width:17px;height:17px;accent-color:var(--primary)" /> Manter conectado neste aparelho</label>
      <div class="err" id="auth-err"></div>
      <button class="btn btn-primary btn-block" type="submit">Entrar</button>`;
  } else if (mode === 'first') {
    form = `
      <p class="muted small" style="margin:0 0 14px;line-height:1.5">Use o e-mail que o gestor cadastrou na equipe e crie sua senha.</p>
      <div class="field"><label>E-mail cadastrado</label><input class="input" type="email" name="email" autocomplete="email" required /></div>
      <div class="field"><label>Crie uma senha</label><input class="input" type="password" name="password" autocomplete="new-password" minlength="6" required /></div>
      <div class="field"><label>Repita a senha</label><input class="input" type="password" name="password2" autocomplete="new-password" minlength="6" required /></div>
      <div class="err" id="auth-err"></div>
      <button class="btn btn-primary btn-block" type="submit">Criar meu acesso</button>`;
  } else {
    form = `
      <p class="muted small" style="margin:0 0 14px;line-height:1.5">Enviaremos um link para você criar uma nova senha.</p>
      <div class="field"><label>E-mail</label><input class="input" type="email" name="email" autocomplete="email" required /></div>
      <div class="err" id="auth-err"></div>
      <button class="btn btn-primary btn-block" type="submit">Enviar link</button>`;
  }
  root().innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-brand">${LOGO}<div><h1>${esc(APP_NAME)}</h1><p>${esc(COMPANY_NAME)}</p></div></div>
        <div class="tabs">${tab('login', 'Entrar')}${tab('first', 'Primeiro acesso')}${tab('forgot', 'Esqueci a senha')}</div>
        ${notice ? `<div class="alert ok" style="margin-bottom:16px">${ic('ok')}<div>${notice}</div></div>` : ''}
        <form id="auth-form" novalidate>${form}</form>
      </div>
    </div>`;
  $$('[data-mode]').forEach((b) => (b.onclick = () => renderAuth(b.dataset.mode)));
  const f = $('#auth-form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#auth-err');
    const btn = $('button[type=submit]', f);
    const email = f.email.value.trim().toLowerCase();
    err.textContent = '';
    if (!email || !email.includes('@')) { err.textContent = 'Informe um e-mail válido.'; return; }
    btn.disabled = true;
    try {
      if (mode === 'login') {
        try { localStorage.setItem(REMEMBER_KEY, f.remember.checked ? '1' : '0'); } catch { /* ignore */ }
        await q(sb.auth.signInWithPassword({ email, password: f.password.value }));
      } else if (mode === 'first') {
        if (f.password.value.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        if (f.password.value !== f.password2.value) throw new Error('As senhas não são iguais.');
        const allowed = await q(sb.rpc('is_email_allowed', { p_email: email }));
        if (!allowed) throw new Error('Esse e-mail ainda não foi cadastrado pelo gestor da equipe.');
        const data = await q(sb.auth.signUp({ email, password: f.password.value, options: { emailRedirectTo: appUrl() } }));
        if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw new Error('Esse e-mail já tem cadastro. Use "Entrar" ou "Esqueci a senha".');
        }
        if (!data?.session) {
          renderAuth('login', `Quase lá! Enviamos um e-mail de confirmação para <b>${esc(email)}</b>. Clique no link e depois entre com sua senha.`);
        }
      } else {
        await q(sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() }));
        renderAuth('login', `Se <b>${esc(email)}</b> estiver cadastrado, você vai receber um link para criar uma nova senha.`);
      }
    } catch (ex) {
      err.textContent = translateError(ex.message || String(ex));
      btn.disabled = false;
    }
  };
}

function renderRecovery() {
  root().innerHTML = `
    <div class="auth-wrap"><div class="auth-card">
      <div class="auth-brand">${LOGO}<div><h1>Nova senha</h1><p>Crie uma nova senha de acesso</p></div></div>
      <form id="rec-form">
        <div class="field"><label>Nova senha</label><input class="input" type="password" name="p1" minlength="6" required autocomplete="new-password" /></div>
        <div class="field"><label>Repita a nova senha</label><input class="input" type="password" name="p2" minlength="6" required autocomplete="new-password" /></div>
        <div class="err" id="rec-err"></div>
        <button class="btn btn-primary btn-block" type="submit">Salvar e entrar</button>
      </form>
    </div></div>`;
  const f = $('#rec-form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#rec-err');
    if (f.p1.value.length < 6) { err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
    if (f.p1.value !== f.p2.value) { err.textContent = 'As senhas não são iguais.'; return; }
    try {
      await q(sb.auth.updateUser({ password: f.p1.value }));
      S.recovery = false; S.recoveryShown = false; S.started = true;
      history.replaceState(null, '', appUrl() + '#/inicio');
      toast('Senha alterada!', 'ok');
      afterLogin();
    } catch (ex) { err.textContent = translateError(ex.message); }
  };
}

function renderUnauthorized(email, extra = '') {
  root().innerHTML = `
    <div class="center-msg"><div class="auth-card">
      <div class="auth-brand">${LOGO}<div><h1>Acesso não liberado</h1><p>${esc(email)}</p></div></div>
      <p class="muted" style="line-height:1.55">Seu login funcionou, mas esse e-mail não está cadastrado (ou está desativado) na equipe.
      Peça ao gestor para adicionar você na aba <b>Equipe</b> e depois entre de novo.</p>
      ${extra ? `<p class="err">${esc(extra)}</p>` : ''}
      <button class="btn btn-block" id="out">${ic('logout')} Sair</button>
    </div></div>`;
  $('#out').onclick = () => sb.auth.signOut();
}

async function afterLogin() {
  renderBoot();
  const email = (S.session?.user?.email || '').toLowerCase();
  try {
    const me = await q(sb.from('team_members').select('*').eq('email', email).maybeSingle());
    if (!me || !me.active) { renderUnauthorized(email); return; }
    S.me = me;
    await loadAll();
    renderShell();
    setupRealtime();
    route();
    maybeBrowserNotify();
  } catch (e) {
    console.error(e);
    renderUnauthorized(email, translateError(e.message || String(e)));
  }
}

// ---------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------
async function loadAll() {
  const [members, projects, tasks, comments] = await Promise.all([
    q(sb.from('team_members').select('*').order('name')),
    q(sb.from('projects').select('*').order('created_at')),
    q(sb.from('tasks').select('*').order('created_at')),
    q(sb.from('task_comments').select('task_id')),
  ]);
  S.members = members || [];
  S.projects = projects || [];
  S.tasks = tasks || [];
  countComments(comments || []);
  const meNow = S.members.find((m) => m.id === S.me.id);
  if (meNow) S.me = meNow;
}
function countComments(rows) {
  S.commentCounts = {};
  for (const r of rows) S.commentCounts[r.task_id] = (S.commentCounts[r.task_id] || 0) + 1;
}
function upsertLocal(arr, row) {
  const i = arr.findIndex((x) => x.id === row.id);
  if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push(row);
}

async function updateTask(id, patch) {
  const t = task(id);
  if (!t) return;
  // automações de status/progresso
  if ('progress' in patch && !('status' in patch)) {
    if (patch.progress === 100 && t.status !== 'concluido') patch.status = 'concluido';
    else if (patch.progress > 0 && patch.progress < 100 && t.status === 'nao_iniciado') patch.status = 'em_andamento';
    else if (patch.progress < 100 && t.status === 'concluido') patch.status = 'em_andamento';
  }
  if (patch.status === 'concluido' && !('progress' in patch)) patch.progress = 100;
  const prev = { ...t };
  Object.assign(t, patch);
  refresh();
  try {
    const row = await q(sb.from('tasks').update(patch).eq('id', id).select().single());
    upsertLocal(S.tasks, row);
    refresh();
  } catch (e) {
    Object.assign(t, prev);
    refresh();
    toastErr(e);
  }
}

async function createTask(fields) {
  const row = await q(sb.from('tasks').insert(fields).select().single());
  upsertLocal(S.tasks, row);
  refresh();
  return row;
}

// ---------------------------------------------------------------------
// Tempo real
// ---------------------------------------------------------------------
function setupRealtime() {
  teardownRealtime();
  S.channel = sb.channel('equipe-db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (p) => applyChange(S.tasks, p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (p) => applyChange(S.projects, p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments' }, onCommentChange)
    .subscribe();
}
function teardownRealtime() {
  if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
}
function applyChange(arr, p) {
  if (p.eventType === 'DELETE') {
    const i = arr.findIndex((x) => x.id === p.old?.id);
    if (i >= 0) arr.splice(i, 1);
  } else if (p.new) {
    upsertLocal(arr, p.new);
  }
  scheduleRefresh();
}
let commentReload = null;
function onCommentChange(p) {
  clearTimeout(commentReload);
  commentReload = setTimeout(async () => {
    try { countComments(await q(sb.from('task_comments').select('task_id'))); } catch { /* ignore */ }
    S.onCommentsChanged?.(p);
    scheduleRefresh();
  }, 300);
}

// Re-renderiza a tela atual sem atrapalhar quem está digitando
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 250);
}
function refresh() {
  if (!S.me || !$('#view')) return;
  updateChrome();
  const r = currentRoute();
  if (r.name === 'notas') return;
  const a = document.activeElement;
  if (a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.value) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 1200);
    return;
  }
  if (S.pop && $('#view').contains(S.pop.anchor || null)) return;
  renderView(r, true);
}

// ---------------------------------------------------------------------
// Estrutura (menu lateral, barra superior, menu inferior no celular)
// ---------------------------------------------------------------------
function renderShell() {
  const me = S.me;
  root().innerHTML = `
  <div class="app">
    <aside class="sidebar">
      <div class="brand">${LOGO}<div><b>${esc(APP_NAME)}</b><span>${esc(COMPANY_NAME)}</span></div></div>
      <nav class="nav">
        <a href="#/inicio" data-nav="inicio">${ic('home')} Projetos</a>
        <a href="#/minhas" data-nav="minhas">${ic('check')} Minhas atividades <span class="count" id="nav-count" hidden></span></a>
        <a href="#/notas" data-nav="notas">${ic('note')} Anotações</a>
        ${me.role === 'admin' ? `<a href="#/equipe" data-nav="equipe">${ic('users')} Equipe</a>` : ''}
      </nav>
      <div class="nav-section">Projetos</div>
      <div class="nav-projects" id="nav-projects"></div>
      <div class="userbox">
        ${avatar(me, 'lg')}
        <div class="info"><b>${esc(me.name)}</b><span>${me.role === 'admin' ? 'Administrador' : 'Colaborador'}</span></div>
        <button class="btn btn-ghost btn-icon" id="logout" title="Sair">${ic('logout')}</button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <button class="btn btn-ghost btn-icon back" id="back" hidden>${ic('back')}</button>
        <h2 id="page-title"></h2>
        <button class="btn btn-ghost btn-icon bell" id="bell" data-pop-anchor title="Avisos">${ic('bell')}<span class="badge" id="bell-badge" hidden></span></button>
        <button class="btn btn-ghost btn-icon only-mobile" id="me-btn" data-pop-anchor>${avatar(me)}</button>
      </header>
      <div class="view" id="view"></div>
    </main>
    <nav class="bottomnav">
      <a href="#/inicio" data-nav="inicio">${ic('home')}<span>Projetos</span></a>
      <a href="#/minhas" data-nav="minhas">${ic('check')}<span>Minhas</span><span class="count" id="bn-count" hidden></span></a>
      <a href="#/notas" data-nav="notas">${ic('note')}<span>Anotações</span></a>
      ${me.role === 'admin' ? `<a href="#/equipe" data-nav="equipe">${ic('users')}<span>Equipe</span></a>` : ''}
    </nav>
  </div>`;
  $('#logout').onclick = logout;
  $('#bell').onclick = (e) => openBell(e.currentTarget);
  $('#me-btn').onclick = (e) => openMeMenu(e.currentTarget);
  $('#back').onclick = () => { if (S.backTo) location.hash = S.backTo; };
  bindViewEvents();
  updateChrome();
}

async function logout() {
  if (S.leaveHook) await S.leaveHook();
  await sb.auth.signOut();
}

function updateChrome() {
  const { late, soon } = alertsFor(myTasks());
  const n = late.length + soon.length + (isAdmin() ? pendingRequests().length : 0);
  const badge = $('#bell-badge');
  if (badge) { badge.hidden = n === 0; badge.textContent = n > 99 ? '99+' : n; }
  for (const id of ['#nav-count', '#bn-count']) {
    const el = $(id);
    if (el) { el.hidden = late.length === 0; el.textContent = late.length; }
  }
  const r = currentRoute();
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.name || (r.name === 'projeto' && a.dataset.nav === 'inicio')));
  const np = $('#nav-projects');
  if (np) {
    const list = S.projects.filter((p) => !p.archived);
    np.innerHTML = list.length
      ? list.map((p) => `<a href="#/projeto/${p.id}" class="${r.name === 'projeto' && r.id === p.id ? 'active' : ''}"><span class="dot" style="background:${esc(p.color)}"></span><span class="t">${esc(p.name)}</span></a>`).join('')
      : '<div class="muted small" style="padding:6px 10px">Nenhum projeto ainda</div>';
  }
}

function setTitle(html, backTo = null) {
  $('#page-title').innerHTML = html;
  S.backTo = backTo;
  $('#back').hidden = !backTo;
}

function openBell(anchor) {
  if (S.pop) { closePopover(); return; }
  const { late, soon } = alertsFor(myTasks());
  const items = [...late, ...soon].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const reqs = isAdmin() ? pendingRequests() : [];
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const html = `
    <div class="ttl">Avisos de prazo</div>
    <div class="notif-list">
      ${reqs.map((t) => `
        <div class="notif" data-task="${t.id}">
          <span class="dot" style="background:var(--primary)"></span>
          <div><b>Aprovar: ${esc(t.title)}</b><span>${esc(memberByEmail(t.requested_by_email)?.name || '')} · ${esc(project(t.project_id)?.name || '')}</span></div>
        </div>`).join('')}
      ${items.length || reqs.length ? items.map((t) => `
        <div class="notif" data-task="${t.id}">
          <span class="dot" style="background:${dueState(t) === 'late' ? 'var(--danger)' : 'var(--warn)'}"></span>
          <div><b>${esc(t.title)}</b><span>${esc(project(t.project_id)?.name || '')} · ${esc(dueText(t))}</span></div>
        </div>`).join('')
      : `<div class="notif" style="cursor:default"><span class="dot" style="background:var(--ok)"></span><div><b>Tudo em dia</b><span>Nenhuma atividade sua atrasada ou vencendo nos próximos ${DUE_SOON_DAYS} dias.</span></div></div>`}
    </div>
    ${perm === 'default' ? `<button class="btn btn-sm btn-block" id="enable-notif" style="margin-top:6px">${ic('bell')} Ativar notificações neste aparelho</button>` : ''}`;
  openPopover(anchor, html, (el) => {
    $$('[data-task]', el).forEach((n) => (n.onclick = () => { closePopover(); openTask(n.dataset.task); }));
    const b = $('#enable-notif', el);
    if (b) b.onclick = async () => { closePopover(); await requestNotif(); };
  }, { width: 340 });
}

function openMeMenu(anchor) {
  if (S.pop) { closePopover(); return; }
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  openPopover(anchor, `
    <div style="display:flex;gap:10px;align-items:center;padding:6px 6px 10px">${avatar(S.me, 'lg')}
      <div style="min-width:0"><b style="display:block">${esc(S.me.name)}</b><span class="muted small">${esc(S.me.email)}</span></div></div>
    ${perm === 'default' ? `<button class="menu-item" id="m-notif">${ic('bell')} Ativar notificações</button>` : ''}
    <button class="menu-item" id="m-out" style="color:var(--danger)">${ic('logout')} Sair</button>`,
  (el) => {
    $('#m-out', el).onclick = () => { closePopover(); logout(); };
    const n = $('#m-notif', el);
    if (n) n.onclick = () => { closePopover(); requestNotif(); };
  }, { width: 260 });
}

// Notificações do navegador (aparecem no celular/computador quando o app abre)
async function requestNotif() {
  if (!('Notification' in window)) { toast('Este navegador não suporta notificações. No iPhone, instale o app na tela inicial primeiro.'); return; }
  const p = await Notification.requestPermission();
  if (p === 'granted') { toast('Notificações ativadas!', 'ok'); localStorage.removeItem('ga-notified'); maybeBrowserNotify(); }
  else toast('Notificações não permitidas.');
}
async function maybeBrowserNotify() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const key = todayStr();
  if (localStorage.getItem('ga-notified') === key) return;
  const { late, soon } = alertsFor(myTasks());
  if (!late.length && !soon.length) return;
  const parts = [];
  if (late.length) parts.push(`${late.length} atrasada${late.length > 1 ? 's' : ''}`);
  if (soon.length) parts.push(`${soon.length} vencendo em até ${DUE_SOON_DAYS} dias`);
  const body = parts.join(' e ') + '. Toque para ver.';
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification('Atividades com prazo próximo', { body, icon: 'icons/icon-192.png', tag: 'prazos' });
    else new Notification('Atividades com prazo próximo', { body, icon: 'icons/icon-192.png' });
    localStorage.setItem('ga-notified', key);
  } catch (e) { console.warn(e); }
}

// ---------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  return { name: name || 'inicio', id };
}
async function route() {
  if (!S.me) return;
  closePopover();
  if (S.leaveHook) { const fn = S.leaveHook; S.leaveHook = null; await fn(); }
  const r = currentRoute();
  updateChrome();
  window.scrollTo(0, 0);
  renderView(r, false);
}
window.addEventListener('hashchange', route);

function renderView(r, isRefresh) {
  const view = $('#view');
  view.classList.toggle('notes-view', r.name === 'notas');
  switch (r.name) {
    case 'projeto': return viewProject(r.id, isRefresh);
    case 'minhas': return viewMine();
    case 'notas': return viewNotes(r.id);
    case 'equipe': if (!isAdmin()) { location.hash = '#/inicio'; return; } return viewTeam();
    default: return viewHome();
  }
}

// ---------------------------------------------------------------------
// Componentes de atividades
// ---------------------------------------------------------------------
function statusPill(t, editable) {
  const s = STATUS[t.status] || STATUS.nao_iniciado;
  return `<button class="pill ${editable ? 'editable' : ''}" ${editable ? 'data-act="status" data-pop-anchor' : 'tabindex="-1"'} style="background:${s.color}">${s.label}</button>`;
}
function prioPill(t, editable) {
  const p = PRIORITY[t.priority] || PRIORITY.media;
  return `<button class="pill sm ${editable ? 'editable' : ''}" ${editable ? 'data-act="prio" data-pop-anchor' : 'tabindex="-1"'} style="background:${p.color}">${p.label}</button>`;
}
function dueChip(t, editable) {
  if (approvalOf(t) === 'pendente') return `<span class="due soon" title="Aguardando aprovação">${ic('clock')}Aguardando aprovação</span>`;
  if (approvalOf(t) === 'recusada') return `<span class="due late">${ic('x')}Recusada</span>`;
  const st = dueState(t);
  return `<span class="due ${st}" ${editable ? 'data-act="due" data-pop-anchor style="cursor:pointer"' : ''} title="${t.due_date ? fmtDate(t.due_date, true) : ''}">${ic('calendar')}${esc(dueText(t))}</span>`;
}
function progBar(t, editable) {
  return `<div class="prog ${editable ? 'editable' : ''}" ${editable ? 'data-act="progress" data-pop-anchor' : ''}>
    <div class="bar"><i class="${t.progress >= 100 ? 'full' : ''}" style="width:${t.progress}%"></i></div><b>${t.progress}%</b></div>`;
}
function whoCell(t) {
  const m = member(t.assignee_id);
  const inner = `<div class="person">${avatar(m)}<span>${m ? esc(m.name) : '<span class="muted">—</span>'}</span></div>`;
  return canPlanTask(t) ? `<div data-act="who" data-pop-anchor style="cursor:pointer;min-width:0;width:100%">${inner}</div>` : inner;
}

function taskRow(t, { color, showProject }) {
  const ed = canEditTask(t);
  const adm = canPlanTask(t);
  const p = project(t.project_id);
  const cc = S.commentCounts[t.id] || 0;
  return `
  <div class="tr" data-id="${t.id}" style="--gc:${color}">
    <div class="td">
      <div style="min-width:0;flex:1">
        <div class="task-title" data-act="open">${esc(t.title)}</div>
        ${showProject && p ? `<div class="task-proj"><i style="background:${esc(p.color)}"></i>${esc(p.name)}</div>` : ''}
      </div>
      ${cc ? `<span class="cmt-count">${ic('msg')}${cc}</span>` : ''}
      <span data-act="open" style="display:flex;cursor:pointer">${ic('open', 'open-ic')}</span>
    </div>
    <div class="td col-who">${whoCell(t)}</div>
    <div class="td col-status">${statusPill(t, ed)}</div>
    <div class="td c col-due">${dueChip(t, adm)}</div>
    <div class="td col-prog">${progBar(t, ed)}</div>
    <div class="td c col-prio">${prioPill(t, adm)}</div>
  </div>`;
}

function renderGroups(groups, { showProject = false, allowAdd = false, scope = 'x' } = {}) {
  return groups.map((g) => {
    const ckey = `${scope}:${g.key}`;
    const collapsed = S.ui.collapsed[ckey] ?? !!g.collapsed;
    return `
    <section class="group ${collapsed ? 'collapsed' : ''}" style="--gc:${g.color}">
      <div class="group-head" data-collapse="${esc(ckey)}">${ic('chev', 'chev')}<span>${esc(g.label)}</span><span class="n">${g.tasks.length} ${g.tasks.length === 1 ? 'atividade' : 'atividades'}</span></div>
      <div class="tbl">
        <div class="tr th" style="--gc:${g.color}">
          <div class="td">Atividade</div><div class="td">Responsável</div><div class="td">Status</div>
          <div class="td">Prazo</div><div class="td">Progresso</div><div class="td col-prio">Prioridade</div>
        </div>
        ${g.tasks.map((t) => taskRow(t, { color: g.color, showProject })).join('')}
        ${allowAdd && isAdmin() ? `<div class="add-row"><input placeholder="+ Adicionar atividade" data-add='${esc(JSON.stringify(g.defaults || {}))}' /></div>` : ''}
      </div>
    </section>`;
  }).join('');
}

function sortByDue(a, b) {
  if (!a.due_date && !b.due_date) return a.created_at.localeCompare(b.created_at);
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

// Eventos da área principal (delegação)
function bindViewEvents() {
  const view = $('#view');
  view.addEventListener('click', (e) => {
    const col = e.target.closest('[data-collapse]');
    if (col) {
      const k = col.dataset.collapse;
      const sec = col.closest('.group');
      const now = !sec.classList.contains('collapsed');
      sec.classList.toggle('collapsed', now);
      S.ui.collapsed[k] = now;
      return;
    }
    const actEl = e.target.closest('[data-act]');
    if (!actEl) return;
    const row = actEl.closest('[data-id]');
    const id = row?.dataset.id;
    const t = id && task(id);
    if (!t) return;
    const act = actEl.dataset.act;
    if (act === 'open') openTask(id);
    else if (act === 'status') popStatus(actEl, t);
    else if (act === 'progress') popProgress(actEl, t);
    else if (act === 'prio') popPriority(actEl, t);
    else if (act === 'due') popDue(actEl, t);
    else if (act === 'who') popWho(actEl, t);
  });
  view.addEventListener('keydown', async (e) => {
    const inp = e.target.closest('[data-add]');
    if (!inp || e.key !== 'Enter') return;
    const title = inp.value.trim();
    if (!title) return;
    const r = currentRoute();
    const defaults = JSON.parse(inp.dataset.add || '{}');
    inp.disabled = true;
    try {
      await createTask({ project_id: r.id, title, ...defaults, ...(defaults.status === 'concluido' ? { progress: 100 } : {}) });
      inp.value = '';
      refresh();
      const again = $$('[data-add]').find((x) => x.dataset.add === JSON.stringify(defaults));
      again?.focus();
    } catch (ex) { toastErr(ex); inp.disabled = false; }
  });
}

function popStatus(anchor, t) {
  const el = openPopover(anchor, `<div class="opt-list">${STATUS_ORDER.map((k) =>
    `<button class="pill editable" data-v="${k}" style="background:${STATUS[k].color}">${STATUS[k].label}</button>`).join('')}</div>`,
  (el) => $$('[data-v]', el).forEach((b) => (b.onclick = () => { closePopover(); updateTask(t.id, { status: b.dataset.v }); })),
  { width: 210 });
  el.anchor = anchor;
}
function popPriority(anchor, t) {
  const el = openPopover(anchor, `<div class="opt-list">${Object.entries(PRIORITY).map(([k, v]) =>
    `<button class="pill editable" data-v="${k}" style="background:${v.color}">${v.label}</button>`).join('')}</div>`,
  (el) => $$('[data-v]', el).forEach((b) => (b.onclick = () => { closePopover(); updateTask(t.id, { priority: b.dataset.v }); })),
  { width: 180 });
  el.anchor = anchor;
}
function popProgress(anchor, t) {
  const el = openPopover(anchor, `
    <div class="ttl">Progresso: <b id="pv">${t.progress}%</b></div>
    <input type="range" min="0" max="100" step="5" value="${t.progress}" id="pr" />
    <div class="quick">${[0, 25, 50, 75, 100].map((v) => `<button data-v="${v}">${v}%</button>`).join('')}</div>`,
  (el) => {
    const r = $('#pr', el);
    r.oninput = () => ($('#pv', el).textContent = r.value + '%');
    r.onchange = () => updateTask(t.id, { progress: Number(r.value) });
    $$('[data-v]', el).forEach((b) => (b.onclick = () => { closePopover(); updateTask(t.id, { progress: Number(b.dataset.v) }); }));
  }, { width: 250 });
  el.anchor = anchor;
}
function popDue(anchor, t) {
  const el = openPopover(anchor, `
    <div class="ttl">Data de entrega</div>
    <input type="date" class="input" id="dd" value="${t.due_date || ''}" />
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="btn btn-sm" id="dclear" style="flex:1">Sem prazo</button>
      <button class="btn btn-sm btn-primary" id="dok" style="flex:1">Salvar</button>
    </div>`,
  (el) => {
    $('#dok', el).onclick = () => { const v = $('#dd', el).value || null; closePopover(); updateTask(t.id, { due_date: v }); };
    $('#dclear', el).onclick = () => { closePopover(); updateTask(t.id, { due_date: null }); };
  }, { width: 240 });
  el.anchor = anchor;
}
function popWho(anchor, t) {
  const list = S.members.filter((m) => m.active);
  const el = openPopover(anchor, `
    <div class="ttl">Responsável</div>
    <div style="max-height:280px;overflow-y:auto">
      ${list.map((m) => `<button class="menu-item" data-v="${m.id}">${avatar(m)} <span style="min-width:0"><span style="display:block">${esc(m.name)}</span>${m.job_title ? `<span class="small muted">${esc(m.job_title)}</span>` : ''}</span>${m.id === t.assignee_id ? ' <span style="margin-left:auto;color:var(--primary)">✓</span>' : ''}</button>`).join('')}
      <button class="menu-item" data-v="">${avatar(null)} <span class="muted">Sem responsável</span></button>
    </div>`,
  (el) => $$('[data-v]', el).forEach((b) => (b.onclick = () => { closePopover(); updateTask(t.id, { assignee_id: b.dataset.v || null }); })),
  { width: 250 });
  el.anchor = anchor;
}

// ---------------------------------------------------------------------
// TELA: Início (projetos)
// ---------------------------------------------------------------------
function viewHome() {
  setTitle('Projetos');
  document.title = `Projetos · ${APP_NAME}`;
  const mine = myTasks();
  const open = mine.filter((t) => t.status !== 'concluido');
  const { late, soon } = alertsFor(mine);
  const done = mine.filter((t) => t.status === 'concluido');
  const archivedCount = S.projects.filter((p) => p.archived).length;
  const list = S.projects.filter((p) => S.ui.showArchived || !p.archived);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const dateTxt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const card = (p) => {
    const ts = S.tasks.filter((t) => t.project_id === p.id && isApproved(t));
    const pendN = S.tasks.filter((t) => t.project_id === p.id && approvalOf(t) === 'pendente').length;
    const total = ts.length;
    const avg = total ? Math.round(ts.reduce((s, t) => s + t.progress, 0) / total) : 0;
    const pl = ts.filter((t) => dueState(t) === 'late').length;
    const ps = ts.filter((t) => dueState(t) === 'soon').length;
    const people = [...new Set(ts.map((t) => t.assignee_id).filter(Boolean))].map(member).filter(Boolean);
    const seg = STATUS_ORDER.map((k) => {
      const n = ts.filter((t) => t.status === k).length;
      return n ? `<i style="width:${(n / total) * 100}%;background:${STATUS[k].color}" title="${STATUS[k].label}: ${n}"></i>` : '';
    }).join('');
    return `
      <div class="pcard" style="--c:${esc(p.color)}" data-proj="${p.id}">
        <div style="display:flex;align-items:center;gap:8px"><h3 style="flex:1">${esc(p.name)}</h3>${p.archived ? '<span class="archived-tag">Arquivado</span>' : ''}</div>
        ${p.description ? `<p>${esc(p.description)}</p>` : ''}
        <div class="stackbar">${seg}</div>
        <div class="meta">
          <span>${total} ${total === 1 ? 'atividade' : 'atividades'}</span>
          <span>${avg}% concluído</span>
          ${pl ? `<span class="late">${pl} atrasada${pl > 1 ? 's' : ''}</span>` : ''}
          ${ps ? `<span class="soon">${ps} vencendo</span>` : ''}
          ${pendN && isAdmin() ? `<span class="soon">${pendN} para aprovar</span>` : ''}
          <span style="margin-left:auto;display:flex">${people.slice(0, 4).map((m, i) => `<span style="margin-left:${i ? -8 : 0}px;border:2px solid #fff;border-radius:50%;display:inline-flex">${avatar(m)}</span>`).join('')}</span>
        </div>
      </div>`;
  };

  $('#view').innerHTML = `
    <div class="page-head">
      <div class="t"><h1>${greet}, ${esc(firstName(S.me.name))}!</h1><p>${esc(dateTxt.charAt(0).toUpperCase() + dateTxt.slice(1))}</p></div>
      <div class="actions">${isAdmin() ? `<button class="btn btn-primary" id="new-proj">${ic('plus')} Novo projeto</button>` : ''}</div>
    </div>
    ${isAdmin() && backupDue() ? `<div class="alert warn">${ic('archive')}<div style="flex:1"><b>Faça um backup dos dados</b>${lastBackupText()}. Leva 2 segundos e protege a equipe caso algo dê errado.</div><button class="btn btn-sm" id="home-backup">Baixar backup</button></div>` : ''}
    ${isAdmin() && pendingRequests().length ? `<div class="alert warn" style="display:block">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">${ic('clock')}<b>${pendingRequests().length} solicitaç${pendingRequests().length > 1 ? 'ões' : 'ão'} de atividade aguardando aprovação</b></div>
      ${pendingRequests().slice(0, 6).map((t) => `<div class="notif" data-req="${t.id}" style="padding:7px 8px;background:rgba(255,255,255,.6);margin-top:4px">
        <span class="dot" style="background:var(--warn)"></span><div><b>${esc(t.title)}</b><span>${esc(memberByEmail(t.requested_by_email)?.name || t.requested_by_email || '')} · ${esc(project(t.project_id)?.name || '')} · ${relTime(t.created_at)}</span></div></div>`).join('')}
    </div>` : ''}
    <div class="stats">
      <div class="stat" data-go="#/minhas"><div class="k"><i style="background:var(--primary)"></i>Minhas em aberto</div><div class="v">${open.length}</div></div>
      <div class="stat warn" data-go="#/minhas"><div class="k"><i style="background:var(--warn)"></i>Vencendo (${DUE_SOON_DAYS} dias)</div><div class="v">${soon.length}</div></div>
      <div class="stat danger" data-go="#/minhas"><div class="k"><i style="background:var(--danger)"></i>Atrasadas</div><div class="v">${late.length}</div></div>
      <div class="stat ok" data-go="#/minhas"><div class="k"><i style="background:var(--ok)"></i>Concluídas</div><div class="v">${done.length}</div></div>
    </div>
    <div class="toolbar">
      <h3 style="margin:0;font-size:16px">Projetos</h3><div class="spacer"></div>
      ${archivedCount ? `<label class="small muted" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="show-arch" ${S.ui.showArchived ? 'checked' : ''}/> Mostrar arquivados (${archivedCount})</label>` : ''}
    </div>
    ${list.length || isAdmin() ? `<div class="grid-cards">
      ${list.map(card).join('')}
      ${isAdmin() ? `<div class="pcard add" id="new-proj-2">${ic('plus', '').replace('<svg', '<svg width="22" height="22"')} Novo projeto</div>` : ''}
    </div>` : `<div class="empty"><b>Nenhum projeto ainda</b>Quando o gestor criar um projeto, ele aparece aqui.</div>`}`;

  $$('[data-req]').forEach((c) => (c.onclick = () => openTask(c.dataset.req)));
  $$('[data-proj]').forEach((c) => (c.onclick = () => (location.hash = `#/projeto/${c.dataset.proj}`)));
  $$('[data-go]').forEach((c) => (c.onclick = () => (location.hash = c.dataset.go)));
  $('#new-proj')?.addEventListener('click', () => projectModal());
  $('#home-backup')?.addEventListener('click', async () => { await exportBackup(); viewHome(); });
  $('#new-proj-2')?.addEventListener('click', () => projectModal());
  $('#show-arch')?.addEventListener('change', (e) => { S.ui.showArchived = e.target.checked; viewHome(); });
}

function projectModal(p = null) {
  let color = p?.color || PROJECT_COLORS[S.projects.length % PROJECT_COLORS.length];
  openModal({
    title: p ? 'Editar projeto' : 'Novo projeto',
    body: `
      <div class="field"><label>Nome do projeto</label><input class="input" id="pn" value="${esc(p?.name || '')}" placeholder="Ex.: Ampliação Galpão B" /></div>
      <div class="field"><label>Descrição (opcional)</label><textarea class="textarea" id="pd" placeholder="Cliente, escopo, observações...">${esc(p?.description || '')}</textarea></div>
      <div class="field"><label>Cor</label><div style="display:flex;gap:8px;flex-wrap:wrap" id="pcol">
        ${PROJECT_COLORS.map((c) => `<button type="button" data-c="${c}" style="width:30px;height:30px;border-radius:8px;border:3px solid ${c === color ? '#1f2430' : 'transparent'};background:${c}"></button>`).join('')}
      </div></div>
      <div class="err" id="perr"></div>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="psave">${p ? 'Salvar' : 'Criar projeto'}</button>`,
    onMount: ({ el, close }) => {
      $('#pn', el).focus();
      $$('[data-c]', el).forEach((b) => (b.onclick = () => {
        color = b.dataset.c;
        $$('[data-c]', el).forEach((x) => (x.style.borderColor = x.dataset.c === color ? '#1f2430' : 'transparent'));
      }));
      $('#pn', el).onkeydown = (e) => { if (e.key === 'Enter') $('#psave', el).click(); };
      $('#psave', el).onclick = async () => {
        const name = $('#pn', el).value.trim();
        if (!name) { $('#perr', el).textContent = 'Dê um nome ao projeto.'; return; }
        const fields = { name, description: $('#pd', el).value.trim(), color };
        try {
          if (p) {
            const row = await q(sb.from('projects').update(fields).eq('id', p.id).select().single());
            upsertLocal(S.projects, row);
            close(); refresh();
          } else {
            const row = await q(sb.from('projects').insert(fields).select().single());
            upsertLocal(S.projects, row);
            close();
            location.hash = `#/projeto/${row.id}`;
          }
        } catch (e) { $('#perr', el).textContent = translateError(e.message); }
      };
    },
  });
}

// ---------------------------------------------------------------------
// TELA: Projeto
// ---------------------------------------------------------------------
function projUi(id) {
  if (!S.ui.projects[id]) S.ui.projects[id] = { q: '', who: '', st: '' };
  return S.ui.projects[id];
}

function viewProject(id, isRefresh) {
  const p = project(id);
  if (!p) {
    setTitle('Projeto', '#/inicio');
    $('#view').innerHTML = `<div class="empty"><b>Projeto não encontrado</b>Ele pode ter sido excluído. <br/><a class="btn" href="#/inicio">Voltar aos projetos</a></div>`;
    return;
  }
  setTitle(`<span style="width:10px;height:10px;border-radius:3px;background:${esc(p.color)};display:inline-block;flex:none"></span><span style="overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span>`, '#/inicio');
  document.title = `${p.name} · ${APP_NAME}`;
  const ui = projUi(id);
  const mode = S.prefs.projView || 'table';
  const groupBy = S.prefs.groupBy || 'status';

  const allTs = S.tasks.filter((t) => t.project_id === id);
  let ts = allTs.filter(isApproved);
  const total = ts.length;
  const textMatch = (t) => !ui.q || t.title.toLowerCase().includes(ui.q.toLowerCase()) || (t.description || '').toLowerCase().includes(ui.q.toLowerCase());
  const pendingTs = allTs.filter((t) => approvalOf(t) === 'pendente' && textMatch(t)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const refusedTs = allTs.filter((t) => approvalOf(t) === 'recusada' && textMatch(t));
  const reqGroups = [
    { key: '_pend', label: isAdmin() ? 'Solicitações aguardando sua aprovação' : 'Suas solicitações aguardando aprovação', color: '#f59e0b', tasks: pendingTs },
    { key: '_rec', label: 'Solicitações recusadas', color: '#e2445c', tasks: refusedTs, collapsed: true },
  ].filter((g) => g.tasks.length);
  const canRequest = !p.archived;
  if (ui.q) { const qq = ui.q.toLowerCase(); ts = ts.filter((t) => t.title.toLowerCase().includes(qq) || (t.description || '').toLowerCase().includes(qq)); }
  if (ui.who === '_none') ts = ts.filter((t) => !t.assignee_id);
  else if (ui.who === '_me') ts = ts.filter((t) => t.assignee_id === S.me.id);
  else if (ui.who) ts = ts.filter((t) => t.assignee_id === ui.who);
  if (ui.st === '_open') ts = ts.filter((t) => t.status !== 'concluido');
  else if (ui.st) ts = ts.filter((t) => t.status === ui.st);
  ts.sort(sortByDue);

  const avg = total ? Math.round(allTs.filter(isApproved).reduce((s, t) => s + t.progress, 0) / total) : 0;

  let body = '';
  if (!total && !reqGroups.length) {
    body = `<div class="empty"><b>Nenhuma atividade neste projeto</b>${isAdmin() ? 'Crie a primeira atividade e defina o responsável e o prazo.' : 'Você pode solicitar uma atividade: o administrador aprova e define o prazo.'}
      ${canRequest ? `<br/><button class="btn btn-primary" id="first-task">${ic('plus')} ${isAdmin() ? 'Nova atividade' : 'Solicitar atividade'}</button>` : ''}</div>`;
  } else if (mode === 'kanban') {
    body = (reqGroups.length ? renderGroups(reqGroups, { scope: id }) : '') + `<div class="kanban">${STATUS_ORDER.map((k) => {
      const list = ts.filter((t) => t.status === k);
      return `<div class="kcol" data-col="${k}">
        <div class="kcol-head"><i style="background:${STATUS[k].color}"></i>${STATUS[k].label}<span class="n">${list.length}</span></div>
        ${list.map((t) => {
          const m = member(t.assignee_id);
          return `<div class="kcard" data-id="${t.id}" draggable="${canEditTask(t)}" style="--gc:${STATUS[k].color}">
            <div class="t" data-act="open">${esc(t.title)}</div>
            ${progBar(t, false)}
            <div class="m">${dueChip(t, false)}<span class="person">${avatar(m)}</span></div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}</div>`;
  } else {
    let groups;
    if (groupBy === 'pessoa') {
      const ids = [...new Set(ts.map((t) => t.assignee_id || ''))];
      groups = ids.map((mid) => {
        const m = member(mid);
        return { key: 'p' + (mid || 'none'), label: m ? m.name : 'Sem responsável', color: m ? hashColor(m.email) : '#a8adba', tasks: ts.filter((t) => (t.assignee_id || '') === mid), defaults: { assignee_id: mid || null } };
      }).sort((a, b) => a.label.localeCompare(b.label));
      if (!groups.length) groups = [{ key: 'pnone', label: 'Atividades', color: '#a8adba', tasks: [], defaults: {} }];
    } else {
      groups = STATUS_ORDER.map((k) => ({ key: k, label: STATUS[k].label, color: STATUS[k].color, tasks: ts.filter((t) => t.status === k), defaults: { status: k }, collapsed: k === 'concluido' }))
        .filter((g) => g.tasks.length || (g.key === 'nao_iniciado' && !ui.q && !ui.who && !ui.st));
    }
    body = (reqGroups.length ? renderGroups(reqGroups, { scope: id }) : '')
      + (groups.length ? renderGroups(groups, { allowAdd: true, scope: id }) : (total ? `<div class="empty"><b>Nada encontrado</b>Nenhuma atividade corresponde aos filtros.</div>` : ''));
  }

  const memberOpts = S.members.filter((m) => m.active).map((m) => `<option value="${m.id}" ${ui.who === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  $('#view').innerHTML = `
    <div class="page-head">
      <div class="t">
        <h1><span style="width:14px;height:14px;border-radius:4px;background:${esc(p.color)};flex:none"></span>${esc(p.name)} ${p.archived ? '<span class="archived-tag">Arquivado</span>' : ''}</h1>
        ${p.description ? `<p>${esc(p.description)}</p>` : ''}
        <div style="display:flex;align-items:center;gap:10px;margin-top:10px;max-width:360px">
          <div class="prog" style="flex:1"><div class="bar"><i class="${avg >= 100 ? 'full' : ''}" style="width:${avg}%"></i></div><b>${avg}%</b></div>
          <span class="small muted" style="white-space:nowrap">${total} atividades</span>
        </div>
      </div>
      ${isAdmin() ? `<div class="actions">
        <button class="btn" id="edit-proj">${ic('edit')} Editar</button>
        <button class="btn btn-icon" id="more-proj" data-pop-anchor title="Mais">${ic('more')}</button>
        ${canRequest ? `<button class="btn btn-primary" id="new-task">${ic('plus')} Nova atividade</button>` : ''}
      </div>` : (canRequest && (total || reqGroups.length) ? `<div class="actions"><button class="btn btn-primary" id="new-task">${ic('plus')} Solicitar atividade</button></div>` : '')}
    </div>
    ${total || reqGroups.length ? `<div class="toolbar">
      <div class="search">${ic('search')}<input class="input" id="f-q" placeholder="Buscar atividade..." value="${esc(ui.q)}" /></div>
      <select class="select" id="f-who">
        <option value="">Todos os responsáveis</option>
        <option value="_me" ${ui.who === '_me' ? 'selected' : ''}>Somente as minhas</option>
        ${memberOpts}
        <option value="_none" ${ui.who === '_none' ? 'selected' : ''}>Sem responsável</option>
      </select>
      <select class="select" id="f-st">
        <option value="">Todos os status</option>
        <option value="_open" ${ui.st === '_open' ? 'selected' : ''}>Em aberto</option>
        ${STATUS_ORDER.map((k) => `<option value="${k}" ${ui.st === k ? 'selected' : ''}>${STATUS[k].label}</option>`).join('')}
      </select>
      ${mode === 'table' ? `<select class="select" id="f-group">
        <option value="status" ${groupBy === 'status' ? 'selected' : ''}>Agrupar: Status</option>
        <option value="pessoa" ${groupBy === 'pessoa' ? 'selected' : ''}>Agrupar: Responsável</option>
      </select>` : ''}
      <div class="seg">
        <button class="${mode === 'table' ? 'active' : ''}" data-mode="table">${ic('table')} Tabela</button>
        <button class="${mode === 'kanban' ? 'active' : ''}" data-mode="kanban">${ic('kanban')} Kanban</button>
      </div>
    </div>` : ''}
    <div id="proj-body">${body}</div>`;

  const qi = $('#f-q');
  if (qi) {
    qi.oninput = () => { ui.q = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { viewProject(id, true); const n = $('#f-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  }
  $('#f-who') && ($('#f-who').onchange = (e) => { ui.who = e.target.value; viewProject(id, true); });
  $('#f-st') && ($('#f-st').onchange = (e) => { ui.st = e.target.value; viewProject(id, true); });
  $('#f-group') && ($('#f-group').onchange = (e) => { S.prefs.groupBy = e.target.value; savePrefs(); viewProject(id, true); });
  $$('.seg [data-mode]').forEach((b) => (b.onclick = () => { S.prefs.projView = b.dataset.mode; savePrefs(); viewProject(id, true); }));
  $('#new-task')?.addEventListener('click', () => openTask(null, { project_id: id }));
  $('#first-task')?.addEventListener('click', () => openTask(null, { project_id: id }));
  $('#edit-proj')?.addEventListener('click', () => projectModal(p));
  $('#more-proj')?.addEventListener('click', (e) => projectMenu(e.currentTarget, p));
  if (mode === 'kanban') bindKanban();
}

function projectMenu(anchor, p) {
  if (S.pop) { closePopover(); return; }
  openPopover(anchor, `
    <button class="menu-item" id="pm-arch">${ic('archive')} ${p.archived ? 'Desarquivar projeto' : 'Arquivar projeto'}</button>
    <button class="menu-item" id="pm-del" style="color:var(--danger)">${ic('trash')} Excluir projeto</button>`,
  (el) => {
    $('#pm-arch', el).onclick = async () => {
      closePopover();
      try {
        const row = await q(sb.from('projects').update({ archived: !p.archived }).eq('id', p.id).select().single());
        upsertLocal(S.projects, row);
        toast(row.archived ? 'Projeto arquivado' : 'Projeto reativado', 'ok');
        refresh();
      } catch (e) { toastErr(e); }
    };
    $('#pm-del', el).onclick = async () => {
      closePopover();
      const n = S.tasks.filter((t) => t.project_id === p.id).length;
      const ok = await confirmDialog(`Excluir o projeto <b>${esc(p.name)}</b> e suas <b>${n}</b> atividades? Isso não pode ser desfeito.`, { okText: 'Excluir', danger: true, title: 'Excluir projeto' });
      if (!ok) return;
      try {
        await q(sb.from('projects').delete().eq('id', p.id));
        S.projects = S.projects.filter((x) => x.id !== p.id);
        S.tasks = S.tasks.filter((t) => t.project_id !== p.id);
        toast('Projeto excluído', 'ok');
        location.hash = '#/inicio';
      } catch (e) { toastErr(e); }
    };
  }, { width: 230 });
}

function bindKanban() {
  let dragId = null;
  $$('.kcard').forEach((c) => {
    c.addEventListener('dragstart', (e) => { dragId = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    c.addEventListener('dragend', () => { c.classList.remove('dragging'); $$('.kcol').forEach((k) => k.classList.remove('over')); });
    c.addEventListener('click', (e) => { if (!e.target.closest('[data-act]')) openTask(c.dataset.id); });
  });
  $$('.kcol').forEach((col) => {
    col.addEventListener('dragover', (e) => { if (dragId) { e.preventDefault(); col.classList.add('over'); } });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('over');
      const t = task(dragId);
      if (t && t.status !== col.dataset.col) updateTask(t.id, { status: col.dataset.col });
      dragId = null;
    });
  });
}

// ---------------------------------------------------------------------
// Painel de detalhes da atividade
// ---------------------------------------------------------------------
async function openTask(id, defaults = {}) {
  const isNew = !id;
  const t = isNew
    ? { title: '', description: '', assignee_id: null, due_date: null, status: 'nao_iniciado', progress: 0, priority: 'media', approval: isAdmin() ? 'aprovada' : 'pendente', ...defaults }
    : task(id);
  if (!t) { toast('Atividade não encontrada'); return; }
  const adm = isAdmin();
  const approval = approvalOf(t);
  const pending = approval !== 'aprovada';
  const isRequest = isNew && !adm;                         // colaborador criando uma solicitação
  const canText = isNew || isTaskManager(t);                // nome e descrição
  const canPlan = isNew ? adm : canPlanTask(t);             // prazo, prioridade, responsável, projeto
  const canEd = isNew || canEditTask(t);                    // status, progresso, atualizações
  const canReview = !isNew && pending && adm;               // aprovar / recusar
  const canDelete = !isNew && isTaskManager(t);
  const creator = memberByEmail(t.created_by_email);
  const creatorName = creator ? creator.name : (t.created_by_email || 'administrador');
  const requester = memberByEmail(t.requested_by_email);
  const assignee = member(t.assignee_id);
  const p = project(t.project_id);
  const memberOpts = S.members.filter((m) => m.active || m.id === t.assignee_id)
    .map((m) => `<option value="${m.id}" ${m.id === t.assignee_id ? 'selected' : ''}>${esc(m.name)}${m.job_title ? ' — ' + esc(m.job_title) : ''}</option>`).join('');
  const projOpts = S.projects.filter((x) => !x.archived || x.id === t.project_id)
    .map((x) => `<option value="${x.id}" ${x.id === t.project_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const D = (ok) => (ok ? '' : 'disabled');
  const lockIc = ic('lock').replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px"');

  let note = '';
  if (isRequest) {
    note = `<div class="alert warn" style="margin-bottom:14px">${ic('clock')}<div><b>Vai para aprovação</b>Descreva a atividade. Um administrador aprova e define o prazo de entrega e a prioridade.</div></div>`;
  } else if (!isNew && approval === 'pendente') {
    note = adm
      ? `<div class="alert warn" style="margin-bottom:14px">${ic('clock')}<div><b>Solicitação de ${esc(requester?.name || t.requested_by_email || '')}</b>Enviada ${relTime(t.created_at)}. Defina a <b>data de entrega</b> e a <b>prioridade</b> e clique em Aprovar.</div></div>`
      : `<div class="alert warn" style="margin-bottom:14px">${ic('clock')}<div><b>Aguardando aprovação</b>Um administrador vai aprovar e definir o prazo e a prioridade. Enquanto isso você pode ajustar o nome e a descrição.</div></div>`;
  } else if (!isNew && approval === 'recusada') {
    note = `<div class="alert danger" style="margin-bottom:14px">${ic('alert')}<div><b>Solicitação recusada</b>${t.review_note ? esc(t.review_note) : 'Sem motivo informado.'}</div></div>`;
  } else if (!isNew && !isTaskManager(t) && canEd) {
    note = `<div class="readonly-note">Atividade passada por <b>${esc(creatorName)}</b>. Você é o responsável: atualize o <b>status</b>, o <b>progresso</b> e escreva as atualizações. Prazo e prioridade são definidos por ${esc(firstName(creatorName))}.</div>`;
  } else if (!isNew && !canEd) {
    note = `<div class="readonly-note">${lockIc} Atividade passada por <b>${esc(creatorName)}</b>${assignee ? ` para <b>${esc(assignee.name)}</b>` : ''}. Somente ${assignee ? 'os dois podem' : 'quem passou pode'} alterar ou comentar.</div>`;
  }

  const body = `
    <div class="drawer-head">
      <div class="crumb"><span style="width:9px;height:9px;border-radius:3px;background:${esc(p?.color || '#999')}"></span>${esc(p?.name || '')}${isNew ? (isRequest ? ' · Solicitar atividade' : ' · Nova atividade') : ''}</div>
      ${canDelete ? `<button class="btn btn-ghost btn-icon" id="t-del" title="${pending && !adm ? 'Cancelar solicitação' : 'Excluir'}">${ic('trash')}</button>` : ''}
      <button class="btn btn-ghost btn-icon" data-close title="Fechar">${ic('x')}</button>
    </div>
    <div class="drawer-body">
      <input class="title-input" id="t-title" placeholder="${isRequest ? 'O que você vai fazer?' : 'Nome da atividade'}" value="${esc(t.title)}" ${D(canText)} />
      ${note}
      ${isRequest ? '' : `<div class="kv">
        <label>Status</label>
        <select class="select" id="t-status" ${D(canEd)}>${STATUS_ORDER.map((k) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${STATUS[k].label}</option>`).join('')}</select>
        <label>Progresso</label>
        <div class="range-row"><input type="range" id="t-prog" min="0" max="100" step="5" value="${t.progress}" ${D(canEd)} /><b id="t-progv">${t.progress}%</b></div>
        <label>Responsável</label>
        <select class="select" id="t-who" ${D(canPlan)}><option value="">— Sem responsável —</option>${memberOpts}</select>
        <label>Data de entrega${canReview ? ' *' : ''}</label>
        <input class="input" type="date" id="t-due" value="${t.due_date || ''}" ${D(canPlan)} />
        <label>Prioridade</label>
        <select class="select" id="t-prio" ${D(canPlan)}>${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}" ${t.priority === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        ${canPlan ? `<label>Projeto</label><select class="select" id="t-proj">${projOpts}</select>` : ''}
        ${!isNew && !pending ? `<label>Passada por</label><div class="person">${avatar(creator || { name: creatorName, email: t.created_by_email || '' })}<span>${esc(creatorName)}${requester ? ` <span class="muted small">(pedida por ${esc(firstName(requester.name))})</span>` : ''}</span></div>` : ''}
      </div>`}
      <div class="field"><label>Descrição / escopo</label>
        <textarea class="textarea" id="t-desc" rows="5" placeholder="${canText ? 'Detalhes, normas, documentos de referência...' : ''}" ${D(canText)}>${esc(t.description || '')}</textarea></div>
      ${isNew ? '' : `
        <div class="section-t">${ic('msg').replace('<svg', '<svg width="16" height="16"')} Atualizações e comentários</div>
        ${canEd ? `<div class="comment-form">
          <textarea class="textarea" id="c-body" placeholder="Escreva uma atualização... (Ctrl+Enter envia)"></textarea>
          <button class="btn btn-primary btn-icon" id="c-send" title="Enviar">${ic('send')}</button>
        </div>` : ''}
        <div class="comments" id="comments"><div class="muted small">Carregando...</div></div>`}
    </div>
    ${canEd || canReview ? `<div class="drawer-foot">
      ${canReview && approval === 'pendente' ? `<button class="btn btn-danger" id="t-reject">Recusar</button>` : ''}
      <div class="spacer"></div>
      <button class="btn" data-close>Cancelar</button>
      ${canEd && !canReview ? `<button class="btn btn-primary" id="t-save">${isNew ? (isRequest ? 'Enviar para aprovação' : 'Criar atividade') : 'Salvar'}</button>` : ''}
      ${canReview ? `<button class="btn" id="t-save">Salvar</button><button class="btn btn-primary" id="t-approve">${ic('ok')} Aprovar</button>` : ''}
    </div>` : ''}`;

  openModal({
    drawer: true,
    body,
    onClose: () => { S.onCommentsChanged = null; },
    onMount: ({ el, close }) => {
      const prog = $('#t-prog', el);
      const st = $('#t-status', el);
      if (prog && st) {
        prog.oninput = () => {
          $('#t-progv', el).textContent = prog.value + '%';
          const v = Number(prog.value);
          if (v === 100) st.value = 'concluido';
          else if (v > 0 && st.value === 'nao_iniciado') st.value = 'em_andamento';
          else if (v < 100 && st.value === 'concluido') st.value = 'em_andamento';
        };
        st.onchange = () => { if (st.value === 'concluido') { prog.value = 100; $('#t-progv', el).textContent = '100%'; } };
      }
      if (isNew) setTimeout(() => $('#t-title', el).focus(), 50);

      const collect = () => {
        const v = { title: $('#t-title', el).value.trim(), description: $('#t-desc', el).value.trim() };
        if (st) { v.status = st.value; v.progress = Number(prog.value); }
        if ($('#t-who', el)) {
          v.assignee_id = $('#t-who', el).value || null;
          v.due_date = $('#t-due', el).value || null;
          v.priority = $('#t-prio', el).value;
        }
        if ($('#t-proj', el)) v.project_id = $('#t-proj', el).value;
        return v;
      };
      const buildPatch = (vals) => {
        const keys = [];
        if (canText) keys.push('title', 'description');
        if (canEd) keys.push('status', 'progress');
        if (canPlan) keys.push('assignee_id', 'due_date', 'priority', 'project_id');
        const patch = {};
        for (const k of keys) if (k in vals && (vals[k] ?? null) !== (t[k] ?? null)) patch[k] = vals[k];
        return patch;
      };
      const saveRow = async (patch) => {
        if (!Object.keys(patch).length) return;
        const row = await q(sb.from('tasks').update(patch).eq('id', t.id).select().single());
        upsertLocal(S.tasks, row);
        refresh();
      };

      $('#t-save', el)?.addEventListener('click', async () => {
        const vals = collect();
        if (!vals.title) { toast('Dê um nome à atividade', 'error'); $('#t-title', el).focus(); return; }
        const btn = $('#t-save', el);
        btn.disabled = true;
        try {
          if (isNew) {
            if (isRequest) {
              await createTask({ project_id: t.project_id, title: vals.title, description: vals.description });
              toast('Solicitação enviada para aprovação', 'ok');
            } else {
              await createTask({ ...vals, project_id: vals.project_id || t.project_id });
              toast('Atividade criada', 'ok');
            }
          } else {
            await saveRow(buildPatch(vals));
            toast('Atividade salva', 'ok');
          }
          close();
        } catch (e) { toastErr(e); btn.disabled = false; }
      });

      $('#t-approve', el)?.addEventListener('click', async () => {
        const vals = collect();
        if (!vals.due_date) { toast('Defina a data de entrega para aprovar', 'error'); $('#t-due', el).focus(); return; }
        if (!vals.title) { toast('Dê um nome à atividade', 'error'); return; }
        try {
          await saveRow({ ...buildPatch(vals), due_date: vals.due_date, priority: vals.priority, approval: 'aprovada', review_note: '' });
          toast('Atividade aprovada', 'ok');
          close();
        } catch (e) { toastErr(e); }
      });

      $('#t-reject', el)?.addEventListener('click', () => {
        openModal({
          title: 'Recusar solicitação',
          body: `<div class="field"><label>Motivo (aparece para ${esc(requester?.name || 'quem pediu')})</label><textarea class="textarea" id="rj" rows="3" placeholder="Ex.: já existe uma atividade para isso"></textarea></div>`,
          foot: `<button class="btn" data-close>Voltar</button><button class="btn btn-danger" id="rj-ok">Recusar</button>`,
          onMount: ({ el: m, close: closeM }) => {
            $('#rj', m).focus();
            $('#rj-ok', m).onclick = async () => {
              try {
                await saveRow({ approval: 'recusada', review_note: $('#rj', m).value.trim() });
                closeM(); close();
                toast('Solicitação recusada');
              } catch (e) { toastErr(e); }
            };
          },
        });
      });

      $('#t-del', el)?.addEventListener('click', async () => {
        const msg = pending && !adm ? `Cancelar a solicitação <b>${esc(t.title)}</b>?` : `Excluir a atividade <b>${esc(t.title)}</b>?`;
        const ok = await confirmDialog(msg, { okText: 'Excluir', danger: true, title: 'Excluir atividade' });
        if (!ok) return;
        try {
          await q(sb.from('tasks').delete().eq('id', t.id));
          S.tasks = S.tasks.filter((x) => x.id !== t.id);
          close();
          refresh();
          toast('Atividade excluída', 'ok');
        } catch (e) { toastErr(e); }
      });

      if (!isNew) {
        const loadComments = async () => {
          try {
            const rows = await q(sb.from('task_comments').select('*').eq('task_id', t.id).order('created_at', { ascending: false }));
            const box = $('#comments', el);
            if (!box) return;
            box.innerHTML = rows.length ? rows.map((c) => {
              const m = memberByEmail(c.author_email);
              const mine = c.author_email === S.me.email;
              return `<div class="comment">${avatar(m || { name: c.author_email, email: c.author_email })}
                <div class="bubble"><div class="h"><b>${esc(m?.name || c.author_email)}</b><span>${relTime(c.created_at)}</span>
                ${mine ? `<button data-delc="${c.id}">Apagar</button>` : ''}</div><p>${esc(c.body)}</p></div></div>`;
            }).join('') : '<div class="muted small">Nenhuma atualização ainda. Use este espaço para registrar o andamento, dúvidas ou pendências.</div>';
            $$('[data-delc]', box).forEach((b) => (b.onclick = async () => {
              try { await q(sb.from('task_comments').delete().eq('id', b.dataset.delc)); loadComments(); } catch (e) { toastErr(e); }
            }));
          } catch (e) { toastErr(e); }
        };
        loadComments();
        S.onCommentsChanged = () => loadComments();
        const send = async () => {
          const ta = $('#c-body', el);
          const bodyTxt = ta.value.trim();
          if (!bodyTxt) return;
          $('#c-send', el).disabled = true;
          try {
            await q(sb.from('task_comments').insert({ task_id: t.id, body: bodyTxt, author_email: S.me.email }));
            ta.value = '';
            S.commentCounts[t.id] = (S.commentCounts[t.id] || 0) + 1;
            await loadComments();
          } catch (e) { toastErr(e); }
          $('#c-send', el).disabled = false;
        };
        if ($('#c-send', el)) $('#c-send', el).onclick = send;
        if ($('#c-body', el)) $('#c-body', el).onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
      }
    },
  });
}

// ---------------------------------------------------------------------
// TELA: Minhas atividades
// ---------------------------------------------------------------------
function viewMine() {
  setTitle('Minhas atividades');
  document.title = `Minhas atividades · ${APP_NAME}`;
  const ui = S.ui.mine;
  let base;
  if (ui.who === 'me' || !isAdmin()) base = myTasks();
  else if (ui.who === 'all') base = S.tasks.filter((t) => isApproved(t) && activeProject(t));
  else base = S.tasks.filter((t) => isApproved(t) && t.assignee_id === ui.who && activeProject(t));
  if (ui.q) { const qq = ui.q.toLowerCase(); base = base.filter((t) => t.title.toLowerCase().includes(qq)); }
  base = [...base].sort(sortByDue);
  const { late, soon } = alertsFor(base);
  const ok = base.filter((t) => dueState(t) === 'ok');
  const none = base.filter((t) => dueState(t) === 'none');
  const done = base.filter((t) => dueState(t) === 'done').sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  const who = ui.who === 'me' || !isAdmin() ? 'Você' : ui.who === 'all' ? 'A equipe' : member(ui.who)?.name || '';

  const qMatch = (t) => !ui.q || t.title.toLowerCase().includes(ui.q.toLowerCase());
  const myReqs = S.tasks.filter((t) => !isApproved(t) && t.requested_by_email === S.me.email && activeProject(t) && qMatch(t));
  const toApprove = isAdmin() && ui.who === 'me' ? pendingRequests().filter(qMatch) : [];
  const groups = [
    { key: 'approve', label: 'Solicitações para você aprovar', color: '#1d4ed8', tasks: toApprove },
    { key: 'req', label: 'Minhas solicitações aguardando aprovação', color: '#f59e0b', tasks: myReqs.filter((t) => approvalOf(t) === 'pendente') },
    { key: 'refused', label: 'Minhas solicitações recusadas', color: '#e2445c', tasks: myReqs.filter((t) => approvalOf(t) === 'recusada') },
    { key: 'late', label: 'Atrasadas', color: '#e2445c', tasks: late },
    { key: 'soon', label: `Vencem nos próximos ${DUE_SOON_DAYS} dias`, color: '#f59e0b', tasks: soon },
    { key: 'ok', label: 'No prazo', color: '#579bfc', tasks: ok },
    { key: 'none', label: 'Sem prazo definido', color: '#a8adba', tasks: none },
    { key: 'done', label: 'Concluídas', color: '#00c875', tasks: done, collapsed: true },
  ].filter((g) => g.tasks.length);

  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  $('#view').innerHTML = `
    <div class="page-head"><div class="t"><h1>Minhas atividades</h1><p>Tudo o que está sob responsabilidade ${ui.who === 'me' || !isAdmin() ? 'sua' : 'do filtro selecionado'}, ordenado pelo prazo.</p></div></div>
    ${late.length ? `<div class="alert danger">${ic('alert')}<div><b>${who === 'Você' ? 'Você tem' : who + ' tem'} ${late.length} atividade${late.length > 1 ? 's' : ''} atrasada${late.length > 1 ? 's' : ''}</b>Atualize o status ou fale com o gestor sobre um novo prazo.</div></div>` : ''}
    ${soon.length ? `<div class="alert warn">${ic('clock')}<div><b>${soon.length} atividade${soon.length > 1 ? 's vencem' : ' vence'} nos próximos ${DUE_SOON_DAYS} dias</b>${soon.slice(0, 3).map((t) => esc(t.title) + ' (' + esc(dueText(t).toLowerCase()) + ')').join(' · ')}</div></div>` : ''}
    ${!late.length && !soon.length && base.length ? `<div class="alert ok">${ic('ok')}<div><b>Tudo em dia!</b>Nenhuma atividade atrasada ou vencendo nos próximos dias.</div></div>` : ''}
    ${perm === 'default' ? `<div class="alert" style="background:var(--primary-soft);border-color:#c9d8ff;color:#1e3a8a">${ic('bell')}<div style="flex:1"><b>Receba avisos neste aparelho</b>Ative as notificações para ser lembrado das atividades perto do prazo.</div><button class="btn btn-sm btn-primary" id="mine-notif">Ativar</button></div>` : ''}
    <div class="toolbar">
      <div class="search">${ic('search')}<input class="input" id="m-q" placeholder="Buscar..." value="${esc(ui.q)}" /></div>
      ${isAdmin() ? `<select class="select" id="m-who">
        <option value="me" ${ui.who === 'me' ? 'selected' : ''}>Minhas</option>
        <option value="all" ${ui.who === 'all' ? 'selected' : ''}>Toda a equipe</option>
        ${S.members.filter((m) => m.active && m.id !== S.me.id).map((m) => `<option value="${m.id}" ${ui.who === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>` : ''}
    </div>
    ${groups.length ? renderGroups(groups, { showProject: true, scope: 'mine' }) : `<div class="empty"><b>Nenhuma atividade</b>Quando o gestor atribuir uma atividade a você, ela aparece aqui.</div>`}`;

  const qi = $('#m-q');
  qi.oninput = () => { ui.q = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { viewMine(); const n = $('#m-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  $('#m-who')?.addEventListener('change', (e) => { ui.who = e.target.value; viewMine(); });
  $('#mine-notif')?.addEventListener('click', async () => { await requestNotif(); viewMine(); });
}

// ---------------------------------------------------------------------
// TELA: Equipe
// ---------------------------------------------------------------------
function viewTeam() {
  setTitle('Equipe');
  document.title = `Equipe · ${APP_NAME}`;
  const adm = isAdmin();
  const list = [...S.members].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
  const stats = (m) => {
    const ts = S.tasks.filter((t) => isApproved(t) && t.assignee_id === m.id && activeProject(t));
    const open = ts.filter((t) => t.status !== 'concluido').length;
    const late = ts.filter((t) => dueState(t) === 'late').length;
    return `${open} em aberto${late ? ` · <span style="color:var(--danger);font-weight:600">${late} atrasada${late > 1 ? 's' : ''}</span>` : ''}`;
  };
  $('#view').innerHTML = `
    <div class="page-head"><div class="t"><h1>Equipe</h1><p>${adm ? 'Cadastre aqui o e-mail de cada colaborador. Só quem estiver nesta lista consegue entrar no app.' : 'Pessoas da equipe com acesso ao app.'}</p></div></div>
    ${adm ? `<div class="card">
      <h3>Adicionar colaborador</h3>
      <form class="form-inline" id="add-m">
        <div class="field"><label>Nome</label><input class="input" name="name" placeholder="Nome completo" required /></div>
        <div class="field"><label>E-mail</label><input class="input" name="email" type="email" placeholder="nome@empresa.com.br" required /></div>
        <div class="field"><label>Cargo / função</label><input class="input" name="job" list="job-titles" placeholder="Ex.: Projetista" /></div>
        <div class="field"><label>Papel no app</label><select class="select" name="role"><option value="member">Colaborador</option><option value="admin">Administrador</option></select></div>
        <button class="btn btn-primary" type="submit" style="height:38px">${ic('plus')} Adicionar</button>
      </form>
      ${jobDatalist()}
      <p class="small muted" style="margin:12px 0 0;line-height:1.5"><b>Cargo</b>: escolha uma sugestão ou digite qualquer outro. <b>Colaborador</b>: vê todos os projetos, atualiza status/progresso das atividades dele e comenta. <b>Administrador</b>: cria projetos e atividades, distribui tarefas e gerencia a equipe.</p>
    </div>` : ''}
    <div class="tbl team-list">
      <div class="tr team-row th"><div class="td">Nome</div><div class="td">E-mail</div><div class="td">Cargo</div><div class="td">Papel no app</div><div class="td">Ativo</div><div class="td"></div></div>
      ${list.map((m) => {
        const self = m.id === S.me.id;
        return `<div class="tr team-row" data-mid="${m.id}" style="${m.active ? '' : 'opacity:.6'}">
          <div class="td c-name"><div class="person">${avatar(m, 'lg')}<div style="min-width:0"><b style="display:block">${esc(m.name)}${self ? ' <span class="muted small">(você)</span>' : ''}</b>${m.job_title ? `<span class="small" style="display:block;color:var(--text-2)">${esc(m.job_title)}</span>` : ''}<span class="small muted">${stats(m)}</span></div></div></div>
          <div class="td c-email" style="overflow:hidden;text-overflow:ellipsis">${esc(m.email)}</div>
          <div class="td c-job">${adm
            ? `<input class="input" data-job list="job-titles" value="${esc(m.job_title || '')}" placeholder="Definir cargo" style="height:32px" />`
            : `<span class="small">${esc(m.job_title || '—')}</span>`}</div>
          <div class="td c-role">${adm && !self
            ? `<select class="select" data-role style="height:32px"><option value="member" ${m.role === 'member' ? 'selected' : ''}>Colaborador</option><option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Administrador</option></select>`
            : `<span class="small">${m.role === 'admin' ? 'Administrador' : 'Colaborador'}</span>`}</div>
          <div class="td c-active"><label class="switch" title="${m.active ? 'Ativo' : 'Desativado'}"><input type="checkbox" data-active ${m.active ? 'checked' : ''} ${adm && !self ? '' : 'disabled'}/><span></span></label></div>
          <div class="td c-del">${adm && !self ? `<button class="btn btn-ghost btn-sm" data-invite title="Copiar convite">Convite</button><button class="btn btn-ghost btn-icon btn-sm" data-delm title="Remover">${ic('trash')}</button>` : ''}</div>
        </div>`;
      }).join('')}
    </div>
    ${adm ? backupCardHtml() : ''}`;

  if (!adm) return;
  bindBackupCard();
  const f = $('#add-m');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const name = f.name.value.trim();
    const email = f.email.value.trim().toLowerCase();
    if (!name || !email.includes('@')) { toast('Preencha nome e e-mail válidos', 'error'); return; }
    try {
      const row = await q(sb.from('team_members').insert({ name, email, role: f.role.value, job_title: f.job.value.trim() }).select().single());
      upsertLocal(S.members, row);
      S.members.sort((a, b) => a.name.localeCompare(b.name));
      viewTeam();
      inviteModal(row);
    } catch (ex) { toastErr(ex); }
  };
  $$('[data-mid]').forEach((rowEl) => {
    const m = member(rowEl.dataset.mid);
    if (!m) return;
    $('[data-job]', rowEl)?.addEventListener('change', async (e) => {
      try { upsertLocal(S.members, await q(sb.from('team_members').update({ job_title: e.target.value.trim() }).eq('id', m.id).select().single())); toast('Cargo atualizado', 'ok'); viewTeam(); }
      catch (ex) { toastErr(ex); viewTeam(); }
    });
    $('[data-role]', rowEl)?.addEventListener('change', async (e) => {
      try { upsertLocal(S.members, await q(sb.from('team_members').update({ role: e.target.value }).eq('id', m.id).select().single())); toast('Papel atualizado', 'ok'); }
      catch (ex) { toastErr(ex); viewTeam(); }
    });
    $('[data-active]', rowEl)?.addEventListener('change', async (e) => {
      try { upsertLocal(S.members, await q(sb.from('team_members').update({ active: e.target.checked }).eq('id', m.id).select().single())); viewTeam(); }
      catch (ex) { toastErr(ex); viewTeam(); }
    });
    $('[data-invite]', rowEl)?.addEventListener('click', () => inviteModal(m));
    $('[data-delm]', rowEl)?.addEventListener('click', async () => {
      const n = S.tasks.filter((t) => t.assignee_id === m.id).length;
      const ok = await confirmDialog(`Remover <b>${esc(m.name)}</b> da equipe?${n ? ` As ${n} atividades dele(a) ficarão sem responsável.` : ''} <br/><span class="muted small">Dica: se for temporário, prefira desativar.</span>`, { okText: 'Remover', danger: true, title: 'Remover colaborador' });
      if (!ok) return;
      try {
        await q(sb.from('team_members').delete().eq('id', m.id));
        S.members = S.members.filter((x) => x.id !== m.id);
        S.tasks.forEach((t) => { if (t.assignee_id === m.id) t.assignee_id = null; });
        viewTeam();
      } catch (ex) { toastErr(ex); }
    });
  });
}

function inviteModal(m) {
  const msg = `Olá, ${firstName(m.name)}! Você foi adicionado(a) ao app de gestão de atividades da ${COMPANY_NAME}.\n\n1. Acesse: ${appUrl()}\n2. Clique em "Primeiro acesso"\n3. Use este e-mail: ${m.email}\n4. Crie sua senha e confirme pelo e-mail que você vai receber.\n\nNo celular, abra o link e use "Adicionar à tela inicial" para instalar o app.`;
  openModal({
    title: 'Convite pronto',
    body: `<p class="muted" style="margin:0 0 10px">${esc(m.name)} já pode acessar. Envie esta mensagem (WhatsApp, e-mail, Teams...):</p>
      <textarea class="textarea" id="inv" rows="9" readonly>${esc(msg)}</textarea>`,
    foot: `<button class="btn" data-close>Fechar</button><button class="btn btn-primary" id="copy-inv">Copiar mensagem</button>`,
    onMount: ({ el }) => {
      $('#copy-inv', el).onclick = async () => {
        try { await navigator.clipboard.writeText(msg); toast('Mensagem copiada!', 'ok'); }
        catch { $('#inv', el).select(); document.execCommand('copy'); toast('Mensagem copiada!', 'ok'); }
      };
    },
  });
}

// ---------------------------------------------------------------------
// TELA: Anotações (privadas, estilo Notion)
// ---------------------------------------------------------------------
const ALLOWED_TAGS = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'A', 'DIV', 'SPAN']);
function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(child.tagName)) { child.remove(); continue; }
          walk(child);
          child.replaceWith(...child.childNodes);
          continue;
        }
        for (const a of [...child.attributes]) {
          const keep = (child.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value))
            || (child.tagName === 'UL' && a.name === 'class' && a.value === 'checklist')
            || (child.tagName === 'LI' && a.name === 'data-checked');
          if (!keep) child.removeAttribute(a.name);
        }
        if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener'); }
        walk(child);
      } else if (child.nodeType !== 3) {
        child.remove();
      }
    }
  };
  const box = doc.body.firstChild;
  walk(box);
  return box.innerHTML;
}

async function loadNotes() {
  S.notes = await q(sb.from('notes').select('*').order('updated_at', { ascending: false }));
}

async function viewNotes(noteId) {
  const view = $('#view');
  setTitle(noteId ? 'Anotação' : 'Anotações', noteId ? '#/notas' : null);
  document.title = `Anotações · ${APP_NAME}`;
  if (!S.notes) {
    view.innerHTML = '<div class="boot" style="height:300px"><div class="spinner"></div></div>';
    try { await loadNotes(); } catch (e) { toastErr(e); return; }
    if (currentRoute().name !== 'notas') return;
  }
  const note = noteId ? S.notes.find((n) => n.id === noteId) : null;
  if (noteId && !note) { location.hash = '#/notas'; return; }
  if (note) setTitle(`${esc(note.icon || '📄')} ${esc(note.title || 'Sem título')}`, '#/notas');

  view.innerHTML = `
    <div class="notes-layout ${note ? 'has-note' : ''}">
      <div class="notes-list">
        <div class="top">
          <div class="lock">${ic('lock')} Somente você vê suas anotações</div>
          <div class="search" style="position:relative">${ic('search').replace('<svg', '<svg style="position:absolute;left:10px;top:10px;width:16px;height:16px;color:var(--text-3)"')}<input class="input" id="n-q" placeholder="Buscar nas anotações..." style="padding-left:32px" /></div>
          <button class="btn btn-primary btn-block" id="n-new">${ic('plus')} Nova página</button>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" id="n-exp" style="flex:1" title="Baixar todas as suas anotações">⬇ Backup</button>
            <button class="btn btn-sm" id="n-imp" style="flex:1" title="Restaurar anotações de um arquivo">⬆ Restaurar</button>
            <input type="file" id="n-file" accept=".json,application/json" hidden />
          </div>
        </div>
        <div class="notes-items" id="n-items"></div>
      </div>
      <div class="editor-wrap" id="n-editor">
        ${note ? '' : `<div class="notes-empty"><div><div style="font-size:42px">📝</div><b style="display:block;margin:8px 0 4px;color:var(--text)">Suas anotações pessoais</b>Ideias, cálculos rápidos, checklists de obra, atas...<br/>Selecione uma página ou crie uma nova.</div></div>`}
      </div>
    </div>`;

  const renderList = () => {
    const qq = ($('#n-q')?.value || '').toLowerCase();
    const plain = (h) => h.replace(/<[^>]+>/g, ' ');
    const list = S.notes.filter((n) => !qq || (n.title || '').toLowerCase().includes(qq) || plain(n.content || '').toLowerCase().includes(qq));
    const pinned = list.filter((n) => n.pinned);
    const rest = list.filter((n) => !n.pinned);
    const item = (n) => `<div class="note-item ${n.id === noteId ? 'active' : ''}" data-note="${n.id}">
      <span class="ic">${esc(n.icon || '📄')}</span>
      <div class="tx"><b>${esc(n.title || 'Sem título')}</b><span>${relTime(n.updated_at)}</span></div>
      ${n.pinned ? `<span class="pin">📌</span>` : ''}</div>`;
    $('#n-items').innerHTML = !list.length
      ? `<div class="muted small" style="padding:14px">${qq ? 'Nada encontrado.' : 'Nenhuma anotação ainda.'}</div>`
      : (pinned.length ? `<div class="note-group-t">Fixadas</div>${pinned.map(item).join('')}<div class="note-group-t">Páginas</div>` : '') + rest.map(item).join('');
    $$('[data-note]').forEach((x) => (x.onclick = () => (location.hash = `#/notas/${x.dataset.note}`)));
  };
  renderList();
  $('#n-q').oninput = renderList;
  $('#n-exp').onclick = exportNotes;
  $('#n-imp').onclick = () => $('#n-file').click();
  $('#n-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importNotes(f); };
  $('#n-new').onclick = async () => {
    try {
      const row = await q(sb.from('notes').insert({ title: '', content: '', icon: '📄' }).select().single());
      S.notes.unshift(row);
      location.hash = `#/notas/${row.id}`;
      setTimeout(() => $('#note-title')?.focus(), 80);
    } catch (e) { toastErr(e); }
  };

  if (note) mountEditor(note, renderList);
}

function mountEditor(note, renderList) {
  const wrap = $('#n-editor');
  wrap.innerHTML = `
    <div class="editor-inner">
      <div class="editor-top">
        <span id="n-saved">Editado ${relTime(note.updated_at)}</span>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="n-pin">${note.pinned ? '📌 Desafixar' : '📌 Fixar'}</button>
        <button class="btn btn-ghost btn-sm" id="n-del" style="color:var(--danger)">${ic('trash').replace('<svg', '<svg width="15" height="15"')} Excluir</button>
      </div>
      <button class="note-icon" id="n-icon" data-pop-anchor title="Trocar ícone">${esc(note.icon || '📄')}</button>
      <input class="note-title" id="note-title" placeholder="Sem título" value="${esc(note.title)}" />
      <div class="etoolbar" id="etb">
        <button data-cmd="h1" title="Título 1">H1</button>
        <button data-cmd="h2" title="Título 2">H2</button>
        <button data-cmd="h3" title="Título 3">H3</button>
        <button data-cmd="p" title="Texto normal">T</button>
        <span class="sep"></span>
        <button data-cmd="bold" title="Negrito (Ctrl+B)"><b>B</b></button>
        <button data-cmd="italic" title="Itálico (Ctrl+I)"><i>I</i></button>
        <button data-cmd="underline" title="Sublinhado (Ctrl+U)"><u>U</u></button>
        <button data-cmd="strikeThrough" title="Riscado"><s>S</s></button>
        <span class="sep"></span>
        <button data-cmd="ul" title="Lista">${ic('ul')}</button>
        <button data-cmd="ol" title="Lista numerada">${ic('ol')}</button>
        <button data-cmd="check" title="Checklist">${ic('checksq')}</button>
        <button data-cmd="quote" title="Citação">${ic('quote')}</button>
        <button data-cmd="code" title="Bloco de código">${ic('code')}</button>
        <button data-cmd="hr" title="Divisória">${ic('minus')}</button>
        <button data-cmd="link" title="Link">${ic('link')}</button>
      </div>
      <div class="editor" id="ed" contenteditable="true" spellcheck="true"
        data-placeholder="Comece a escrever... Atalhos: # título, - lista, [] checklist, > citação"></div>
    </div>`;

  const ed = $('#ed');
  const titleEl = $('#note-title');
  ed.innerHTML = sanitize(note.content) || '<p><br></p>';
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* ignore */ }

  const updateEmpty = () => ed.classList.toggle('is-empty', !ed.textContent.trim() && !ed.querySelector('hr,li,img'));
  updateEmpty();

  // --- salvar automaticamente ---
  let timer = null, dirty = false, saving = null;
  const savedEl = $('#n-saved');
  const save = async () => {
    if (!dirty) return;
    dirty = false;
    clearTimeout(timer);
    const patch = { title: titleEl.value.trim(), content: ed.innerHTML === '<p><br></p>' ? '' : ed.innerHTML, icon: note.icon, updated_at: new Date().toISOString() };
    savedEl.textContent = 'Salvando...';
    saving = (async () => {
      try {
        const row = await q(sb.from('notes').update(patch).eq('id', note.id).select().single());
        Object.assign(note, row);
        savedEl.textContent = 'Salvo';
        S.notes.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        renderList();
        if (currentRoute().id === note.id) setTitle(`${esc(note.icon || '📄')} ${esc(note.title || 'Sem título')}`, '#/notas');
      } catch (e) { dirty = true; savedEl.textContent = 'Erro ao salvar'; toastErr(e); }
    })();
    await saving;
  };
  const touch = () => { dirty = true; savedEl.textContent = 'Editando...'; clearTimeout(timer); timer = setTimeout(save, 800); };
  S.leaveHook = async () => { await save(); };
  window.onbeforeunload = () => { if (dirty) { save(); return 'Salvando...'; } };

  titleEl.oninput = touch;
  titleEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ed.focus(); } };
  ed.addEventListener('input', () => { updateEmpty(); touch(); });

  // --- ícone ---
  $('#n-icon').onclick = (e) => {
    if (S.pop) { closePopover(); return; }
    openPopover(e.currentTarget, `<div class="emoji-grid">${EMOJIS.map((x) => `<button data-e="${x}">${x}</button>`).join('')}</div>`, (el) => {
      $$('[data-e]', el).forEach((b) => (b.onclick = () => {
        note.icon = b.dataset.e; $('#n-icon').textContent = note.icon; closePopover(); dirty = true; save();
      }));
    }, { width: 300 });
  };

  // --- fixar / excluir ---
  $('#n-pin').onclick = async () => {
    try {
      const row = await q(sb.from('notes').update({ pinned: !note.pinned }).eq('id', note.id).select().single());
      Object.assign(note, row);
      $('#n-pin').textContent = note.pinned ? '📌 Desafixar' : '📌 Fixar';
      renderList();
    } catch (e) { toastErr(e); }
  };
  $('#n-del').onclick = async () => {
    const ok = await confirmDialog(`Excluir a página <b>${esc(note.title || 'Sem título')}</b>? Isso não pode ser desfeito.`, { okText: 'Excluir', danger: true, title: 'Excluir anotação' });
    if (!ok) return;
    try {
      dirty = false;
      S.leaveHook = null;
      await q(sb.from('notes').delete().eq('id', note.id));
      S.notes = S.notes.filter((n) => n.id !== note.id);
      location.hash = '#/notas';
    } catch (e) { toastErr(e); }
  };

  // --- comandos de formatação ---
  const block = () => {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    while (n && n !== ed) {
      if (n.nodeType === 1 && /^(P|H1|H2|H3|LI|BLOCKQUOTE|PRE|DIV)$/.test(n.tagName)) return n;
      n = n.parentNode;
    }
    return null;
  };
  const caretAt = (node) => {
    const r = document.createRange(); r.selectNodeContents(node); r.collapse(false);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  };
  // kind: 'ul' | 'ol' | 'check'
  const makeList = (kind) => {
    const b = block();
    const li = b?.closest?.('li');
    if (li) {
      const list = li.parentElement;
      const cur = list.tagName === 'OL' ? 'ol' : list.classList.contains('checklist') ? 'check' : 'ul';
      if (cur === kind) {
        // desfaz a lista
        if (kind === 'check') { list.removeAttribute('class'); $$(':scope > li', list).forEach((x) => x.removeAttribute('data-checked')); }
        document.execCommand(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
        return;
      }
      if (cur !== 'ol' && kind !== 'ol') {
        // lista ↔ checklist
        if (kind === 'check') { list.className = 'checklist'; $$(':scope > li', list).forEach((x) => { if (!x.dataset.checked) x.dataset.checked = 'false'; }); }
        else { list.removeAttribute('class'); $$(':scope > li', list).forEach((x) => x.removeAttribute('data-checked')); }
        return;
      }
      const nl = document.createElement(kind === 'ol' ? 'ol' : 'ul');
      if (kind === 'check') nl.className = 'checklist';
      for (const x of [...list.children]) {
        if (kind === 'check') x.dataset.checked = x.dataset.checked || 'false'; else x.removeAttribute('data-checked');
        nl.appendChild(x);
      }
      list.replaceWith(nl);
      caretAt(li);
      return;
    }
    const nl = document.createElement(kind === 'ol' ? 'ol' : 'ul');
    if (kind === 'check') nl.className = 'checklist';
    const nli = document.createElement('li');
    if (kind === 'check') nli.dataset.checked = 'false';
    nli.innerHTML = b && b.textContent.trim() ? b.innerHTML : '<br>';
    nl.appendChild(nli);
    if (b && b !== ed) b.replaceWith(nl); else ed.appendChild(nl);
    caretAt(nli);
  };
  const run = (cmd) => {
    ed.focus();
    switch (cmd) {
      case 'h1': case 'h2': case 'h3': case 'p':
        document.execCommand('formatBlock', false, `<${cmd}>`); break;
      case 'quote': document.execCommand('formatBlock', false, '<blockquote>'); break;
      case 'code': document.execCommand('formatBlock', false, '<pre>'); break;
      case 'ul': makeList('ul'); break;
      case 'ol': makeList('ol'); break;
      case 'check': makeList('check'); break;
      case 'hr': document.execCommand('insertHorizontalRule'); break;
      case 'link': {
        const sel = getSelection();
        const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        openModal({
          title: 'Inserir link',
          body: `<div class="field"><label>Endereço (URL)</label><input class="input" id="lk" placeholder="https://..." /></div>`,
          foot: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="lk-ok">Inserir</button>`,
          onMount: ({ el, close }) => {
            const inp = $('#lk', el); inp.focus();
            const ok = () => {
              let url = inp.value.trim();
              if (!url) return close();
              if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
              close();
              ed.focus();
              if (range) { sel.removeAllRanges(); sel.addRange(range); }
              if (range && !range.collapsed) document.execCommand('createLink', false, url);
              else document.execCommand('insertHTML', false, `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>&nbsp;`);
              touch();
            };
            $('#lk-ok', el).onclick = ok;
            inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
          },
        });
        return;
      }
      default: document.execCommand(cmd);
    }
    updateEmpty();
    touch();
  };
  $$('#etb [data-cmd]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => run(b.dataset.cmd));
  });

  // --- atalhos estilo Notion/Markdown ---
  const SHORTCUTS = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'ul', '*': 'ul', '1.': 'ol', '[]': 'check', '[ ]': 'check', '>': 'quote', '```': 'code', '---': 'hr' };
  ed.addEventListener('keydown', (e) => {
    if (e.key === ' ' || (e.key === 'Enter' && !e.shiftKey)) {
      const b = block();
      const txt = (b ? b.textContent : ed.textContent).trim();
      const cmd = SHORTCUTS[txt];
      if (cmd && (e.key === ' ' || cmd === 'hr' || cmd === 'code') && !(b && b.tagName === 'LI' && cmd !== 'check')) {
        e.preventDefault();
        if (b) { b.innerHTML = '<br>'; const r = document.createRange(); r.setStart(b, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
        run(cmd);
        return;
      }
    }
    if (e.key === 'Enter') {
      setTimeout(() => {
        const b = block();
        if (b && b.tagName === 'LI' && b.closest('ul.checklist') && !b.textContent.trim()) b.dataset.checked = 'false';
      }, 0);
    }
  });
  // marcar/desmarcar checklist
  ed.addEventListener('click', (e) => {
    const li = e.target.closest('ul.checklist > li');
    if (!li) return;
    const r = li.getBoundingClientRect();
    if (e.clientX - r.left < 26) {
      e.preventDefault();
      li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
      touch();
    }
  });
  // colar como texto simples (evita formatação estranha de outros sites)
  ed.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  // abrir links com Ctrl+clique
  ed.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, '_blank', 'noopener');
  });
}


// ---------------------------------------------------------------------
// BACKUP (o plano grátis do Supabase não tem backup automático)
// ---------------------------------------------------------------------
const BACKUP_KEY = 'ga-last-backup';
function lastBackupAt() { try { return localStorage.getItem(BACKUP_KEY); } catch { return null; } }
function backupDue() {
  const t = lastBackupAt();
  return !t || Date.now() - new Date(t).getTime() > 7 * 86400000;
}
function lastBackupText() {
  const t = lastBackupAt();
  return t ? `Último backup neste aparelho: ${new Date(t).toLocaleDateString('pt-BR')} (${relTime(t)})` : 'Nenhum backup feito neste aparelho ainda';
}
function downloadJson(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function fetchAll(table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await q(sb.from(table).select('*').order('created_at').range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
async function exportBackup() {
  try {
    const [team_members, projects, tasks, task_comments] = await Promise.all(
      ['team_members', 'projects', 'tasks', 'task_comments'].map(fetchAll));
    const data = { app: 'gestao-atividades', tipo: 'equipe', versao: 1, criado_em: new Date().toISOString(), criado_por: S.me.email, data: { team_members, projects, tasks, task_comments } };
    downloadJson(data, `backup-atividades-${todayStr()}.json`);
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
    toast(`Backup baixado: ${projects.length} projetos, ${tasks.length} atividades`, 'ok');
  } catch (e) { toastErr(e); }
}
async function upsertChunks(table, rows, opts) {
  for (let i = 0; i < rows.length; i += 500) {
    await q(sb.from(table).upsert(rows.slice(i, i + 500), opts));
  }
}
async function importBackup(file) {
  let b;
  try { b = JSON.parse(await file.text()); } catch { toast('Arquivo inválido.', 'error'); return; }
  if (b?.app !== 'gestao-atividades' || b?.tipo !== 'equipe') { toast('Esse arquivo não é um backup da equipe deste app.', 'error'); return; }
  const d = b.data;
  const ok = await confirmDialog(`Restaurar o backup de <b>${new Date(b.criado_em).toLocaleString('pt-BR')}</b>?<br/><br/>
    ${d.projects.length} projetos · ${d.tasks.length} atividades · ${d.team_members.length} pessoas · ${d.task_comments.length} comentários.<br/><br/>
    <span class="muted small">O que já existe com o mesmo código é sobrescrito pela versão do backup. Nada é apagado.</span>`, { okText: 'Restaurar', title: 'Restaurar backup' });
  if (!ok) return;
  toast('Restaurando...');
  try {
    const r = await q(sb.rpc('restore_backup', { payload: b }));
    await loadAll();
    refresh();
    toast(`Backup restaurado: ${r?.projetos ?? d.projects.length} projetos, ${r?.atividades ?? d.tasks.length} atividades`, 'ok');
  } catch (e) { toastErr(e); }
}
function backupCardHtml() {
  return `<div class="card" style="margin-top:18px">
    <h3>${ic('archive').replace('<svg', '<svg style="vertical-align:-3px;margin-right:6px"')}Backup dos dados</h3>
    <p class="small muted" style="margin:0 0 12px;line-height:1.55">Baixa um arquivo com todos os projetos, atividades, comentários e a lista da equipe.
      Guarde no OneDrive/Google Drive da empresa. Se algum dia for preciso trocar de servidor, é só restaurar esse arquivo.
      <br/>As <b>anotações pessoais</b> não entram aqui (são privadas): cada pessoa baixa as suas na aba Anotações.
      <br/><b>${esc(lastBackupText())}.</b></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" id="bk-exp">⬇ Baixar backup agora</button>
      <button class="btn" id="bk-imp">⬆ Restaurar de um arquivo</button>
      <input type="file" id="bk-file" accept=".json,application/json" hidden />
    </div>
  </div>`;
}
function bindBackupCard() {
  $('#bk-exp').onclick = async () => { await exportBackup(); viewTeam(); };
  $('#bk-imp').onclick = () => $('#bk-file').click();
  $('#bk-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackup(f); };
}
async function exportNotes() {
  try {
    const notes = await fetchAll('notes');
    downloadJson({ app: 'gestao-atividades', tipo: 'anotacoes', versao: 1, criado_em: new Date().toISOString(), dono: S.me.email, notes },
      `minhas-anotacoes-${todayStr()}.json`);
    toast(`${notes.length} anotações salvas no arquivo`, 'ok');
  } catch (e) { toastErr(e); }
}
async function importNotes(file) {
  let b;
  try { b = JSON.parse(await file.text()); } catch { toast('Arquivo inválido.', 'error'); return; }
  if (b?.app !== 'gestao-atividades' || b?.tipo !== 'anotacoes') { toast('Esse arquivo não é um backup de anotações.', 'error'); return; }
  const existing = new Set((S.notes || []).map((n) => n.id));
  const novos = b.notes.filter((n) => !existing.has(n.id));
  const ok = await confirmDialog(`Restaurar <b>${novos.length}</b> anotações do arquivo? (${b.notes.length - novos.length} já existem e serão mantidas como estão.)`, { okText: 'Restaurar', title: 'Restaurar anotações' });
  if (!ok || !novos.length) return;
  try {
    const rows = novos.map(({ title, icon, content, pinned, created_at, updated_at }) => ({ title, icon, content, pinned, created_at, updated_at }));
    for (let i = 0; i < rows.length; i += 200) await q(sb.from('notes').insert(rows.slice(i, i + 200)));
    await loadNotes();
    viewNotes(currentRoute().id);
    toast('Anotações restauradas!', 'ok');
  } catch (e) { toastErr(e); }
}

// ---------------------------------------------------------------------
// Service worker (permite instalar no celular como app)
// ---------------------------------------------------------------------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
