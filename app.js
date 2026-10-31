(() => {
'use strict';
const D = window.UAI;
const KEY = 'uai-study-v1';
const $ = s => document.querySelector(s);
const app = $('#app');

/* ---------- storage (guarded for sandboxed previews) ---------- */
const Store = window.UAIStore || { persistent: false, get: () => null, set: () => {} };
function load() { try { const raw = Store.get(KEY); if (raw) return JSON.parse(raw); } catch (e) {} return { weeks: {}, items: {}, refs: {}, start: '' }; }
let S = load();
S.weeks ||= {}; S.items ||= {}; S.refs ||= {};
function save() { try { Store.set(KEY, JSON.stringify(S)); } catch (e) {} }
const W = n => (S.weeks[n] ||= { status: 'todo', checks: {}, notes: '', score: {} });

/* ---------- indexes ---------- */
const MODS = {}; const MOD_PHASE = {};
D.phases.forEach(p => p.modules.forEach(m => { MODS[m.id] = m; MOD_PHASE[m.id] = p; }));
const REF = {}; D.refs.forEach(r => REF[r.id] = r);
const MOD_WEEK = {}; D.weeks.forEach(w => w.mods.forEach(id => MOD_WEEK[id] = w.week));
const modLabel = id => id === 'E' ? 'Electives' : id.startsWith('W') ? 'Week ' + id.slice(1) : 'Module ' + id.slice(1);

/* ---------- helpers ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function md(t) {
  let h = esc(t);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+?)\)(\{\{(\d+)\}\})?/g, (m, txt, url, _x, n) =>
    `<a href="${url}" target="_blank" rel="noopener">${txt}</a>` + (n ? `<sup class="ref"><a href="#ref-${n}" data-ref="${n}" aria-label="Reference ${n}">[${n}]</a></sup>` : ''));
  return h;
}
const refsIn = t => [...String(t).matchAll(/\{\{(\d+)\}\}/g)].map(m => +m[1]);
function itemKey(modId, si, ii, t) { const r = refsIn(t); return r.length ? 'r' + r[0] : `${modId}:${si}:${ii}`; }
function isDone(key) { return key[0] === 'r' && !key.includes(':') ? !!S.refs[key.slice(1)] : !!S.items[key]; }
function setDone(key, v) { if (key[0] === 'r' && !key.includes(':')) S.refs[key.slice(1)] = v; else S.items[key] = v; save(); }
function modItems(m) { const out = []; m.sections.forEach((s, si) => s.items.forEach((t, ii) => { if (refsIn(t).length) out.push(itemKey(m.id, si, ii, t)); })); return [...new Set(out)]; }
function modProgress(m) { const k = modItems(m); return { done: k.filter(isDone).length, total: k.length }; }
function weekDate(n) {
  if (!S.start) return '';
  const d = new Date(S.start + 'T12:00:00'); d.setDate(d.getDate() + (n - 1) * 7);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const statusClass = s => s === 'done' ? 'done' : s === 'prog' ? 'prog' : '';
const statusText = s => s === 'done' ? 'Done' : s === 'prog' ? 'In progress' : 'Not started';
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800); }
function confirmDlg(title, body, okText = 'Confirm') {
  return new Promise(res => {
    const d = $('#dialog'); $('#dlgTitle').textContent = title; $('#dlgBody').textContent = body; $('#dlgOk').textContent = okText; d.hidden = false;
    const done = v => { d.hidden = true; $('#dlgOk').onclick = $('#dlgCancel').onclick = null; res(v); };
    $('#dlgOk').onclick = () => done(true); $('#dlgCancel').onclick = () => done(false);
  });
}
const chev = '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

/* ---------- navigation ---------- */
let stack = [{ v: 'plan' }];
let refFilter = { q: '', type: 'All', unread: false };
function go(view, push = true) { if (push) stack.push(view); else stack = [view]; render(); }
function back() { if (stack.length > 1) { stack.pop(); render(); } }
$('#backBtn').onclick = back;
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => go({ v: b.dataset.tab }, false));

app.addEventListener('click', e => {
  const r = e.target.closest('[data-ref]');
  if (r) { e.preventDefault(); refFilter = { q: '', type: 'All', unread: false }; go({ v: 'refs', focus: +r.dataset.ref }); return; }
  const nav = e.target.closest('[data-go]');
  if (nav) { e.preventDefault(); const [v, id] = nav.dataset.go.split(':'); go({ v, id: v === 'week' ? +id : id }); }
});

function render() {
  const cur = stack[stack.length - 1];
  const tab = { plan: 'plan', week: 'plan', modules: 'modules', module: 'modules', refs: 'refs', settings: 'settings' }[cur.v];
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#backBtn').hidden = stack.length < 2;
  const views = { plan: vPlan, week: vWeek, modules: vModules, module: vModule, refs: vRefs, settings: vSettings };
  views[cur.v](cur);
  if (cur.focus) {
    const el = document.getElementById('ref-' + cur.focus);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); }
    delete cur.focus;
  } else window.scrollTo(0, 0);
}
const setTitle = t => { $('#viewTitle').textContent = t; document.title = t + ' · UpskillAI Self Study'; };

