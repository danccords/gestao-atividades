// Gera PDF de verdade (sem bibliotecas externas) para as anotações.
// Usa as fontes padrão do PDF (Helvetica/Courier), que todo leitor de PDF tem.
// Funciona igual no computador e no celular.

const WR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500];
const WB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556];
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
const REPL = { '→': '->', '←': '<-', '✓': 'v', '✔': 'v', '☐': '[ ]', '☑': '[x]', '−': '-', ' ': ' ', '​': '' };

// texto -> bytes WinAnsi (caracteres sem equivalente, como emojis, são removidos)
function toAnsi(str) {
  let out = '';
  for (const ch of String(str || '').normalize('NFC')) {
    if (REPL[ch] !== undefined) { out += REPL[ch]; continue; }
    const c = ch.codePointAt(0);
    if (c === 9) out += '    ';
    else if (c >= 32 && c < 127) out += ch;
    else if (c >= 160 && c <= 255) out += String.fromCharCode(c);
    else if (CP1252[c]) out += String.fromCharCode(CP1252[c]);
    else if (c > 0xffff || (c >= 0x2600 && c <= 0x27bf) || (c >= 0xfe00 && c <= 0xfe0f)) continue;   // emoji/símbolos
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += /^[\x20-\x7e]+$/.test(base) ? base : '';
    }
  }
  return out;
}
const FONT = { R: 'F1', B: 'F2', I: 'F3', BI: 'F4', M: 'F5' };
function charW(code, f) {
  if (f === 'M') return 600;
  const t = f === 'B' || f === 'BI' ? WB : WR;
  return code >= 32 && code <= 255 ? t[code - 32] || 556 : 556;
}
function textW(s, f, size) { let w = 0; for (let i = 0; i < s.length; i++) w += charW(s.charCodeAt(i), f); return (w * size) / 1000; }
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r/g, '');
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((x) => x.toFixed(3)).join(' '); };

