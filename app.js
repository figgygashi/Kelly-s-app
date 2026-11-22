'use strict';
/* Kelly's Memory — a small, private, offline memory helper.
   All data lives in this browser's localStorage. Use Settings → Back up to save a copy. */

const KEY = 'kelly-memory-v1';
const DAY = 864e5;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BOX_DAYS = [0, 1, 3, 7, 14, 30]; // Leitner spacing for Practice, by box number

const $ = (s, el = document) => el.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
const fmtTime = (hhmm) => hhmm ? new Date(`2000-01-01T${hhmm}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
const fmtDay = (d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => d.toLocaleDateString(undefined, opts);

/* ---------- Storage ---------- */

function blank() {
  return {
    version: 1,
    settings: { name: 'Kelly' },
    routines: [
      { id: uid(), emoji: '💧', title: 'Drink a glass of water', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6] },
      { id: uid(), emoji: '🔑', title: 'Keys, wallet, phone before leaving', time: '', days: [1, 2, 3, 4, 5] },
    ],
    doneLog: {},   // { 'YYYY-MM-DD': [routineId, ...] }
    reminders: [], // { id, text, due: 'YYYY-MM-DDTHH:MM' | '', done, doneAt, notified }
    notes: [],     // { id, text, tags, pinned, created }
    places: [],    // { id, item, location, updated }
    people: [],    // { id, name, relation, details, updated }
    dates: [],     // { id, label, date: 'YYYY-MM-DD', type, yearly }
    cards: [],     // { id, front, back, box, due: 'YYYY-MM-DD' }
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch (e) { /* storage blocked or corrupt — fall back to fresh data */ }
  return blank();
}

let db = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('⚠️ Could not save. Try backing up from Settings.'); }
}

const state = { view: 'today', q: { remember: '', people: '' }, review: null };

/* ---------- Helpers ---------- */

function timeAgo(ts) {
  const d = daysBetween(new Date(ts), new Date());
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 730) return `${Math.round(d / 30)} months ago`;
  return `${Math.round(d / 365)} years ago`;
}

function dueInfo(s) {
  if (!s) return { label: 'Anytime', cls: '' };
  const d = new Date(s);
  const now = new Date();
  const diff = daysBetween(now, d);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d < now) return { label: diff === 0 ? `Overdue · ${t}` : `Overdue · ${fmtDay(d)}`, cls: 'overdue' };
  if (diff === 0) return { label: `Today · ${t}`, cls: 'soon' };
  if (diff === 1) return { label: `Tomorrow · ${t}`, cls: '' };
  return { label: `${fmtDay(d)} · ${t}`, cls: '' };
}

function nextOccurrence(entry) {
  const base = parseDay(entry.date);
  if (!entry.yearly) return base;
  const today = startOfDay(new Date());
  let next = new Date(today.getFullYear(), base.getMonth(), base.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, base.getMonth(), base.getDate());
  return next;
}

function datesWithNext() {
  const today = new Date();
  return db.dates.map((e) => {
    const next = nextOccurrence(e);
    const away = daysBetween(today, next);
    let extra = '';
    const year = parseDay(e.date).getFullYear();
    if (e.yearly && year > 1900 && year < next.getFullYear()) {
      const n = next.getFullYear() - year;
      if (e.type === 'birthday') extra = `turns ${n}`;
      else if (e.type === 'anniversary') extra = `${n} ${n === 1 ? 'year' : 'years'}`;
    }
    return { ...e, next, away, extra };
  }).sort((a, b) => a.next - b.next);
}

const DATE_TYPES = { birthday: '🎂', anniversary: '💞', appointment: '🩺', event: '🎉', other: '📌' };

function awayLabel(n) {
  if (n === 0) return '<b>Today</b>';
  if (n === 1) return '<b>1</b><small>day</small>';
  return `<b>${n}</b><small>days</small>`;
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}

function matches(q, ...fields) {
  if (!q) return true;
  const hay = fields.join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

/* ---------- Views ---------- */

const views = {
  today() {
    const now = new Date();
    const h = now.getHours();
    const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const done = new Set(db.doneLog[dayKey()] || []);
    const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99');
    const todays = db.routines.filter((r) => r.days.includes(now.getDay())).sort(byTime);
    const others = db.routines.filter((r) => !r.days.includes(now.getDay())).sort(byTime);
    const doneCount = todays.filter((r) => done.has(r.id)).length;
    const rems = db.reminders.filter((r) => !r.done)
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const soon = datesWithNext().filter((d) => d.away >= 0 && d.away <= 30).slice(0, 5);
    const lastPlace = [...db.places].sort((a, b) => b.updated - a.updated)[0];
    const dueCards = db.cards.filter((c) => c.due <= dayKey()).length;

    return `
      <section class="hero">
        <p class="greet">${greet}, ${esc(db.settings.name)} 👋</p>
        <h1>${now.toLocaleDateString(undefined, { weekday: 'long' })}</h1>
        <p class="big-date">${now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      </section>

      ${soon.length ? `
      <section class="card">
        <div class="sec-head"><h2>Coming up</h2><a href="#dates" class="btn small">All dates</a></div>
        <ul class="list">${soon.map(dateItem).join('')}</ul>
      </section>` : ''}

      <section class="card">
        <div class="sec-head"><h2>Reminders</h2><button class="btn small" data-action="add-reminder">+ Add</button></div>
        ${rems.length ? `<ul class="list">${rems.map((r) => {
          const d = dueInfo(r.due);
          return `<li class="item">
            <button class="check" data-action="done-reminder" data-id="${r.id}" aria-label="Mark done: ${esc(r.text)}"></button>
            <div class="body" data-action="edit-reminder" data-id="${r.id}">
              <div class="title">${esc(r.text)}</div>
              <span class="tag ${d.cls}">${esc(d.label)}</span>
            </div></li>`;
        }).join('')}</ul>` : `<p class="empty">Nothing to remember right now. 🎉</p>`}
      </section>

      <section class="card">
        <div class="sec-head"><h2>Today's routine</h2>
          <span class="count">${doneCount}/${todays.length}</span>
          <button class="btn small" data-action="add-routine">+ Add</button></div>
        ${todays.length ? `
          <div class="progress"><div style="width:${todays.length ? (doneCount / todays.length) * 100 : 0}%"></div></div>
          <ul class="list">${todays.map((r) => routineItem(r, done.has(r.id), true)).join('')}</ul>`
          : `<p class="empty">No routines for today.</p>`}
        ${others.length ? `<details><summary>Other days (${others.length})</summary>
          <ul class="list">${others.map((r) => routineItem(r, false, false)).join('')}</ul></details>` : ''}
      </section>

      <section class="card">
        <div class="sec-head"><h2>Quick save</h2></div>
        <div class="row">
          <button class="btn" data-action="add-place">📍 Where I put…</button>
          <button class="btn" data-action="add-note">📝 Note</button>
        </div>
        ${lastPlace ? `<p class="hint">Last saved: <b>${esc(lastPlace.item)}</b> → ${esc(lastPlace.location)} (${timeAgo(lastPlace.updated)})</p>` : ''}
        ${dueCards ? `<p class="hint">🎯 ${dueCards} thing${dueCards === 1 ? '' : 's'} to practise today. <a href="#practice">Practise now</a></p>` : ''}
      </section>`;
  },

  remember() {
    const q = state.q.remember;
    const places = db.places.filter((p) => matches(q, p.item, p.location))
      .sort((a, b) => a.item.localeCompare(b.item));
    const notes = db.notes.filter((n) => matches(q, n.text, n.tags))
      .sort((a, b) => (b.pinned - a.pinned) || (b.created - a.created));
    return `
      <h1 class="page-title">Remember</h1>
      <input class="search" type="search" data-search="remember" placeholder="🔍 Search things and notes…" value="${esc(q)}">

      <section class="card">
        <div class="sec-head"><h2>📍 Where things are</h2><button class="btn small" data-action="add-place">+ Add</button></div>
        ${places.length ? `<ul class="list">${places.map((p) => `
          <li class="item"><div class="body" data-action="edit-place" data-id="${p.id}">
            <div class="title">${esc(p.item)}</div>
            <div class="sub">→ ${esc(p.location)} · <i>${timeAgo(p.updated)}</i></div>
          </div></li>`).join('')}</ul>`
          : `<p class="empty">${q ? 'No matches.' : 'Save where you put things: passport, spare key, chargers, the car…'}</p>`}
      </section>

      <section class="card">
        <div class="sec-head"><h2>📝 Notes</h2><button class="btn small" data-action="add-note">+ Add</button></div>
        ${notes.length ? `<ul class="list">${notes.map((n) => `
          <li class="item">
            <button class="check ${n.pinned ? 'on' : ''}" style="border-color:transparent;background:none;color:inherit"
              data-action="pin-note" data-id="${n.id}" aria-label="${n.pinned ? 'Unpin' : 'Pin'} note">${n.pinned ? '📌' : '·'}</button>
            <div class="body" data-action="edit-note" data-id="${n.id}">
              <div class="title" style="font-weight:500;white-space:pre-wrap">${esc(n.text)}</div>
              <div class="sub">${n.tags ? n.tags.split(',').map((t) => t.trim()).filter(Boolean)
                .map((t) => `<span class="tag">${esc(t)}</span>`).join('') : ''} ${timeAgo(n.created)}</div>
            </div></li>`).join('')}</ul>`
          : `<p class="empty">${q ? 'No matches.' : 'Jot down anything: Wi-Fi password, a parking spot, what the doctor said.'}</p>`}
      </section>`;
  },

  people() {
    const q = state.q.people;
    const list = db.people.filter((p) => matches(q, p.name, p.relation, p.details))
      .sort((a, b) => a.name.localeCompare(b.name));
    return `
      <h1 class="page-title">People</h1>
      <input class="search" type="search" data-search="people" placeholder="🔍 Search names, places, details…" value="${esc(q)}">
      <section class="card">
        <div class="sec-head"><h2>People I know</h2><button class="btn small" data-action="add-person">+ Add</button></div>
        ${list.length ? `<ul class="list">${list.map((p) => `
          <li class="item" data-action="edit-person" data-id="${p.id}" style="cursor:pointer">
            <div class="avatar">${esc(initials(p.name))}</div>
            <div class="body">
              <div class="title">${esc(p.name)}</div>
              ${p.relation ? `<div class="sub"><b>${esc(p.relation)}</b></div>` : ''}
              ${p.details ? `<div class="sub">${esc(p.details)}</div>` : ''}
            </div></li>`).join('')}</ul>`
          : `<p class="empty">${q ? 'No matches.' : 'Add people with a few details: how you know them, partner and kids\' names, what you last talked about.'}</p>`}
      </section>`;
  },

  dates() {
    const all = datesWithNext();
    const upcoming = all.filter((d) => d.away >= 0);
    const past = all.filter((d) => d.away < 0).reverse();
    return `
      <h1 class="page-title">Important dates</h1>
      <section class="card">
        <div class="sec-head"><h2>Upcoming</h2><button class="btn small" data-action="add-date">+ Add</button></div>
        ${upcoming.length ? `<ul class="list">${upcoming.map(dateItem).join('')}</ul>`
          : `<p class="empty">Add birthdays, anniversaries and appointments so they never sneak up.</p>`}
        ${past.length ? `<details><summary>Past (${past.length})</summary>
          <ul class="list">${past.map(dateItem).join('')}</ul></details>` : ''}
      </section>`;
  },

  practice() {
    if (state.review) return reviewView();
    const today = dayKey();
    const due = db.cards.filter((c) => c.due <= today);
    const learned = db.cards.filter((c) => c.box >= 4).length;
    return `
      <h1 class="page-title">Practice</h1>
      <section class="card" style="text-align:center">
        <p class="big-num">${due.length}</p>
        <p class="hint">to practise today · ${learned} of ${db.cards.length} well learned</p>
        ${due.length ? `<button class="btn primary block" data-action="start-review">Start practising</button>`
          : `<p class="empty">All caught up! ✨</p>`}
        <p class="hint" style="margin-top:12px">Short, regular practice helps things stick. Cards you know come back less often; tricky ones come back sooner.</p>
      </section>
      <section class="card">
        <div class="sec-head"><h2>Cards</h2><button class="btn small" data-action="add-card">+ Add</button></div>
        ${db.cards.length ? `<ul class="list">${db.cards.map((c) => `
          <li class="item"><div class="body" data-action="edit-card" data-id="${c.id}">
            <div class="title">${esc(c.front)}</div>
            <div class="sub">${esc(c.back)}</div>
            <span class="tag ${c.box >= 4 ? 'good' : ''}">${'★'.repeat(c.box)}${'☆'.repeat(5 - c.box)}</span>
            ${c.due <= today ? '<span class="tag soon">due</span>' : `<span class="tag">next ${fmtDay(parseDay(c.due))}</span>`}
          </div></li>`).join('')}</ul>`
          : `<p class="empty">Make cards for things you want to remember: a new phone number, a neighbour's name, your licence plate.</p>`}
      </section>`;
  },

  settings() {
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    return `
      <h1 class="page-title">Settings</h1>
      <section class="card">
        <div class="sec-head"><h2>Your name</h2></div>
        <div class="row"><input class="search" style="margin:0;flex:2" id="name-input" value="${esc(db.settings.name)}">
          <button class="btn" data-action="save-name">Save</button></div>
      </section>
      <section class="card">
        <div class="sec-head"><h2>🔔 Reminder alerts</h2></div>
        <p class="hint">${perm === 'granted' ? 'Alerts are on. They show up while this app is open.'
          : perm === 'denied' ? 'Alerts are blocked. Turn them on in your browser or phone settings.'
          : perm === 'unsupported' ? 'This browser does not support alerts. Reminders still appear on the Today screen.'
          : 'Turn on alerts for a pop-up when a reminder is due.'}</p>
        ${perm === 'default' ? `<button class="btn primary" data-action="notify-perm">Turn on alerts</button>` : ''}
      </section>
      <section class="card">
        <div class="sec-head"><h2>💾 Backup</h2></div>
        <p class="hint">Everything is saved privately on this device only. Back up now and then so nothing is lost if the phone is replaced.</p>
        <div class="row">
          <button class="btn" data-action="export">Download backup</button>
          <button class="btn" data-action="import">Restore backup</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </section>
      <section class="card">
        <div class="sec-head"><h2>Start over</h2></div>
        <p class="hint">Erase everything on this device.</p>
        <button class="btn danger" data-action="reset">Erase all data</button>
      </section>`;
  },
};

function routineItem(r, isDone, checkable) {
  const when = [r.time ? fmtTime(r.time) : '', r.days.length === 7 ? 'Every day'
    : r.days.map((d) => DAY_NAMES[d]).join(', ')].filter(Boolean).join(' · ');
  return `<li class="item ${isDone ? 'done' : ''}">
    ${checkable ? `<button class="check ${isDone ? 'on' : ''}" data-action="toggle-routine" data-id="${r.id}"
      aria-pressed="${isDone}" aria-label="${esc(r.title)}">${isDone ? '✓' : ''}</button>` : ''}
    <span class="emoji">${esc(r.emoji || '•')}</span>
    <div class="body" data-action="edit-routine" data-id="${r.id}">
      <div class="title">${esc(r.title)}</div><div class="sub">${esc(when)}</div>
    </div></li>`;
}

function dateItem(d) {
  return `<li class="item" data-action="edit-date" data-id="${d.id}" style="cursor:pointer">
    <span class="emoji">${DATE_TYPES[d.type] || '📌'}</span>
    <div class="body">
      <div class="title">${esc(d.label)}</div>
      <div class="sub">${fmtDay(d.next, { weekday: 'long', month: 'long', day: 'numeric' })}${d.extra ? ` · ${esc(d.extra)}` : ''}${d.yearly ? ' · yearly' : ''}</div>
    </div>
    <div class="days-away">${d.away < 0 ? `<small>${-d.away} days ago</small>` : awayLabel(d.away)}</div></li>`;
}

function reviewView() {
  const r = state.review;
  const card = db.cards.find((c) => c.id === r.queue[r.idx]);
  if (!card) {
    const total = r.queue.length;
    state.review = null;
    return `<h1 class="page-title">Practice</h1>
      <section class="card flash"><div class="q">Nice work! 🎉</div>
      <p class="hint">You practised ${total} card${total === 1 ? '' : 's'}. ${r.right} remembered.</p>
      <a class="btn primary" href="#today">Back to today</a></section>`;
  }
  return `<h1 class="page-title">Practice <span class="count hint">${r.idx + 1} / ${r.queue.length}</span></h1>
    <section class="card flash">
      <div class="q">${esc(card.front)}</div>
      ${r.flipped ? `<div class="a">${esc(card.back)}</div>
        <div class="row"><button class="btn" data-action="grade" data-grade="0">Not yet</button>
        <button class="btn primary" data-action="grade" data-grade="1">I remembered</button></div>`
      : `<p class="hint">Try to remember, then tap to check.</p>
        <button class="btn primary block" data-action="flip">Show answer</button>`}
    </section>
    <button class="btn ghost block" data-action="stop-review">Stop for now</button>`;
}

/* ---------- Rendering & routing ---------- */

function render() {
  $('#view').innerHTML = views[state.view]();
  document.querySelectorAll('.tabs a').forEach((a) =>
    a.classList.toggle('active', a.dataset.tab === state.view));
}

function route() {
  const name = location.hash.slice(1) || 'today';
  const next = views[name] ? name : 'today';
  if (next !== state.view) state.review = null;
  state.view = next;
  render();
  window.scrollTo(0, 0);
}

/* ---------- Forms ---------- */

function fieldHtml(f) {
  const v = f.value ?? '';
  const id = `f-${f.name}`;
  const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
  switch (f.type) {
    case 'textarea':
      return `<label class="field"><span>${esc(f.label)}</span><textarea id="${id}" name="${f.name}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>${hint}</label>`;
    case 'select':
      return `<label class="field"><span>${esc(f.label)}</span><select name="${f.name}">${f.options.map(([val, txt]) =>
        `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(txt)}</option>`).join('')}</select>${hint}</label>`;
    case 'checkbox':
      return `<label class="field check-field"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
    case 'days':
      return `<div class="field"><span>${esc(f.label)}</span><div class="days-pick">${DAY_NAMES.map((d, i) =>
        `<label title="${d}"><input type="checkbox" name="${f.name}" value="${i}" ${v.includes(i) ? 'checked' : ''}>${d.slice(0, 2)}</label>`).join('')}</div>${hint}</div>`;
    default:
      return `<label class="field"><span>${esc(f.label)}</span><input id="${id}" type="${f.type || 'text'}" name="${f.name}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="${id}-list"` : ''} autocomplete="off">
        ${f.list ? `<datalist id="${id}-list">${f.list.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}${hint}</label>`;
  }
}