/* ---------- Plan ---------- */
function vPlan() {
  setTitle('Plan');
  const done = D.weeks.filter(w => W(w.week).status === 'done').length;
  const allRefs = new Set(); D.phases.forEach(p => p.modules.forEach(m => modItems(m).forEach(k => allRefs.add(k))));
  const readDone = [...allRefs].filter(isDone).length;
  const next = D.weeks.find(w => W(w.week).status !== 'done');
  let h = `<section class="card hero">`;
  if (next) {
    h += `<div class="label">${W(next.week).status === 'prog' ? 'In progress' : 'Up next'} · Week ${next.week}${weekDate(next.week) ? ' · ' + weekDate(next.week) : ''}</div>
      <h2>${esc(next.module)}</h2><p>${esc(next.milestone)}</p>
      <div class="btnrow"><button class="btn primary" data-go="week:${next.week}">Open week ${next.week}</button></div>`;
  } else h += `<div class="label">Complete</div><h2>All 20 weeks done</h2><p>Review your capstone and phase scores, or start an elective.</p>`;
  h += `<div class="stats"><div class="stat"><b>${done}/20</b><span>weeks done</span></div>
    <div class="stat"><b>${readDone}/${allRefs.size}</b><span>readings done</span></div>
    <div class="stat"><b>${Math.round(done / 20 * 100)}%</b><span>complete</span></div></div>
    <div class="bar" aria-hidden="true"><i style="width:${done / 20 * 100}%"></i></div></section>`;
  D.phases.forEach(p => {
    const ws = D.weeks.filter(w => w.phase === p.n);
    h += `<div class="sectionhead"><h3>Phase ${p.n} · ${esc(p.title)}</h3><span>Wk ${p.weeks}</span></div><div class="list">`;
    ws.forEach(w => {
      const st = W(w.week).status;
      h += `<button class="row" data-go="week:${w.week}" aria-label="Week ${w.week}: ${esc(w.module)}, ${statusText(st)}">
        <span class="wk ${statusClass(st)}">${st === 'done' ? '✓' : w.week}</span>
        <span class="rowmain"><b>${esc(w.module)}${w.checkpoint ? '<span class="tag">Gate</span>' : ''}</b>
        <small>${weekDate(w.week) ? weekDate(w.week) + ' · ' : ''}${esc(w.deliverable)}</small></span>${chev}</button>`;
    });
    h += `</div>`;
  });
  if (!S.start) h += `<p class="note" style="margin:14px 4px">Set a start date in Settings to see target dates for each week.</p>`;
  app.innerHTML = h;
}