export function buildNotePdf({ company = '', author = '', date = '', title = '', html = '', footer = '' }) {
  const PW = 595.28, PH = 841.89, ML = 56, MR = 56, MT = 56, MB = 64;
  const maxW = PW - ML - MR;
  const pages = [];
  let ops = null, y = 0;
  const newPage = () => { ops = []; pages.push(ops); y = PH - MT; };
  const ensure = (h) => { if (y - h < MB) newPage(); };
  const text = (x, yy, s, f, size, color = '#1f2937') => { if (s) ops.push(`BT ${hex(color)} rg /${FONT[f]} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td (${esc(s)}) Tj ET`); };
  const line = (x1, y1, x2, y2, color = '#d1d5db', w = 0.8) => ops.push(`${hex(color)} RG ${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  const rect = (x, yy, w, h, stroke = '#6b7280', fill = null) => ops.push(fill ? `${hex(fill)} rg ${x} ${yy} ${w} ${h} re f` : `${hex(stroke)} RG 0.8 w ${x.toFixed(2)} ${yy.toFixed(2)} ${w} ${h} re S`);

  // quebra uma lista de trechos (com fonte) em linhas que cabem na largura
  function wrap(runs, width, size) {
    const lines = [[]];
    let lw = 0;
    const push = (word, f, color, isSpace) => {
      const w = textW(word, f, size);
      const cur = lines[lines.length - 1];
      if (!isSpace && lw + w > width && cur.length) {
        while (cur.length && cur[cur.length - 1].space) { lw -= cur[cur.length - 1].w; cur.pop(); }
        lines.push([]); lw = 0;
      }
      if (isSpace && !lines[lines.length - 1].length) return;
      if (!isSpace && w > width) {            // palavra maior que a linha: corta
        let part = '';
        for (const ch of word) {
          if (textW(part + ch, f, size) > width - lw && part) { lines[lines.length - 1].push({ s: part, f, color, w: textW(part, f, size) }); lines.push([]); lw = 0; part = ''; }
          part += ch;
        }
        word = part;
      }
      const ww = textW(word, f, size);
      lines[lines.length - 1].push({ s: word, f, color, w: ww, space: isSpace });
      lw += ww;
    };
    for (const r of runs) {
      if (r.br) { lines.push([]); lw = 0; continue; }
      const parts = toAnsi(r.text).split(/( +)/);
      for (const p of parts) if (p) push(p, r.f, r.color, /^ +$/.test(p));
    }
    return lines.filter((l, i) => l.length || i === 0);
  }
  function drawLines(lines, x, size, lead) {
    for (const ln of lines) {
      ensure(lead);
      y -= lead;
      let cx = x;
      for (const seg of ln) { if (!seg.space) text(cx, y + (lead - size) * 0.35, seg.s, seg.f, size, seg.color); cx += seg.w; }
    }
  }
  // trechos (negrito/itálico) de um elemento
  function runsOf(node, st = { b: false, i: false, m: false }, color, out = []) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const t = n.textContent.replace(/[\r\n\t]+/g, ' ');
        if (t) out.push({ text: t, f: st.m ? 'M' : st.b && st.i ? 'BI' : st.b ? 'B' : st.i ? 'I' : 'R', color });
      } else if (n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === 'BR') { out.push({ br: true }); continue; }
        if (['UL', 'OL', 'LI', 'P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE'].includes(tag)) continue;
        const s2 = { ...st };
        if (tag === 'B' || tag === 'STRONG') s2.b = true;
        if (tag === 'I' || tag === 'EM') s2.i = true;
        if (tag === 'CODE') s2.m = true;
        runsOf(n, s2, tag === 'A' ? '#1d4ed8' : color, out);
      }
    }
    return out;
  }
  const trimRuns = (runs) => { while (runs.length && !runs[0].br && !runs[0].text.trim()) runs.shift(); if (runs[0]?.text) runs[0].text = runs[0].text.replace(/^\s+/, ''); return runs; };

  function block(el, indent = 0) {
    const tag = el.tagName;
    const x = ML + indent, width = maxW - indent;
    if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
      const size = tag === 'H1' ? 16 : tag === 'H2' ? 13 : 11.5;
      y -= tag === 'H3' ? 6 : 10;
      ensure(size * 2.4);
      drawLines(wrap(trimRuns(runsOf(el, { b: true, i: false }, '#111827')), width, size), x, size, size * 1.3);
      if (tag === 'H2') { y -= 3; line(x, y, x + width, y, '#e5e7eb', 0.8); }
      y -= 4;
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      const check = el.classList.contains('checklist');
      let n = 0;
      for (const li of el.children) {
        if (li.tagName !== 'LI') continue;
        n++;
        const size = 10.5, lead = 15;
        const runs = trimRuns(runsOf(li, { b: false, i: false }, '#1f2937'));
        const lines = wrap(runs.length ? runs : [{ text: ' ', f: 'R' }], width - 18, size);
        ensure(lead);
        const yTop = y;
        if (check) {
          const done = li.dataset.checked === 'true';
          rect(x + 1, yTop - lead + 3.2, 8, 8, '#6b7280');
          if (done) ops.push(`${hex('#059669')} RG 1.3 w ${x + 2.6} ${yTop - lead + 7.3} m ${x + 4.6} ${yTop - lead + 5} l ${x + 8.2} ${yTop - lead + 10} l S`);
        } else {
          text(x + 2, yTop - lead + (lead - size) * 0.35, tag === 'OL' ? `${n}.` : '\x95', 'R', size, '#4b5563');
        }
        drawLines(lines, x + 18, size, lead);
        for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') block(sub, indent + 18);
      }
      y -= 4;
      return;
    }
    if (tag === 'BLOCKQUOTE') {
      const yStart = y;
      drawLines(wrap(trimRuns(runsOf(el, { b: false, i: true }, '#4b5563')), width - 14, 10.5), x + 14, 10.5, 15);
      line(x + 3, yStart - 2, x + 3, y + 1, '#d1d5db', 2.5);
      y -= 6;
      return;
    }
    if (tag === 'PRE') {
      const lines = el.textContent.split('\n').map((l) => [{ s: toAnsi(l), f: 'M', color: '#111827', w: 0 }]);
      for (const ln of lines) { ensure(13); y -= 13; rect(x, y - 2, width, 13, null, '#f3f4f6'); text(x + 6, y + 1.5, ln[0].s.slice(0, Math.floor((width - 12) / 5.4)), 'M', 9); }
      y -= 6;
      return;
    }
    if (tag === 'HR') { ensure(14); y -= 8; line(x, y, x + width, y); y -= 6; return; }
    // parágrafo / div / texto solto
    const runs = trimRuns(runsOf(el, { b: false, i: false }, '#1f2937'));
    const hasBlocks = [...el.children].some((c) => ['P', 'DIV', 'UL', 'OL', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE', 'HR'].includes(c.tagName));
    if (runs.some((r) => r.br || r.text.trim())) { drawLines(wrap(runs, width, 10.5), x, 10.5, 15.5); y -= 5; }
    else if (!hasBlocks) y -= 8;
    if (hasBlocks) for (const c of el.children) if (['P', 'DIV', 'UL', 'OL', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE', 'HR'].includes(c.tagName)) block(c, indent);
  }

  // ---- cabeçalho ----
  newPage();
  text(ML, y - 12, toAnsi(company), 'B', 12, '#1d4ed8');
  const meta = toAnsi([author, date].filter(Boolean).join('  ·  '));
  text(PW - MR - textW(meta, 'R', 9), y - 11, meta, 'R', 9, '#6b7280');
  y -= 22; line(ML, y, PW - MR, y, '#1d4ed8', 1.6); y -= 14;
  drawLines(wrap([{ text: title || 'Sem título', f: 'B', color: '#111827' }], maxW, 18), ML, 18, 23);
  y -= 8;

  // ---- corpo ----
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html');
  const root = doc.getElementById('r');
  for (const n of root.childNodes) {
    if (n.nodeType === 3) { if (n.textContent.trim()) { const p = doc.createElement('p'); p.textContent = n.textContent; block(p); } }
    else if (n.nodeType === 1) block(n);
  }

  // ---- rodapé em todas as páginas ----
  const total = pages.length;
  pages.forEach((p, i) => {
    ops = p;
    line(ML, MB - 22, PW - MR, MB - 22, '#e5e7eb', 0.6);
    text(ML, MB - 36, toAnsi(footer), 'R', 8.5, '#9ca3af');
    const pg = `Página ${i + 1} de ${total}`;
    text(PW - MR - textW(toAnsi(pg), 'R', 8.5), MB - 36, toAnsi(pg), 'R', 8.5, '#9ca3af');
  });

  // ---- monta o arquivo PDF ----
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(''), pagesId = add('');
  const fonts = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Courier']
    .map((n) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${n} /Encoding /WinAnsiEncoding >>`));
  const fontRes = fonts.map((id, i) => `/F${i + 1} ${id} 0 R`).join(' ');
  const kids = [];
  for (const p of pages) {
    const content = p.join('\n');
    const cid = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << ${fontRes} >> >> /Contents ${cid} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${esc(toAnsi(title))}) /Author (${esc(toAnsi(author))}) /Producer (${esc(toAnsi(footer))}) >>`);
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}