function openForm({ title, fields, onSave, onDelete }) {
  const dlg = $('#modal');
  dlg.innerHTML = `<form class="form" novalidate><h2>${esc(title)}</h2>${fields.map(fieldHtml).join('')}
    <div class="form-actions">${onDelete ? '<button type="button" class="btn danger" data-del>Delete</button>' : ''}
    <span class="spacer"></span><button type="button" class="btn ghost" data-cancel>Cancel</button>
    <button type="submit" class="btn primary">Save</button></div></form>`;
  const form = $('form', dlg);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const vals = {};
    const el = (name) => form.querySelector(`[name="${name}"]`);
    for (const f of fields) {
      if (f.type === 'days') vals[f.name] = [...form.querySelectorAll(`[name="${f.name}"]:checked`)].map((x) => +x.value);
      else if (f.type === 'checkbox') vals[f.name] = el(f.name).checked;
      else vals[f.name] = el(f.name).value.trim();
      if (f.required && (!vals[f.name] || (Array.isArray(vals[f.name]) && !vals[f.name].length))) {
        toast(`Please fill in "${f.label}"`);
        el(f.name)?.focus();
        return;
      }
    }
    onSave(vals);
    save(); dlg.close(); render();
  });
  $('[data-cancel]', dlg).onclick = () => dlg.close();
  if (onDelete) $('[data-del]', dlg).onclick = () => {
    if (confirm('Delete this? You can undo right after.')) { onDelete(); save(); dlg.close(); render(); }
  };
  dlg.showModal();
  form.querySelector('input:not([type=checkbox]),textarea')?.focus();
}