/* ---------- Week ---------- */
const DIMS = [['c', 'Concept recall'], ['a', 'Applied skill'], ['j', 'Critical judgment'], ['k', 'Executive communication']];
function vWeek({ id: n }) {
  const w = D.weeks.find(x => x.week === n); const s = W(n);
  setTitle('Week ' + n);
  let h = `<section class="card modhead"><div class="code">Phase ${w.phase} · Week ${n}${weekDate(n) ? ' · ' + weekDate(n) : ''}</div><h2>${esc(w.module)}</h2>
    <div class="status" role="group" aria-label="Week status">
      ${['todo', 'prog', 'done'].map(k => `<button data-s="${k}" aria-pressed="${s.status === k}">${statusText(k)}</button>`).join('')}
    </div></section>`;
  h += `<section class="card"><div class="modsec"><h4>Milestones</h4>
    ${[['m', 'Core milestone', w.milestone], ['l', 'Builder lab (optional)', w.lab], ['d', 'Deliverable', w.deliverable]].map(([k, lab, txt]) =>
      `<label class="check"><input type="checkbox" data-chk="${k}" ${s.checks[k] ? 'checked' : ''}><span><strong>${lab}.</strong> ${esc(txt)}</span></label>`).join('')}
    </div></section>`;
  if (w.checkpoint) {
    h += `<section class="card"><div class="modsec"><h4>Phase gate self-assessment</h4>
      <p class="note" style="margin:0 0 10px">Score 1–5. Advance when every dimension is 3 or higher.</p><div class="score">
      ${DIMS.map(([k, lab]) => `<label id="lb-${k}">${lab}</label><div class="dots" role="group" aria-labelledby="lb-${k}">${[1, 2, 3, 4, 5].map(v => `<button data-score="${k}:${v}" aria-pressed="${s.score[k] === v}">${v}</button>`).join('')}</div>`).join('')}
      </div><div class="gate" id="gate"></div></div></section>`;
  }
  w.mods.forEach(id => { h += moduleCard(MODS[id], true); });
  h += `<section class="card"><div class="modsec"><h4>Notes</h4><textarea id="notes" placeholder="Key takeaways, questions, links to your notebooks…">${esc(s.notes || '')}</textarea></div></section>`;
  app.innerHTML = h;
  const gate = () => { const g = $('#gate'); if (!g) return; const v = DIMS.map(([k]) => s.score[k]);
    if (v.some(x => !x)) { g.className = 'gate'; g.textContent = ''; return; }
    const ok = v.every(x => x >= 3); g.className = 'gate ' + (ok ? 'pass' : 'fail');
    g.textContent = ok ? 'Gate passed. You are ready for the next phase.' : 'Repeat this phase’s builder lab on any dimension scored 2 or lower.'; };
  gate();
  app.querySelectorAll('.status button').forEach(b => b.onclick = () => { s.status = b.dataset.s; save();
    app.querySelectorAll('.status button').forEach(x => x.setAttribute('aria-pressed', x === b)); toast('Week ' + n + ': ' + statusText(s.status)); });
  app.querySelectorAll('[data-chk]').forEach(c => c.onchange = () => { s.checks[c.dataset.chk] = c.checked;
    if (s.status === 'todo' && c.checked) { s.status = 'prog'; app.querySelector('.status [data-s=prog]').click(); }
    if (['m', 'l', 'd'].every(k => s.checks[k]) && s.status !== 'done') { app.querySelector('.status [data-s=done]').click(); }
    save(); });
  app.querySelectorAll('[data-score]').forEach(b => b.onclick = () => { const [k, v] = b.dataset.score.split(':'); s.score[k] = +v; save();
    b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); gate(); });
  const ta = $('#notes'); let t; ta.oninput = () => { clearTimeout(t); t = setTimeout(() => { s.notes = ta.value; save(); }, 300); };
  bindItems();
}

function moduleCard(m, withHead) {
  const p = MOD_PHASE[m.id]; const pr = modProgress(m);
  let h = `<section class="card">`;
  if (withHead) h += `<div class="modhead" style="margin-bottom:12px"><div class="code">${modLabel(m.id)}${pr.total ? ` · ${pr.done}/${pr.total} read` : ''}</div><h2 style="font-size:20px">${esc(m.title)}</h2></div>`;
  m.sections.forEach((sec, si) => {
    h += `<div class="modsec">${sec.label ? `<h4>${esc(sec.label)}</h4>` : ''}`;
    sec.items.forEach((t, ii) => {
      const has = refsIn(t).length; const key = itemKey(m.id, si, ii, t);
      h += has ? `<label class="item"><input type="checkbox" data-item="${key}" ${isDone(key) ? 'checked' : ''} aria-label="Mark as read"><span class="txt">${md(t)}</span></label>`
               : `<div class="item nocheck"><span class="txt">${md(t)}</span></div>`;
    });
    h += `</div>`;
  });
  return h + `</section>`;
}
function bindItems() {
  app.querySelectorAll('[data-item]').forEach(c => {
    c.onchange = () => { setDone(c.dataset.item, c.checked); app.querySelectorAll(`[data-item="${c.dataset.item}"]`).forEach(x => x.checked = c.checked); };
  });
}

