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
// Status pela porcentagem (igual ao Monday): cada status tem a sua faixa de %
const STATUS = {
  nao_iniciado: { label: 'Não iniciado', color: '#a8adba', min: 0,   max: 0,   def: 0 },
  iniciando:    { label: 'Iniciando',    color: '#579bfc', min: 1,   max: 19,  def: 10 },
  em_andamento: { label: 'Em andamento', color: '#fdab3d', min: 20,  max: 74,  def: 50 },
  finalizando:  { label: 'Finalizando',  color: '#a25ddc', min: 75,  max: 99,  def: 85 },
  concluido:    { label: 'Concluída',    color: '#00c875', min: 100, max: 100, def: 100 },
};
const STATUS_ORDER = ['nao_iniciado', 'iniciando', 'em_andamento', 'finalizando', 'concluido'];
const statusForProgress = (p) => (p >= 100 ? 'concluido' : p >= 75 ? 'finalizando' : p >= 20 ? 'em_andamento' : p >= 1 ? 'iniciando' : 'nao_iniciado');
const progressForStatus = (st) => STATUS[st]?.def ?? 0;   // a barra segue o status (não é arrastável)
const statusRange = (k) => (STATUS[k].min === STATUS[k].max ? `${STATUS[k].min}%` : `${STATUS[k].min}–${STATUS[k].max}%`);
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
  members: [], projects: [], tasks: [], commentCounts: {}, lastUpdate: {}, subtasks: [], types: [], dueRequests: [],
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
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
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
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="5" width="3" height="13" rx="1"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
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
  if (m.avatar_url && /^data:image\/(jpeg|png|webp);base64,/.test(m.avatar_url)) return `<span class="avatar has-img ${cls}" title="${esc(m.name)}"><img src="${m.avatar_url}" alt="" /></span>`;
  return `<span class="avatar ${cls}" style="background:${m.avatar_color || hashColor(m.email)}" title="${esc(m.name)}">${esc(initials(m.name))}</span>`;
}
// Aprovação: atividades criadas por colaboradores ficam "pendente" até um admin aprovar
const approvalOf = (t) => t.approval || 'aprovada';
const isApproved = (t) => approvalOf(t) === 'aprovada';
// Quem gerencia a atividade (nome, descrição, prazo, prioridade, responsável):
//  aprovada: o admin que criou/aprovou; se ele não for mais admin ativo, qualquer admin
//  pendente/recusada: quem pediu (só nome/descrição) e os admins
function isTaskManager(t) {
  if (!S.me) return false;
  if (!t.id || isAdmin()) return true;
  return !isApproved(t) && t.created_by_email === S.me.email;
}
// Prazo, prioridade, responsável e projeto
function canPlanTask(t) {
  return isApproved(t) ? isTaskManager(t) : isAdmin();
}
// Status, progresso e atualizações: administradores e o responsável
function canEditTask(t) {
  if (t?.status === 'concluido' && !isAdmin()) return false;   // concluída: travada (só admin reabre)
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
  $('#ai-panel')?.remove();
  AI.msgs = [];
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
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [members, projects, tasks, comments, subtasks, types, dueRequests, recentComments] = await Promise.all([
    q(sb.from('team_members').select('*').order('name')),
    q(sb.from('projects').select('*').order('created_at')),
    q(sb.from('tasks').select('*').order('created_at')),
    fetchLastUpdates(),
    sb.from('subtasks').select('*').order('position').order('created_at').then(({ data }) => data || []),
    sb.from('activity_types').select('*').order('position').then(({ data }) => data || []),
    sb.from('due_requests').select('*').order('created_at', { ascending: false }).then(({ data }) => data || []),
    sb.from('task_comments').select('id, task_id, author_email, body, created_at').gt('created_at', since).then(({ data }) => data || []),
  ]);
  S.recentComments = recentComments || [];
  S.members = members || [];
  S.projects = projects || [];
  S.tasks = tasks || [];
  S.subtasks = subtasks || [];
  S.types = types || [];
  S.dueRequests = dueRequests || [];
  countComments(comments || []);
  const meNow = S.members.find((m) => m.id === S.me.id);
  if (meNow) S.me = meNow;
}
// uma linha por atividade: última atualização + total de comentários (view task_last_update)
function countComments(rows) {
  S.commentCounts = {};
  S.lastUpdate = {};
  for (const r of rows) {
    S.commentCounts[r.task_id] = Number(r.total) || 0;
    S.lastUpdate[r.task_id] = r;
  }
}
// Usa a view do banco (leve); se ela ainda não existir, calcula a partir dos comentários
let lastUpdateViewOk = true;
async function fetchLastUpdates() {
  if (lastUpdateViewOk) {
    const { data, error } = await sb.from('task_last_update').select('*');
    if (!error) return data || [];
    lastUpdateViewOk = false;
  }
  const rows = await q(sb.from('task_comments').select('task_id, body, author_email, created_at').order('created_at', { ascending: false }));
  const m = {};
  for (const r of rows || []) {
    if (!m[r.task_id]) m[r.task_id] = { ...r, total: 0 };
    m[r.task_id].total += 1;
  }
  return Object.values(m);
}
async function reloadLastUpdates() {
  try { countComments(await fetchLastUpdates()); } catch { /* ignore */ }
}
function upsertLocal(arr, row) {
  const i = arr.findIndex((x) => x.id === row.id);
  if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push(row);
}

