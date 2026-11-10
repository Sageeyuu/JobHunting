/* JobHunting: a read-only profile page and an application tracker saved in this browser. */
(function () {
  'use strict';
  const KEY = 'jobhunting.tracker.v2';
  const OLD_KEY = 'jobhunting.v1';
  const P = window.PROFILE;
  const PAGES = [['profile', 'My profile'], ['tracker', 'Applications']];
  const STATUS = [['applied', 'Applied'], ['replied', 'Replied'], ['interview', 'Interview'], ['offer', 'Offer'], ['rejected', 'Rejected'], ['withdrawn', 'Withdrawn']];
  const STATUS_NAME = Object.fromEntries(STATUS);
  const CLOSED = ['offer', 'rejected', 'withdrawn'];
  const NOTE_TYPES = ['Note', 'Email', 'Call', 'Follow-up', 'Interview', 'Feedback'];
  const QUIET_DAYS = 21;

  const ui = { open: null, confirm: null, filter: 'all', q: '', sort: { key: 'appliedOn', dir: -1 }, importing: null };
  let S = { apps: [] };
  let saveTimer = null;
  let needsRender = false;

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => iso(new Date());
  const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const daysSince = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); const [ty, tm, td] = today().split('-').map(Number); return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 864e5); };
  const isUrl = (u) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(u || '');
  const bid = (b) => 'b-' + b.replace(/[^a-zA-Z0-9]/g, '-');
  const pill = (cls, t) => '<span class="pill ' + cls + '">' + esc(t) + '</span>';
  const btn = (t, action, id, cls = '', extra = '') => '<button type="button" class="btn ' + cls + '" data-action="' + action + '"' + (id ? ' data-id="' + esc(id) + '"' : '') + ' ' + extra + '>' + esc(t) + '</button>';
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2800); }

  /* ---------- storage ---------- */
  function newApp(a) { return { id: uid(), company: '', role: '', url: '', location: '', salary: '', appliedOn: today(), status: 'applied', contact: '', nextAction: '', nextDate: '', notes: '', events: [], ...a }; }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); return { apps: (d.apps || []).map(newApp) }; } } catch (e) { /* blocked or first run */ }
    const apps = [];
    try {
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
      ((old && old.jobs) || []).filter((j) => !j.example && STATUS_NAME[j.status]).forEach((j) => apps.push(newApp({ company: j.company || '', role: j.title || '', url: j.url || '', location: j.location || '', salary: j.salary || '', appliedOn: j.appliedOn || '', status: j.status, contact: j.contact || '', nextAction: j.nextAction || '', nextDate: j.nextDate || '', events: j.events || [] })));
    } catch (e) { /* nothing to bring across */ }
    return { apps };
  }
  function saveNow() { clearTimeout(saveTimer); saveTimer = null; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Couldn’t save. This browser is blocking storage, so download a backup now.'); } }
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }
  const app = (id) => S.apps.find((a) => a.id === id);
  function log(a, type, note, date) { a.events.push({ id: uid(), date: date || today(), type, note }); }
  const isDue = (a) => a.nextDate && a.nextDate <= today() && !CLOSED.includes(a.status);
  const isQuiet = (a) => a.status === 'applied' && daysSince(a.appliedOn) >= QUIET_DAYS;
  const lastUpdate = (a) => a.events.reduce((m, e) => (e.date > m ? e.date : m), a.appliedOn || '');

  /* ---------- profile page ---------- */
  function sectionText(sec) {
    return sec.heading.toUpperCase() + '\n' + sec.items.map((i) => [i.title + (i.date ? ' (' + i.date + ')' : ''), i.org, ...(i.points || []).map((p) => '- ' + p)].filter(Boolean).join('\n')).join('\n\n');
  }
  function viewProfile() {
    const copyBtn = (key) => '<button type="button" class="link" data-action="copyProfile" data-id="' + key + '">Copy</button>';
    const skills = Object.entries(P.skills).map(([k, list]) => '<div class="skill-row"><h3>' + esc(k) + '</h3><div class="tags">' + list.map((s) => '<span class="tag">' + esc(s) + '</span>').join('') + '</div></div>').join('');
    const sections = P.sections.map((sec, si) => '<section class="cv-sec"><div class="cv-head"><h2>' + esc(sec.heading) + '</h2>' + copyBtn('sec' + si) + '</div>' +
      sec.items.map((i) => '<article class="entry"><div class="entry-top"><h3>' + (i.link ? '<a href="' + esc(i.link) + '" target="_blank" rel="noopener">' + esc(i.title) + '</a>' : esc(i.title)) + '</h3>' + (i.date ? '<span class="mono date">' + esc(i.date) + '</span>' : '') + '</div>' +
        (i.org ? '<p class="org">' + esc(i.org) + '</p>' : '') + (i.points ? '<ul>' + i.points.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '') + '</article>').join('') + '</section>').join('');
    return '<div class="page">' +
      '<header class="hero"><div class="hero-main"><p class="eyebrow">' + esc(P.current) + '</p><h1>' + esc(P.name) + '</h1><p class="hero-title">' + esc(P.title) + '</p></div>' +
      '<dl class="facts"><div><dt>Email</dt><dd><span class="mono sel">' + esc(P.email) + '</span> <button type="button" class="link" data-action="copyEmail">Copy</button></dd></div>' +
      '<div><dt>Website</dt><dd><a href="' + esc(P.website) + '" target="_blank" rel="noopener">sites.google.com/view/jinghuiyusage</a></dd></div>' +
      '<div><dt>Right to work</dt><dd>' + esc(P.rightToWork) + '</dd></div></dl></header>' +
      '<section class="cv-sec"><div class="cv-head"><h2>Research profile</h2>' + copyBtn('summary') + '</div><div class="prose">' + P.summary.map((p) => '<p>' + esc(p) + '</p>').join('') + '</div></section>' +
      '<section class="cv-sec"><div class="cv-head"><h2>Skills</h2>' + copyBtn('skills') + '</div>' + skills + '</section>' +
      '<section class="cv-sec"><div class="cv-head"><h2>Key competencies</h2>' + copyBtn('comp') + '</div><dl class="comp">' + P.competencies.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl></section>' +
      sections +
      '<section class="cv-sec"><div class="cv-head"><h2>References</h2>' + copyBtn('refs') + '</div><div class="refs">' + P.references.map((r) => '<div class="ref"><h3>' + esc(r.name) + '</h3><p>' + esc(r.role) + '</p><p class="org">' + esc(r.org) + '</p><p class="mono sel">' + esc(r.email) + '</p></div>').join('') + '</div></section>' +
      '<p class="hint">To change anything here, edit profile.js in the repository.</p></div>';
  }
  function profileText(key) {
    if (key === 'summary') return P.summary.join('\n\n');
    if (key === 'skills') return Object.entries(P.skills).map(([k, l]) => k + ': ' + l.join(', ')).join('\n');
    if (key === 'comp') return P.competencies.map(([k, v]) => k + ': ' + v).join('\n\n');
    if (key === 'refs') return P.references.map((r) => [r.name, r.role, r.org, r.email].join('\n')).join('\n\n');
    return sectionText(P.sections[Number(key.slice(3))]);
  }

  /* ---------- spreadsheet ---------- */
  const OPT = (o, v) => o.map(([a, t]) => '<option value="' + esc(a) + '"' + (a === v ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
  const cIn = (bind, v, label, ph) => '<input class="c" id="' + bid(bind) + '" data-bind="' + esc(bind) + '" value="' + esc(v) + '" aria-label="' + esc(label) + '" placeholder="' + esc(ph || '') + '">';
  const cDate = (bind, v, label) => '<input class="c" type="date" id="' + bid(bind) + '" data-bind="' + esc(bind) + '" value="' + esc(v) + '" aria-label="' + esc(label) + '">';
  const cSel = (bind, v, options, label, cls) => '<select class="c ' + (cls || '') + '" id="' + bid(bind) + '" data-bind="' + esc(bind) + '" aria-label="' + esc(label) + '">' + OPT(options, v) + '</select>';
  const ro = (html, cls) => '<div class="ro ' + (cls || '') + '">' + html + '</div>';

  function sheet(cols, rows, detail, newRow) {
    const sort = ui.sort;
    const list = rows.slice();
    const col = sort && cols.find((c) => c.key === sort.key);
    if (col && col.val) list.sort((a, b) => { const x = col.val(a); const y = col.val(b); if (x === '' || x == null) return y === '' || y == null ? 0 : 1; if (y === '' || y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
    const total = cols.reduce((w, c) => w + c.w, 52);
    const head = cols.map((c, i) => {
      const on = col === c;
      return '<th scope="col"' + (on ? ' aria-sort="' + (sort.dir > 0 ? 'ascending' : 'descending') + '"' : '') + (i === 0 ? ' class="stick"' : '') + '>' + (c.val ? '<button type="button" data-action="sort" data-id="' + c.key + '">' + esc(c.label) + (on ? (sort.dir > 0 ? ' ▲' : ' ▼') : '') + '</button>' : esc(c.label)) + '</th>';
    }).join('');
    const body = list.map((r, i) => {
      const open = ui.open === r.id;
      return '<tr class="r' + (open ? ' is-open' : '') + '" data-h="' + esc([r.company, r.role, r.location, r.contact, r.notes, STATUS_NAME[r.status]].join(' ').toLowerCase()) + '"><td class="n"><button type="button" class="n-btn" data-action="toggle" data-id="' + r.id + '" aria-expanded="' + open + '" aria-label="History for row ' + (i + 1) + '"><span>' + (i + 1) + '</span><span aria-hidden="true">' + (open ? '▾' : '▸') + '</span></button></td>' +
        cols.map((c, ci) => '<td' + (ci === 0 ? ' class="stick"' : '') + '>' + c.cell(r) + '</td>').join('') + '</tr>' +
        (open ? '<tr class="detail"><td colspan="' + (cols.length + 1) + '"><div class="detail-in">' + detail(r) + '</div></td></tr>' : '');
    }).join('');
    return '<div class="sheet-wrap"><table class="sheet" style="width:' + total + 'px"><colgroup><col style="width:52px">' + cols.map((c) => '<col style="width:' + c.w + 'px">').join('') + '</colgroup><thead><tr><th class="n">#</th>' + head + '</tr></thead><tbody>' + body + newRow + '</tbody></table></div>';
  }
  function applyFilter() {
    const q = ui.q.trim().toLowerCase();
    document.querySelectorAll('.sheet > tbody > tr.r[data-h]').forEach((tr) => { const hide = !!q && !tr.dataset.h.includes(q); tr.hidden = hide; const n = tr.nextElementSibling; if (n && n.classList.contains('detail')) n.hidden = hide; });
  }
  function moveCell(el, dr, dc) {
    const td = el.closest('td');
    const rows = [...td.closest('tbody').rows].filter((r) => r.classList.contains('r') && !r.hidden);
    let r = rows.indexOf(td.parentNode);
    let c = td.cellIndex;
    for (;;) {
      r += dr; c += dc;
      if (r < 0 || r >= rows.length || c < 0 || c >= rows[r].cells.length) return;
      const t = rows[r].cells[c].querySelector('input,select,textarea');
      if (t) { t.focus(); if (t.select && t.type !== 'date' && t.tagName !== 'SELECT') t.select(); return; }
    }
  }

  /* ---------- tracker page ---------- */
  function detail(a) {
    const events = a.events.slice().sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    const key = 'del:' + a.id;
    return '<div class="stack"><h3>Add to the history</h3><div class="note-form"><label class="f" for="nt-' + a.id + '">Type<select id="nt-' + a.id + '">' + NOTE_TYPES.map((t) => '<option>' + t + '</option>').join('') + '</select></label>' +
      '<label class="f" for="nd-' + a.id + '">Date<input id="nd-' + a.id + '" type="date" value="' + today() + '"></label><label class="f" for="nn-' + a.id + '">What happened<input id="nn-' + a.id + '" placeholder="e.g. Recruiter emailed to book a call"></label>' + btn('Add', 'addNote', a.id) + '</div></div>' +
      '<div class="stack"><h3>History</h3>' + (events.length ? '<ol class="timeline">' + events.map((e) => '<li><span class="mono">' + esc(fmtDate(e.date)) + '</span><span><strong>' + esc(e.type) + '.</strong> ' + esc(e.note) + '</span></li>').join('') + '</ol>' : '<p class="hint">Nothing logged yet.</p>') + '</div>' +
      '<div class="row">' + (ui.confirm === key ? btn('Yes, delete this application', 'delApp', a.id, 'danger') + btn('Keep it', 'cancelConfirm', '', 'quiet') : btn('Delete application', 'askConfirm', key, 'quiet')) + '</div>';
  }
  function viewTracker() {
    const t = S.apps;
    const live = t.filter((a) => !CLOSED.includes(a.status));
    const replied = t.filter((a) => a.status !== 'applied' && a.status !== 'withdrawn').length;
    const interviews = t.filter((a) => ['interview', 'offer'].includes(a.status) || a.events.some((e) => e.type === 'Interview')).length;
    const due = t.filter(isDue).length;
    const quiet = t.filter(isQuiet).length;
    const stat = (n, l, sub) => '<div class="stat"><b>' + n + '</b><span>' + l + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    const chip = (v, l, n) => '<button type="button" class="chip" data-action="filter" data-id="' + v + '" aria-pressed="' + (ui.filter === v) + '">' + l + ' <span class="mono">' + n + '</span></button>';
    const shown = ui.filter === 'all' ? t : ui.filter === 'active' ? live : ui.filter === 'due' ? t.filter((a) => isDue(a) || isQuiet(a)) : t.filter((a) => a.status === ui.filter);
    const tone = { replied: 'info', interview: 'consider', offer: 'apply', rejected: 'skip', withdrawn: 'none', applied: 'none' };
    const cols = [
      { key: 'company', label: 'Company', w: 190, val: (a) => a.company.toLowerCase(), cell: (a) => cIn('a|' + a.id + '|company', a.company, 'Company') },
      { key: 'role', label: 'Role', w: 220, val: (a) => a.role.toLowerCase(), cell: (a) => cIn('a|' + a.id + '|role', a.role, 'Role') },
      { key: 'url', label: 'Link', w: 170, cell: (a) => '<div class="cell-link">' + cIn('a|' + a.id + '|url', a.url, 'Link', 'https://…') + (isUrl(a.url) ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener" aria-label="Open the advert">↗</a>' : '') + '</div>' },
      { key: 'location', label: 'Location', w: 130, val: (a) => a.location.toLowerCase(), cell: (a) => cIn('a|' + a.id + '|location', a.location, 'Location') },
      { key: 'salary', label: 'Salary', w: 130, cell: (a) => cIn('a|' + a.id + '|salary', a.salary, 'Salary') },
      { key: 'appliedOn', label: 'Applied on', w: 148, val: (a) => a.appliedOn, cell: (a) => cDate('a|' + a.id + '|appliedOn', a.appliedOn, 'Applied on') },
      { key: 'days', label: 'Days', w: 70, val: (a) => daysSince(a.appliedOn), cell: (a) => ro(a.appliedOn ? esc(daysSince(a.appliedOn)) : '', 'mono num') },
      { key: 'status', label: 'Status', w: 136, val: (a) => STATUS.findIndex(([v]) => v === a.status), cell: (a) => cSel('status|' + a.id, a.status, STATUS, 'Status', 'st-' + (tone[a.status] || 'none')) },
      { key: 'alert', label: 'Alert', w: 176, val: (a) => (isDue(a) ? 0 : isQuiet(a) ? 1 : ''), cell: (a) => ro(isDue(a) ? pill('late', 'Action due') : isQuiet(a) ? pill('soon', 'No reply in 3+ weeks') : '') },
      { key: 'contact', label: 'Contact', w: 160, val: (a) => a.contact.toLowerCase(), cell: (a) => cIn('a|' + a.id + '|contact', a.contact, 'Contact', 'Name or email') },
      { key: 'nextAction', label: 'Next action', w: 200, cell: (a) => cIn('a|' + a.id + '|nextAction', a.nextAction, 'Next action', CLOSED.includes(a.status) ? '' : 'e.g. Chase recruiter') },
      { key: 'nextDate', label: 'Due', w: 148, val: (a) => a.nextDate, cell: (a) => cDate('a|' + a.id + '|nextDate', a.nextDate, 'Due') },
      { key: 'notes', label: 'Notes', w: 260, cell: (a) => cIn('a|' + a.id + '|notes', a.notes, 'Notes') },
      { key: 'last', label: 'Last update', w: 124, val: lastUpdate, cell: (a) => ro(esc(fmtDate(lastUpdate(a))), 'mono') },
    ];
    const newRow = '<tr class="r new"><td class="n">+</td><td class="stick"><input class="c" id="new-company" data-new="company" aria-label="New application: company" placeholder="New: company"></td>' +
      '<td><input class="c" id="new-role" data-new="role" aria-label="New application: role" placeholder="Role"></td><td><input class="c" id="new-url" data-new="url" aria-label="New application: link" placeholder="Or paste link(s)"></td>' + '<td></td>'.repeat(cols.length - 3) + '</tr>';
    return '<div class="page wide">' +
      '<header class="page-head"><h1>Applications</h1><p>Type a company in the bottom row to add an application. It’s dated today, and you can change anything by clicking a cell. Open a row with ▸ to log what happens next.</p></header>' +
      '<div class="stats">' + stat(t.length, 'Applications', live.length + ' still open') + stat(t.length ? replied + ' of ' + t.length : '0', 'Got a reply', t.length ? Math.round((replied / t.length) * 100) + '% response rate' : '') + stat(interviews, 'Reached interview', t.filter((a) => a.status === 'offer').length + ' offers') + stat(due + quiet, 'Need attention', due + ' due, ' + quiet + ' quiet') + '</div>' +
      '<div class="toolbar"><div class="chips">' + chip('all', 'All', t.length) + chip('active', 'Open', live.length) + chip('due', 'Needs attention', t.filter((a) => isDue(a) || isQuiet(a)).length) + STATUS.filter(([v]) => t.some((a) => a.status === v)).map(([v, l]) => chip(v, l, t.filter((a) => a.status === v).length)).join('') + '</div>' +
      '<label class="filter" for="sheet-filter"><span>Search</span><input id="sheet-filter" value="' + esc(ui.q) + '" placeholder="Company, role, contact"></label></div>' +
      sheet(cols, shown, detail, newRow) +
      (t.length ? '' : '<p class="hint">No applications yet. Start with the company name in the row above.</p>') + '</div>';
  }

  /* ---------- render ---------- */
  const VIEWS = { profile: viewProfile, tracker: viewTracker };
  const route = () => (VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'profile');
  function render() {
    const a = document.activeElement;
    const focusId = a && a.id;
    const y = window.scrollY;
    const r = route();
    const due = S.apps.filter((x) => isDue(x) || isQuiet(x)).length;
    $('#nav').innerHTML = PAGES.map(([k, t]) => '<a class="step" href="#' + k + '"' + (k === r ? ' aria-current="page"' : '') + '><span>' + t + '</span><span class="step-c">' + (k === 'tracker' ? S.apps.length || '' : '') + (k === 'tracker' && due ? ' <span class="dot" title="' + due + ' need attention"></span>' : '') + '</span></a>').join('');
    $('#view').innerHTML = VIEWS[r]();
    applyFilter();
    const f = focusId && document.getElementById(focusId);
    if (f) f.focus({ preventScroll: true });
    window.scrollTo(0, y);
  }
  function commit() { saveNow(); render(); }

  /* ---------- changes ---------- */
  function setStatus(a, status) {
    if (!a || a.status === status) return;
    log(a, 'Status', STATUS_NAME[a.status] + ' → ' + STATUS_NAME[status]);
    a.status = status;
  }
  function setBind(bind, value) {
    const [kind, id, field] = bind.split('|');
    const a = app(id);
    if (!a) return;
    if (kind === 'status') setStatus(a, value); else a[field] = value;
    save();
  }
  function addApps(col, value) {
    const v = value.trim();
    if (!v) return null;
    let made = [];
    if (col === 'url') {
      const links = [...new Set(v.split(/\s+/).filter(isUrl))];
      if (!links.length) { toast('That isn’t a link. Paste a web address starting with https://'); return null; }
      made = links.map((url) => newApp({ url }));
    } else made = [newApp({ [col]: v })];
    made.forEach((a) => { log(a, 'Applied', 'Added to the tracker'); S.apps.push(a); });
    ui.sort = { key: 'appliedOn', dir: -1 };
    if (!['all', 'active', 'applied'].includes(ui.filter)) ui.filter = 'all';
    commit();
    if (made.length > 1) toast(made.length + ' applications added');
    return made[made.length - 1];
  }
  async function copy(text, done) { try { await navigator.clipboard.writeText(text); toast(done); } catch (e) { toast('Copying is blocked here. Select the text and copy it yourself.'); } }

  const A = {
    toggle(id) { ui.open = ui.open === id ? null : id; ui.confirm = null; render(); },
    askConfirm(k) { ui.confirm = k; render(); },
    cancelConfirm() { ui.confirm = null; render(); },
    filter(v) { ui.filter = v; render(); },
    sort(k) { const s = ui.sort; ui.sort = s && s.key === k ? (s.dir > 0 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 }; render(); },
    delApp(id) { S.apps = S.apps.filter((a) => a.id !== id); ui.open = null; ui.confirm = null; commit(); toast('Application deleted'); },
    addNote(id) {
      const note = $('#nn-' + id).value.trim();
      if (!note) { toast('Write what happened first.'); return; }
      const type = $('#nt-' + id).value;
      const a = app(id);
      log(a, type, note, $('#nd-' + id).value || today());
      if (type === 'Interview' && ['applied', 'replied'].includes(a.status)) setStatus(a, 'interview');
      else if (['Email', 'Call', 'Feedback'].includes(type) && a.status === 'applied') setStatus(a, 'replied');
      commit();
      toast('Added to the history');
    },
    copyEmail() { copy(P.email, 'Email copied'); },
    copyProfile(k) { copy(profileText(k), 'Copied'); },
    export() {
      saveNow();
      const url = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
      const l = document.createElement('a');
      l.href = url; l.download = 'jobhunting-backup-' + today() + '.json';
      document.body.appendChild(l); l.click(); l.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Backup downloaded');
    },
    confirmImport() { S = { apps: ui.importing.apps.map(newApp) }; ui.importing = null; commit(); toast('Backup restored'); },
    cancelImport() { ui.importing = null; const b = $('#import-banner'); if (b) b.remove(); },
  };

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-action]'); if (t && !t.disabled && A[t.dataset.action]) A[t.dataset.action](t.dataset.id); });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'sheet-filter') { ui.q = e.target.value; applyFilter(); return; }
    const b = e.target.dataset && e.target.dataset.bind;
    if (b && e.target.tagName !== 'SELECT') setBind(b, e.target.value);
  });
  document.addEventListener('change', (e) => {
    const d = e.target.dataset || {};
    if (d.new) {
      const col = d.new; const v = e.target.value; e.target.value = '';
      setTimeout(() => {
        const next = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.new : '';
        const made = addApps(col, v);
        if (made && next) { const el = document.getElementById(bid('a|' + made.id + '|' + next)); if (el) el.focus(); }
      }, 0);
      return;
    }
    if (!d.bind) return;
    setBind(d.bind, e.target.value);
    if (e.target.tagName === 'SELECT') commit(); else if (e.target.type === 'date') { saveNow(); needsRender = true; } else saveNow();
  });
  document.addEventListener('paste', (e) => {
    if (e.target.id !== 'new-url') return;
    const text = e.clipboardData.getData('text');
    if (text.split(/\s+/).filter(isUrl).length < 2) return;
    e.preventDefault();
    addApps('url', text);
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t.classList || !t.classList.contains('c')) return;
    if (e.key === 'Enter') { e.preventDefault(); if (t.dataset.new) t.blur(); else moveCell(t, e.shiftKey ? -1 : 1, 0); return; }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || t.type === 'date') return;
    const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (t.tagName === 'SELECT') { if (vertical) return; } else {
      const atStart = t.selectionStart === 0 && t.selectionEnd === 0;
      const atEnd = t.selectionStart === t.value.length && t.selectionEnd === t.value.length;
      const all = t.selectionStart === 0 && t.selectionEnd === t.value.length;
      if (!vertical && !all && !(e.key === 'ArrowLeft' ? atStart : atEnd)) return;
    }
    e.preventDefault();
    moveCell(t, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0, e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0);
  });
  document.addEventListener('focusout', () => { if (saveTimer) saveNow(); if (needsRender) { needsRender = false; setTimeout(render, 0); } });
  window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });
  window.addEventListener('hashchange', () => { ui.open = null; ui.confirm = null; render(); window.scrollTo(0, 0); });
  window.addEventListener('storage', (e) => { if (e.key === KEY && document.hidden) { S = load(); render(); } });
  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let data;
      try { data = JSON.parse(r.result); if (!data || !Array.isArray(data.apps)) throw new Error('shape'); } catch (err) { toast('That file isn’t a JobHunting backup.'); return; }
      ui.importing = data;
      if (route() !== 'tracker') location.hash = 'tracker';
      setTimeout(() => {
        const old = $('#import-banner'); if (old) old.remove();
        const div = document.createElement('div');
        div.id = 'import-banner'; div.className = 'banner';
        div.innerHTML = '<p>Replace everything in your tracker with this backup of ' + data.apps.length + ' applications?</p><div class="row">' + btn('Replace', 'confirmImport', '', 'danger') + btn('Cancel', 'cancelImport', '', 'quiet') + '</div>';
        $('#view').prepend(div);
      }, 30);
    };
    r.readAsText(file);
  });
  S = load();
  render();
})();