/* ---------- Modules ---------- */
function vModules() {
  setTitle('Modules');
  let h = `<p class="muted" style="margin:0 4px 12px">Five core courses and 16 modules, plus two added weeks and an elective. Tap a module for its readings and lectures.</p>`;
  D.phases.forEach(p => {
    const c = D.courses.find(x => x.n === p.n);
    h += `<div class="sectionhead"><h3>Phase ${p.n} · Weeks ${p.weeks}</h3></div>`;
    h += `<section class="card course"><div class="modhead"><div class="code">${c ? 'Course ' + c.n + ' · ' + c.code : 'Capstone'}</div>
      <h2 style="font-size:20px">${esc(c ? c.title : p.title)}</h2>
      ${c ? `<div class="meta">${esc(c.faculty)} · ${esc(c.effort)}</div><div class="meta"><a href="${c.url}" target="_blank" rel="noopener">Source course page</a><sup class="ref"><a href="#ref-${c.ref}" data-ref="${c.ref}">[${c.ref}]</a></sup></div>` : `<div class="meta">${esc(p.intro || '')}</div>`}
      </div></section><div class="list">`;
    p.modules.forEach(m => {
      const pr = modProgress(m);
      h += `<button class="row" data-go="module:${m.id}"><span class="wk ${pr.total && pr.done === pr.total ? 'done' : pr.done ? 'prog' : ''}">${m.id === 'E' ? '★' : m.id.slice(1)}</span>
        <span class="rowmain"><b>${esc(m.title)}</b><small>${modLabel(m.id)} · Week ${MOD_WEEK[m.id]}${pr.total ? ` · ${pr.done}/${pr.total} read` : ''}</small></span>${chev}</button>`;
    });
    h += `</div>`;
  });
  app.innerHTML = h;
}
function vModule({ id }) {
  const m = MODS[id]; const p = MOD_PHASE[id];
  setTitle(modLabel(id));
  let h = `<section class="card modhead"><div class="code">Phase ${p.n} · ${esc(p.title)}</div><h2>${esc(m.title)}</h2>
    <p>${esc(p.maps || '')}${p.maps ? '. ' : ''}Scheduled for week ${MOD_WEEK[id]}.</p>
    <div class="btnrow"><button class="btn" data-go="week:${MOD_WEEK[id]}">Open week ${MOD_WEEK[id]} tracker</button></div></section>`;
  h += moduleCard(m, false);
  h += `<p class="note" style="margin:6px 4px">Tap a title to open the source. Tap a gold number to see the full reference.</p>`;
  app.innerHTML = h; bindItems();
}