async function updateTask(id, patch) {
  const t = task(id);
  if (!t) return;
  // automações de status/progresso
  // status e % andam juntos: mudou a %, o status acompanha; escolheu o status, a % vai para a faixa dele
  if ('progress' in patch && !('status' in patch)) patch.status = statusForProgress(patch.progress);
  else if ('status' in patch && !('progress' in patch) && !subsOf(id).length) patch.progress = progressForStatus(patch.status);
  else if ('status' in patch && subsOf(id).length) patch.progress = patch.status === 'concluido' ? 100 : t.progress;
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (p) => { checkFinished(p); checkAssigned(p); applyChange(S.tasks, p); S.onTaskChanged?.(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (p) => applyChange(S.projects, p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, (p) => { applyChange(S.members, p); if (p.new?.id === S.me?.id) Object.assign(S.me, p.new); scheduleRefresh(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_types' }, (p) => applyChange(S.types, p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'due_requests' }, (p) => { applyChange(S.dueRequests, p); S.onDueChanged?.(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, (p) => { checkFeedSub(p); applyChange(S.subtasks, p); S.onSubsChanged?.(); })
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
  if (p.eventType === 'INSERT' && p.new) { (S.recentComments ||= []).push(p.new); checkFeedComment(p.new); }
  clearTimeout(commentReload);
  commentReload = setTimeout(async () => {
    await reloadLastUpdates();
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
        <a href="#/calendario" data-nav="calendario">${ic('calendar')} Calendário</a>
        ${me.role === 'admin' ? `<a href="#/painel" data-nav="painel">${ic('chart')} Painel</a>` : ''}
        <a href="#/notas" data-nav="notas">${ic('note')} Anotações</a>
        ${me.role === 'admin' ? `<a href="#/equipe" data-nav="equipe">${ic('users')} Equipe</a>
` : ''}
      </nav>
      <div class="nav-section">Projetos</div>
      <div class="nav-projects" id="nav-projects"></div>
      <div class="userbox">
        ${avatar(me, 'lg')}
        <a class="info" href="#/perfil" title="Meu perfil"><b>${esc(me.name)}</b><span>${me.job_title ? esc(me.job_title) : me.role === 'admin' ? 'Administrador' : 'Colaborador'} · Meu perfil</span></a>
        <button class="btn btn-ghost btn-icon" id="logout" title="Sair">${ic('logout')}</button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <button class="btn btn-ghost btn-icon back" id="back" hidden>${ic('back')}</button>
        <h2 id="page-title"></h2>
        <button class="btn btn-ghost btn-icon theme-btn" id="theme-btn" title="Modo noturno" aria-label="Alternar modo noturno">${ic(isDark() ? 'sun' : 'moon')}</button>
        <button class="btn btn-ghost btn-icon help-btn" id="help-btn" title="Como usar o app" aria-label="Como usar o app">?</button>
        <button class="btn btn-ghost btn-icon bell" id="bell" data-pop-anchor title="Avisos">${ic('bell')}<span class="badge" id="bell-badge" hidden></span></button>
        <button class="btn btn-ghost btn-icon only-mobile" id="me-btn" data-pop-anchor>${avatar(me)}</button>
      </header>
      <div class="view" id="view"></div>
    </main>
    <button class="ai-fab" id="ai-fab" title="Assistente IA">${ic('spark')}<span>Assistente</span></button>
    <nav class="bottomnav">
      <a href="#/inicio" data-nav="inicio">${ic('home')}<span>Projetos</span></a>
      <a href="#/minhas" data-nav="minhas">${ic('check')}<span>Minhas</span><span class="count" id="bn-count" hidden></span></a>
      <a href="#/calendario" data-nav="calendario">${ic('calendar')}<span>Calendário</span></a>
      <a href="#/notas" data-nav="notas">${ic('note')}<span>Anotações</span></a>
      ${me.role === 'admin' ? `<a href="#/equipe" data-nav="equipe">${ic('users')}<span>Equipe</span></a>` : ''}
    </nav>
  </div>`;
  $('#logout').onclick = logout;
  $('#bell').onclick = (e) => openBell(e.currentTarget);
  $('#help-btn').onclick = openHelp;
  $('#theme-btn').onclick = () => {
    setTheme(isDark() ? 'light' : 'dark');
    $('#theme-btn').innerHTML = ic(isDark() ? 'sun' : 'moon');
    $('#theme-btn').title = isDark() ? 'Modo claro' : 'Modo noturno';
  };
  $('#me-btn').onclick = (e) => openMeMenu(e.currentTarget);
  $('#ai-fab').onclick = toggleAssistant;
  $('#back').onclick = () => { if (S.backTo) location.hash = S.backTo; };
  bindViewEvents();
  updateChrome();
}

// ---------------------------------------------------------------------
// PAINEL DO GESTOR (gráficos gerais)
// ---------------------------------------------------------------------
// Gráfico de rosca: segs = [{label, value, color}]
function donut(segs, { center = '', centerSub = '', size = 150, tipPrefix = '' } = {}) {
  const total = segs.reduce((a, x) => a + x.value, 0);
  const r = 52, C = 2 * Math.PI * r, gap = segs.filter((x) => x.value).length > 1 ? 2 : 0;
  let off = 0;
  const arcs = total ? segs.filter((x) => x.value).map((x) => {
    const len = (x.value / total) * C;
    const pctTxt = Math.round((x.value / total) * 100);
    const a = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${x.color}" stroke-width="20" stroke-dasharray="${Math.max(0.5, len - gap)} ${C}" stroke-dashoffset="${-off}" data-tip="${esc(`${tipPrefix}${x.label}: ${x.value} (${pctTxt}%)`)}"></circle>`;
    off += len;
    return a;
  }).join('') : `<circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="20"></circle>`;
  const legend = segs.map((x) => `<div class="dn-li ${x.value ? '' : 'zero'}"><i style="background:${x.color}"></i><span>${esc(x.label)}</span><b>${total ? Math.round((x.value / total) * 100) : 0}%</b><small>${x.value}</small></div>`).join('');
  return `<div class="dn">
    <div class="dn-svg" style="width:${size}px;height:${size}px"><svg viewBox="0 0 140 140" width="${size}" height="${size}"><g transform="rotate(-90 70 70)">${arcs}</g></svg>
      <div class="dn-c"><b>${center}</b><span>${centerSub}</span></div></div>
    <div class="dn-legend">${legend}</div></div>`;
}
function viewDashboard() {
  setTitle('Painel');
  document.title = `Painel · ${APP_NAME}`;
  const f = (S.dash ||= { proj: '', who: '' });
  const projs = S.projects.filter((p) => !p.archived);
  const inScope = (t) => activeProject(t) && (!f.proj || t.project_id === f.proj) && (!f.who || t.assignee_id === f.who);
  const all = S.tasks.filter(inScope);
  const appr = all.filter(isApproved);
  const open = appr.filter((t) => t.status !== 'concluido');
  const late = open.filter((t) => dueState(t) === 'late');
  const soon = open.filter((t) => dueState(t) === 'soon');
  const pend = all.filter((t) => approvalOf(t) === 'pendente');
  const doneAt = (t) => { const d = (t.stages || []).map((x) => x.done_at).filter(Boolean).sort().pop(); return new Date(d || t.updated_at || t.created_at); };
  const d30 = Date.now() - 30 * 86400000;
  const done30 = appr.filter((t) => t.status === 'concluido' && doneAt(t).getTime() > d30);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const wavg = (list) => { const w = list.reduce((s2, t) => s2 + (SIZES[t.size]?.w || 2), 0); return w ? Math.round(list.reduce((s2, t) => s2 + t.progress * (SIZES[t.size]?.w || 2), 0) / w) : 0; };
  const tile = (label, val, sub, tone = '') => `<div class="dtile ${tone}"><span>${label}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const tip = (txt) => `data-tip="${esc(txt)}"`;

  // 1) progresso por projeto (barras horizontais, cor do projeto)
  const projRows = projs.filter((p) => !f.proj || p.id === f.proj).map((p) => {
    const list = appr.filter((t) => t.project_id === p.id);
    return { p, list, prog: wavg(list), late: list.filter((t) => dueState(t) === 'late').length };
  }).filter((x) => x.list.length).sort((a, b) => b.prog - a.prog);
  const progChart = projRows.length ? projRows.map((x) => `
    <div class="hb-row" data-proj="${x.p.id}" ${tip(`${x.p.name}: ${x.prog}% pronto · ${x.list.length} atividade(s)${x.late ? ` · ${x.late} atrasada(s)` : ''}`)}>
      <div class="hb-lbl"><span class="cal-dot" style="background:${x.p.color}"></span><span>${esc(x.p.name)}</span></div>
      <div class="hb-track"><i style="width:${x.prog}%;background:${x.p.color}"></i></div>
      <div class="hb-val">${x.prog}%${x.late ? ` <em>${x.late} atras.</em>` : ''}</div>
    </div>`).join('') : '<div class="muted small">Sem atividades.</div>';

  // 2) status por projeto (barra empilhada 100%)
  const stOrder = STATUS_ORDER;
  const stLegend = `<div class="dlegend">${stOrder.map((k) => `<span><i style="background:${STATUS[k].color}"></i>${STATUS[k].label}</span>`).join('')}</div>`;
  const stChart = projRows.length ? projRows.map((x) => {
    const n = x.list.length;
    const segs = stOrder.map((k) => ({ k, c: x.list.filter((t) => t.status === k).length })).filter((s2) => s2.c);
    return `<div class="hb-row" data-proj="${x.p.id}">
      <div class="hb-lbl"><span class="cal-dot" style="background:${x.p.color}"></span><span>${esc(x.p.name)}</span></div>
      <div class="sb-track">${segs.map((s2) => `<i style="flex:${s2.c};background:${STATUS[s2.k].color}" ${tip(`${x.p.name} · ${STATUS[s2.k].label}: ${s2.c} de ${n} (${pct(s2.c, n)}%)`)}></i>`).join('')}</div>
      <div class="hb-val">${n}</div>
    </div>`;
  }).join('') : '';

  // 3) carga por pessoa (empilhada: atrasadas / vencem logo / em dia / sem prazo)
  const LOAD = [
    { k: 'late', label: 'Atrasadas', color: 'var(--danger)' },
    { k: 'soon', label: `Vencem em até ${DUE_SOON_DAYS} dias`, color: 'var(--warn)' },
    { k: 'ok', label: 'No prazo', color: 'var(--primary)' },
    { k: 'none', label: 'Sem prazo', color: 'var(--text-3)' },
  ];
  const people = S.members.filter((m) => m.active).map((m) => {
    const list = open.filter((t) => t.assignee_id === m.id);
    return { m, list, c: Object.fromEntries(LOAD.map((l) => [l.k, list.filter((t) => dueState(t) === l.k).length])) };
  }).filter((x) => x.list.length).sort((a, b) => b.list.length - a.list.length || b.c.late - a.c.late);
  const unassigned = open.filter((t) => !t.assignee_id).length;
  const maxLoad = Math.max(1, ...people.map((x) => x.list.length));
  const loadChart = people.length ? people.map((x) => `
    <div class="hb-row">
      <div class="hb-lbl">${avatar(x.m)}<span>${esc(x.m.name)}</span></div>
      <div class="hb-track ld"><div class="sb-track" style="width:${(x.list.length / maxLoad) * 100}%">${LOAD.filter((l) => x.c[l.k]).map((l) => `<i style="flex:${x.c[l.k]};background:${l.color}" ${tip(`${x.m.name} · ${l.label}: ${x.c[l.k]}`)}></i>`).join('')}</div></div>
      <div class="hb-val">${x.list.length}</div>
    </div>`).join('') : '<div class="muted small">Ninguém com atividades abertas.</div>';

  // 4) entregas previstas nas próximas 8 semanas (colunas) + atrasadas
  const monday = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const a = addDays(monday, i * 7), b = addDays(a, 7);
    const list = open.filter((t) => t.due_date && parseDate(t.due_date) >= a && parseDate(t.due_date) < b);
    return { a, n: list.length, list };
  });
  const maxW = Math.max(1, late.length, ...weeks.map((w) => w.n));
  const col = (n, label, sub, tipTxt, cls = '') => `<div class="col ${cls}" ${tip(tipTxt)}>
      <div class="col-bar"><b>${n || ''}</b><i style="height:${(n / maxW) * 100}%"></i></div>
      <div class="col-lbl">${label}<small>${sub}</small></div></div>`;
  const weekChart = `<div class="cols">
      ${col(late.length, 'Atraso', 'vencidas', `${late.length} atividade(s) atrasada(s)`, 'late')}
      ${weeks.map((w, i) => col(w.n, `${String(w.a.getDate()).padStart(2, '0')}/${String(w.a.getMonth() + 1).padStart(2, '0')}`, i === 0 ? 'esta' : i === 1 ? 'próxima' : '', `Semana de ${fmtDate(ymd(w.a))}: ${w.n} entrega(s)${w.list.length ? ' — ' + w.list.slice(0, 4).map((t) => t.title).join(', ') + (w.list.length > 4 ? '…' : '') : ''}`)).join('')}
    </div>`;

  // 6) roscas com porcentagens
  const DUE_SEGS = [
    { k: 'late', label: 'Atrasadas', color: '#e2445c' },
    { k: 'soon', label: `Vencem em até ${DUE_SOON_DAYS} dias`, color: '#fdab3d' },
    { k: 'ok', label: 'No prazo', color: '#579bfc' },
    { k: 'none', label: 'Sem prazo', color: '#a8adba' },
  ];
  const donutStatus = donut(STATUS_ORDER.map((k) => ({ label: STATUS[k].label, value: appr.filter((t) => t.status === k).length, color: STATUS[k].color })),
    { center: appr.length ? `${pct(appr.filter((t) => t.status === 'concluido').length, appr.length)}%` : '—', centerSub: 'concluído' });
  const donutDue = donut(DUE_SEGS.map((d) => ({ label: d.label, value: open.filter((t) => dueState(t) === d.k).length, color: d.color })),
    { center: open.length ? `${pct(open.filter((t) => ['ok', 'soon'].includes(dueState(t))).length, open.length)}%` : '—', centerSub: 'dentro do prazo' });
  const donutPrio = donut(Object.entries(PRIORITY).map(([k, v]) => ({ label: v.label, value: open.filter((t) => (t.priority || 'media') === k).length, color: v.color })),
    { center: String(open.length), centerSub: 'abertas' });
  const donutProj = donut(projRows.map((x) => ({ label: x.p.name, value: x.list.filter((t) => t.status !== 'concluido').length, color: x.p.color })),
    { center: String(open.length), centerSub: 'abertas' });
  const stDonuts = projRows.map((x) => `<div class="dn-mini" data-proj="${x.p.id}"><div class="dn-mini-t"><span class="cal-dot" style="background:${x.p.color}"></span>${esc(x.p.name)}</div>
      ${donut(STATUS_ORDER.map((k) => ({ label: STATUS[k].label, value: x.list.filter((t) => t.status === k).length, color: STATUS[k].color })),
        { center: `${pct(x.list.filter((t) => t.status === 'concluido').length, x.list.length)}%`, centerSub: 'concluído', size: 120, tipPrefix: `${x.p.name} · ` })}</div>`).join('');
  const stMode = S.prefs.dashSt || 'barras';

  // 5) lista de atrasadas
  const lateList = late.slice().sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 12).map((t) => `
    <div class="cal-row" data-task="${t.id}">
      <span class="cal-dot" style="background:${project(t.project_id)?.color || '#999'}"></span>
      <div class="cal-row-tx"><b>${esc(t.title)}</b><span>${esc(project(t.project_id)?.name || '')} · ${member(t.assignee_id) ? esc(member(t.assignee_id).name) : 'sem responsável'}</span></div>
      <span class="due late"><span>${esc(dueText(t))}</span></span>
    </div>`).join('');

  $('#view').innerHTML = `
    <div class="dash">
      <div class="cal-filters" style="margin-bottom:14px">
        <select class="select" id="d-proj"><option value="">Todos os projetos</option>${projs.map((p) => `<option value="${p.id}" ${f.proj === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <select class="select" id="d-who"><option value="">Toda a equipe</option>${S.members.filter((m) => m.active).map((m) => `<option value="${m.id}" ${f.who === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      </div>
      <div class="dtiles">
        ${tile('Atividades abertas', open.length, `${wavg(open)}% pronto em média`)}
        ${tile('Atrasadas', late.length, open.length ? `${pct(late.length, open.length)}% das abertas` : '', late.length ? 'bad' : '')}
        ${tile(`Vencem em até ${DUE_SOON_DAYS} dias`, soon.length, '', soon.length ? 'warn' : '')}
        ${tile('Concluídas em 30 dias', done30.length, '', 'good')}
        ${tile('Aguardando aprovação', pend.length, pend.length ? 'solicitações de colaboradores' : '')}
      </div>
      <div class="dgrid dgrid3">
        <div class="card dcard"><div class="dtitle">Situação geral</div><div class="dsub">Todas as atividades aprovadas, por status.</div>${donutStatus}</div>
        <div class="card dcard"><div class="dtitle">Prazos</div><div class="dsub">Atividades abertas.</div>${donutDue}</div>
        <div class="card dcard"><div class="dtitle">Prioridade</div><div class="dsub">Atividades abertas.</div>${donutPrio}</div>
        <div class="card dcard"><div class="dtitle">Abertas por projeto</div><div class="dsub">Quanto cada projeto representa do trabalho em aberto.</div>${donutProj}</div>
      </div>
      <div class="dgrid">
        <div class="card dcard"><div class="dtitle">Quanto cada projeto está pronto</div><div class="dsub">Média ponderada pelo tamanho das atividades. Clique para abrir o projeto.</div>${progChart}</div>
        <div class="card dcard"><div class="dhead"><div class="dtitle">Situação das atividades por projeto</div>
          <div class="seg seg-sm"><button class="${stMode === 'barras' ? 'active' : ''}" data-stm="barras">Barras</button><button class="${stMode === 'rosca' ? 'active' : ''}" data-stm="rosca">Rosca</button></div></div>
          ${stMode === 'rosca' ? `<div class="dn-grid">${stDonuts || '<div class="muted small">Sem atividades.</div>'}</div>` : stLegend + stChart}</div>
        <div class="card dcard"><div class="dtitle">Carga de trabalho por pessoa</div><div class="dsub">Atividades abertas de cada um.${unassigned ? ` ${unassigned} aberta(s) sem responsável.` : ''}</div>
          <div class="dlegend">${LOAD.map((l) => `<span><i style="background:${l.color}"></i>${l.label}</span>`).join('')}</div>${loadChart}</div>
        <div class="card dcard"><div class="dtitle">Entregas previstas por semana</div><div class="dsub">Atividades abertas pela data de entrega (semanas começando na segunda-feira).</div>${weekChart}</div>
        <div class="card dcard dwide"><div class="dtitle">Atrasadas agora</div>${lateList || '<div class="muted small">Nenhuma atividade atrasada. 🎉</div>'}${late.length > 12 ? `<div class="muted small" style="margin-top:8px">+${late.length - 12} outras</div>` : ''}</div>
      </div>
    </div>`;
  $('#d-proj').onchange = (e) => { f.proj = e.target.value; viewDashboard(); };
  $('#d-who').onchange = (e) => { f.who = e.target.value; viewDashboard(); };
  $$('[data-stm]').forEach((b) => (b.onclick = () => { S.prefs.dashSt = b.dataset.stm; savePrefs(); viewDashboard(); }));
  $$('#view [data-proj]').forEach((x) => (x.onclick = () => (location.hash = `#/projeto/${x.dataset.proj}`)));
  $$('#view [data-task]').forEach((x) => (x.onclick = () => openTask(x.dataset.task)));
  bindTips($('#view'));
}
// dica flutuante ao passar o mouse / tocar nas barras
function bindTips(root) {
  let tipEl = document.getElementById('dtip');
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.id = 'dtip'; tipEl.className = 'dtip'; document.body.appendChild(tipEl); }
  const show = (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t || !root.contains(t)) { tipEl.style.display = 'none'; return; }
    tipEl.textContent = t.dataset.tip;
    tipEl.style.display = 'block';
    const x = Math.min(e.clientX + 14, window.innerWidth - tipEl.offsetWidth - 8);
    const y = e.clientY + 16 + tipEl.offsetHeight > window.innerHeight ? e.clientY - tipEl.offsetHeight - 10 : e.clientY + 16;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  };
  root.addEventListener('mousemove', show);
  root.addEventListener('click', show);
  root.addEventListener('mouseleave', () => (tipEl.style.display = 'none'));
}

// ---------------------------------------------------------------------
// MEU PERFIL
// ---------------------------------------------------------------------
// reduz a foto para 160x160 (fica leve, guardada junto do cadastro)
function resizeImage(file, size = 160) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const k = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler esta imagem.')); };
    img.src = url;
  });
}
function viewProfile() {
  setTitle('Meu perfil');
  document.title = `Meu perfil · ${APP_NAME}`;
  const me = S.me;
  const adm = isAdmin();
  const draft = { name: me.name, avatar_color: me.avatar_color || hashColor(me.email), avatar_url: me.avatar_url || null, phone: me.phone || '', job_title: me.job_title || '' };
  const preview = () => avatar({ ...me, ...draft }, 'xl');
  $('#view').innerHTML = `
    <div class="profile">
      <div class="card prof-card">
        <div class="prof-top">
          <div id="pf-av">${preview()}</div>
          <div class="prof-photo-btns">
            <label class="btn btn-sm">${ic('upload')} Trocar foto<input type="file" id="pf-file" accept="image/*" hidden /></label>
            <button class="btn btn-sm btn-ghost" id="pf-rmphoto" ${draft.avatar_url ? '' : 'hidden'}>Remover foto</button>
            <div class="small muted">A foto aparece para toda a equipe.</div>
          </div>
        </div>
        <div class="field"><label>Nome</label><input class="input" id="pf-name" value="${esc(draft.name)}" maxlength="60" /></div>
        <div class="field"><label>Cor (aparece quando não há foto)</label>
          <div class="color-pick" id="pf-colors">${PERSON_COLORS.map((c) => `<button type="button" class="cp ${c === draft.avatar_color ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}</div></div>
        <div class="field"><label>Telefone / WhatsApp</label><input class="input" id="pf-phone" value="${esc(draft.phone)}" placeholder="(11) 99999-9999" maxlength="30" /></div>
        <div class="kv" style="margin-top:6px">
          <label>Cargo</label>
          ${adm ? `<input class="input" id="pf-job" value="${esc(draft.job_title)}" placeholder="Ex.: Engenheiro, Projetista" maxlength="60" />`
                : `<div class="ro-val">${esc(draft.job_title || '—')} <span class="small muted" style="font-weight:400">· definido pelo administrador</span></div>`}
          <label>E-mail</label><div class="ro-val">${esc(me.email)}</div>
          <label>Acesso</label><div class="ro-val">${adm ? 'Administrador' : 'Colaborador'}</div>
        </div>
        <div class="prof-actions"><button class="btn btn-primary" id="pf-save">Salvar perfil</button></div>
      </div>

      <div class="card prof-card">
        <div class="section-t">${ic('lock').replace('<svg', '<svg width="16" height="16"')} Trocar senha</div>
        <div class="field"><label>Nova senha</label><input class="input" type="password" id="pf-p1" autocomplete="new-password" minlength="6" /></div>
        <div class="field"><label>Repita a nova senha</label><input class="input" type="password" id="pf-p2" autocomplete="new-password" minlength="6" /></div>
        <div class="err" id="pf-perr"></div>
        <div class="prof-actions"><button class="btn" id="pf-pass">Trocar senha</button></div>
      </div>

      <div class="card prof-card">
        <div class="section-t">${ic('settings').replace('<svg', '<svg width="16" height="16"')} Preferências deste aparelho</div>
        <div class="pref-row"><div><b>Modo noturno</b><span class="small muted">Fundo escuro, mais confortável à noite</span></div>
          <label class="switch"><input type="checkbox" id="pf-dark" ${isDark() ? 'checked' : ''} /><span></span></label></div>
        <div class="pref-row"><div><b>Notificações</b><span class="small muted">${'Notification' in window ? (Notification.permission === 'granted' ? 'Ativadas neste aparelho' : Notification.permission === 'denied' ? 'Bloqueadas nas configurações do navegador' : 'Desativadas') : 'Não suportadas neste navegador'}</span></div>
          ${'Notification' in window && Notification.permission === 'default' ? '<button class="btn btn-sm" id="pf-notif">Ativar</button>' : ''}</div>
      </div>
    </div>`;
  const repaint = () => { $('#pf-av').innerHTML = preview(); $('#pf-rmphoto').hidden = !draft.avatar_url; };
  $('#pf-name').oninput = (e) => { draft.name = e.target.value; repaint(); };
  $$('#pf-colors .cp').forEach((b) => (b.onclick = () => {
    draft.avatar_color = b.dataset.c;
    $$('#pf-colors .cp').forEach((x) => x.classList.toggle('on', x === b));
    repaint();
  }));
  $('#pf-file').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { draft.avatar_url = await resizeImage(f); repaint(); toast('Foto pronta. Toque em "Salvar perfil".'); } catch (err) { toastErr(err); }
  };
  $('#pf-rmphoto').onclick = () => { draft.avatar_url = null; repaint(); };
  $('#pf-save').onclick = async () => {
    const name = $('#pf-name').value.trim();
    if (name.length < 2) { toast('Informe seu nome', 'error'); return; }
    const patch = { name, avatar_color: draft.avatar_color, avatar_url: draft.avatar_url, phone: $('#pf-phone').value.trim() };
    if (adm && $('#pf-job')) patch.job_title = $('#pf-job').value.trim();
    const btn = $('#pf-save'); btn.disabled = true;
    try {
      const row = await q(sb.from('team_members').update(patch).eq('id', me.id).select().single());
      Object.assign(S.me, row); upsertLocal(S.members, row);
      renderShell(); viewProfile();
      toast('Perfil salvo', 'ok');
    } catch (e) { toastErr(e); btn.disabled = false; }
  };
  $('#pf-pass').onclick = async () => {
    const p1 = $('#pf-p1').value, p2 = $('#pf-p2').value, err = $('#pf-perr');
    err.textContent = '';
    if (p1.length < 6) { err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return; }
    if (p1 !== p2) { err.textContent = 'As duas senhas não são iguais.'; return; }
    try { await q(sb.auth.updateUser({ password: p1 })); $('#pf-p1').value = $('#pf-p2').value = ''; toast('Senha trocada', 'ok'); }
    catch (e) { err.textContent = e.message || 'Não foi possível trocar a senha.'; }
  };
  $('#pf-dark').onchange = (e) => { setTheme(e.target.checked ? 'dark' : 'light'); const tb = $('#theme-btn'); if (tb) tb.innerHTML = ic(isDark() ? 'sun' : 'moon'); };
  $('#pf-notif')?.addEventListener('click', async () => { await requestNotif(); viewProfile(); });
}

// Modo noturno
function isDark() { return document.documentElement.dataset.theme === 'dark'; }
function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  try { localStorage.setItem('ga-theme', mode); } catch {}
  const mc = document.querySelector('meta[name="theme-color"]');
  if (mc) mc.content = mode === 'dark' ? '#181b34' : '#1d4ed8';
}

// ---------------------------------------------------------------------
// CALENDÁRIO (mês e linha do tempo)
// ---------------------------------------------------------------------
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayDiff = (a, b) => Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
function taskStart(t) {
  const s = t.approved_at || t.created_at;
  return s ? new Date(new Date(s).toDateString()) : (t.due_date ? parseDate(t.due_date) : new Date());
}
function viewCalendar() {
  setTitle('Calendário');
  document.title = `Calendário · ${APP_NAME}`;
  const now = new Date();
  const c = (S.cal ||= { y: now.getFullYear(), m: now.getMonth(), mode: S.prefs.calMode || 'mes', proj: '', who: '', day: ymd(now) });
  const projs = S.projects.filter((p) => !p.archived);
  const tasks = S.tasks.filter((t) => isApproved(t) && activeProject(t) && (!c.proj || t.project_id === c.proj) && (!c.who || (c.who === 'me' ? t.assignee_id === S.me.id : t.assignee_id === c.who)));
  const pColor = (t) => project(t.project_id)?.color || '#1d4ed8';
  const head = `
    <div class="cal-head">
      <div class="cal-nav">
        <button class="btn btn-icon" id="cal-prev" title="Mês anterior">${ic('back')}</button>
        <h3>${MONTHS[c.m]} ${c.y}</h3>
        <button class="btn btn-icon" id="cal-next" title="Próximo mês" style="transform:scaleX(-1)">${ic('back')}</button>
        <button class="btn btn-sm" id="cal-today">Hoje</button>
      </div>
      <div class="cal-filters">
        <select class="select" id="cal-proj"><option value="">Todos os projetos</option>${projs.map((p) => `<option value="${p.id}" ${c.proj === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <select class="select" id="cal-who"><option value="">Todos os responsáveis</option><option value="me" ${c.who === 'me' ? 'selected' : ''}>Somente eu</option>
          ${S.members.filter((m) => m.active).map((m) => `<option value="${m.id}" ${c.who === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <div class="seg">
          <button class="${c.mode === 'mes' ? 'active' : ''}" data-cmode="mes">${ic('calendar')} Mês</button>
          <button class="${c.mode === 'linha' ? 'active' : ''}" data-cmode="linha">${ic('kanban')} Linha do tempo</button>
        </div>
      </div>
    </div>`;
  const body = c.mode === 'linha' ? calTimeline(c, tasks, pColor) : calMonth(c, tasks, pColor);
  $('#view').innerHTML = `<div class="cal">${head}${body}</div>`;
  const go = (dm) => { let m = c.m + dm, y = c.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } c.m = m; c.y = y; viewCalendar(); };
  $('#cal-prev').onclick = () => go(-1);
  $('#cal-next').onclick = () => go(1);
  $('#cal-today').onclick = () => { c.y = now.getFullYear(); c.m = now.getMonth(); c.day = ymd(now); viewCalendar(); };
  $('#cal-proj').onchange = (e) => { c.proj = e.target.value; viewCalendar(); };
  $('#cal-who').onchange = (e) => { c.who = e.target.value; viewCalendar(); };
  $$('[data-cmode]').forEach((b) => (b.onclick = () => { c.mode = b.dataset.cmode; S.prefs.calMode = c.mode; savePrefs(); viewCalendar(); }));
  $$('#view [data-day]').forEach((x) => (x.onclick = (e) => { if (e.target.closest('[data-task]')) return; c.day = x.dataset.day; viewCalendar(); }));
  $$('#view [data-task]').forEach((x) => (x.onclick = (e) => { e.stopPropagation(); openTask(x.dataset.task); }));
  if (c.mode === 'linha') {
    const sc = $('#tl-scroll');
    const tl = sc?.querySelector('.tl-today');
    if (sc && tl) sc.scrollLeft = Math.max(0, tl.offsetLeft - sc.querySelector('.tl-lbl').offsetWidth - 7 * 28);   // hoje com 1 semana antes à vista
  }
}
function calMonth(c, tasks, pColor) {
  const first = new Date(c.y, c.m, 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const last = new Date(c.y, c.m + 1, 0);
  const weeks = Math.ceil((dayDiff(start, last) + 1) / 7);
  const today = ymd(new Date());
  const byDay = {};
  for (const t of tasks) if (t.due_date) (byDay[t.due_date] ||= []).push(t);
  const chip = (t) => `<div class="cal-chip ${dueState(t)}" data-task="${t.id}" style="--pc:${pColor(t)}" title="${esc(t.title)} — ${esc(project(t.project_id)?.name || '')}${member(t.assignee_id) ? ' · ' + esc(member(t.assignee_id).name) : ''}">${esc(t.title)}</div>`;
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), k = ymd(d), list = (byDay[k] || []).sort((a, b) => a.status === 'concluido' ? 1 : -1);
    const late = list.some((t) => dueState(t) === 'late');
    cells += `<div class="cal-cell ${d.getMonth() !== c.m ? 'out' : ''} ${k === today ? 'today' : ''} ${k === c.day ? 'sel' : ''} ${i % 7 >= 5 ? 'wk' : ''}" data-day="${k}">
      <div class="cal-dn">${d.getDate()}${list.length ? `<span class="cal-n ${late ? 'late' : ''}">${list.length}</span>` : ''}</div>
      <div class="cal-chips">${list.slice(0, 3).map(chip).join('')}${list.length > 3 ? `<div class="cal-more">+${list.length - 3} mais</div>` : ''}</div>
    </div>`;
  }
  const sel = (byDay[c.day] || []);
  const selD = parseDate(c.day);
  const noDue = tasks.filter((t) => !t.due_date && t.status !== 'concluido').length;
  return `
    <div class="cal-grid">${WEEKDAYS.map((w) => `<div class="cal-wd">${w}</div>`).join('')}${cells}</div>
    <div class="cal-day">
      <div class="section-t">${selD.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</div>
      ${sel.length ? sel.map((t) => `<div class="cal-row" data-task="${t.id}">
          <span class="cal-dot" style="background:${pColor(t)}"></span>
          <div class="cal-row-tx"><b>${esc(t.title)}</b><span>${esc(project(t.project_id)?.name || '')}${member(t.assignee_id) ? ' · ' + esc(member(t.assignee_id).name) : ''}</span></div>
          <span class="cal-row-st" style="background:${(STATUS[t.status] || STATUS.nao_iniciado).color}">${t.progress}%</span>
        </div>`).join('') : '<div class="muted small">Nenhuma entrega neste dia.</div>'}
      ${noDue ? `<div class="muted small" style="margin-top:10px">${noDue} atividade${noDue > 1 ? 's' : ''} sem data de entrega não aparece${noDue > 1 ? 'm' : ''} no calendário.</div>` : ''}
    </div>`;
}
function calTimeline(c, tasks, pColor) {
  const DW = 28;
  const start = new Date(c.y, c.m, 1);
  const end = new Date(c.y, c.m + 3, 0);   // 3 meses
  const nDays = dayDiff(start, end) + 1;
  const W = nDays * DW;
  const today = new Date();
  const ti = dayDiff(start, today);
  const pos = (d) => Math.max(0, Math.min(nDays, dayDiff(start, d)));
  let days = '', months = '';
  for (let i = 0; i < nDays; i++) {
    const d = addDays(start, i);
    days += `<div class="tl-d ${d.getDay() % 6 === 0 ? 'wk' : ''} ${i === ti ? 'td' : ''}" style="left:${i * DW}px">${d.getDate()}</div>`;
    if (d.getDate() === 1) months += `<div class="tl-m" style="left:${i * DW}px">${MONTHS[d.getMonth()]} ${d.getFullYear()}</div>`;
  }
  const bar = (t) => {
    if (!t.due_date) return '';
    const s0 = taskStart(t), e0 = parseDate(t.due_date);
    const a = s0 > e0 ? e0 : s0;
    if (e0 < start || a > end) return '';
    const l = pos(a), r = pos(e0) + 1;
    const st = dueState(t);
    return `<div class="tl-bar ${st}" data-task="${t.id}" style="left:${l * DW}px;width:${Math.max(1, r - l) * DW - 4}px;--sc:${(STATUS[t.status] || STATUS.nao_iniciado).color}" title="${esc(t.title)} · ${fmtDate(ymd(a))} → ${fmtDate(t.due_date)} · ${t.progress}%"><i style="width:${t.progress}%"></i><span>${t.progress}%</span></div>`;
  };
  const groups = S.projects.filter((p) => !p.archived && (!c.proj || p.id === c.proj)).map((p) => {
    const list = tasks.filter((t) => t.project_id === p.id).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
    if (!list.length) return '';
    const dated = list.filter((t) => t.due_date);
    let pbar = '';
    if (dated.length) {
      const a = dated.map(taskStart).reduce((x, y) => (y < x ? y : x));
      const b = dated.map((t) => parseDate(t.due_date)).reduce((x, y) => (y > x ? y : x));
      const prog = Math.round(list.reduce((sum, t) => sum + t.progress * (SIZES[t.size]?.w || 2), 0) / list.reduce((sum, t) => sum + (SIZES[t.size]?.w || 2), 0));
      if (!(b < start || a > end)) {
        const l = pos(a), r = pos(b) + 1;
        pbar = `<div class="tl-pbar" style="left:${l * DW}px;width:${Math.max(1, r - l) * DW - 4}px;--pc:${p.color}" title="${esc(p.name)} · ${fmtDate(ymd(a))} → ${fmtDate(ymd(b))} · ${prog}%"><i style="width:${prog}%"></i><span>${prog}%</span></div>`;
      }
    }
    return `<div class="tl-row tl-proj"><div class="tl-lbl"><span class="cal-dot" style="background:${p.color}"></span><b>${esc(p.name)}</b></div><div class="tl-track" style="width:${W}px">${pbar}</div></div>
      ${list.map((t) => `<div class="tl-row"><div class="tl-lbl" data-task="${t.id}"><span>${esc(t.title)}</span><small>${member(t.assignee_id) ? esc(firstName(member(t.assignee_id).name)) : '—'}${t.due_date ? '' : ' · sem prazo'}</small></div><div class="tl-track" style="width:${W}px">${bar(t)}</div></div>`).join('')}`;
  }).join('');
  return `<div class="tl-wrap"><div class="tl-scroll" id="tl-scroll">
      <div class="tl-row tl-headrow"><div class="tl-lbl tl-corner">Projeto / atividade</div><div class="tl-track tl-scale" style="width:${W}px">${months}${days}</div></div>
      <div class="tl-body">${groups || '<div class="muted small" style="padding:16px">Nenhuma atividade para mostrar.</div>'}
        ${ti >= 0 && ti < nDays ? `<div class="tl-today" style="left:calc(var(--tl-lbl) + ${ti * DW + DW / 2}px)"></div>` : ''}
      </div></div></div>
    <div class="muted small" style="margin-top:8px">A barra vai de quando a atividade foi passada até a data de entrega; o preenchimento mostra quanto está pronto. Linha vermelha = hoje.</div>`;
}

// Guia rápido "Como usar"
function openHelp() {
  const adm = isAdmin();
  const step = (n, title, txt) => `<div class="help-step"><div class="help-n">${n}</div><div><b>${title}</b><p>${txt}</p></div></div>`;
  const steps = adm ? [
    ['Crie o projeto', 'Em <b>Projetos</b>, toque em <b>Novo projeto</b>. Cada obra ou cliente pode ser um projeto.'],
    ['Passe o serviço', 'Dentro do projeto, toque em <b>Nova atividade</b>. Informe o responsável, a data de entrega e a prioridade. Se quiser, divida em subatividades.'],
    ['Acompanhe', 'Cada status tem a sua porcentagem: <b>Não iniciado</b> 0%, <b>Iniciando</b> 1–19%, <b>Em andamento</b> 20–74%, <b>Finalizando</b> 75–99% e <b>Concluída</b> 100%. As cores mostram o que está atrasado (vermelho) e vencendo (amarelo).'],
    ['Decida', 'No sino aparecem as solicitações de serviço, os pedidos de novo prazo e os serviços concluídos.'],
    ['Veja o geral', 'O <b>Painel</b> mostra gráficos de todos os projetos e a carga de cada pessoa; o <b>Calendário</b> mostra as entregas.'],
    ['Pergunte à IA', 'O botão roxo no canto responde perguntas como "o que está atrasado?" ou "o que o Paulo tem para hoje?".'],
  ] : [
    ['Veja seus serviços', 'Toque em <b>Minhas</b> (embaixo, no celular). Os atrasados aparecem primeiro, em vermelho; os que vencem logo, em amarelo.'],
    ['Abra o serviço', 'Toque no nome do serviço para ver o status, as subatividades, o prazo e as anotações.'],
    ['Atualize o andamento', 'Escolha o status (ou arraste a porcentagem): <b>Iniciando</b> 1–19%, <b>Em andamento</b> 20–74%, <b>Finalizando</b> 75–99%, <b>Concluída</b> 100%. Se houver subatividades, é só marcá-las: a porcentagem sobe sozinha.'],
    ['Conte como está', 'Toque no <b>+</b> ao lado do serviço (ou escreva em <b>Atualizações</b>) e diga o que fez e o que falta.'],
    ['Precisa de algo?', 'Se estiver esperando cliente ou fornecedor, use <b>Impedimento</b>. Se precisar de mais tempo, toque em <b>Pedir novo prazo</b>.'],
    ['Serviço novo de reunião', 'Dentro do projeto, toque em <b>Solicitar atividade</b> e informe o prazo combinado. O gestor aprova.'],
  ];
  openModal({
    title: 'Como usar o app',
    body: `<div class="help">${steps.map((x, i) => step(i + 1, x[0], x[1])).join('')}</div>`,
    foot: `<button class="btn btn-primary" data-close>Entendi</button>`,
  });
}

async function logout() {
  if (S.leaveHook) await S.leaveHook();
  await sb.auth.signOut();
}

// Prazos e decisões continuam na lista do sino, mas a bolinha some depois que a pessoa abre o sino
const BELL_SEEN_KEY = 'ga-seen-bell';
const bellKeys = (late, soon, decs) => [
  ...late.map((t) => `late:${t.id}:${t.due_date}`), ...soon.map((t) => `soon:${t.id}:${t.due_date}`),
  ...decs.map((d) => `dec:${d.t.id}:${d.kind}:${d.since}`)];
function seenBell() { try { return JSON.parse(localStorage.getItem(BELL_SEEN_KEY) || '{}'); } catch { return {}; } }
function markBellSeen(keys) {
  const seen = seenBell(), limit = Date.now() - 60 * 86400000;
  for (const k of Object.keys(seen)) if (seen[k] < limit) delete seen[k];
  keys.forEach((k) => (seen[k] = Date.now()));
  try { localStorage.setItem(BELL_SEEN_KEY, JSON.stringify(seen)); } catch {}
}
function updateChrome() {
  const { late, soon } = alertsFor(myTasks());
  const seenB = seenBell();
  const n = bellKeys(late, soon, myDecisions()).filter((k) => !seenB[k]).length + finishedForMe().length + newForMe().length + feedForMe().length;
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
  const reqs = myDecisions();
  const fin = finishedForMe();
  const nov = newForMe();
  const feed = feedForMe();
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const html = `
    <div class="ttl">Avisos</div>
    <div class="notif-list">
      ${nov.length ? '<div class="ttl" style="padding-top:2px">Serviços novos para você</div>' : ''}
      ${nov.map((t) => `
        <div class="notif" data-task="${t.id}">
          <span class="dot" style="background:var(--primary)"></span>
          <div><b>${esc(t.title)}</b><span>${esc(firstName(memberByEmail(t.created_by_email)?.name || 'Gestor'))} passou · ${esc(project(t.project_id)?.name || '')}${t.due_date ? ` · entregar até ${fmtDate(t.due_date)}` : ''}</span></div>
        </div>`).join('')}
      ${feed.length ? '<div class="ttl" style="padding-top:2px">Novidades nos seus serviços</div>' : ''}
      ${feed.map((x) => `
        <div class="notif" data-task="${x.t.id}">
          <span class="dot" style="background:var(--purple, #7c3aed)"></span>
          <div><b>${esc(x.t.title)}</b><span>${esc(firstName(memberByEmail(x.who)?.name || x.who))} ${esc(x.text)} · ${relTime(x.at)}</span></div>
        </div>`).join('')}
      ${fin.length ? '<div class="ttl" style="padding-top:2px">Concluídas</div>' : ''}
      ${fin.map((t) => `
        <div class="notif" data-task="${t.id}">
          <span class="dot" style="background:var(--ok)"></span>
          <div><b>${esc(firstName(member(t.assignee_id)?.name || ''))} concluiu ${esc(t.title)}</b><span>${esc(project(t.project_id)?.name || '')} · ${relTime(t.updated_at)}</span></div>
        </div>`).join('')}
      ${reqs.length ? '<div class="ttl" style="padding-top:2px">Para você decidir</div>' : ''}
      ${reqs.map((d) => `
        <div class="notif" data-task="${d.t.id}">
          <span class="dot" style="background:var(--primary)"></span>
          <div><b>${esc(d.label)}</b><span>${esc(d.t.title)} · ${esc(project(d.t.project_id)?.name || '')} · ${waitText(d.since)}</span></div>
        </div>`).join('')}
      ${reqs.length && items.length ? '<div class="ttl" style="padding-top:6px">Prazos</div>' : ''}
      ${(reqs.length || fin.length || nov.length || feed.length) && items.length && !reqs.length ? '<div class="ttl" style="padding-top:6px">Prazos</div>' : ''}
      ${items.length || reqs.length || fin.length || nov.length || feed.length ? items.map((t) => `
        <div class="notif" data-task="${t.id}">
          <span class="dot" style="background:${dueState(t) === 'late' ? 'var(--danger)' : 'var(--warn)'}"></span>
          <div><b>${esc(t.title)}</b><span>${esc(project(t.project_id)?.name || '')} · ${esc(dueText(t))}</span></div>
        </div>`).join('')
      : `<div class="notif" style="cursor:default"><span class="dot" style="background:var(--ok)"></span><div><b>Tudo em dia</b><span>Nenhuma atividade sua atrasada ou vencendo nos próximos ${DUE_SOON_DAYS} dias.</span></div></div>`}
    </div>
    ${perm === 'default' ? `<button class="btn btn-sm btn-block" id="enable-notif" style="margin-top:6px">${ic('bell')} Ativar notificações neste aparelho</button>` : ''}`;
  if (fin.length) markDoneSeen(fin.map((t) => t.id));
  if (nov.length) markNewSeen(nov.map((t) => t.id));
  if (feed.length) markFeedSeen(feed.map((x) => x.key));
  markBellSeen(bellKeys(late, soon, reqs));
  setTimeout(updateChrome, 0);
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
    <button class="menu-item" id="m-prof">${ic('user')} Meu perfil</button>
    ${isAdmin() ? `<button class="menu-item" id="m-dash">${ic('chart')} Painel do gestor</button>` : ''}
    ${perm === 'default' ? `<button class="menu-item" id="m-notif">${ic('bell')} Ativar notificações</button>` : ''}
    <button class="menu-item" id="m-out" style="color:var(--danger)">${ic('logout')} Sair</button>`,
  (el) => {
    $('#m-out', el).onclick = () => { closePopover(); logout(); };
    $('#m-prof', el).onclick = () => { closePopover(); location.hash = '#/perfil'; };
    const md = $('#m-dash', el); if (md) md.onclick = () => { closePopover(); location.hash = '#/painel'; };
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
    case 'modelos': return (location.hash = '#/inicio');
    case 'calendario': return viewCalendar();
    case 'perfil': return viewProfile();
    case 'painel': return isAdmin() ? viewDashboard() : (location.hash = '#/inicio');
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
  if (approvalOf(t) === 'pendente') return `<span class="due pend" title="Aguardando aprovação${t.suggested_due_date ? ' · data de entrega: ' + fmtDate(t.suggested_due_date, true) : ''}">${ic('clock')}<span>Em aprovação</span></span>`;
  if (approvalOf(t) === 'recusada') return `<span class="due late">${ic('x')}Recusada</span>`;
  const st = dueState(t);
  return `<span class="due ${st}" ${editable ? 'data-act="due" data-pop-anchor style="cursor:pointer"' : ''} title="${t.due_date ? fmtDate(t.due_date, true) : ''}">${ic('calendar')}<span>${esc(dueText(t))}</span></span>`;
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

// Subatividades
const subsOf = (taskId) => S.subtasks.filter((x) => x.task_id === taskId).sort((a, b) => (a.position - b.position) || a.created_at.localeCompare(b.created_at));
function subChip(t) {
  const list = subsOf(t.id);
  if (!list.length) return '';
  const done = list.filter((x) => x.done).length;
  return `<span class="sub-chip ${done === list.length ? 'all' : ''}" data-act="open" title="Subatividades concluídas">${ic('checksq')}${done}/${list.length}</span>`;
}

// Resumo curto da última atualização (uma linha só na lista)
function updPreview(body) {
  const lines = String(body || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const clean = (x) => x.replace(/^[^\p{L}\p{N}"]+/u, '').replace(/^(Feito|Falta)\s*:\s*/i, '');
  const feito = lines.find((x) => /^✅\s*Feito:/.test(x));
  const main = feito || lines.find((x) => !/^📊/.test(x)) || lines[0] || '';
  return clean(main);
}

// Última atualização escrita na atividade (aparece na lista, compacta)
function updateLine(t) {
  if (!isApproved(t)) return t.started_early ? `<div class="task-badges"><span class="dec-badge">Já iniciada</span></div>` : '';
  const lu = S.lastUpdate[t.id];
  const open = t.status !== 'concluido' && !!t.assignee_id;
  const ageH = lu ? (Date.now() - new Date(lu.created_at).getTime()) / 3600000 : Infinity;
  const days = Math.floor(ageH / 24);
  const stale = open && ageH > 24;
  const who = lu ? (memberByEmail(lu.author_email)?.name || lu.author_email) : '';
  const dueReq = S.dueRequests.find((r) => r.task_id === t.id && r.status === 'pendente');
  const badges = [
    t.hold ? `<span class="hold-badge" title="${esc(t.hold_note || '')}"><svg class="pause-ic" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1" width="2.4" height="8" rx=".8"/><rect x="6.1" y="1" width="2.4" height="8" rx=".8"/></svg>${esc(HOLDS[t.hold] || t.hold)}</span>` : '',
    dueReq ? `<span class="dec-badge">📅 Novo prazo pedido</span>` : '',
  ].join('');
  const staleTxt = stale ? (lu ? `sem atualização há ${days <= 1 ? '1 dia' : days + ' dias'}` : 'sem atualização') : '';
  const cc = S.commentCounts[t.id] || 0;
  const btn = cc ? `<button type="button" class="upd-btn" data-act="comments" data-pop-anchor title="${lu ? `Última: ${esc(firstName(who))}, ${relTime(lu.created_at)}` : 'Ver atualizações'}">${ic('msg')}Atualizações<span class="n">${cc}</span></button>` : '';
  if (!btn && !badges && !staleTxt) return '';
  return `<div class="task-upd-wrap"><div class="task-badges">${btn}${badges}${staleTxt ? `<span class="upd-stale">${staleTxt}</span>` : ''}</div></div>`;
}

function taskRow(t, { color, showProject }) {
  const ed = canEditTask(t);
  const adm = canPlanTask(t);
  const p = project(t.project_id);
  const cc = S.commentCounts[t.id] || 0;
  return `
  <div class="tr" data-id="${t.id}" style="--gc:${color}">
    <div class="td col-title" data-act="open" title="Abrir ${esc(t.title)}">
      <div style="min-width:0;flex:1">
        <div class="task-title" title="${esc(t.title)}">${esc(t.title)}</div>
        ${showProject && p ? `<div class="task-proj"><i style="background:${esc(p.color)}"></i>${esc(p.name)}</div>` : ''}
        ${updateLine(t)}
      </div>
      ${subChip(t)}
      ${canEditTask(t) && isApproved(t) && t.status !== 'concluido' ? `<button class="upd-mini" data-act="update" title="Escrever atualização do dia" aria-label="Atualização do dia">${ic('plus')}</button>` : ''}
      <span data-act="open" style="display:flex;cursor:pointer">${ic('open', 'open-ic')}</span>
    </div>
    <div class="td col-who">${whoCell(t)}</div>
    <div class="td col-status">${hasStages(t) ? stagePill(t) : statusPill(t, ed)}</div>
    <div class="td c col-due">${dueChip(t, adm)}</div>
    <div class="td col-prog">${progBar(t, false)}</div>
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
          <div class="td">Atividade</div><div class="td"><span class="h-long">Responsável</span><span class="h-short">Resp.</span></div><div class="td">Status</div>
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
    else if (act === 'update') dailyUpdate(t);
    else if (act === 'comments') popComments(actEl, t);
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
    `<button class="pill editable pill-range" data-v="${k}" style="background:${STATUS[k].color}">${STATUS[k].label}<small>${statusRange(k)}</small></button>`).join('')}</div>`,
  (el) => $$('[data-v]', el).forEach((b) => (b.onclick = async () => {
    closePopover();
    if (b.dataset.v === 'concluido' && !(await confirmConclusion(t))) return;
    updateTask(t.id, { status: b.dataset.v });
  })),
  { width: 230 });
  el.anchor = anchor;
}
// Separa uma atualização em "Feito", "Falta" e o resto (status, comentários livres)
function parseUpd(body) {
  const out = { feito: [], falta: [], outro: [] };
  let cur = 'outro';
  for (const raw of String(body || '').split('\n')) {
    let line = raw;
    const mF = line.match(/^\s*(?:✅\s*)?feito\s*:\s*/i), mT = line.match(/^\s*(?:⏳\s*)?falta\s*:\s*/i);
    if (mF) { cur = 'feito'; line = line.slice(mF[0].length); }
    else if (mT) { cur = 'falta'; line = line.slice(mT[0].length); }
    else if (/^\s*(📊|🏁)/.test(line)) cur = 'outro';
    if (line.trim()) out[cur].push(line.trim());
  }
  return { feito: out.feito.join('\n'), falta: out.falta.join('\n'), outro: out.outro.join('\n') };
}

// Atualizações num balão abaixo do botão (sem abrir o painel), separadas em Feito / Falta / Todas
async function popComments(anchor, t, startTab = 'feito') {
  const el = openPopover(anchor, `<div class="pc-head"><b>${esc(t.title)}</b><span class="muted small">Atualizações e comentários</span></div>
    <div class="pc-tabs" role="tablist">
      <button type="button" class="pc-tab feito" data-tab="feito">${ic('check')}Feito <span class="n">·</span></button>
      <button type="button" class="pc-tab falta" data-tab="falta">${ic('clock')}Falta <span class="n">·</span></button>
      <button type="button" class="pc-tab todas" data-tab="todas">Todas</button>
    </div>
    <div class="pc-list"><div class="muted small" style="padding:10px">Carregando…</div></div>
    ${canEditTask(t) ? `<div class="pc-form"><textarea class="textarea" rows="2" placeholder="Escrever um comentário…" id="pc-body"></textarea><button class="btn btn-sm btn-primary" id="pc-send">Enviar</button></div>` : ''}
    <button class="btn btn-sm btn-ghost btn-block" id="pc-open">Abrir atividade</button>`,
  (root) => {
    $('#pc-open', root).onclick = () => { closePopover(); openTask(t.id); };
    $$('.pc-tab', root).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); }));
    const send = $('#pc-send', root);
    if (send) send.onclick = async () => {
      const body = $('#pc-body', root).value.trim();
      if (!body) return;
      send.disabled = true;
      try {
        await q(sb.from('task_comments').insert({ task_id: t.id, body, author_email: S.me.email }));
        $('#pc-body', root).value = '';
        await reloadLastUpdates();
        tab = 'todas';
        await load();
        refresh();
      } catch (e) { toastErr(e); }
      send.disabled = false;
    };
  }, { width: 360 });
  el.anchor = anchor;
  let tab = startTab, rows = [], top0 = null;
  const who = (email) => memberByEmail(email) || { name: email, email };
  const item = (c, text, cls = '') => {
    const m = who(c.author_email);
    return `<div class="pc-item ${cls}">${avatar(m)}
      <div class="pc-tx"><div><b>${esc(m.name)}</b> <span class="muted small">${relTime(c.created_at)}</span></div><p>${esc(text)}</p></div></div>`;
  };
  const render = () => {
    const list = $('.pc-list', el);
    if (!list) return;
    const subs = subsOf(t.id);
    const subDone = subs.filter((x) => x.done), subTodo = subs.filter((x) => !x.done);
    const parsed = rows.map((c) => ({ c, p: parseUpd(c.body) }));
    const feitos = parsed.filter((x) => x.p.feito);
    const ultFalta = parsed.find((x) => x.p.falta);   // a mais recente que diz o que falta
    const nFeito = subDone.length + feitos.length;
    const nFalta = t.status === 'concluido' ? 0 : subTodo.length + (ultFalta ? 1 : 0);
    $('.pc-tab.feito .n', el).textContent = nFeito;
    $('.pc-tab.falta .n', el).textContent = nFalta;
    $$('.pc-tab', el).forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const subList = (arr, done) => arr.length ? `<div class="pc-sec">Subatividades</div><ul class="pc-subs ${done ? 'done' : ''}">${arr.map((x) => `<li>${esc(x.title)}</li>`).join('')}</ul>` : '';
    let html = '';
    if (tab === 'feito') {
      html = subList(subDone, true)
        + (feitos.length ? `${subDone.length ? '<div class="pc-sec">Atualizações</div>' : ''}${feitos.map((x) => item(x.c, x.p.feito, 'feito')).join('')}` : '');
      if (!html) html = '<div class="pc-empty">Ainda não há nada marcado como feito.</div>';
    } else if (tab === 'falta') {
      if (t.status === 'concluido') html = '<div class="pc-empty">Atividade concluída: não falta nada. ✅</div>';
      else {
        html = subList(subTodo, false)
          + (ultFalta ? `${subTodo.length ? '<div class="pc-sec">Última atualização</div>' : ''}${item(ultFalta.c, ultFalta.p.falta, 'falta')}` : '');
        if (!html) html = '<div class="pc-empty">Ninguém informou o que falta ainda.</div>';
      }
    } else {
      html = rows.length ? rows.map((c) => item(c, c.body)).join('') : '<div class="pc-empty">Nenhum comentário.</div>';
    }
    list.innerHTML = html;
    // reposiciona se o balão passou da parte de baixo da tela
    if (top0 == null) top0 = el.style.top; else el.style.top = top0;
    const r = el.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) { const ar = anchor.getBoundingClientRect(); el.style.top = Math.max(8, Math.min(ar.top - r.height - 6, innerHeight - r.height - 8)) + 'px'; }
  };
  const load = async () => {
    const list = $('.pc-list', el);
    if (!list) return;
    try {
      rows = await q(sb.from('task_comments').select('*').eq('task_id', t.id).order('created_at', { ascending: false }).limit(60));
      render();
    } catch (e) { list.innerHTML = `<div class="err" style="padding:10px">${esc(e.message || 'Erro ao carregar')}</div>`; }
  };
  load();
}

// Confirmação antes de concluir (depois de concluída, só o gestor reabre)
function confirmConclusion(t) {
  const falta = subsOf(t.id).filter((x) => !x.done).length;
  return confirmDialog(`Confirmar a conclusão de <b>${esc(t.title)}</b>?<br/><br/>
    ${falta ? `<span style="color:var(--warn)">Ainda há ${falta} subatividade${falta > 1 ? 's' : ''} não marcada${falta > 1 ? 's' : ''}.</span><br/><br/>` : ''}
    <span class="muted small">Depois de concluída, a atividade fica travada: não dá para mudar o status, nem adicionar subatividades ou atualizações. Só um administrador pode reabrir.</span>`,
    { okText: 'Confirmar conclusão', title: 'Concluir atividade' });
}
const isLocked = (t) => t?.status === 'concluido' && !isAdmin();
function popPriority(anchor, t) {
  const el = openPopover(anchor, `<div class="opt-list">${Object.entries(PRIORITY).map(([k, v]) =>
    `<button class="pill editable" data-v="${k}" style="background:${v.color}">${v.label}</button>`).join('')}</div>`,
  (el) => $$('[data-v]', el).forEach((b) => (b.onclick = () => { closePopover(); updateTask(t.id, { priority: b.dataset.v }); })),
  { width: 180 });
  el.anchor = anchor;
}
function popProgress(anchor, t) {
  const el = openPopover(anchor, `
    <div class="ttl">Progresso: <b id="pv">${t.progress}%</b> · <span id="ps">${STATUS[statusForProgress(t.progress)].label}</span></div>
    <input type="range" min="0" max="100" step="5" value="${t.progress}" id="pr" />
    <div class="quick">${[0, 10, 50, 85, 100].map((v) => `<button data-v="${v}" title="${STATUS[statusForProgress(v)].label}">${v}%</button>`).join('')}</div>`,
  (el) => {
    const r = $('#pr', el);
    r.oninput = () => { $('#pv', el).textContent = r.value + '%'; $('#ps', el).textContent = STATUS[statusForProgress(Number(r.value))].label; };
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
// ETAPAS (modelos de etapas e avanço por etapa)
// ---------------------------------------------------------------------
const HOLDS = {
  '': 'Sem impedimento',
  cliente: 'Aguardando cliente',
  fornecedor: 'Aguardando fornecedor',
  interno: 'Aguardando informação interna',
  bloqueado: 'Bloqueado',
};
const SIZES = { P: { label: 'Pequena', w: 1 }, M: { label: 'Média', w: 2 }, G: { label: 'Grande', w: 3 } };
const hasStages = () => false;   // etapas desativadas: só status + % e subatividades
const typeById = (id) => S.types.find((x) => x.id === id);
const activeTypes = () => S.types.filter((x) => x.active).sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name));

// Progresso automático: por etapas ou, na atividade Livre, pelas subatividades
const autoProg = (t) => hasStages(t) || (!!t.id && subsOf(t.id).length > 0);
// Subatividades que faltam numa etapa
const subsPendingIn = (t, stageName) => subsOf(t.id).filter((x) => x.stage_name === stageName && !x.done).length;
async function reloadTask(id) {
  try {
    const { data } = await sb.from('tasks').select('*').eq('id', id).single();
    if (data) { upsertLocal(S.tasks, data); S.onTaskChanged?.(); scheduleRefresh(); }
  } catch (e) { console.warn(e); }
}
function stageInfo(t) {
  const list = hasStages(t) ? t.stages : [];
  const next = list.findIndex((x) => !x.done_at);
  const pend = list.findIndex((x) => x.requested_at && !x.done_at);
  return { list, next, pend, done: list.filter((x) => x.done_at).length, all: list.length > 0 && next === -1 };
}
function copyStages(type) {
  return (type?.stages || []).map((x) => ({ name: x.name, pct: Number(x.pct), confirm: false }));
}
function sameStructure(a, b) {
  const k = (l) => JSON.stringify((l || []).map((x) => [x.name, Number(x.pct), !!x.confirm]));
  return k(a) === k(b);
}
function distributeStages(list) {
  const n = list.length;
  return list.map((x, i) => ({ ...x, pct: i === n - 1 ? 100 : Math.round(((i + 1) / n) * 100) }));
}
// Remove uma etapa e redistribui o "peso" dela proporcionalmente entre as outras
function removeStageAt(list, idx) {
  const inc = list.map((x, i) => Number(x.pct) - (i ? Number(list[i - 1].pct) : 0));
  const rest = list.filter((_, i) => i !== idx);
  const restInc = inc.filter((_, i) => i !== idx);
  const total = restInc.reduce((a, b) => a + b, 0);
  if (!rest.length) return [];
  if (total <= 0) return distributeStages(rest);
  let acc = 0;
  return rest.map((x, i) => {
    acc += restInc[i];
    return { ...x, pct: i === rest.length - 1 ? 100 : Math.max(1, Math.round((acc / total) * 100)) };
  });
}
function validateStages(list) {
  if (!list.length) return 'Inclua pelo menos uma etapa.';
  let prev = 0;
  for (const [i, x] of list.entries()) {
    if (!String(x.name || '').trim()) return `Dê um nome para a etapa ${i + 1}.`;
    const p = Number(x.pct);
    if (!Number.isFinite(p) || p <= prev || p > 100) return `A % da etapa "${x.name}" precisa ser maior que a da etapa anterior (${prev}%) e no máximo 100%.`;
    prev = p;
  }
  if (prev !== 100) return 'A última etapa precisa valer 100%.';
  return '';
}
function weightedProgress(list) {
  let sw = 0, sp = 0;
  for (const t of list) { const w = SIZES[t.size || 'M']?.w || 2; sw += w; sp += w * (t.progress || 0); }
  return sw ? Math.round(sp / sw) : 0;
}
function stageColors(color, n) {
  return Array.from({ length: n }, (_, i) => `color-mix(in srgb, ${color} ${Math.round(35 + (65 * (i + 1)) / n)}%, white)`);
}

// Editor de etapas (usado nos modelos e para ajustar uma atividade)
function stageEditor(box, initial, { color = '#1d4ed8', onChange } = {}) {
  let list = (initial || []).map((x) => ({ ...x, pct: Number(x.pct) }));
  const changed = () => { onChange?.(list); };
  const bar = () => {
    const cols = stageColors(color, list.length);
    return list.map((x, i) => `<i style="width:${Math.max(0, Number(x.pct) - (i ? Number(list[i - 1].pct) : 0))}%;background:${cols[i]}" title="${esc(x.name)}: ${x.pct}%"></i>`).join('');
  };
  const refreshMeta = () => {
    $('.stg-bar', box).innerHTML = bar();
    $('.stg-err', box).textContent = list.length ? validateStages(list) : '';
  };
  const render = () => {
    box.innerHTML = `
      <div class="stg-bar">${bar()}</div>
      <div class="stg-list">
        ${list.map((x, i) => `<div class="stg-row" data-i="${i}">
          <div class="stg-mv"><button type="button" class="btn btn-ghost btn-sm" data-up ${i ? '' : 'disabled'} title="Subir">▲</button><button type="button" class="btn btn-ghost btn-sm" data-down ${i < list.length - 1 ? '' : 'disabled'} title="Descer">▼</button></div>
          <input class="input stg-name" value="${esc(x.name)}" placeholder="Nome da etapa" />
          <div class="stg-pct"><input class="input" type="number" min="1" max="100" step="1" value="${x.pct}" /><span>%</span></div>
          ${x.done_at ? `<span class="stg-done" title="Etapa já concluída">${ic('check')}</span>` : ''}
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-del title="Remover etapa">${ic('x')}</button>
        </div>`).join('')}
      </div>
      <div class="stg-actions">
        <button type="button" class="btn btn-sm" data-add>${ic('plus')} Etapa</button>
        <button type="button" class="btn btn-sm" data-eq>Distribuir igualmente</button>
        <span class="small muted">Para cada etapa: "quando ela termina, quanto da atividade está pronto?"</span>
      </div>
      <div class="err stg-err"></div>`;
    $$('.stg-row', box).forEach((row) => {
      const i = Number(row.dataset.i);
      $('.stg-name', row).oninput = (e) => { list[i].name = e.target.value; refreshMeta(); changed(); };
      $('.stg-pct input', row).oninput = (e) => { list[i].pct = Number(e.target.value); refreshMeta(); changed(); };
      $('[data-up]', row).onclick = () => { if (i) { const nm = list[i].name; list[i].name = list[i - 1].name; list[i - 1].name = nm; const c = list[i].confirm; list[i].confirm = list[i - 1].confirm; list[i - 1].confirm = c; render(); changed(); } };
      $('[data-down]', row).onclick = () => { if (i < list.length - 1) { const nm = list[i].name; list[i].name = list[i + 1].name; list[i + 1].name = nm; const c = list[i].confirm; list[i].confirm = list[i + 1].confirm; list[i + 1].confirm = c; render(); changed(); } };
      $('[data-del]', row).onclick = () => { list = removeStageAt(list, i); render(); changed(); };
    });
    $('[data-add]', box).onclick = () => {
      const n = list.length;
      if (!n) list = [{ name: '', pct: 100, confirm: false }];
      else {
        const prevPrev = n > 1 ? Number(list[n - 2].pct) : 0;
        list[n - 1] = { ...list[n - 1], pct: Math.max(prevPrev + 1, Math.round((prevPrev + 100) / 2)) };
        list.push({ name: '', pct: 100, confirm: false });
      }
      render(); changed();
      $$('.stg-name', box).pop()?.focus();
    };
    $('[data-eq]', box).onclick = () => { list = distributeStages(list); render(); changed(); };
    refreshMeta();
  };
  render();
  return { get: () => list.map((x) => ({ ...x, name: String(x.name).trim(), pct: Number(x.pct) })), validate: () => validateStages(list) };
}

// Barra de etapas (somente leitura)
function stepperHtml(t) {
  const { list, next, pend } = stageInfo(t);
  return `<div class="stepper">${list.map((x, i) => {
    const st = x.done_at ? 'done' : i === pend ? 'pend' : i === next ? 'cur' : 'todo';
    return `<div class="stp ${st}" title="${esc(x.name)}${x.done_at ? ' — concluída em ' + new Date(x.done_at).toLocaleDateString('pt-BR') : ''}">
      <div class="stp-dot">${x.done_at ? ic('check') : i + 1}</div>
      <div class="stp-name">${esc(x.name)}</div>
      <div class="stp-pct">${x.pct}%</div></div>`;
  }).join('')}</div>`;
}

// Pílula da etapa atual (aparece na coluna Status)
function stagePill(t) {
  const { list, next, pend, all } = stageInfo(t);
  let label, color;
  if (all) { label = 'Concluído'; color = STATUS.concluido.color; }
  else if (pend >= 0) { label = `Confirmar: ${list[pend].name}`; color = STATUS.em_revisao.color; }
  else if (next === 0) { label = `${list[0].name}`; color = STATUS.nao_iniciado.color; }
  else { label = `${list[next].name}`; color = STATUS.em_andamento.color; }
  return `<button class="pill editable pill-stage" data-act="open" style="background:${color}" title="${next === 0 && !all ? 'A iniciar: ' : ''}${esc(label)} — ${t.progress}%">${esc(label)}</button>`;
}

// Decisões que estão esperando por mim (aprovar, confirmar etapa, novo prazo)
// Decisões de etapa/prazo vão para quem passou; se ele não for mais admin, para todos os admins
function decidesFor(t) {
  if (!isAdmin()) return false;
  if (t.created_by_email === S.me.email) return true;
  return !S.members.some((m) => m.email === t.created_by_email && m.role === 'admin' && m.active);
}
// Atividades concluídas por outra pessoa (aviso para o admin que passou)
const SEEN_KEY = 'ga-seen-done';
function seenDone() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } }
function finishedForMe() {
  if (!isAdmin()) return [];
  const seen = seenDone();
  const limit = Date.now() - 7 * 86400000;
  return S.tasks.filter((t) => t.status === 'concluido' && isApproved(t) && activeProject(t) && decidesFor(t)
      && t.assignee_id && t.assignee_id !== S.me.id && new Date(t.updated_at || 0).getTime() > limit && !seen[t.id])
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}
function markDoneSeen(ids) {
  const seen = seenDone();
  const limit = Date.now() - 30 * 86400000;
  for (const k of Object.keys(seen)) if (seen[k] < limit) delete seen[k];
  ids.forEach((id) => (seen[id] = Date.now()));
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {}
}
// Serviços novos passados para mim (aviso para o colaborador)
const SEEN_NEW_KEY = 'ga-seen-new';
function seenNew() { try { return JSON.parse(localStorage.getItem(SEEN_NEW_KEY) || '{}'); } catch { return {}; } }
function newForMe() {
  if (!S.me) return [];
  const seen = seenNew();
  const limit = Date.now() - 7 * 86400000;
  return S.tasks.filter((t) => t.assignee_id === S.me.id && isApproved(t) && t.status !== 'concluido' && activeProject(t)
      && t.created_by_email !== S.me.email && new Date(t.approved_at || t.created_at || 0).getTime() > limit && !seen[t.id])
    .sort((a, b) => (b.approved_at || b.created_at || '').localeCompare(a.approved_at || a.created_at || ''));
}
function markNewSeen(ids) {
  const seen = seenNew();
  const limit = Date.now() - 30 * 86400000;
  for (const k of Object.keys(seen)) if (seen[k] < limit) delete seen[k];
  ids.forEach((id) => (seen[id] = Date.now()));
  try { localStorage.setItem(SEEN_NEW_KEY, JSON.stringify(seen)); } catch {}
}
function checkAssigned(p) {
  const n = p.new;
  if (!n || !S.me || n.assignee_id !== S.me.id || (n.approval || 'aprovada') !== 'aprovada' || n.created_by_email === S.me.email) return;
  const prev = p.eventType === 'UPDATE' ? task(n.id) : null;
  if (p.eventType === 'UPDATE' && prev && prev.assignee_id === S.me.id && (prev.approval || 'aprovada') === 'aprovada') return;
  if (p.eventType !== 'INSERT' && p.eventType !== 'UPDATE') return;
  const by = memberByEmail(n.created_by_email)?.name || 'O gestor';
  const proj = project(n.project_id)?.name || '';
  toast(`📌 Serviço novo para você: "${n.title}"`, 'ok');
  if ('Notification' in window && Notification.permission === 'granted') {
    const title = 'Serviço novo para você';
    const body = `${firstName(by)} passou "${n.title}"${proj ? ` (${proj})` : ''}${n.due_date ? ` · entregar até ${fmtDate(n.due_date, true)}` : ''}.`;
    navigator.serviceWorker?.getRegistration().then((reg) => reg
      ? reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'new-' + n.id })
      : new Notification(title, { body, icon: 'icons/icon-192.png' })).catch(() => {});
  }
}
// Novidades nos meus serviços: itens (subatividades) e avisos/comentários que outra pessoa colocou
const SEEN_FEED_KEY = 'ga-seen-feed';
function seenFeed() { try { return JSON.parse(localStorage.getItem(SEEN_FEED_KEY) || '{}'); } catch { return {}; } }
function feedForMe() {
  if (!S.me) return [];
  const seen = seenFeed();
  const limit = Date.now() - 7 * 86400000;
  const mine = (taskId) => { const t = task(taskId); return t && t.assignee_id === S.me.id && isApproved(t) && t.status !== 'concluido' && activeProject(t) ? t : null; };
  const out = [];
  for (const x of S.subtasks) {
    const t = mine(x.task_id);
    if (!t || x.done || !x.created_by_email || x.created_by_email === S.me.email) continue;
    if (new Date(x.created_at).getTime() < limit || new Date(x.created_at) <= new Date(t.approved_at || t.created_at)) continue;
    out.push({ key: 's' + x.id, t, who: x.created_by_email, text: `adicionou "${x.title}"`, at: x.created_at });
  }
  for (const c of S.recentComments || []) {
    const t = mine(c.task_id);
    if (!t || c.author_email === S.me.email || new Date(c.created_at).getTime() < limit) continue;
    out.push({ key: 'c' + c.id, t, who: c.author_email, text: `escreveu: ${c.body.replace(/\s+/g, ' ').slice(0, 80)}`, at: c.created_at });
  }
  return out.filter((x) => !seen[x.key]).sort((a, b) => b.at.localeCompare(a.at));
}
function markFeedSeen(keys) {
  const seen = seenFeed();
  const limit = Date.now() - 30 * 86400000;
  for (const k of Object.keys(seen)) if (seen[k] < limit) delete seen[k];
  keys.forEach((k) => (seen[k] = Date.now()));
  try { localStorage.setItem(SEEN_FEED_KEY, JSON.stringify(seen)); } catch {}
}
function deviceNotify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  navigator.serviceWorker?.getRegistration().then((reg) => reg
    ? reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag })
    : new Notification(title, { body, icon: 'icons/icon-192.png' })).catch(() => {});
}
function feedNotify(t, who, what, tag) {
  const name = firstName(memberByEmail(who)?.name || who);
  toast(`🔔 ${name} ${what} em "${t.title}"`, 'ok');
  deviceNotify(`Novidade em "${t.title}"`, `${name} ${what}`, tag);
  setTimeout(updateChrome, 0);
}
function checkFeedSub(p) {
  const n = p.new;
  if (p.eventType !== 'INSERT' || !n || !S.me || !n.created_by_email || n.created_by_email === S.me.email) return;
  const t = task(n.task_id);
  if (!t || t.assignee_id !== S.me.id || !isApproved(t)) return;
  feedNotify(t, n.created_by_email, `adicionou "${n.title}"`, 'sub-' + n.id);
}
function checkFeedComment(c) {
  if (!S.me || c.author_email === S.me.email) return;
  const t = task(c.task_id);
  if (!t || t.assignee_id !== S.me.id || !isApproved(t)) return;
  feedNotify(t, c.author_email, `escreveu um aviso`, 'cmt-' + c.id);
}
function checkFinished(p) {
  const n = p.new;
  if (!n || p.eventType !== 'UPDATE' || n.status !== 'concluido') return;
  const prev = task(n.id);
  if (!prev || prev.status === 'concluido' || !isAdmin() || !decidesFor(n) || n.assignee_id === S.me?.id) return;
  const who = member(n.assignee_id)?.name || 'O responsável';
  const proj = project(n.project_id)?.name || '';
  toast(`✅ ${firstName(who)} concluiu "${n.title}"`, 'ok');
  if ('Notification' in window && Notification.permission === 'granted') {
    const title = 'Atividade concluída';
    const body = `${who} concluiu "${n.title}"${proj ? ` (${proj})` : ''}.`;
    navigator.serviceWorker?.getRegistration().then((reg) => reg
      ? reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'done-' + n.id })
      : new Notification(title, { body, icon: 'icons/icon-192.png' })).catch(() => {});
  }
}
function myDecisions() {
  const out = [];
  if (isAdmin()) pendingRequests().forEach((t) => out.push({ t, kind: 'aprovar', label: 'Aprovar solicitação', since: t.created_at }));
  S.dueRequests.filter((r) => r.status === 'pendente').forEach((r) => {
    const t = task(r.task_id);
    if (t && activeProject(t) && decidesFor(t)) out.push({ t, kind: 'prazo', label: `Novo prazo: ${fmtDate(r.old_due) || 'sem prazo'} → ${fmtDate(r.new_due)}`, since: r.created_at });
  });
  return out.sort((a, b) => (a.since || '').localeCompare(b.since || ''));
}
function waitText(since) {
  if (!since) return '';
  const h = (Date.now() - new Date(since).getTime()) / 3600000;
  return h > 24 ? `<span style="color:var(--danger);font-weight:600">esperando há ${Math.floor(h / 24)} dia(s)</span>` : relTime(since);
}