function removeWithUndo(listName, id, label) {
  const list = db[listName];
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const [item] = list.splice(idx, 1);
  toast(`Deleted ${label}`, () => { db[listName].splice(idx, 0, item); save(); render(); });
}

/* ---------- Actions ---------- */

const find = (list, id) => db[list].find((x) => x.id === id);

const actions = {
  'add-reminder': () => editReminder(),
  'edit-reminder': (id) => editReminder(find('reminders', id)),
  'done-reminder': (id) => {
    const r = find('reminders', id); r.done = true; r.doneAt = Date.now(); save(); render();
    toast('Done! ✓', () => { r.done = false; save(); render(); });
  },
  'add-routine': () => editRoutine(),
  'edit-routine': (id) => editRoutine(find('routines', id)),
  'toggle-routine': (id) => {
    const k = dayKey(); const set = new Set(db.doneLog[k] || []);
    set.has(id) ? set.delete(id) : set.add(id);
    db.doneLog[k] = [...set];
    // keep only the last 60 days of history
    const cutoff = dayKey(addDays(new Date(), -60));
    for (const key of Object.keys(db.doneLog)) if (key < cutoff) delete db.doneLog[key];
    save(); render();
  },
  'add-place': () => editPlace(),
  'edit-place': (id) => editPlace(find('places', id)),
  'add-note': () => editNote(),
  'edit-note': (id) => editNote(find('notes', id)),
  'pin-note': (id) => { const n = find('notes', id); n.pinned = !n.pinned; save(); render(); },
  'add-person': () => editPerson(),
  'edit-person': (id) => editPerson(find('people', id)),
  'add-date': () => editDate(),
  'edit-date': (id) => editDate(find('dates', id)),
  'add-card': () => editCard(),
  'edit-card': (id) => editCard(find('cards', id)),
  'start-review': () => {
    const today = dayKey();
    const queue = db.cards.filter((c) => c.due <= today).sort(() => Math.random() - 0.5).map((c) => c.id);
    state.review = { queue, idx: 0, flipped: false, right: 0 }; render();
  },
  'flip': () => { state.review.flipped = true; render(); },
  'grade': (_, el) => {
    const r = state.review; const card = find('cards', r.queue[r.idx]);
    if (el.dataset.grade === '1') { card.box = Math.min(5, card.box + 1); r.right++; }
    else card.box = 1;
    card.due = dayKey(addDays(new Date(), BOX_DAYS[card.box]));
    // missed cards come back again at the end of this session
    if (el.dataset.grade === '0' && r.queue.filter((x) => x === card.id).length < 3) r.queue.push(card.id);
    r.idx++; r.flipped = false; save(); render();
  },
  'stop-review': () => { state.review = null; render(); },
  'save-name': () => {
    db.settings.name = $('#name-input').value.trim() || 'Kelly'; save(); toast('Saved'); render();
  },
  'notify-perm': async () => {
    try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
    render();
  },
  'export': () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `memory-backup-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'import': () => $('#import-file').click(),
  'reset': () => {
    if (confirm('Erase everything on this device? This cannot be undone. Download a backup first if unsure.')) {
      db = blank(); save(); toast('Erased'); location.hash = '#today'; render();
    }
  },
};

function editReminder(r) {
  const d = new Date(Date.now() + 60 * 60 * 1000); d.setMinutes(0);
  const defaultDue = `${dayKey(d)}T${pad(d.getHours())}:00`;
  openForm({
    title: r ? 'Edit reminder' : 'New reminder',
    fields: [
      { name: 'text', label: 'What do you need to remember?', required: true, value: r?.text, placeholder: 'Call the pharmacy' },
      { name: 'due', label: 'When?', type: 'datetime-local', value: r ? r.due : defaultDue, hint: 'Leave blank for "anytime".' },
    ],
    onSave: (v) => {
      if (r) { if (v.due !== r.due) r.notified = false; Object.assign(r, v); }
      else db.reminders.push({ id: uid(), ...v, done: false, notified: false });
    },
    onDelete: r && (() => removeWithUndo('reminders', r.id, 'reminder')),
  });
}

function editRoutine(r) {
  openForm({
    title: r ? 'Edit routine' : 'New routine',
    fields: [
      { name: 'title', label: 'What', required: true, value: r?.title, placeholder: 'Take vitamins' },
      { name: 'emoji', label: 'Icon (optional emoji)', value: r?.emoji ?? '✅', placeholder: '💊' },
      { name: 'time', label: 'Time (optional)', type: 'time', value: r?.time },
      { name: 'days', label: 'Which days', type: 'days', value: r?.days ?? [0, 1, 2, 3, 4, 5, 6], required: true },
    ],
    onSave: (v) => { r ? Object.assign(r, v) : db.routines.push({ id: uid(), ...v }); },
    onDelete: r && (() => removeWithUndo('routines', r.id, 'routine')),
  });
}

function editPlace(p) {
  const locations = [...new Set(db.places.map((x) => x.location))];
  openForm({
    title: p ? `Where is ${p.item}?` : 'Where did I put…',
    fields: [
      { name: 'item', label: 'Thing', required: true, value: p?.item, placeholder: 'Passport' },
      { name: 'location', label: 'Where it is', required: true, value: p?.location, placeholder: 'Top drawer of the desk', list: locations },
    ],
    onSave: (v) => {
      // saving the same item again updates it rather than creating a duplicate
      const existing = p || db.places.find((x) => x.item.toLowerCase() === v.item.toLowerCase());
      if (existing) Object.assign(existing, v, { updated: Date.now() });
      else db.places.push({ id: uid(), ...v, updated: Date.now() });
    },
    onDelete: p && (() => removeWithUndo('places', p.id, p.item)),
  });
}

function editNote(n) {
  openForm({
    title: n ? 'Edit note' : 'New note',
    fields: [
      { name: 'text', label: 'Note', type: 'textarea', required: true, value: n?.text, placeholder: 'Parked on level 3, row F' },
      { name: 'tags', label: 'Tags (optional, comma separated)', value: n?.tags, placeholder: 'car, work' },
      { name: 'pinned', label: 'Pin to top', type: 'checkbox', value: n?.pinned },
    ],
    onSave: (v) => { n ? Object.assign(n, v) : db.notes.push({ id: uid(), ...v, created: Date.now() }); },
    onDelete: n && (() => removeWithUndo('notes', n.id, 'note')),
  });
}

function editPerson(p) {
  openForm({
    title: p ? p.name : 'New person',
    fields: [
      { name: 'name', label: 'Name', required: true, value: p?.name, placeholder: 'Sam Rivera' },
      { name: 'relation', label: 'How I know them', value: p?.relation, placeholder: 'Neighbour at no. 12, works with Jo' },
      { name: 'details', label: 'Things to remember', type: 'textarea', value: p?.details,
        placeholder: 'Partner: Alex. Dog: Biscuit. Loves hiking. Last talked about her new job.' },
      ...(p ? [] : [{ name: 'practice', label: 'Add to Practice so I learn their name', type: 'checkbox', value: false }]),
    ],
    onSave: (v) => {
      const { practice, ...rest } = v;
      if (p) Object.assign(p, rest, { updated: Date.now() });
      else {
        db.people.push({ id: uid(), ...rest, updated: Date.now() });
        const clue = [rest.relation, rest.details].filter(Boolean).join(' — ');
        if (practice && clue) db.cards.push({ id: uid(), front: `Who is this? ${clue}`, back: rest.name, box: 0, due: dayKey() });
        else if (practice) toast('Add how you know them so there is a clue to practise with.');
      }
    },
    onDelete: p && (() => removeWithUndo('people', p.id, p.name)),
  });
}

function editDate(e) {
  openForm({
    title: e ? 'Edit date' : 'New important date',
    fields: [
      { name: 'label', label: 'What', required: true, value: e?.label, placeholder: "Mum's birthday" },
      { name: 'date', label: 'Date', type: 'date', required: true, value: e?.date },
      { name: 'type', label: 'Type', type: 'select', value: e?.type ?? 'birthday',
        options: Object.entries(DATE_TYPES).map(([k, ico]) => [k, `${ico} ${k[0].toUpperCase()}${k.slice(1)}`]) },
      { name: 'yearly', label: 'Repeats every year', type: 'checkbox', value: e ? e.yearly : true },
    ],
    onSave: (v) => { e ? Object.assign(e, v) : db.dates.push({ id: uid(), ...v }); },
    onDelete: e && (() => removeWithUndo('dates', e.id, e.label)),
  });
}

function editCard(c) {
  openForm({
    title: c ? 'Edit card' : 'New practice card',
    fields: [
      { name: 'front', label: 'Question', required: true, value: c?.front, placeholder: "What's my new phone number?" },
      { name: 'back', label: 'Answer', type: 'textarea', required: true, value: c?.back, placeholder: '0412 345 678' },
    ],
    onSave: (v) => { c ? Object.assign(c, v) : db.cards.push({ id: uid(), ...v, box: 0, due: dayKey() }); },
    onDelete: c && (() => removeWithUndo('cards', c.id, 'card')),
  });
}

/* ---------- Toast ---------- */

let toastTimer;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
  if (undo) $('button', t).onclick = () => { undo(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 6000 : 3000);
}

/* ---------- Reminder alerts (while the app is open) ---------- */

async function checkDue() {
  const now = new Date();
  let changed = false;
  for (const r of db.reminders) {
    if (r.done || r.notified || !r.due || new Date(r.due) > now) continue;
    r.notified = true; changed = true;
    toast(`⏰ ${r.text}`);
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) reg.showNotification('Reminder', { body: r.text, tag: r.id, icon: 'icons/icon-192.png' });
        else new Notification('Reminder', { body: r.text, tag: r.id });
      } catch (e) { /* some browsers only allow notifications from the service worker */ }
    }
  }
  if (changed) { save(); if (state.view === 'today') render(); }
}

/* ---------- Wiring ---------- */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  actions[el.dataset.action](el.dataset.id, el);
});

document.addEventListener('input', (e) => {
  const key = e.target.dataset?.search;
  if (!key) return;
  state.q[key] = e.target.value;
  const pos = e.target.selectionStart;
  render();
  const input = document.querySelector(`[data-search="${key}"]`);
  input.focus(); input.setSelectionRange(pos, pos);
});

document.addEventListener('change', (e) => {
  if (e.target.id !== 'import-file' || !e.target.files[0]) return;
  e.target.files[0].text().then((txt) => {
    const data = JSON.parse(txt);
    if (!data || typeof data !== 'object' || !Array.isArray(data.reminders)) throw new Error('not a backup');
    if (!confirm('Replace everything on this device with this backup?')) return;
    db = { ...blank(), ...data }; save(); toast('Backup restored ✓'); render();
  }).catch(() => toast('That file is not a Memory backup.'));
  e.target.value = '';
});

// Close the dialog when tapping the dim backdrop
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') e.target.close(); });

window.addEventListener('hashchange', route);
// Re-render when coming back to the app (date may have changed, reminders due)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { db = load(); checkDue(); if (!$('#modal').open) render(); }
});

route();
checkDue();
setInterval(checkDue, 30 * 1000);
setInterval(() => { if (state.view === 'today' && !$('#modal').open) render(); }, 60 * 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