/* ---------- References ---------- */
const TYPES = ['All', 'Program pages', 'Paper', 'Textbook', 'Course & video', 'Article', 'Reference', 'Standard & regulation', 'Tool'];
function vRefs() {
  setTitle('References');
  let h = `<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--faint)"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
    <input id="q" type="search" placeholder="Search ${D.refs.length} references" value="${esc(refFilter.q)}" aria-label="Search references" autocomplete="off"></div>
    <div class="chips" role="group" aria-label="Filter by type">${TYPES.map(t => `<button class="chip" data-type="${t}" aria-pressed="${refFilter.type === t}">${t === 'All' ? 'All' : t}</button>`).join('')}
    <button class="chip" data-unread aria-pressed="${refFilter.unread}">Unread only</button></div>
    <div id="refcount" class="note" style="margin:0 4px 8px"></div><div class="list" id="reflist"></div>`;
  app.innerHTML = h;
  const draw = () => {
    const q = refFilter.q.trim().toLowerCase();
    const list = D.refs.filter(r => (refFilter.type === 'All' || r.type === refFilter.type) && (!refFilter.unread || !S.refs[r.id]) &&
      (!q || (r.title + ' ' + r.author + ' ' + r.suffix + ' ' + r.url + ' ' + r.id).toLowerCase().includes(q)));
    $('#refcount').textContent = `${list.length} of ${D.refs.length} · numbered by first appearance in the guide`;
    $('#reflist').innerHTML = list.length ? list.map(r => `<article class="ref-entry" id="ref-${r.id}">
      <div class="ref-num">${r.id}</div>
      <div class="ref-body"><div class="typ">${esc(r.type)}</div>
        ${r.author ? `<div class="au">${esc(r.author)}</div>` : ''}
        <a class="ti" href="${r.url}" target="_blank" rel="noopener">${esc(r.title)}</a>
        ${r.suffix ? `<div class="ve">${esc(r.suffix.replace(/^\(|\)$/g, ''))}</div>` : ''}
        <span class="url">${esc(r.url.replace(/^https?:\/\//, ''))}</span>
        ${r.modules.length ? `<div class="used"><span class="note">Used in</span>${r.modules.map(id => `<button data-go="module:${id}">${modLabel(id)}</button>`).join('')}</div>` : ''}
      </div>
      <label class="item readtoggle" style="border:0;padding:0"><input type="checkbox" data-refread="${r.id}" ${S.refs[r.id] ? 'checked' : ''} aria-label="Mark reference ${r.id} as read"></label>
    </article>`).join('') : `<div class="empty">No references match. Try a different search or filter.</div>`;
    app.querySelectorAll('[data-refread]').forEach(c => c.onchange = () => { S.refs[c.dataset.refread] = c.checked; save(); });
  };
  draw();
  $('#q').oninput = e => { refFilter.q = e.target.value; draw(); };
  app.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { refFilter.type = b.dataset.type;
    app.querySelectorAll('[data-type]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  const ub = app.querySelector('[data-unread]'); ub.onclick = () => { refFilter.unread = !refFilter.unread; ub.setAttribute('aria-pressed', refFilter.unread); draw(); };
}

/* ---------- Settings ---------- */
function vSettings() {
  setTitle('Settings');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  app.innerHTML = `
  <section class="card"><div class="modsec"><h4>Start date</h4>
    <p class="note" style="margin:0 0 8px">Week 1 begins on this date. Target dates appear across the plan.</p>
    <input type="date" id="start" value="${S.start || ''}" aria-label="Start date"></div></section>
  <section class="card"><div class="modsec"><h4>Install on iPhone</h4>
    ${standalone ? '<p class="muted" style="margin:0">Installed. You are running the home-screen app.</p>' :
    `<ol class="steps"><li>Open this page in <strong>Safari</strong>.</li><li>Tap the <strong>Share</strong> button.</li><li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol>
     <p class="note">The app then opens full screen, works offline, and keeps your progress on the device.</p>`}</div></section>
  <section class="card"><div class="modsec"><h4>Backup and sync</h4>
    <p class="note" style="margin:0">${Store.persistent ? 'Progress is saved on this device only. Export a backup file to move it to another device.' : 'This preview does not save progress between visits. Use the installed version to keep progress, or export a backup before closing.'}</p>
    <div class="btnrow"><button class="btn" id="exp">Export progress</button><button class="btn" id="impBtn">Import backup</button>
    <input type="file" id="imp" accept="application/json,.json" hidden></div></div></section>
  <section class="card"><div class="modsec"><h4>Reset</h4>
    <p class="note" style="margin:0">Clears all statuses, checkmarks, scores, and notes.</p>
    <div class="btnrow"><button class="btn" id="reset" style="color:var(--danger)">Reset all progress</button></div></div></section>
  <section class="card"><div class="modsec"><h4>About</h4>
    <p class="note" style="margin:0">UpskillAI Self Study is modeled on the public syllabus of MIT Open Learning’s <a href="https://learn.mit.edu/programs/program-v1:UAI+B2C" target="_blank" rel="noopener">Universal AI program</a>; it is not affiliated with or endorsed by MIT. Readings are mapped to the published module outcomes, since no official reading list is published. Weeks 11 and 19 are added synthesis and governance weeks.</p></div></section>`;
  $('#start').onchange = e => { S.start = e.target.value; save(); toast(S.start ? 'Start date saved' : 'Start date cleared'); };
  $('#exp').onclick = () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'upskillai-progress.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Backup exported');
  };
  $('#impBtn').onclick = () => $('#imp').click();
  $('#imp').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (!d.weeks) throw 0; S = { weeks: {}, items: {}, refs: {}, start: '', ...d }; save(); toast('Backup imported'); }
      catch (err) { toast('That file is not a valid backup'); } }; r.readAsText(f); };
  $('#reset').onclick = async () => { if (await confirmDlg('Reset all progress?', 'This clears every status, checkmark, score, and note on this device. Export a backup first if you want to keep them.', 'Reset')) {
    S = { weeks: {}, items: {}, refs: {}, start: S.start }; save(); toast('Progress reset'); } };
}

render();
if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {} }
})();