// ---------------------------------------------------------------------
// TELA: Modelos de etapas (só administradores)
// ---------------------------------------------------------------------
function viewModels() {
  if (!isAdmin()) { location.hash = '#/inicio'; return; }
  setTitle('Modelos de etapas', '#/equipe');
  document.title = `Modelos de etapas · ${APP_NAME}`;
  const used = (id) => S.tasks.filter((t) => t.type_id === id).length;
  const list = [...S.types].sort((a, b) => (b.active - a.active) || (a.position - b.position) || a.name.localeCompare(b.name));
  $('#view').innerHTML = `
    <div class="page-head">
      <div class="t"><h1>Modelos de etapas</h1><p>Cada tipo de atividade tem suas etapas e quanto da atividade fica pronto ao concluir cada uma. Ao criar uma atividade, as etapas do modelo são copiadas para ela e podem ser ajustadas só nela.</p></div>
      <div class="actions"><button class="btn btn-primary" id="new-type">${ic('plus')} Novo modelo</button></div>
    </div>
    <div class="grid-cards">
      ${list.map((ty) => {
        const cols = stageColors(ty.color, ty.stages.length);
        return `<div class="pcard" style="--c:${esc(ty.color)};${ty.active ? '' : 'opacity:.55'}" data-type="${ty.id}">
          <div style="display:flex;align-items:center;gap:8px"><h3 style="flex:1">${esc(ty.name)}</h3>${ty.active ? '' : '<span class="archived-tag">Inativo</span>'}</div>
          <div class="stg-bar">${ty.stages.map((x, i) => `<i style="width:${x.pct - (i ? ty.stages[i - 1].pct : 0)}%;background:${cols[i]}"></i>`).join('')}</div>
          <div class="type-steps">${ty.stages.map((x) => `<span>${esc(x.name)} <b>${x.pct}%</b></span>`).join('<i>→</i>')}</div>
          <div class="meta"><span>${used(ty.id)} atividade(s) usando</span></div>
        </div>`;
      }).join('')}
      <div class="pcard" style="--c:#a8adba;cursor:default"><h3>Livre</h3><p>Sem etapas: o progresso é informado manualmente. Bom para coisas rápidas e avulsas.</p></div>
    </div>
`;
  $('#new-type').onclick = () => typeModal();
  $$('[data-type]').forEach((c) => (c.onclick = () => typeModal(typeById(c.dataset.type))));
}

function typeModal(ty = null) {
  let color = ty?.color || PROJECT_COLORS[S.types.length % PROJECT_COLORS.length];
  let editor;
  openModal({
    title: ty ? 'Editar modelo' : 'Novo modelo de etapas',
    body: `
      <div class="field"><label>Nome do tipo de atividade</label><input class="input" id="ty-name" value="${esc(ty?.name || '')}" placeholder="Ex.: Campo / Montagem" /></div>
      <div class="field"><label>Cor</label><div style="display:flex;gap:8px;flex-wrap:wrap" id="ty-col">
        ${PROJECT_COLORS.map((c) => `<button type="button" data-c="${c}" style="width:28px;height:28px;border-radius:8px;border:3px solid ${c === color ? '#1f2430' : 'transparent'};background:${c}"></button>`).join('')}</div></div>
      <div class="field"><label>Etapas (em ordem)</label><div id="ty-stages"></div></div>
      ${ty ? `<label class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" id="ty-active" ${ty.active ? 'checked' : ''}/> Modelo ativo (aparece ao criar atividades)</label>
      <p class="small muted" style="margin:0">Alterar o modelo não muda as atividades que já existem: elas guardam a própria cópia das etapas.</p>` : ''}
      <div class="err" id="ty-err"></div>`,
    foot: `${ty ? `<button class="btn btn-danger" id="ty-del" style="margin-right:auto">Excluir</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="ty-save">Salvar modelo</button>`,
    onMount: ({ el, close }) => {
      el.querySelector('.modal').style.maxWidth = '640px';
      editor = stageEditor($('#ty-stages', el), ty?.stages?.length ? ty.stages : [
        { name: 'Início', pct: 30, confirm: false }, { name: 'Execução', pct: 80, confirm: false }, { name: 'Entrega', pct: 100, confirm: false }], { color });
      $$('[data-c]', el).forEach((b) => (b.onclick = () => {
        color = b.dataset.c;
        $$('[data-c]', el).forEach((x) => (x.style.borderColor = x.dataset.c === color ? '#1f2430' : 'transparent'));
      }));
      $('#ty-save', el).onclick = async () => {
        const name = $('#ty-name', el).value.trim();
        const stages = editor.get().map(({ name: n, pct, confirm }) => ({ name: n, pct, confirm: false }));
        const err = !name ? 'Dê um nome ao modelo.' : validateStages(stages);
        if (err) { $('#ty-err', el).textContent = err; return; }
        const fields = { name, color, stages, active: ty ? $('#ty-active', el).checked : true };
        if (!ty) fields.position = Math.max(0, ...S.types.map((x) => x.position)) + 1;
        try {
          const row = ty
            ? await q(sb.from('activity_types').update(fields).eq('id', ty.id).select().single())
            : await q(sb.from('activity_types').insert(fields).select().single());
          upsertLocal(S.types, row);
          close(); toast('Modelo salvo', 'ok'); viewModels();
        } catch (e) { $('#ty-err', el).textContent = translateError(e.message); }
      };
      $('#ty-del', el)?.addEventListener('click', async () => {
        const n = S.tasks.filter((t) => t.type_id === ty.id).length;
        const ok = await confirmDialog(n
          ? `<b>${n}</b> atividade(s) usam este modelo. Elas continuam com as etapas delas. Excluir mesmo assim? (Dica: você pode só desativar.)`
          : `Excluir o modelo <b>${esc(ty.name)}</b>?`, { okText: 'Excluir', danger: true, title: 'Excluir modelo' });
        if (!ok) return;
        try {
          await q(sb.from('activity_types').delete().eq('id', ty.id));
          S.types = S.types.filter((x) => x.id !== ty.id);
          close(); viewModels();
        } catch (e) { toastErr(e); }
      });
    },
  });
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
    const avg = weightedProgress(ts);
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
        <div class="pc-prog" title="${avg}% concluído"><div class="bar"><i style="width:${avg}%;background:${avg >= 100 ? 'var(--ok)' : 'var(--primary)'}"></i></div><b>${avg}%</b></div>
        <div class="meta">
          <span>${total} ${total === 1 ? 'atividade' : 'atividades'}</span>
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
    ${(() => { const dec = myDecisions(); return dec.length ? `<div class="alert warn" style="display:block">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">${ic('clock')}<b>${dec.length} ${dec.length > 1 ? 'itens' : 'item'} para você decidir</b></div>
      ${dec.slice(0, 8).map((d) => `<div class="notif" data-req="${d.t.id}" style="padding:7px 8px;background:rgba(255,255,255,.6);margin-top:4px">
        <span class="dot" style="background:var(--warn)"></span><div><b>${esc(d.label)}</b><span>${esc(d.t.title)} · ${esc(project(d.t.project_id)?.name || '')} · ${waitText(d.since)}</span></div></div>`).join('')}
    </div>` : ''; })()}
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

  const avg = weightedProgress(allTs.filter(isApproved));

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
            ${updateLine(t, true)}
            ${progBar(t, false)}
            ${subChip(t) ? `<div style="margin-top:6px">${subChip(t)}</div>` : ''}
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
      ${true ? `<select class="select" id="f-group" ${mode === 'table' ? '' : 'style="visibility:hidden" tabindex="-1" aria-hidden="true"'}>
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
// Lista de subatividades dentro do painel da atividade
function mountSubtasks(el, t, canEd) {
  const box = $('#subs-box', el);
  if (!box) return;
  const members = S.members.filter((m) => m.active);
  const subRow = (x, stageOpts) => {
    const m = member(x.assignee_id);
    const late = !x.done && x.due_date && daysUntil(x.due_date) < 0;
    return `<div class="sub ${x.done ? 'done' : ''}" data-sid="${x.id}">
      <input type="checkbox" class="sub-ck" ${x.done ? 'checked' : ''} ${canEd ? '' : 'disabled'} />
      <div class="sub-main">
        <input class="sub-title" value="${esc(x.title)}" ${canEd ? '' : 'disabled'} />
        <div class="sub-meta">
          <select class="sub-who" ${canEd ? '' : 'disabled'} title="Responsável">
            <option value="">Sem responsável</option>
            ${members.map((mm) => `<option value="${mm.id}" ${mm.id === x.assignee_id ? 'selected' : ''}>${esc(mm.name)}</option>`).join('')}
            ${m && !m.active ? `<option value="${m.id}" selected>${esc(m.name)}</option>` : ''}
          </select>
          <input type="date" class="sub-due ${late ? 'late' : ''}" value="${x.due_date || ''}" ${canEd ? '' : 'disabled'} title="Prazo" />
          ${stageOpts ? `<select class="sub-stage" ${canEd ? '' : 'disabled'} title="Etapa">${stageOpts.map((o) => `<option value="${esc(o)}" ${o === x.stage_name ? 'selected' : ''}>${esc(o)}</option>`).join('')}${stageOpts.includes(x.stage_name) ? '' : '<option value="" selected>Sem etapa</option>'}</select>` : ''}
        </div>
      </div>
      ${canEd ? `<button class="btn btn-ghost btn-icon btn-sm sub-del" title="Excluir subatividade">${ic('x')}</button>` : ''}
    </div>`;
  };
  const render = () => {
    const cur = task(t.id) || t;
    const list = subsOf(t.id);
    const done = list.filter((x) => x.done).length;
    const staged = hasStages(cur);
    const { list: stages, next } = stageInfo(cur);
    const names = stages.map((x) => x.name);
    let groups = '';
    if (staged && list.length) {
      groups = stages.map((st, i) => {
        const items = list.filter((x) => x.stage_name === st.name);
        if (!items.length) return '';
        const from = i ? stages[i - 1].pct : 0;
        const d = items.filter((x) => x.done).length;
        const tag = st.done_at ? '<span class="sg-tag ok">concluída</span>' : i === next ? '<span class="sg-tag cur">etapa atual</span>' : '';
        return `<div class="sub-group ${st.done_at ? 'past' : ''}"><div class="sg-head"><b>${esc(st.name)}</b> <span class="muted">${from}% → ${st.pct}%</span> ${tag}<span class="sg-n">${d}/${items.length}</span></div>
          <div class="subs">${items.map((x) => subRow(x, names)).join('')}</div></div>`;
      }).join('');
      const orphans = list.filter((x) => !names.includes(x.stage_name));
      if (orphans.length) groups += `<div class="sub-group"><div class="sg-head"><b>Sem etapa</b> <span class="muted">não conta no progresso</span></div><div class="subs">${orphans.map((x) => subRow(x, names)).join('')}</div></div>`;
    } else {
      groups = `<div class="subs">${list.map((x) => subRow(x, null)).join('')}</div>`;
    }
    const defStage = staged ? (next >= 0 ? stages[next].name : stages[stages.length - 1].name) : '';
    box.innerHTML = `
      <div class="section-t">${ic('checksq').replace('<svg', '<svg width="16" height="16"')} Subatividades
        ${list.length ? `<span class="muted small" style="font-weight:500">${done} de ${list.length} concluídas</span>` : ''}</div>
      <div class="small muted" style="margin:-4px 0 8px">${!list.length ? 'Divida o serviço em partes menores. Com subatividades, a porcentagem e o status passam a ser calculados por elas.' : staged ? 'Marque cada subatividade quando terminar. Quando todas da etapa estiverem marcadas, o botão Concluir etapa libera.' : 'A porcentagem sobe conforme você marca as subatividades (até 99%). No final, mude o status para Concluída.'}</div>
      ${groups}
      ${canEd ? `<div class="sub-add"><span>${ic('plus')}</span><input id="sub-new" placeholder="Adicionar subatividade e tecle Enter" />
        ${staged ? `<select id="sub-new-stage" class="sub-stage" title="Etapa">${names.map((o) => `<option value="${esc(o)}" ${o === defStage ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}</div>`
        : (list.length ? '' : '<div class="muted small">Nenhuma subatividade.</div>')}`;

    $$('.sub', box).forEach((row) => {
      const x = S.subtasks.find((s) => s.id === row.dataset.sid);
      if (!x) return;
      const save = async (patch) => {
        try {
          const r = await q(sb.from('subtasks').update(patch).eq('id', x.id).select().single());
          upsertLocal(S.subtasks, r);
          if ('done' in patch || 'stage_name' in patch) await reloadTask(t.id);
          // marcou a última: pergunta se conclui a atividade
          const cur = task(t.id);
          if (patch.done && cur && cur.status !== 'concluido' && subsOf(t.id).every((y) => y.done)) {
            if (await confirmConclusion(cur)) await updateTask(t.id, { status: 'concluido' });
          }
        } catch (e) { toastErr(e); }
      };
      $('.sub-ck', row)?.addEventListener('change', async (e) => {
        const d = e.target.checked;
        Object.assign(x, { done: d });
        row.classList.toggle('done', d);
        await save({ done: d, done_at: d ? new Date().toISOString() : null });
        render(); refresh();
      });
      $('.sub-title', row)?.addEventListener('change', (e) => { const v = e.target.value.trim(); if (v) save({ title: v }); else e.target.value = x.title; });
      $('.sub-title', row)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
      $('.sub-who', row)?.addEventListener('change', (e) => save({ assignee_id: e.target.value || null }));
      $('.sub-stage', row)?.addEventListener('change', (e) => save({ stage_name: e.target.value || null }).then(render));
      $('.sub-due', row)?.addEventListener('change', (e) => save({ due_date: e.target.value || null }).then(render));
      $('.sub-del', row)?.addEventListener('click', async () => {
        try {
          await q(sb.from('subtasks').delete().eq('id', x.id));
          S.subtasks = S.subtasks.filter((s) => s.id !== x.id);
          await reloadTask(t.id);
          render(); refresh();
          } catch (e) { toastErr(e); }
      });
    });
    const inp = $('#sub-new', box);
    inp?.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const title = inp.value.trim();
      if (!title) return;
      inp.disabled = true;
      try {
        const pos = Math.max(0, ...subsOf(t.id).map((x) => x.position)) + 1;
        const stg = $('#sub-new-stage', box)?.value;
        const r = await q(sb.from('subtasks').insert({ task_id: t.id, title, position: pos, ...(stg ? { stage_name: stg } : {}) }).select().single());
        upsertLocal(S.subtasks, r);
        await reloadTask(t.id);
        render(); refresh();
        $('#sub-new', box)?.focus();
      } catch (ex) { toastErr(ex); inp.disabled = false; }
    });
  };
  render();
  S.onSubsChanged = () => { if (!box.contains(document.activeElement)) render(); };
  return () => { if (!box.contains(document.activeElement)) render(); };
}

// Atualização rápida do dia: o que fez, o que falta e o avanço
function dailyUpdate(t) {
  const staged = hasStages(t);
  const { list, next } = stageInfo(t);
  const nx = staged && next >= 0 ? list[next] : null;
  const mgr = isApproved(t) ? isTaskManager(t) : isAdmin();
  const falta = nx ? subsPendingIn(t, nx.name) : 0;
  const stageLabel = nx ? (falta ? `Concluir a etapa "${esc(nx.name)}" — falta${falta > 1 ? 'm' : ''} ${falta} subatividade${falta > 1 ? 's' : ''}` : `Concluí a etapa "${esc(nx.name)}" (${nx.pct}%)`) : '';
  const subAuto = !staged && subsOf(t.id).length > 0;
  openModal({
    title: 'Atualização do dia',
    body: `<p class="muted small" style="margin:0 0 12px">${esc(t.title)}${staged && nx ? ` · etapa atual: <b>${esc(nx.name)}</b>` : ''}</p>
      <div class="field"><label>✅ O que foi feito</label><textarea class="textarea" id="du-done" rows="3" placeholder="Ex.: terminei o cálculo das sapatas S1 a S6"></textarea></div>
      <div class="field"><label>⏳ O que falta fazer</label><textarea class="textarea" id="du-todo" rows="3" placeholder="Ex.: falta a revisão e as pranchas de detalhamento"></textarea></div>
      ${staged ? (nx ? `<label class="du-stage" ${falta ? 'style="opacity:.6"' : ''}><input type="checkbox" id="du-stage" ${falta ? 'disabled' : ''} /> ${stageLabel}</label>` : '')
        : subAuto ? `<div class="small muted">Progresso calculado pelas subatividades (${t.progress}%).</div>` : `<div class="field"><label>Status</label>
        <select class="select" id="du-st">${STATUS_ORDER.filter((k) => k !== 'concluido').map((k) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${STATUS[k].label} (${statusRange(k)})</option>`).join('')}</select>
        <div class="small muted" style="margin-top:4px">Para concluir, use o status <b>Concluída</b> na atividade (pede confirmação).</div></div>`}`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="du-save">Salvar atualização</button>`,
    onMount: ({ el, close }) => {
      const r = $('#du-st', el);
      setTimeout(() => $('#du-done', el).focus(), 50);
      $('#du-save', el).onclick = async () => {
        const done = $('#du-done', el).value.trim();
        const todo = $('#du-todo', el).value.trim();
        const newSt = r ? r.value : t.status;
        const prog = r && newSt !== t.status ? progressForStatus(newSt) : t.progress;
        const stageDone = $('#du-stage', el)?.checked;
        if (!done && !todo && prog === t.progress && !stageDone) { toast('Escreva o que foi feito ou o que falta', 'error'); return; }
        $('#du-save', el).disabled = true;
        try {
          const parts = [];
          if (done) parts.push(`✅ Feito: ${done}`);
          if (todo) parts.push(`⏳ Falta: ${todo}`);
          if (!staged && prog !== t.progress) parts.push(`📊 Status: ${STATUS[t.status]?.label || t.status} → ${STATUS[newSt].label} (${prog}%)`);
          if (stageDone && nx) parts.push(`🏁 Etapa "${nx.name}" concluída (${nx.pct}%)`);
          if (parts.length) await q(sb.from('task_comments').insert({ task_id: t.id, body: parts.join('\n'), author_email: S.me.email }));
          close();
          if (stageDone && nx) await stageAction(t, next, 'done');
          else if (!staged && prog !== t.progress) await updateTask(t.id, { status: newSt });
          await reloadLastUpdates();
          refresh();
          toast('Atualização registrada', 'ok');
        } catch (e) { toastErr(e); $('#du-save', el).disabled = false; }
      };
    },
  });
}

// Ações nas etapas: concluir, pedir confirmação, confirmar, devolver, desfazer
async function stageAction(t, idx, action) {
  const cur = task(t.id) || t;
  const list = (cur.stages || []).map((x) => ({ ...x }));
  const s = list[idx];
  if (!s) return;
  const now = new Date().toISOString();
  if (action === 'done') { s.done_at = now; s.done_by = S.me.email; }
  else if (action === 'request') { s.requested_at = now; s.requested_by = S.me.email; }
  else if (action === 'return' || action === 'cancel') { delete s.requested_at; delete s.requested_by; }
  else if (action === 'undo') { delete s.done_at; delete s.done_by; delete s.requested_at; delete s.requested_by; }
  await updateTask(t.id, { stages: list });
}

async function openTask(id, defaults = {}) {
  const isNew = !id;
  const firstType = activeTypes()[0];
  const t = isNew
    ? { title: '', description: '', assignee_id: null, due_date: null, status: 'nao_iniciado', progress: 0, priority: 'media', size: 'M',
        approval: isAdmin() ? 'aprovada' : 'pendente', type_id: null, stages: null,
        suggested_due_date: null, origin: '', started_early: false, hold: '', hold_note: '', ...defaults }
    : task(id);
  if (!t) { toast('Atividade não encontrada'); return; }
  if (!isNew && t.id) {   // abrir o serviço = já viu as novidades dele
    const fk = feedForMe().filter((x) => x.t.id === t.id).map((x) => x.key);
    if (fk.length) markFeedSeen(fk);
    if (newForMe().some((x) => x.id === t.id)) markNewSeen([t.id]);
    if (fk.length) setTimeout(updateChrome, 0);
  }
  const adm = isAdmin();
  const approval = approvalOf(t);
  const pending = approval !== 'aprovada';
  const isRequest = isNew && !adm;                         // colaborador criando uma solicitação
  if (isRequest) { t.type_id = null; t.stages = null; }     // tipo e etapas: o gestor define na aprovação
  const mgr = isNew ? adm : isTaskManager(t);
  const canText = isNew || mgr;                             // nome e descrição
  const canPlan = isNew ? adm : canPlanTask(t);             // prazo, prioridade, responsável, tamanho, projeto
  const canEd = isNew || canEditTask(t);                    // etapas, status, progresso, impedimento, atualizações
  const canStructure = isNew ? adm : (pending ? adm : mgr);   // tipo e etapas (colaborador não define)
  const canReview = !isNew && pending && adm;               // aprovar / recusar
  const canDelete = !isNew && mgr;
  const stageMgr = isNew ? adm : (isApproved(t) ? mgr : adm);   // quem confirma etapas finais
  const creator = memberByEmail(t.created_by_email);
  const creatorName = creator ? creator.name : (t.created_by_email || 'administrador');
  const requester = memberByEmail(t.requested_by_email);
  const assignee = member(t.assignee_id);
  const p = project(t.project_id);
  const memberOpts = S.members.filter((m) => m.active || m.id === t.assignee_id)
    .map((m) => `<option value="${m.id}" ${m.id === t.assignee_id ? 'selected' : ''}>${esc(m.name)}${m.job_title ? ' — ' + esc(m.job_title) : ''}</option>`).join('');
  const projOpts = S.projects.filter((x) => !x.archived || x.id === t.project_id)
    .map((x) => `<option value="${x.id}" ${x.id === t.project_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const typeOpts = () => `${activeTypes().concat(t.type_id && !activeTypes().some((x) => x.id === t.type_id) && typeById(t.type_id) ? [typeById(t.type_id)] : [])
    .map((x) => `<option value="${x.id}" ${x.id === t.type_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
    <option value="" ${!t.type_id && !hasStages(t) ? 'selected' : ''}>Livre (sem etapas, progresso manual)</option>`;
  const D = (ok) => (ok ? '' : 'disabled');
  const lockIc = ic('lock').replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px"');

  let note = '';
  if (isRequest) {
    note = `<div class="alert warn" style="margin-bottom:14px">${ic('clock')}<div><b>Vai para aprovação</b>Escreva o que precisa ser feito, o que foi conversado na reunião e a data de entrega da atividade. O gestor aprova e define o prazo e a prioridade.</div></div>`;
  } else if (!isNew && approval === 'pendente') {
    note = adm
      ? `<div class="alert warn" style="margin-bottom:14px">${ic('clock')}<div><b>Solicitação de ${esc(requester?.name || t.requested_by_email || '')}</b>Enviada ${relTime(t.created_at)}${t.suggested_due_date ? ` · prazo combinado: <b>${fmtDate(t.suggested_due_date, true)}</b>` : ''}${t.started_early ? ' · <b>já iniciada</b>' : ''}. Defina a <b>data de entrega</b> e a <b>prioridade</b> e clique em Aprovar.</div></div>`
      : `<div class="alert warn" style="margin-bottom:14px">${ic('clock')}<div><b>Aguardando aprovação</b>Um administrador vai confirmar o prazo e a prioridade. Enquanto isso você ainda pode ajustar o nome.</div></div>`;
  } else if (!isNew && approval === 'recusada') {
    note = `<div class="alert danger" style="margin-bottom:14px">${ic('alert')}<div><b>Solicitação recusada</b>${t.review_note ? esc(t.review_note) : 'Sem motivo informado.'}</div></div>`;
  } else if (!isNew && !mgr && canEd) {
    note = `<div class="readonly-note"><b>${esc(firstName(creatorName))}</b> passou este serviço para você. Você atualiza o status, marca as subatividades e escreve as atualizações. O prazo é definido pelo gestor; se precisar de mais tempo, toque em <b>Pedir novo prazo</b>.</div>`;
  } else if (!isNew && isLocked(t)) {
    note = `<div class="alert ok" style="margin-bottom:14px">${ic('check')}<div><b>Atividade concluída</b>Ela está travada: não dá para mudar o status nem adicionar subatividades ou atualizações. Se precisar mexer, fale com um administrador para reabrir.</div></div>`;
  } else if (!isNew && !canEd) {
    note = `<div class="readonly-note">${lockIc} Atividade passada por <b>${esc(creatorName)}</b>${assignee ? ` para <b>${esc(assignee.name)}</b>` : ''}. Somente ${assignee ? 'o responsável e os administradores podem' : 'os administradores podem'} alterar ou comentar.</div>`;
  }

  const body = `
    <div class="drawer-head">
      <div class="crumb"><span style="width:9px;height:9px;border-radius:3px;background:${esc(p?.color || '#999')}"></span>${esc(p?.name || '')}${isNew ? (isRequest ? ' · Solicitar atividade' : ' · Nova atividade') : ''}</div>
      ${canDelete ? `<button class="btn btn-ghost btn-icon" id="t-del" title="${pending && !adm ? 'Cancelar solicitação' : 'Excluir'}">${ic('trash')}</button>` : ''}
      <button class="btn btn-ghost btn-icon" data-close title="Fechar">${ic('x')}</button>
    </div>
    <div class="drawer-body">
      <input class="title-input" id="t-title" placeholder="${isRequest ? 'O que precisa ser feito?' : 'Nome da atividade'}" value="${esc(t.title)}" ${D(canText)} />
      ${note}
      <div hidden>
      <div class="section-t" style="margin-top:4px">${ic('checksq').replace('<svg', '<svg width="16" height="16"')} Tipo e etapas</div>
      <div class="hint">O serviço é dividido em etapas. Cada etapa concluída aumenta a porcentagem de pronto.</div>
      <div class="kv" style="margin-bottom:10px"><label>Tipo de atividade</label>
        <select class="select" id="t-type" ${D(canStructure)}>${typeOpts()}</select></div>
      <div id="stage-box"></div>
      </div>
      <div class="kv" style="margin-top:14px">
        ${isRequest ? '' : `
        <label>Status<small>Como o serviço está agora</small></label><div id="status-cell"></div>
        <label>Progresso<small>Quanto já está pronto</small></label><div id="prog-cell"></div>`}
        ${isRequest ? '' : `<label>Responsável<small>Quem faz o serviço</small></label>
        <select class="select" id="t-who" ${D(canPlan)}><option value="">— Sem responsável —</option>${memberOpts}</select>`}
        ${isNew && isRequest ? `<label>Data de entrega da atividade<small>Data combinada na reunião</small></label><input class="input" type="date" id="t-sdue" value="${t.suggested_due_date || ''}" />` : ''}
        ${isRequest ? '' : `<label>Data de entrega${canReview ? ' *' : ''}<small>Até quando entregar</small></label>
        <div><input class="input" type="date" id="t-due" value="${t.due_date || (canReview ? t.suggested_due_date || '' : '')}" ${D(canPlan)} />
          ${t.suggested_due_date && !isNew ? `<div class="small muted" style="margin-top:4px">Prazo combinado/sugerido: <b>${fmtDate(t.suggested_due_date, true)}</b>${requester ? ` (por ${esc(firstName(requester.name))})` : ''}</div>` : ''}
          <div id="due-req-box"></div></div>
        <label>Prioridade<small>Urgência do serviço</small></label>
        <select class="select" id="t-prio" ${D(canPlan)}>${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}" ${t.priority === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        <label>Tamanho<small>Pequeno, médio ou grande</small></label>
        <select class="select" id="t-size" ${D(canPlan)} title="Peso da atividade no progresso do projeto">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}" ${(t.size || 'M') === k ? 'selected' : ''}>${v.label} (peso ${v.w})</option>`).join('')}</select>`}
        ${canPlan ? `<label>Projeto</label><select class="select" id="t-proj">${projOpts}</select>` : ''}
        ${isNew ? '' : `<label>Impedimento<small>Está esperando alguém ou algo?</small></label>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><select class="select" id="t-hold" ${D(canEd)} style="flex:1;min-width:160px">${Object.entries(HOLDS).map(([k, v]) => `<option value="${k}" ${(t.hold || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <input class="input" id="t-holdn" placeholder="Detalhe (ex.: cliente vai enviar as cotas)" value="${esc(t.hold_note || '')}" ${D(canEd)} style="flex:2;min-width:180px;${t.hold ? '' : 'display:none'}" /></div>`}
        ${!isNew && !pending ? `<label>Passada por<small>Quem pediu o serviço</small></label><div class="person">${avatar(creator || { name: creatorName, email: t.created_by_email || '' })}<span>${esc(creatorName)}${requester ? ` <span class="muted small">(pedida por ${esc(firstName(requester.name))})</span>` : ''}</span></div>` : ''}
      </div>
      ${!isNew && pending && t.requested_by_email === S.me.email ? `<label class="du-stage" style="margin-bottom:12px"><input type="checkbox" id="t-early" ${t.started_early ? 'checked' : ''} /> Já iniciei (o serviço não pode esperar a aprovação)</label>` : ''}
      <div class="field"><label>${isRequest ? 'O que foi conversado na reunião' : 'Origem / onde foi combinado'}</label>
        <textarea class="textarea" id="t-origin" rows="${isRequest ? 5 : 2}" placeholder="${isRequest ? 'Ex.: Reunião com o cliente em 24/11 (João e Mateus). Ficou combinado enviar a documentação da P4 para liberação na plataforma.' : 'Ex.: Reunião com o cliente em 24/11 — presentes: João (cliente), Mateus'}" ${D(isNew || adm)}>${esc(t.origin || '')}</textarea></div>
      <div class="field" ${isRequest ? 'hidden' : ''}><label>Descrição / escopo</label>
        <textarea class="textarea" id="t-desc" rows="4" placeholder="${canText ? 'Detalhes, normas, documentos de referência...' : ''}" ${D(canText)}>${esc(t.description || '')}</textarea></div>
      ${isNew ? '' : `<div id="subs-box"></div>`}
      ${isNew ? '' : `
        <div class="section-t">${ic('msg').replace('<svg', '<svg width="16" height="16"')} Atualizações e comentários</div>
        <div class="hint">Escreva aqui o que foi feito e o que falta. Todo mundo que acompanha o serviço consegue ler.</div>
        ${canEd ? `<div class="comment-form">
          <textarea class="textarea" id="c-body" placeholder="O que foi feito hoje e o que falta fazer... (Ctrl+Enter envia)"></textarea>
          <button class="btn btn-primary btn-icon" id="c-send" title="Enviar">${ic('send')}</button>
        </div>` : ''}
        <div class="comments" id="comments"><div class="muted small">Carregando...</div></div>
        <details class="hist" id="hist"><summary>${ic('clock').replace('<svg', '<svg width="15" height="15"')} Histórico de alterações</summary><div id="hist-list" class="muted small">Carregando...</div></details>`}
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
    onClose: () => { S.onCommentsChanged = null; S.onSubsChanged = null; S.onTaskChanged = null; S.onDueChanged = null; },
    onMount: ({ el, close }) => {
      const rerenderSubs = isNew ? null : mountSubtasks(el, t, canEd);
      // campos que a pessoa não pode alterar aparecem como texto (e não como caixa cinza)
      const roify = () => $$('.kv select:disabled, .kv input:disabled, select#t-type:disabled, .field textarea:disabled', el).forEach((x) => {
        if (x.dataset.ro || x.style.display === 'none') return;
        x.dataset.ro = '1';
        let txt = '';
        if (x.tagName === 'SELECT') txt = x.selectedOptions[0]?.text || '—';
        else if (x.type === 'date') txt = x.value ? parseDate(x.value).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Sem data';
        else txt = x.value || '—';
        txt = txt.replace(/^— (.*) —$/, '$1');
        const d = document.createElement('div');
        d.className = 'ro-val' + (x.tagName === 'TEXTAREA' ? ' ro-multi' : '');
        d.textContent = txt;
        x.style.display = 'none';
        x.after(d);
      });
      new MutationObserver(roify).observe(el, { childList: true, subtree: true });
      setTimeout(roify, 0);
      // ---------- estado das etapas no painel ----------
      let draftStages = hasStages(t) ? t.stages.map((x) => ({ ...x })) : null;   // etapas em edição (nova/estrutura)
      let editing = isNew;                                                         // editor aberto direto só ao criar
      let editor = null;
      const live = () => (isNew ? t : task(t.id) || t);
      const typeSel = $('#t-type', el);
      const renderStatusProg = () => {
        const cur = live();
        const sc = $('#status-cell', el), pc = $('#prog-cell', el);
        if (!sc) return;
        const staged = editing ? !!(draftStages && draftStages.length) : hasStages(cur);
        if (staged) {
          sc.innerHTML = `<div class="small muted">Definido pelas etapas · <b style="color:var(--text)">${(STATUS[cur.status] || STATUS.nao_iniciado).label}</b></div>`;
          pc.innerHTML = `<div class="range-row"><div class="prog" style="flex:1"><div class="bar"><i class="${cur.progress >= 100 ? 'full' : ''}" style="width:${cur.progress}%"></i></div></div><b>${cur.progress}%</b></div>
            <div class="small muted">Calculado pela última etapa concluída</div>`;
        } else if (autoProg(cur)) {
          sc.innerHTML = `<select class="select" id="t-status" ${D(canEd)}>${STATUS_ORDER.map((k) => `<option value="${k}" ${cur.status === k ? 'selected' : ''}>${STATUS[k].label} (${statusRange(k)})</option>`).join('')}</select>`;
          pc.innerHTML = `<div class="range-row"><div class="prog" style="flex:1"><div class="bar"><i class="${cur.progress >= 100 ? 'full' : ''}" style="width:${cur.progress}%"></i></div></div><b>${cur.progress}%</b></div>
            <div class="small muted">Calculado pelas subatividades</div>`;
        } else {
          sc.innerHTML = `<select class="select" id="t-status" ${D(canEd)}>${STATUS_ORDER.map((k) => `<option value="${k}" ${cur.status === k ? 'selected' : ''}>${STATUS[k].label} (${statusRange(k)})</option>`).join('')}</select>`;
          pc.innerHTML = `<div class="range-row"><div class="prog" style="flex:1"><div class="bar"><i id="t-progbar" class="${cur.progress >= 100 ? 'full' : ''}" style="width:${cur.progress}%"></i></div></div><b id="t-progv">${cur.progress}%</b></div>
            <input type="hidden" id="t-prog" value="${cur.progress}" />
            <div class="small muted">A barra acompanha o status escolhido</div>`;
          const prog = $('#t-prog', el), st = $('#t-status', el);
          st.onchange = () => {
            prog.value = progressForStatus(st.value);
            $('#t-progv', el).textContent = prog.value + '%';
            const b = $('#t-progbar', el); b.style.width = prog.value + '%'; b.classList.toggle('full', Number(prog.value) >= 100);
          };
        }
      };
      const renderStages = () => {
        const box = $('#stage-box', el);
        const cur = live();
        const ty = typeById(typeSel.value);
        if (editing) {
          if (!draftStages || !draftStages.length) {
            box.innerHTML = `<div class="small muted" style="margin-bottom:6px">Sem etapas: o progresso é informado manualmente.${canStructure ? ' Escolha um tipo acima ou ' : ''}</div>
              ${canStructure ? `<button type="button" class="btn btn-sm" id="stg-addfirst">${ic('plus')} Criar etapas só para esta atividade</button>` : ''}`;
            $('#stg-addfirst', box)?.addEventListener('click', () => { draftStages = [{ name: '', pct: 100, confirm: false }]; renderStages(); renderStatusProg(); });
            editor = null;
          } else {
            box.innerHTML = `<div class="small muted" style="margin-bottom:8px">${isNew ? 'Etapas copiadas do modelo. Tire as que não se aplicam ou inclua alguma só para esta atividade.' : 'Ajuste as etapas desta atividade (o modelo não é alterado).'}</div><div id="stg-ed"></div>
              ${!isNew ? `<div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn btn-sm" id="stg-cancel">Cancelar edição</button><button type="button" class="btn btn-sm btn-primary" id="stg-apply">Salvar etapas</button></div>` : ''}`;
            editor = stageEditor($('#stg-ed', box), draftStages, { color: ty?.color || '#1d4ed8', onChange: (l) => { draftStages = l; } });
            $('#stg-cancel', box)?.addEventListener('click', () => { editing = false; draftStages = hasStages(live()) ? live().stages.map((x) => ({ ...x })) : null; typeSel.value = live().type_id || ''; renderStages(); renderStatusProg(); });
            $('#stg-apply', box)?.addEventListener('click', async () => {
              const list = editor.get();
              const err = validateStages(list);
              if (err) { toast(err, 'error'); return; }
              const old = live().stages || [];
              const merged = list.map((x) => { const o = old.find((y) => y.name === x.name); return o ? { ...o, name: x.name, pct: x.pct, confirm: false } : { name: x.name, pct: x.pct, confirm: false }; });
              await updateTask(t.id, { stages: merged, type_id: typeSel.value || null });
              editing = pending && canStructure;
              draftStages = hasStages(live()) ? live().stages.map((x) => ({ ...x })) : null;
              renderStages(); renderStatusProg();
              toast('Etapas atualizadas', 'ok');
            });
          }
          return;
        }
        // visualização + ações
        if (!hasStages(cur)) {
          box.innerHTML = `<div class="small muted">Sem etapas: o progresso é informado manualmente.</div>
            ${canStructure ? `<button type="button" class="btn btn-sm" id="stg-edit" style="margin-top:6px">${ic('plus')} Definir etapas</button>` : ''}`;
        } else {
          const { list, next, pend, all, done } = stageInfo(cur);
          const nx = next >= 0 ? list[next] : null;
          const prevDone = done > 0 ? list[done - 1] : null;
          let actions = '';
          if (all) {
            actions = `<div class="stage-msg ok">${ic('ok')} Todas as etapas concluídas.</div>`;
          } else if (pend >= 0) {
            const who = memberByEmail(list[pend].requested_by)?.name || list[pend].requested_by || '';
            actions = stageMgr
              ? `<div class="stage-msg">${esc(who)} terminou <b>${esc(list[pend].name)}</b> e pediu sua confirmação ${relTime(list[pend].requested_at)}.</div>
                 <div class="stage-btns"><button type="button" class="btn btn-primary" data-sa="done" data-i="${pend}">${ic('ok')} Confirmar conclusão</button><button type="button" class="btn" data-sa="return" data-i="${pend}">Devolver para ajustes</button></div>`
              : `<div class="stage-msg">Aguardando ${esc(firstName(creatorName))} confirmar <b>${esc(list[pend].name)}</b>.</div>
                 ${canEd ? `<div class="stage-btns"><button type="button" class="btn btn-sm" data-sa="cancel" data-i="${pend}">Cancelar pedido</button></div>` : ''}`;
          } else if (canEd && nx) {
            const falta = subsPendingIn(cur, nx.name);
            actions = falta
              ? `<div class="stage-btns"><button type="button" class="btn" disabled>${ic('ok')} Concluir etapa "${esc(nx.name)}"</button></div>
                 <div class="small muted" style="margin-top:6px">Falta${falta > 1 ? 'm' : ''} ${falta} subatividade${falta > 1 ? 's' : ''} desta etapa para liberar.</div>`
              : `<div class="stage-btns"><button type="button" class="btn btn-primary" data-sa="done" data-i="${next}">${ic('ok')} Concluir etapa "${esc(nx.name)}"</button></div>
              ${pending ? `<div class="small muted" style="margin-top:6px">A atividade ainda não foi aprovada; o avanço só conta no projeto depois da aprovação.</div>` : ''}`;
          }
          const canUndo = prevDone && pend < 0 && (stageMgr || canEd);
          box.innerHTML = `${stepperHtml(cur)}${actions}
            <div class="stage-links">
              ${canUndo ? `<button type="button" class="linkbtn" data-sa="undo" data-i="${done - 1}">Desfazer "${esc(prevDone.name)}"</button>` : ''}
              ${canStructure ? `<button type="button" class="linkbtn" id="stg-edit">Editar etapas desta atividade</button>` : ''}
            </div>`;
          $$('[data-sa]', box).forEach((b) => (b.onclick = async () => {
            const act = b.dataset.sa, i = Number(b.dataset.i);
            if (act === 'return') {
              const reason = await promptText('Devolver etapa', `O que precisa ser ajustado em "${list[i].name}"?`);
              if (reason === null) return;
              if (reason) await q(sb.from('task_comments').insert({ task_id: t.id, body: `↩️ Etapa "${list[i].name}" devolvida: ${reason}`, author_email: S.me.email })).catch(toastErr);
            }
            b.disabled = true;
            await stageAction(t, i, act);
            renderStages(); renderStatusProg(); rerenderSubs?.();
          }));
        }
        $('#stg-edit', box)?.addEventListener('click', () => { editing = true; draftStages = hasStages(cur) ? cur.stages.map((x) => ({ ...x })) : []; renderStages(); renderStatusProg(); });
      };
      typeSel.onchange = () => {
        const ty = typeById(typeSel.value);
        draftStages = ty ? copyStages(ty) : null;
        editing = true;
        renderStages(); renderStatusProg();
      };
      renderStages();
      renderStatusProg();
      S.onTaskChanged = () => { if (!editing && !el.querySelector('.stage-box-busy')) { renderStages(); renderStatusProg(); } rerenderSubs?.(); };

      // ---------- impedimento ----------
      const holdSel = $('#t-hold', el);
      if (holdSel) holdSel.onchange = () => { $('#t-holdn', el).style.display = holdSel.value ? '' : 'none'; };

      // ---------- pedido de novo prazo ----------
      const renderDueReq = () => {
        const box = $('#due-req-box', el);
        if (!box || isNew) return;
        const req = S.dueRequests.find((r) => r.task_id === t.id && r.status === 'pendente');
        const last = S.dueRequests.filter((r) => r.task_id === t.id && r.status !== 'pendente')[0];
        if (req) {
          const who = memberByEmail(req.requested_by_email)?.name || req.requested_by_email;
          box.innerHTML = `<div class="due-req">📅 <b>${esc(firstName(who))}</b> pediu novo prazo: ${fmtDate(req.old_due, true) || 'sem prazo'} → <b>${fmtDate(req.new_due, true)}</b>${req.reason ? `<br><span class="muted">"${esc(req.reason)}"</span>` : ''}
            <div class="stage-btns">${mgr ? `<button type="button" class="btn btn-sm btn-primary" data-dr="aprovado">Aprovar novo prazo</button><button type="button" class="btn btn-sm" data-dr="recusado">Recusar</button>`
              : req.requested_by_email === S.me.email ? `<button type="button" class="btn btn-sm" data-dr="cancelar">Cancelar pedido</button>` : ''}</div></div>`;
          $$('[data-dr]', box).forEach((b) => (b.onclick = async () => {
            try {
              if (b.dataset.dr === 'cancelar') { await q(sb.from('due_requests').delete().eq('id', req.id)); S.dueRequests = S.dueRequests.filter((r) => r.id !== req.id); }
              else {
                let noteTxt = '';
                if (b.dataset.dr === 'recusado') { noteTxt = await promptText('Recusar novo prazo', 'Motivo (aparece para quem pediu):'); if (noteTxt === null) return; }
                const row = await q(sb.from('due_requests').update({ status: b.dataset.dr, decision_note: noteTxt || '' }).eq('id', req.id).select().single());
                upsertLocal(S.dueRequests, row);
                if (b.dataset.dr === 'aprovado') { const tr = await q(sb.from('tasks').select('*').eq('id', t.id).single()); upsertLocal(S.tasks, tr); $('#t-due', el).value = tr.due_date || ''; }
              }
              renderDueReq(); refresh(); loadHist();
            } catch (e) { toastErr(e); }
          }));
        } else if (canEd && !mgr && isApproved(t)) {
          box.innerHTML = `${last ? `<div class="small muted" style="margin-top:4px">Último pedido: ${fmtDate(last.new_due, true)} — ${last.status === 'aprovado' ? 'aprovado' : 'recusado'}${last.decision_note ? ` (${esc(last.decision_note)})` : ''}</div>` : ''}
            <button type="button" class="linkbtn" id="ask-due" style="margin-top:4px">Pedir novo prazo</button>`;
          $('#ask-due', box).onclick = () => askNewDue(t, () => { renderDueReq(); loadHist(); refresh(); });
        } else box.innerHTML = '';
      };
      renderDueReq();
      S.onDueChanged = renderDueReq;

      // ---------- histórico ----------
      const loadHist = async () => {
        const hb = $('#hist-list', el);
        if (!hb || !$('#hist', el).open) return;
        try {
          const rows = await q(sb.from('task_history').select('*').eq('task_id', t.id).order('created_at', { ascending: false }).limit(100));
          hb.innerHTML = rows.length ? rows.map((h) => `<div class="hist-row"><b>${esc(firstName(memberByEmail(h.actor_email)?.name || h.actor_email || 'Sistema'))}</b> ${esc(h.action)} <span>${new Date(h.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>`).join('')
            : 'Sem registros ainda.';
        } catch { hb.textContent = 'Histórico indisponível.'; }
      };
      $('#hist', el)?.addEventListener('toggle', loadHist);

      if (isNew) setTimeout(() => $('#t-title', el).focus(), 50);

      // ---------- salvar ----------
      const collect = () => {
        const v = { title: $('#t-title', el).value.trim(), description: $('#t-desc', el).value.trim() };
        const st = $('#t-status', el), pr = $('#t-prog', el);
        if (st && pr) { v.status = st.value; v.progress = Number(pr.value); }
        if ($('#t-who', el)) {
          v.assignee_id = $('#t-who', el).value || null;
          v.due_date = $('#t-due', el).value || null;
          v.priority = $('#t-prio', el).value;
          v.size = $('#t-size', el).value;
        }
        if ($('#t-proj', el)) v.project_id = $('#t-proj', el).value;
        if (holdSel) { v.hold = holdSel.value; v.hold_note = holdSel.value ? $('#t-holdn', el).value.trim() : ''; }
        if ($('#t-early', el)) v.started_early = $('#t-early', el).checked;
        v.origin = $('#t-origin', el).value.trim();
        return v;   // etapas desativadas
      };
      const buildPatch = (vals) => {
        const keys = [];
        if (canText) keys.push('title', 'description');
        if (canEd) keys.push('status', 'progress', 'hold', 'hold_note');
        if (canPlan) keys.push('assignee_id', 'due_date', 'priority', 'project_id', 'size');
        if (adm) keys.push('origin');
        if (pending && t.requested_by_email === S.me.email) keys.push('started_early');
        const patch = {};
        for (const k of keys) {
          if (!(k in vals)) continue;
          const a = vals[k] ?? null, b = t[k] ?? null;
          if (k === 'stages' ? JSON.stringify(a) !== JSON.stringify(b) : a !== b) patch[k] = vals[k];
        }
        if (hasStages(live()) && !('stages' in patch)) { delete patch.status; delete patch.progress; }
        else if (autoProg(live())) delete patch.progress;
        return patch;
      };
      const checkStages = (vals) => {
        if (!('stages' in vals) || !vals.stages) return '';
        return validateStages(vals.stages);
      };
      const saveRow = async (patch) => {
        if (!Object.keys(patch).length) return;
        const row = await q(sb.from('tasks').update(patch).eq('id', t.id).select().single());
        upsertLocal(S.tasks, row);
        Object.assign(t, row);
        refresh();
      };

      $('#t-save', el)?.addEventListener('click', async () => {
        const vals = collect();
        if (!vals.title) { toast('Dê um nome à atividade', 'error'); $('#t-title', el).focus(); return; }
        const se = checkStages(vals);
        if (se) { toast(se, 'error'); return; }
        const btn = $('#t-save', el);
        btn.disabled = true;
        try {
          if (isNew) {
            const base = { project_id: vals.project_id || t.project_id, title: vals.title, description: vals.description, origin: vals.origin,
              type_id: null, stages: null };
            if (isRequest) {
              if (!$('#t-sdue', el)?.value) { toast('Informe a data de entrega da atividade', 'error'); btn.disabled = false; $('#t-sdue', el)?.focus(); return; }
              await createTask({ ...base, suggested_due_date: $('#t-sdue', el).value });
              toast('Solicitação enviada para aprovação', 'ok');
            } else {
              const extra = { assignee_id: vals.assignee_id, due_date: vals.due_date, priority: vals.priority, size: vals.size };
              if (!base.stages) { extra.status = vals.status; extra.progress = vals.progress; }
              await createTask({ ...base, ...extra });
              toast('Atividade criada', 'ok');
            }
          } else {
            const patch = buildPatch(vals);
            if (patch.status === 'concluido' && t.status !== 'concluido' && !(await confirmConclusion(t))) { btn.disabled = false; return; }
            await saveRow(patch);
            toast('Atividade salva', 'ok');
          }
          close();
        } catch (e) { toastErr(e); btn.disabled = false; }
      });

      $('#t-approve', el)?.addEventListener('click', async () => {
        const vals = collect();
        if (!vals.due_date) { toast('Defina a data de entrega para aprovar', 'error'); $('#t-due', el).focus(); return; }
        if (!vals.title) { toast('Dê um nome à atividade', 'error'); return; }
        const se = checkStages(vals);
        if (se) { toast(se, 'error'); return; }
        try {
          await saveRow({ ...buildPatch(vals), due_date: vals.due_date, priority: vals.priority, approval: 'aprovada', review_note: '' });
          toast('Atividade aprovada', 'ok');
          close();
        } catch (e) { toastErr(e); }
      });

      $('#t-reject', el)?.addEventListener('click', async () => {
        const reason = await promptText('Recusar solicitação', `Motivo (aparece para ${requester?.name || 'quem pediu'}):`);
        if (reason === null) return;
        try {
          await saveRow({ approval: 'recusada', review_note: reason });
          close();
          toast('Solicitação recusada');
        } catch (e) { toastErr(e); }
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
            reloadLastUpdates().then(refresh);
          } catch (e) { toastErr(e); }
          $('#c-send', el).disabled = false;
        };
        if ($('#c-send', el)) $('#c-send', el).onclick = send;
        if ($('#c-body', el)) $('#c-body', el).onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
      }
    },
  });
}

// Caixa de texto simples (motivo de recusa/devolução)
function promptText(title, label, initial = '') {
  return new Promise((resolve) => {
    let done = false;
    openModal({
      title: esc(title),
      body: `<div class="field"><label>${esc(label)}</label><textarea class="textarea" id="pt-in" rows="3">${esc(initial)}</textarea></div>`,
      foot: `<button class="btn" data-close>Voltar</button><button class="btn btn-primary" id="pt-ok">Confirmar</button>`,
      onMount: ({ el, close }) => {
        setTimeout(() => $('#pt-in', el).focus(), 50);
        $('#pt-ok', el).onclick = () => { done = true; const v = $('#pt-in', el).value.trim(); close(); resolve(v); };
      },
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

// Pedido de novo prazo (responsável → quem passou)
function askNewDue(t, after) {
  openModal({
    title: 'Pedir novo prazo',
    body: `<p class="muted small" style="margin:0 0 12px">${esc(t.title)} · prazo atual: <b>${fmtDate(t.due_date, true) || 'sem prazo'}</b></p>
      <div class="field"><label>Novo prazo</label><input class="input" type="date" id="nd-date" /></div>
      <div class="field"><label>Motivo</label><textarea class="textarea" id="nd-reason" rows="3" placeholder="Ex.: o cliente atrasou o envio das informações"></textarea></div>
      <div class="err" id="nd-err"></div>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="nd-ok">Enviar pedido</button>`,
    onMount: ({ el, close }) => {
      $('#nd-ok', el).onclick = async () => {
        const d = $('#nd-date', el).value, r = $('#nd-reason', el).value.trim();
        if (!d) { $('#nd-err', el).textContent = 'Escolha a nova data.'; return; }
        if (!r) { $('#nd-err', el).textContent = 'Explique o motivo.'; return; }
        try {
          const row = await q(sb.from('due_requests').insert({ task_id: t.id, new_due: d, reason: r }).select().single());
          upsertLocal(S.dueRequests, row);
          close(); toast('Pedido enviado para quem passou a atividade', 'ok'); after?.();
        } catch (e) { $('#nd-err', el).textContent = translateError(e.message); }
      };
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
  const toApprove = ui.who === 'me' || !isAdmin() ? [...new Set(myDecisions().map((d) => d.t))].filter(qMatch) : [];
  const groups = [
    { key: 'approve', label: 'Para você decidir (aprovar, novo prazo)', color: '#1d4ed8', tasks: toApprove },
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
// ---------- Fotos nas anotações ----------
const PHOTO_URLS = new Map();   // caminho -> endereço para mostrar (temporário)
let UID = null;
async function currentUid() {
  if (UID) return UID;
  const { data } = await sb.auth.getSession();
  UID = data.session?.user?.id;
  if (!UID) throw new Error('Sua sessão expirou. Entre de novo para enviar fotos.');
  return UID;
}
// reduz a foto (máx. 1600 px no lado maior) e converte para JPEG
function resizeToJpeg(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível processar a foto.'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Formato de imagem não suportado. Tente uma foto JPG ou PNG.')); };
    img.src = url;
  });
}
// ---- quadro de fotos estilo Word: tamanho e proporção pelas alças, arrastar para mover ----
const PH_GAP = 12;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function photoDefaults(g, f) {
  const cols = Number(g.dataset.cols) || 2;
  if (!f.dataset.w) f.dataset.w = String(Math.floor(100 / cols));
  if (!f.dataset.ar) f.dataset.ar = cols === 1 ? '1.6' : '1.333';
  if (!f.dataset.px) f.dataset.px = '50';
  if (!f.dataset.py) f.dataset.py = '50';
}
function applyPhotoStyle(f) {
  f.style.setProperty('--w', f.dataset.w);
  f.querySelector('.ph-frame')?.style.setProperty('aspect-ratio', String(f.dataset.ar));
  const img = f.querySelector('img');
  if (img) img.style.objectPosition = `${f.dataset.px}% ${f.dataset.py}%`;
}
function onDrag(el, onMove, onEnd, guard) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (guard && !guard(e)) return;
    e.preventDefault(); e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    const ctx = onMove(null, start, e) || {};
    // escuta na janela inteira: continua funcionando mesmo se a foto mudar de lugar durante o arraste
    const mv = (ev) => { if (ev.pointerId !== e.pointerId) return; ev.preventDefault(); onMove(ctx, { x: ev.clientX, y: ev.clientY, dx: ev.clientX - start.x, dy: ev.clientY - start.y }, ev); };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      onEnd?.(ctx, ev);
    };
    window.addEventListener('pointermove', mv, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}
function prepareDocLogos(ed) {
  for (const d of ed.querySelectorAll('.doc-logos')) {
    d.contentEditable = 'false';
    d.innerHTML = ['left', 'right'].map((side) => { const L = DOC_LOGOS[d.dataset[side]]; if (!L) return '<span></span>';
      const area = matchMedia('(max-width: 860px)').matches ? 4200 : 8000;
      return `<img class="dl-${side}" src="${L.src}" alt="${esc(L.name)}" style="height:${logoHeight(L.ar, area).toFixed(1)}px" />`; }).join('');
  }
}
async function preparePhotoGrids(ed, onChange) {
  prepareDocLogos(ed);
  const grids = [...ed.querySelectorAll('.photo-grid')];
  for (const g of grids) {
    if (!g.querySelector('figure.photo')) { g.remove(); continue; }
    g.contentEditable = 'false';
    if (!g.querySelector(':scope > .pg-tools')) {
      const tb = document.createElement('div');
      tb.className = 'pg-tools ph-ui';
      tb.innerHTML = `<span>Tamanho rápido:</span>${[1, 2, 3].map((n) => `<button type="button" data-cols="${n}" title="${n} por linha">${n}</button>`).join('')}<span class="pg-tip">Arraste as alças azuis para mudar o tamanho · ✥ para mover</span>`;
      g.prepend(tb);
      tb.addEventListener('mousedown', (e) => e.preventDefault());
      tb.onclick = (e) => {
        const b = e.target.closest('[data-cols]'); if (!b) return;
        const n = Number(b.dataset.cols);
        g.dataset.cols = String(n);
        g.querySelectorAll('figure.photo').forEach((f) => { f.dataset.w = String(Math.floor(100 / n)); f.dataset.ar = n === 1 ? '1.6' : '1.333'; applyPhotoStyle(f); });
        markCols(g); onChange();
      };
    }
    markCols(g);
    for (const f of g.querySelectorAll('figure.photo')) {
      photoDefaults(g, f);
      const cap = f.querySelector('figcaption') || f.appendChild(document.createElement('figcaption'));
      cap.contentEditable = 'true';
      if (!cap.dataset.bound) {
        cap.dataset.bound = '1';
        cap.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {   // selecionar tudo só na legenda
            e.preventDefault(); e.stopPropagation();
            const r = document.createRange(); r.selectNodeContents(cap); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
          }
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); }
        });
      }
      if (!f.querySelector('.ph-frame')) { const fr = document.createElement('div'); fr.className = 'ph-frame'; fr.appendChild(f.querySelector('img') || document.createElement('img')); f.prepend(fr); }
      const frame = f.querySelector('.ph-frame');
      if (!f.querySelector('img')) frame.appendChild(document.createElement('img'));
      const img = f.querySelector('img');
      img.draggable = false;
      applyPhotoStyle(f);
      if (f.querySelector('.ph-btns')) continue;
      // botões
      const bx = document.createElement('div');
      bx.className = 'ph-btns ph-ui';
      bx.innerHTML = `<button type="button" data-move title="Arrastar para mover a foto">✥</button><button type="button" data-fit title="Foto inteira / preencher o quadro">⤢</button><button type="button" data-rm title="Remover foto">✕</button>`;
      frame.appendChild(bx);
      bx.addEventListener('mousedown', (e) => e.preventDefault());
      bx.querySelector('[data-fit]').onclick = () => { f.dataset.fit = f.dataset.fit === 'contain' ? 'cover' : 'contain'; onChange(); };
      bx.querySelector('[data-rm]').onclick = async () => {
        if (!(await confirmDialog('Remover esta foto da página?', { okText: 'Remover', danger: true, title: 'Remover foto' }))) return;
        const path = f.dataset.path;
        const grid = f.closest('.photo-grid');
        f.remove();
        if (grid && !grid.querySelector('figure.photo')) grid.remove();
        onChange();
        if (path) sb.storage.from('fotos-notas').remove([path]).catch(() => {});
      };
      // alças: lateral (largura), baixo (altura), canto (tamanho mantendo a proporção)
      for (const kind of ['e', 's', 'se']) {
        const h = document.createElement('span');
        h.className = `ph-h ph-h-${kind} ph-ui`;
        frame.appendChild(h);
        onDrag(h, (ctx, p) => {
          const grid = f.closest('.photo-grid');
          if (!ctx) {
            f.classList.add('ph-active');
            const gw = grid.clientWidth - parseFloat(getComputedStyle(grid).paddingLeft) - parseFloat(getComputedStyle(grid).paddingRight);
            const r = frame.getBoundingClientRect();
            return { gw, w0: r.width, h0: r.height };
          }
          let w = ctx.w0, hgt = ctx.h0;
          if (kind === 'e') w = ctx.w0 + p.dx;
          if (kind === 's') hgt = ctx.h0 + p.dy;
          if (kind === 'se') { w = ctx.w0 + p.dx; hgt = w * (ctx.h0 / ctx.w0); }
          w = clamp(w, 80, ctx.gw);
          hgt = clamp(hgt, 60, 1400);
          const pct = clamp(((w + PH_GAP) / (ctx.gw + PH_GAP)) * 100, 12, 100);
          f.dataset.w = pct.toFixed(1);
          f.dataset.ar = clamp(w / hgt, 0.25, 4).toFixed(3);
          applyPhotoStyle(f);
        }, () => { f.classList.remove('ph-active'); onChange(); });
      }
      // arrastar a imagem: muda o enquadramento (qual parte aparece no quadro)
      onDrag(img, (ctx, p) => {
        if (!ctx) { const r = frame.getBoundingClientRect(); return { r, px: Number(f.dataset.px), py: Number(f.dataset.py) }; }
        if (f.dataset.fit === 'contain') return;
        f.dataset.px = clamp(ctx.px - (p.dx / ctx.r.width) * 100, 0, 100).toFixed(0);
        f.dataset.py = clamp(ctx.py - (p.dy / ctx.r.height) * 100, 0, 100).toFixed(0);
        applyPhotoStyle(f);
      }, () => onChange(), (e) => e.pointerType !== 'touch' || f.classList.contains('ph-sel'));
      // no celular: toque na foto para selecionar (aí o arraste ajusta o enquadramento; sem selecionar, a página rola normal)
      img.addEventListener('click', () => {
        ed.querySelectorAll('figure.photo.ph-sel').forEach((x) => x !== f && x.classList.remove('ph-sel'));
        f.classList.add('ph-sel');
      });
      // ✥ mover: arrasta a foto para outra posição (inclusive para outro quadro de fotos)
      onDrag(bx.querySelector('[data-move]'), (ctx, p) => {
        if (!ctx) {
          f.classList.add('ph-moving');
          const ghost = f.cloneNode(true); ghost.className = 'photo ph-ghost'; ghost.querySelectorAll('.ph-ui').forEach((x) => x.remove());
          ghost.style.width = f.getBoundingClientRect().width + 'px';
          document.body.appendChild(ghost);
          return { ghost };
        }
        ctx.ghost.style.left = p.x + 12 + 'px'; ctx.ghost.style.top = p.y + 12 + 'px';
        ctx.ghost.style.display = 'none';
        const under = document.elementFromPoint(p.x, p.y);
        ctx.ghost.style.display = '';
        const target = under?.closest?.('figure.photo');
        const grid = under?.closest?.('.photo-grid');
        if (target && target !== f && ed.contains(target)) {
          const r = target.getBoundingClientRect();
          if (p.x < r.left + r.width / 2) target.before(f); else target.after(f);
        } else if (grid && ed.contains(grid) && !grid.contains(f)) {
          grid.appendChild(f);
        } else if (!grid && under && ed.contains(under) && under !== ed) {
          // soltou no meio do texto: cria um quadro de fotos ali (antes ou depois do parágrafo)
          let blk = under; while (blk && blk.parentNode !== ed) blk = blk.parentNode;
          if (blk && blk.nodeType === 1) {
            const r = blk.getBoundingClientRect();
            const before = p.y < r.top + r.height / 2;
            const sib = before ? blk.previousElementSibling : blk.nextElementSibling;
            if (sib?.classList?.contains('photo-grid')) { if (!sib.contains(f)) (before ? sib.appendChild(f) : sib.querySelector('figure.photo') ? sib.querySelector('figure.photo').before(f) : sib.appendChild(f)); }
            else {
              const ng = document.createElement('div');
              ng.className = 'photo-grid'; ng.dataset.cols = f.closest('.photo-grid')?.dataset.cols || '2';
              if (before) blk.before(ng); else blk.after(ng);
              ng.appendChild(f);
              ctx.newGrid = true;
            }
          }
        }
      }, (ctx) => {
        ctx.ghost?.remove();
        f.classList.remove('ph-moving');
        ed.querySelectorAll('.photo-grid').forEach((gg) => { if (!gg.querySelector('figure.photo')) gg.remove(); });
        if (ctx.newGrid) preparePhotoGrids(ed, onChange);
        onChange();
      });
    }
  }
  // carrega as imagens (endereços temporários e privados)
  const need = [...ed.querySelectorAll('figure.photo')].map((f) => f.dataset.path).filter((p) => p && !PHOTO_URLS.has(p));
  if (need.length) {
    try {
      const { data } = await sb.storage.from('fotos-notas').createSignedUrls(need, 3600);
      (data || []).forEach((x) => x.signedUrl && PHOTO_URLS.set(x.path, x.signedUrl));
    } catch (e) { console.warn(e); }
  }
  for (const f of ed.querySelectorAll('figure.photo')) {
    const im = f.querySelector('img');
    const u = PHOTO_URLS.get(f.dataset.path);
    if (im && u && im.getAttribute('src') !== u) im.src = u;
  }
}
function markCols(g) { g.querySelectorAll('.pg-tools [data-cols]').forEach((b) => b.classList.toggle('on', b.dataset.cols === (g.dataset.cols || '2') && [...g.querySelectorAll('figure.photo')].every((f) => Math.abs(Number(f.dataset.w) - Math.floor(100 / Number(b.dataset.cols))) < 0.5))); }
// HTML para salvar: sem botões, sem endereços temporários
function serializeEditor(ed) {
  const c = ed.cloneNode(true);
  c.querySelectorAll('.ph-ui, .photo.uploading').forEach((x) => x.remove());
  c.querySelectorAll('.doc-logos').forEach((x) => { x.innerHTML = ''; });
  c.querySelectorAll('[contenteditable]').forEach((x) => x.removeAttribute('contenteditable'));
  c.querySelectorAll('[data-bound]').forEach((x) => x.removeAttribute('data-bound'));
  c.querySelectorAll('figure.photo img').forEach((x) => { x.removeAttribute('src'); x.removeAttribute('style'); x.removeAttribute('draggable'); });
  c.querySelectorAll('figure.photo, figure.photo .ph-frame').forEach((x) => { x.removeAttribute('style'); x.classList.remove('ph-active', 'ph-moving', 'ph-sel'); });
  return c.innerHTML;
}
async function removeNotePhotos(noteId) {
  try {
    const uid = await currentUid();
    const { data } = await sb.storage.from('fotos-notas').list(`${uid}/${noteId}`, { limit: 1000 });
    if (data?.length) await sb.storage.from('fotos-notas').remove(data.map((x) => `${uid}/${noteId}/${x.name}`));
  } catch (e) { console.warn(e); }
}

const ALLOWED_TAGS = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'A', 'DIV', 'SPAN', 'FIGURE', 'FIGCAPTION', 'IMG']);
// Logos disponíveis para o cabeçalho das anotações (arquivos em /logos)
const DOC_LOGOS = {
  allos: { src: 'logos/allos.jpg', name: 'ALLOS Engenharia e Projetos', ar: 668 / 354 },
  genica: { src: 'logos/genica.jpg', name: 'Gênica', ar: 515 / 112 },
};
// Mesma área visual para todas as logos (uma logo larga fica mais baixa), em px
const logoHeight = (ar, area) => Math.sqrt(area / ar);
const PHOTO_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[\w-]+\.jpg$/;
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
        // fotos: só a estrutura do quadro de fotos é aceita
        if (child.tagName === 'FIGURE' && !(child.classList.contains('photo') && PHOTO_PATH_RE.test(child.dataset.path || ''))) { child.remove(); continue; }
        if (child.tagName === 'IMG' && child.parentElement?.closest?.('figure.photo') == null) { child.remove(); continue; }
        for (const a of [...child.attributes]) {
          const keep = (child.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value))
            || (child.tagName === 'UL' && a.name === 'class' && a.value === 'checklist')
            || (child.tagName === 'LI' && a.name === 'data-checked')
            || (child.tagName === 'DIV' && a.name === 'class' && ['photo-grid', 'ph-frame', 'doc-logos'].includes(a.value))
            || (child.tagName === 'DIV' && ['data-left', 'data-right'].includes(a.name) && Object.hasOwn(DOC_LOGOS, a.value))
            || (child.tagName === 'DIV' && a.name === 'data-cols' && /^[123]$/.test(a.value))
            || (child.tagName === 'FIGURE' && ((a.name === 'class' && a.value === 'photo') || a.name === 'data-path' || (a.name === 'data-fit' && /^(cover|contain)$/.test(a.value))
                || (['data-w', 'data-ar', 'data-px', 'data-py'].includes(a.name) && /^\d{1,3}(\.\d{1,3})?$/.test(a.value))));
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
  const all = await q(sb.from('notes').select('*').order('updated_at', { ascending: false }));
  S.notes = (all || []).filter((n) => !n.is_template);
  S.noteTemplates = (all || []).filter((n) => n.is_template);
}

// ---------- Modelos de anotação ----------
const todayBR = () => new Date().toLocaleDateString('pt-BR');
const CK = (items) => `<ul class="checklist">${items.map((x) => `<li data-checked="false">${x}</li>`).join('')}</ul>`;
const NOTE_TEMPLATES = [
  { key: 'ata', icon: '📝', name: 'Ata de reunião', desc: 'Participantes, pauta, decisões e ações com responsável e prazo',
    title: () => `Ata de reunião — ${todayBR()}`,
    html: () => `<p><b>Data:</b> ${todayBR()} &nbsp; <b>Horário:</b> &nbsp; <b>Local:</b> </p>
<p><b>Projeto / Cliente:</b> </p>
<p><b>Elaborado por:</b> ${esc(S.me?.name || '')}</p>
<h2>Participantes</h2><ul><li>Nome — empresa / função</li></ul>
<h2>Pauta</h2><ol><li></li></ol>
<h2>Assuntos discutidos</h2><p></p>
<h2>Decisões</h2><ul><li></li></ul>
<h2>Ações combinadas</h2>${CK(['O que fazer — Responsável — Prazo'])}
<h2>Próxima reunião</h2><p><b>Data:</b> &nbsp; <b>Local:</b> </p>` },
  { key: 'visita', icon: '🏗️', name: 'Relatório de visita técnica', desc: 'Local, objetivo, constatações, fotos/anexos e pendências',
    title: () => `Visita técnica — ${todayBR()}`,
    html: () => `<p><b>Data:</b> ${todayBR()} &nbsp; <b>Local / obra:</b> </p>
<p><b>Cliente:</b> &nbsp; <b>Acompanhado por:</b> </p>
<p><b>Responsável pela visita:</b> ${esc(S.me?.name || '')}</p>
<h2>Objetivo da visita</h2><p></p>
<h2>Constatações</h2><ul><li></li></ul>
<h2>Medições / dados coletados</h2><ul><li></li></ul>
<h2>Fotos e anexos</h2><p>Indique onde estão salvos (pasta, link).</p>
<h2>Pendências</h2>${CK(['Pendência — Responsável — Prazo'])}` },
  { key: 'visita_genica', icon: '📋', name: 'Relatório de visita técnica — ALLOS + Gênica', desc: 'Com as logos da ALLOS e da Gênica no topo e no PDF',
    title: () => `Relatório de visita técnica — ${todayBR()}`,
    html: () => `<div class="doc-logos" data-left="allos" data-right="genica"></div>
<p><b>Cliente:</b> Gênica &nbsp; <b>Unidade / local:</b> </p>
<p><b>Data da visita:</b> ${todayBR()} &nbsp; <b>Horário:</b> </p>
<p><b>Responsável técnico (ALLOS):</b> ${esc(S.me?.name || '')}</p>
<p><b>Acompanhado por (Gênica):</b> </p>
<h2>Objetivo da visita</h2><p></p>
<h2>Descrição da visita</h2><p></p>
<h2>Constatações</h2>${CK(['O que foi verificado — situação encontrada'])}
<h2>Registro fotográfico</h2><p>Toque em <b>Foto</b> na barra acima para adicionar as fotos. Elas ficam em quadros, várias por página.</p>
<h2>Recomendações</h2><ul><li></li></ul>
<h2>Próximos passos</h2>${CK(['O que fazer — Responsável — Prazo'])}
<h2>Conclusão</h2><p></p>` },
  { key: 'fornecedor', icon: '🏭', name: 'Relatório de visita ao fornecedor', desc: 'Inspeção de fabricação: dados, não conformidades, fotos e pendências',
    title: () => `Relatório de visita — ${todayBR()}`,
    html: () => `<p><b>Fornecedor:</b> &nbsp; <b>Local:</b> </p>
<p><b>Data da visita:</b> ${todayBR()} &nbsp; <b>Pedido / OC:</b> </p>
<p><b>Equipamentos inspecionados:</b> </p>
<p><b>Participantes:</b> ${esc(S.me?.name || '')}</p>
<h2>Objetivo da visita</h2><p>Inspeção de fabricação e conferência com o projeto e a lista de materiais.</p>
<h2>Observações e não conformidades</h2>${CK(['Item / equipamento — o que foi encontrado — o que era esperado'])}
<h2>Registro fotográfico</h2><p>Toque em <b>Foto</b> na barra acima para adicionar as fotos. Elas ficam em quadros, várias por página.</p>
<h2>Pendências e ações</h2>${CK(['O que fazer — Responsável — Prazo'])}
<h2>Conclusão</h2><p>Aprovado / Aprovado com ressalvas / Reprovado</p>` },
  { key: 'inspecao', icon: '✅', name: 'Checklist de inspeção', desc: 'Lista de verificação com observações',
    title: () => `Inspeção — ${todayBR()}`,
    html: () => `<p><b>Data:</b> ${todayBR()} &nbsp; <b>Equipamento / item:</b> </p>
<p><b>Inspetor:</b> ${esc(S.me?.name || '')}</p>
<h2>Verificações</h2>${CK(['Dimensional conforme desenho', 'Soldas sem defeitos aparentes', 'Pintura / acabamento', 'Identificação / plaqueta', 'Documentação (certificados, relatórios)'])}
<h2>Não conformidades</h2><ul><li></li></ul>
<h2>Resultado</h2><p>Aprovado / Aprovado com ressalvas / Reprovado</p>` },
];
async function newNoteFrom(tpl) {
  const row = await q(sb.from('notes').insert(tpl ? { title: tpl.title, content: tpl.html, icon: tpl.icon || '📄' } : { title: '', content: '', icon: '📄' }).select().single());
  S.notes.unshift(row);
  location.hash = `#/notas/${row.id}`;
  setTimeout(() => (tpl ? $('#ed') : $('#note-title'))?.focus(), 80);
}
function chooseNoteTemplate() {
  const card = (attrs, icon, name, desc, extra = '') => `<div class="tpl-card" ${attrs}><span class="tpl-ic">${icon}</span><div class="tpl-tx"><b>${name}</b><span>${desc}</span></div>${extra}</div>`;
  const m = openModal({
    title: 'Nova página',
    body: `<div class="tpl-list">
      ${card('data-tpl="blank"', '📄', 'Página em branco', 'Comece do zero')}
      ${NOTE_TEMPLATES.map((x) => card(`data-tpl="${x.key}"`, x.icon, esc(x.name), esc(x.desc))).join('')}
    </div>`,
    foot: `<button class="btn" data-close>Cancelar</button>`,
  });
  const root = m.el;
  $$('[data-tpl]', root).forEach((b) => (b.onclick = async () => {
    const t = NOTE_TEMPLATES.find((x) => x.key === b.dataset.tpl);
    m.close();
    try { await newNoteFrom(t ? { title: t.title(), html: t.html(), icon: t.icon } : null); } catch (e) { toastErr(e); }
  }));
}
// Exporta a página como arquivo PDF (gerado no próprio app: funciona no celular e no computador)
async function exportNotePdf(note, html) {
  try {
    const { buildNotePdf } = await import('./minipdf.js');
    const title = note.title || 'Anotação';
    // baixa as fotos da página para colocar no PDF
    const images = {};
    const paths = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('figure.photo')].map((f) => f.dataset.path).filter(Boolean);
    if (paths.length) toast(`Preparando ${paths.length} foto${paths.length > 1 ? 's' : ''}…`);
    for (const path of paths) {
      try {
        const { data: blob, error } = await sb.storage.from('fotos-notas').download(path);
        if (error) throw error;
        const bmp = await createImageBitmap(blob);
        images[path] = { bytes: new Uint8Array(await blob.arrayBuffer()), w: bmp.width, h: bmp.height };
        bmp.close?.();
      } catch (e) { console.warn('foto', path, e); }
    }
    // logos do cabeçalho (se a página usar um modelo com logos)
    let logos = null;
    const dl = new DOMParser().parseFromString(html, 'text/html').querySelector('.doc-logos');
    if (dl) {
      logos = {};
      for (const side of ['left', 'right']) {
        const L = DOC_LOGOS[dl.dataset[side]];
        if (!L) continue;
        try {
          const blob = await (await fetch(L.src)).blob();
          const bmp = await createImageBitmap(blob);
          logos[side] = { bytes: new Uint8Array(await blob.arrayBuffer()), w: bmp.width, h: bmp.height };
        } catch (e) { console.warn('logo', e); }
      }
    }
    const bytes = buildNotePdf({
      logos,
      company: COMPANY_NAME, author: S.me?.name || '', date: new Date().toLocaleDateString('pt-BR'),
      title, html: sanitize(html), footer: `Gerado pelo ${APP_NAME}`, images,
    });
    const name = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'anotacao';
    const file = new File([bytes], `${name}.pdf`, { type: 'application/pdf' });
    const mobile = matchMedia('(max-width: 860px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (mobile && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('PDF gerado', 'ok');
  } catch (e) { toastErr(e); }
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
          <div style="display:${isAdmin() ? 'flex' : 'none'};gap:6px">
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
  $('#n-exp').onclick = () => isAdmin() && exportNotes();
  $('#n-imp').onclick = () => $('#n-file').click();
  $('#n-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importNotes(f); };
  $('#n-new').onclick = chooseNoteTemplate;

  if (note) mountEditor(note, renderList);
}

function mountEditor(note, renderList) {
  const wrap = $('#n-editor');
  wrap.innerHTML = `
    <div class="editor-inner">
      <div class="editor-top">
        <span id="n-saved">Editado ${relTime(note.updated_at)}</span>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="n-pdf" title="Baixar esta página em PDF">${ic('download').replace('<svg', '<svg width="15" height="15"')} PDF</button>
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
        <span class="sep"></span>
        <button data-cmd="photo" title="Adicionar fotos" class="tb-photo">${ic('camera')} <span>Foto</span></button>
        <input type="file" id="ph-file" accept="image/*" multiple hidden />
      </div>
      <div class="editor" id="ed" contenteditable="true" spellcheck="true"
        data-placeholder="Comece a escrever... Atalhos: # título, - lista, [] checklist, > citação"></div>
    </div>`;

  const ed = $('#ed');
  const titleEl = $('#note-title');
  ed.innerHTML = sanitize(note.content) || '<p><br></p>';
  preparePhotoGrids(ed, () => touch());
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* ignore */ }

  const updateEmpty = () => ed.classList.toggle('is-empty', !ed.textContent.trim() && !ed.querySelector('hr,li,img,figure'));
  updateEmpty();

  // --- salvar automaticamente ---
  let timer = null, dirty = false, saving = null;
  const savedEl = $('#n-saved');
  const save = async () => {
    if (!dirty) return;
    dirty = false;
    clearTimeout(timer);
    const html = serializeEditor(ed);
    const patch = { title: titleEl.value.trim(), content: html === '<p><br></p>' ? '' : html, icon: note.icon, updated_at: new Date().toISOString() };
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

  // --- PDF e modelo ---
  $('#n-pdf').onclick = async () => { dirty = true; await save(); exportNotePdf({ ...note, title: titleEl.value.trim() }, serializeEditor(ed)); };
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
      removeNotePhotos(note.id);
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
      case 'photo': {
        const sel = getSelection();
        photoRange = sel.rangeCount && ed.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
        $('#ph-file').value = '';
        $('#ph-file').click();
        return;
      }
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
  // --- fotos ---
  let photoRange = null;
  ed.addEventListener('pointerdown', (e) => { if (!e.target.closest('figure.photo')) ed.querySelectorAll('figure.photo.ph-sel').forEach((x) => x.classList.remove('ph-sel')); });
  $('#ph-file').onchange = async (e) => {
    const files = [...e.target.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    // onde inserir: no quadro de fotos onde está o cursor, ou um quadro novo depois do parágrafo atual
    let grid = photoRange && photoRange.startContainer.parentElement?.closest?.('.photo-grid');
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'photo-grid'; grid.dataset.cols = '2';
      let anchor = photoRange ? photoRange.startContainer : null;
      while (anchor && anchor.parentNode !== ed) anchor = anchor.parentNode;
      const isHint = anchor && anchor.nodeType === 1 && /^Toque em Foto/.test(anchor.textContent.trim());
      if (anchor && anchor.nodeType === 1 && ((!anchor.textContent.trim() && !anchor.querySelector('figure,hr')) || isHint)) anchor.replaceWith(grid);
      else if (anchor) anchor.after(grid);
      else ed.appendChild(grid);
      if (!grid.nextElementSibling) grid.after(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
    }
    const uid = await currentUid();
    for (const f of files) {
      const fig = document.createElement('figure');
      fig.className = 'photo uploading'; fig.dataset.fit = 'cover';
      fig.innerHTML = '<div class="ph-frame"><div class="ph-wait">Enviando foto…</div></div><figcaption></figcaption>';
      grid.appendChild(fig);
      try {
        const blob = await resizeToJpeg(f, 1600, 0.82);
        const path = `${uid}/${note.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error } = await sb.storage.from('fotos-notas').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
        PHOTO_URLS.set(path, URL.createObjectURL(blob));
        fig.dataset.path = path;
        fig.classList.remove('uploading');
        fig.innerHTML = '<div class="ph-frame"><img alt="" /></div><figcaption></figcaption>';
      } catch (err) { fig.remove(); toastErr(err); }
    }
    preparePhotoGrids(ed, () => touch());
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
// ASSISTENTE IA (Gemini, via Edge Function "assistente")
// ---------------------------------------------------------------------
const AI = { msgs: [], busy: false };
function aiSuggestions() {
  const base = ['Quais são minhas atividades mais urgentes?', 'O que eu preciso fazer hoje?', 'Quais atividades estão atrasadas?'];
  if (isAdmin()) return ['O que a equipe tem que fazer hoje?', 'Quem está sem atualizar as atividades?', 'Tem solicitação esperando aprovação?', 'Resumo do andamento de cada projeto', ...base.slice(0, 1)];
  return [...base, 'O que falta fazer nas minhas atividades?'];
}
function mdLite(text) {
  const lines = esc(text).split('\n');
  let html = '', inList = false;
  for (let line of lines) {
    line = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>');
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${li[1]}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    html += h ? `<p><b>${h[1]}</b></p>` : line.trim() ? `<p>${line}</p>` : '';
  }
  if (inList) html += '</ul>';
  return html;
}
function toggleAssistant() {
  if ($('#ai-panel')) { $('#ai-panel').remove(); $('#ai-fab').hidden = false; return; }
  closePopover();
  const el = document.createElement('div');
  el.id = 'ai-panel';
  el.className = 'ai-panel';
  el.innerHTML = `
    <div class="ai-head">
      <div class="ai-title">${ic('spark')}<div><b>Assistente IA</b><span>Pergunte sobre as atividades</span></div></div>
      <button class="btn btn-ghost btn-icon btn-sm" id="ai-clear" title="Nova conversa">${ic('trash')}</button>
      <button class="btn btn-ghost btn-icon btn-sm" id="ai-close" title="Fechar">${ic('x')}</button>
    </div>
    <div class="ai-body" id="ai-body"></div>
    <form class="ai-form" id="ai-form">
      <textarea id="ai-input" rows="1" placeholder="Pergunte algo…"></textarea>
      <button class="btn btn-primary btn-icon" type="submit" id="ai-send" title="Enviar">${ic('send')}</button>
    </form>`;
  document.body.appendChild(el);
  $('#ai-fab').hidden = true;
  $('#ai-close', el).onclick = toggleAssistant;
  $('#ai-clear', el).onclick = () => { AI.msgs = []; renderAI(); };
  const input = $('#ai-input', el);
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#ai-form').requestSubmit(); } });
  $('#ai-form', el).onsubmit = (e) => { e.preventDefault(); askAI(input.value); };
  renderAI();
  if (innerWidth > 860) setTimeout(() => input.focus(), 50);
}
function renderAI() {
  const body = $('#ai-body');
  if (!body) return;
  if (!AI.msgs.length) {
    body.innerHTML = `<div class="ai-hello"><div class="ai-spark">${ic('spark')}</div>
      <b>Olá, ${esc(firstName(S.me.name))}!</b><p>Eu leio as atividades que você pode ver no app e te ajudo a priorizar. Experimente:</p>
      <div class="ai-chips">${aiSuggestions().map((q) => `<button class="ai-chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <p class="ai-note">As respostas são geradas por IA (Google Gemini) e podem conter erros. Suas anotações pessoais nunca são enviadas.</p></div>`;
    $$('[data-q]', body).forEach((b) => (b.onclick = () => askAI(b.dataset.q)));
    return;
  }
  body.innerHTML = AI.msgs.map((m) => m.role === 'user'
    ? `<div class="ai-msg me">${esc(m.text)}</div>`
    : `<div class="ai-msg bot ${m.error ? 'err' : ''}">${mdLite(m.text)}</div>`).join('')
    + (AI.busy ? '<div class="ai-msg bot"><span class="ai-dots"><i></i><i></i><i></i></span></div>' : '');
  body.scrollTop = body.scrollHeight;
}
async function askAI(text) {
  text = String(text || '').trim();
  if (!text || AI.busy) return;
  const input = $('#ai-input');
  if (input) { input.value = ''; input.style.height = 'auto'; }
  AI.msgs.push({ role: 'user', text });
  AI.busy = true;
  renderAI();
  try {
    const history = AI.msgs.filter((m) => !m.error).slice(-12).map(({ role, text }) => ({ role, text }));
    const { data, error } = await sb.functions.invoke('assistente', { body: { messages: history } });
    if (error) {
      let code = '';
      try { code = (await error.context?.json())?.error || ''; } catch { /* ignore */ }
      throw new Error(code || error.message || 'erro');
    }
    AI.msgs.push({ role: 'assistant', text: data?.reply || 'Não consegui gerar uma resposta.' });
  } catch (e) {
    const m = String(e.message || e);
    const msg = /not_configured/.test(m) ? 'O assistente ainda não foi configurado: falta cadastrar a chave do Gemini no Supabase.'
      : /Failed to send|Failed to fetch|404|not found/i.test(m) ? 'O assistente ainda não está instalado no servidor (função "assistente" do Supabase).'
      : /ai_failed/.test(m) ? 'A IA não respondeu agora (limite gratuito do dia ou instabilidade). Tente de novo em alguns minutos.'
      : 'Não consegui falar com o assistente agora. Tente de novo.';
    AI.msgs.push({ role: 'assistant', text: msg, error: true });
  }
  AI.busy = false;
  renderAI();
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
    const [team_members, projects, tasks, task_comments, subtasks, activity_types, due_requests, task_history] = await Promise.all(
      ['team_members', 'projects', 'tasks', 'task_comments', 'subtasks', 'activity_types', 'due_requests', 'task_history'].map(fetchAll));
    const data = { app: 'gestao-atividades', tipo: 'equipe', versao: 3, criado_em: new Date().toISOString(), criado_por: S.me.email, data: { team_members, projects, tasks, task_comments, subtasks, activity_types, due_requests, task_history } };
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
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    // procura versão nova ao abrir e sempre que o app volta para a tela
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  // quando uma versão nova é instalada, recarrega uma vez para usá-la
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
}
