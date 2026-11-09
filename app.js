/* JobHunting interface. All records live in this browser's localStorage. */
(function () {
  'use strict';
  const KEY = 'jobhunting.v1';
  const J = window.JH;
  const STAGES = [
    ['profile', 'Your profile'], ['jobs', 'Add jobs'], ['evaluate', 'Evaluate matches'],
    ['shortlist', 'Shortlist'], ['prepare', 'Prepare'], ['track', 'Track progress'],
  ];
  const STATUS = [['preparing', 'Preparing'], ['ready', 'Ready to send'], ['applied', 'Applied'], ['replied', 'Replied'], ['interview', 'Interview'], ['offer', 'Offer'], ['rejected', 'Rejected'], ['withdrawn', 'Withdrawn']];
  const STATUS_NAME = Object.fromEntries(STATUS);
  const REC_NAME = { apply: 'Apply', consider: 'Consider', skip: 'Skip' };
  const SOURCE_NAME = { keyword: 'Keyword check', claude: 'Assessed by Claude' };
  const NOTE_TYPES = ['Note', 'Email', 'Call', 'Follow-up', 'Interview', 'Feedback'];

  const blank = () => ({ profile: { name: '', headline: '', cv: '', cvFile: '', cvRead: '', goals: '', mustHaves: '', dealBreakers: '', minSalary: '', locations: '' }, jobs: [] });
  const ui = { open: null, prep: null, tab: 'cv', filter: 'all', confirm: null, importing: null, cvBusy: false, cvPending: null, sort: {}, q: '' };
  let S = load();
  let storageOk = true;
  let saveTimer = null;
  let needsRender = false;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalise(JSON.parse(raw));
    } catch (e) { /* first run or blocked storage */ }
    return blank();
  }
  function normalise(data) {
    const b = blank();
    const out = { ...data, profile: { ...b.profile, ...(data.profile || {}) }, jobs: Array.isArray(data.jobs) ? data.jobs : [] };
    out.jobs = out.jobs.map(newJob);
    return out;
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; } catch (e) { storageOk = false; toast('Couldn’t save. This browser is blocking storage, so download a backup now.'); }
  }
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const safeHref = (u) => (/^https?:\/\//i.test(u || '') ? esc(u) : '#');
  let toastTimer;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2800); }

  function newJob(j) {
    return { id: J.uid(), url: '', title: '', company: '', location: '', salary: '', deadline: '', description: '', requirements: [], evaluation: null, decision: '', why: '', order: 0, status: '', appliedOn: '', nextAction: '', nextDate: '', contact: '', events: [], example: false, ...j, drafts: { cv: '', cover: '', answers: [], ...((j && j.drafts) || {}) } };
  }
  const job = (id) => S.jobs.find((x) => x.id === id);
  const jobName = (j) => j.title || J.hostLabel(j.url) || 'Untitled job';
  const jobSub = (j) => [j.company, j.location].filter(Boolean).join(' · ') || J.hostLabel(j.url) || 'Add the details';
  function log(j, type, note, date) { j.events.push({ id: J.uid(), date: date || today(), type, note }); }

  function recOf(j) {
    const ev = j.evaluation;
    if (!ev) return { rec: '', why: '' };
    const auto = J.recommend(ev);
    if (ev.override) return { rec: ev.override, why: 'You set this. The checks say: ' + (REC_NAME[auto.rec] || 'nothing yet') + '.' };
    if (ev.claudeRec) return { rec: ev.claudeRec, why: ev.reason || auto.why };
    return auto;
  }
  const isStale = (j) => j.evaluation && j.evaluation.basis !== J.basisOf(j, S.profile);
  const queue = () => S.jobs.filter((j) => j.decision === 'pursue' && !['applied', 'replied', 'interview', 'offer', 'rejected', 'withdrawn'].includes(j.status)).sort((a, b) => a.order - b.order);
  const tracked = () => S.jobs.filter((j) => j.status);
  const pill = (cls, text) => '<span class="pill ' + cls + '">' + esc(text) + '</span>';
  const recPill = (j) => { const r = recOf(j).rec; return r ? pill(r, REC_NAME[r]) : pill('none', j.requirements.length ? 'Not evaluated' : 'No requirements'); };

  function deadlinePill(j) {
    if (!j.deadline) return '';
    const [y, m, d] = j.deadline.split('-').map(Number);
    const [ty, tm, td] = today().split('-').map(Number);
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 864e5);
    if (days < 0) return pill('late', 'Closed ' + fmtDate(j.deadline));
    if (days === 0) return pill('late', 'Closes today');
    return pill(days <= 7 ? 'soon' : 'none', days <= 7 ? days + (days === 1 ? ' day left' : ' days left') : 'Closes ' + fmtDate(j.deadline));
  }

  /* ---------- small templates ---------- */
  const bid = (b) => 'b-' + b.replace(/[^a-zA-Z0-9]/g, '-');
  function field(label, bind, value, opts = {}) {
    const id = bid(bind);
    const ctl = opts.area
      ? '<textarea id="' + id + '" class="' + (opts.cls || '') + '" data-bind="' + esc(bind) + '" placeholder="' + esc(opts.ph || '') + '">' + esc(value) + '</textarea>'
      : '<input id="' + id + '" type="' + (opts.type || 'text') + '" data-bind="' + esc(bind) + '" value="' + esc(value) + '" placeholder="' + esc(opts.ph || '') + '">';
    return '<label class="f" for="' + id + '">' + esc(label) + ctl + '</label>';
  }
  function select(label, bind, value, options) {
    const id = bid(bind);
    return '<label class="f" for="' + id + '">' + esc(label) + '<select id="' + id + '" data-bind="' + esc(bind) + '">' + options.map(([v, t]) => '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>';
  }
  const btn = (text, action, id, cls = '', extra = '') => '<button type="button" class="btn ' + cls + '" data-action="' + action + '"' + (id ? ' data-id="' + esc(id) + '"' : '') + ' ' + extra + '>' + esc(text) + '</button>';
  function twoStep(text, action, id) {
    const key = action + ':' + id;
    return ui.confirm === key ? btn('Yes, ' + text.toLowerCase(), action, id, 'danger') + btn('Keep it', 'cancelConfirm', '', 'quiet') : btn(text, 'askConfirm', key, 'quiet', 'data-confirm="' + esc(key) + '"');
  }
  const head = (title, text) => '<header class="page-head"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p></header>';
  const empty = (text, cta) => '<div class="empty"><p>' + esc(text) + '</p>' + (cta || '') + '</div>';
  const go = (t, h) => '<a class="btn-link" href="#' + h + '">' + esc(t) + '</a>';

  function claudePanel(j, ctx) {
    return '<div class="claude"><h3>Let Claude read and assess it</h3><p class="hint">This site can’t open other websites. Copy the prompt into a Claude chat, then paste the reply here. It fills in the job and checks every quoted line against your CV.</p>' +
      '<div class="row">' + btn('Copy prompt', 'copyEval', j.id) + '</div>' +
      '<label class="f" for="reply-' + ctx + '-' + j.id + '">Claude’s reply<textarea id="reply-' + ctx + '-' + j.id + '" data-reply="' + j.id + '" placeholder="Paste the whole reply"></textarea></label>' +
      '<div class="row">' + btn('Use this reply', 'importReply', j.id + '|' + ctx, 'quiet') + '</div></div>';
  }

  /* ---------- spreadsheet ---------- */
  const OPT = (o, v) => o.map(([a, t]) => '<option value="' + esc(a) + '"' + (a === v ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
  const cIn = (bind, v, label, ph) => '<input class="c" id="' + bid(bind) + '" data-bind="' + esc(bind) + '" value="' + esc(v) + '" aria-label="' + esc(label) + '" placeholder="' + esc(ph || '') + '">';
  const cDate = (bind, v, label) => '<input class="c" type="date" id="' + bid(bind) + '" data-bind="' + esc(bind) + '" value="' + esc(v) + '" aria-label="' + esc(label) + '">';
  const cSel = (bind, v, options, label, cls) => '<select class="c ' + (cls || '') + '" id="' + bid(bind) + '" data-bind="' + esc(bind) + '" aria-label="' + esc(label) + '">' + OPT(options, v) + '</select>';
  const cArea = (bind, v, label) => '<textarea class="c" rows="2" id="' + bid(bind) + '" data-bind="' + esc(bind) + '" aria-label="' + esc(label) + '">' + esc(v) + '</textarea>';
  const ro = (html, cls) => '<div class="ro ' + (cls || '') + '">' + html + '</div>';
  const roJob = (j) => ro('<strong>' + esc(jobName(j)) + '</strong>');
  const num = (v) => ro(esc(v), 'mono num');

  function sheet(name, cols, rows, opts = {}) {
    const sort = ui.sort[name];
    const list = rows.slice();
    if (sort) {
      const col = cols.find((c) => c.key === sort.key);
      if (col && col.val) {
        list.sort((a, b) => {
          const x = col.val(a);
          const y = col.val(b);
          if (x === '' || x == null) return y === '' || y == null ? 0 : 1;
          if (y === '' || y == null) return -1;
          return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
        });
      }
    }
    const nW = opts.numbered === false ? 0 : 52;
    const total = cols.reduce((w, c) => w + c.w, nW);
    const colgroup = (nW ? '<col style="width:' + nW + 'px">' : '') + cols.map((c) => '<col style="width:' + c.w + 'px">').join('');
    const headers = cols.map((c, i) => {
      const on = sort && sort.key === c.key;
      const aria = on ? ' aria-sort="' + (sort.dir > 0 ? 'ascending' : 'descending') + '"' : '';
      const inner = c.val ? '<button type="button" data-action="sort" data-id="' + esc(name + '|' + c.key) + '">' + esc(c.label) + (on ? (sort.dir > 0 ? ' ▲' : ' ▼') : '') + '</button>' : esc(c.label);
      return '<th scope="col"' + aria + (i === 0 && nW ? ' class="stick"' : '') + '>' + inner + '</th>';
    }).join('');
    const colspan = cols.length + (nW ? 1 : 0);
    const body = list.map((r, i) => {
      const id = opts.rowId ? opts.rowId(r) : r.id;
      const open = opts.detail && ui.open === id;
      const n = !nW ? '' : '<td class="n">' + (opts.detail ? '<button type="button" class="n-btn" data-action="toggle" data-id="' + esc(id) + '" aria-expanded="' + !!open + '" aria-label="Details for row ' + (i + 1) + '"><span>' + (i + 1) + '</span><span aria-hidden="true">' + (open ? '▾' : '▸') + '</span></button>' : (i + 1)) + '</td>';
      const hay = opts.hay ? ' data-h="' + esc(opts.hay(r).toLowerCase()) + '"' : '';
      return '<tr class="r' + (open ? ' is-open' : '') + '"' + hay + '>' + n + cols.map((c, ci) => '<td class="' + (ci === 0 && nW ? 'stick' : '') + '">' + c.cell(r, i) + '</td>').join('') + '</tr>' +
        (open ? '<tr class="detail"><td colspan="' + colspan + '"><div class="detail-in">' + opts.detail(r) + '</div></td></tr>' : '');
    }).join('');
    return '<div class="sheet-wrap' + (opts.main ? ' sheet-main' : '') + '"><table class="sheet" style="width:' + total + 'px"><colgroup>' + colgroup + '</colgroup><thead><tr>' + (nW ? '<th class="n">#</th>' : '') + headers + '</tr></thead><tbody>' + body + (opts.newRow || '') + '</tbody></table></div>';
  }
  const filterBox = (ph) => '<label class="filter" for="sheet-filter"><span>Filter</span><input id="sheet-filter" value="' + esc(ui.q) + '" placeholder="' + esc(ph) + '"></label>';
  function applyFilter() {
    const q = ui.q.trim().toLowerCase();
    document.querySelectorAll('.sheet-main > table > tbody > tr.r[data-h]').forEach((tr) => {
      const hide = !!q && !tr.dataset.h.includes(q);
      tr.hidden = hide;
      const next = tr.nextElementSibling;
      if (next && next.classList.contains('detail')) next.hidden = hide;
    });
  }
  function moveCell(el, dr, dc) {
    const td = el.closest('td');
    const table = td.closest('table');
    const rows = [...table.tBodies[0].rows].filter((r) => r.classList.contains('r') && !r.hidden);
    let r = rows.indexOf(td.parentNode);
    let c = td.cellIndex;
    const control = (row, col) => row.cells[col] && row.cells[col].querySelector('input,select,textarea');
    for (;;) {
      r += dr; c += dc;
      if (r < 0 || r >= rows.length || c < 0 || c >= rows[r].cells.length) return false;
      const target = control(rows[r], c);
      if (target) { target.focus(); if (target.select && target.type !== 'date' && target.tagName !== 'SELECT') target.select(); return true; }
    }
  }

  /* ---------- stage 1 ---------- */
  function cvUpload(p) {
    if (ui.cvPending) return '<div class="banner warn"><p>Replace the CV text below with ' + esc(ui.cvPending.name) + '?</p><div class="row">' + btn('Replace', 'useCv') + btn('Keep current text', 'dropCv', '', 'quiet') + '</div></div>';
    const status = p.cvFile ? 'Read from ' + p.cvFile + ' on ' + fmtDate(p.cvRead) + '. Check the text below looks right.' : 'Upload a PDF and the text is filled in for you. The file stays on your device.';
    return '<div class="upload">' + btn(ui.cvBusy ? 'Reading your CV…' : p.cvFile ? 'Upload a new CV (PDF)' : 'Upload CV (PDF)', 'pickCv', '', '', ui.cvBusy ? 'disabled' : '') + '<p>' + esc(status) + '</p></div>';
  }
  function viewProfile() {
    const p = S.profile;
    const done = [p.cv, p.goals, p.mustHaves || p.dealBreakers].filter((v) => v && v.trim()).length;
    const lines = J.cvLines(p.cv).length;
    const intro = !S.jobs.length && !p.cv ? '<div class="banner"><p>Want to see how it works first? Load a made-up candidate and three made-up jobs, then remove them when you’re done.</p>' + btn('Load example data', 'loadExample', '', 'quiet') + '</div>' : '';
    const ex = S.jobs.some((j) => j.example) ? '<div class="banner warn"><p>You’re viewing example data. Remove it before adding your own.</p>' + btn('Remove example data', 'removeExample', '', 'quiet') + '</div>' : '';
    return '<div class="page">' + head('Your profile', 'Everything else is measured against this. Update it whenever your CV or priorities change.') + intro + ex +
      '<section class="panel"><div class="panel-head"><h2>Who you are</h2>' + pill(done === 3 ? 'ok' : 'none', done + ' of 3 essentials filled') + '</div>' +
      '<div class="grid-2">' + field('Name', 'p|name', p.name) + field('Headline', 'p|headline', p.headline, { ph: 'e.g. Economics PhD moving into data science' }) + '</div>' +
      cvUpload(p) +
      field('CV text', 'p|cv', p.cv, { area: 1, cls: 'tall', ph: 'Your CV appears here after you upload it. You can also type or paste it.' }) +
      '<p class="hint mono">' + lines + ' usable CV lines found</p></section>' +
      '<section class="panel"><h2>What you want</h2>' + field('Career goals', 'p|goals', p.goals, { area: 1, ph: 'Where do you want to be in two or three years?' }) +
      '<div class="grid-2">' + field('Must-haves (one per line)', 'p|mustHaves', p.mustHaves, { area: 1, ph: 'Visa sponsorship\nAnalytical work' }) + field('Deal-breakers (one per line)', 'p|dealBreakers', p.dealBreakers, { area: 1, ph: 'Commission only\nNight shifts' }) + '</div>' +
      '<div class="grid-2">' + field('Minimum salary', 'p|minSalary', p.minSalary, { ph: '£35,000' }) + field('Locations (separate with commas)', 'p|locations', p.locations, { ph: 'London, Remote' }) + '</div>' +
      '<p class="hint">A job that contains every word of a deal-breaker is marked Skip, so write them as words a job advert would use.</p></section></div>';
  }

  /* ---------- stage 2 ---------- */
  function reqEditor(j) {
    return '<div class="stack"><div class="panel-head"><h3>Requirements (' + j.requirements.length + ')</h3>' + btn('Add requirement', 'addReq', j.id, 'quiet') + '</div>' +
      (j.requirements.length ? j.requirements.map((r) => '<div class="req"><input aria-label="Requirement" id="' + bid('req|' + r.id) + '" data-bind="req|' + j.id + '|' + r.id + '|text" value="' + esc(r.text) + '">' +
        '<select aria-label="Importance" id="' + bid('rt|' + r.id) + '" data-bind="req|' + j.id + '|' + r.id + '|type"><option value="must"' + (r.type === 'must' ? ' selected' : '') + '>Must</option><option value="nice"' + (r.type === 'nice' ? ' selected' : '') + '>Nice</option></select>' +
        '<button type="button" class="icon" aria-label="Remove requirement" data-action="delReq" data-id="' + j.id + '|' + r.id + '">×</button></div>').join('') : '<p class="hint">None yet. Paste the description above and choose Find requirements.</p>') + '</div>';
  }
  function jobDetail(j) {
    return (j.url ? '<p class="hint"><a href="' + safeHref(j.url) + '" target="_blank" rel="noopener">Open the advert</a></p>' : '') +
      field('Job description', 'job|' + j.id + '|description', j.description, { area: 1, cls: 'tall', ph: 'Open the advert, copy the whole text and paste it here.' }) +
      '<div class="row">' + btn('Find requirements', 'extract', j.id) + '</div>' + reqEditor(j) + (j.description && j.requirements.length ? '' : claudePanel(j, 'jobs')) +
      '<div class="row">' + twoStep('Remove job', 'delJob', j.id) + '</div>';
  }
  function viewJobs() {
    const cols = [
      { key: 'url', label: 'Link', w: 220, val: (j) => j.url, cell: (j) => cIn('job|' + j.id + '|url', j.url, 'Link', 'https://…') },
      { key: 'title', label: 'Job title', w: 200, val: (j) => j.title.toLowerCase(), cell: (j) => cIn('job|' + j.id + '|title', j.title, 'Job title') },
      { key: 'company', label: 'Company', w: 170, val: (j) => j.company.toLowerCase(), cell: (j) => cIn('job|' + j.id + '|company', j.company, 'Company') },
      { key: 'location', label: 'Location', w: 130, val: (j) => j.location.toLowerCase(), cell: (j) => cIn('job|' + j.id + '|location', j.location, 'Location') },
      { key: 'salary', label: 'Salary', w: 150, val: (j) => j.salary, cell: (j) => cIn('job|' + j.id + '|salary', j.salary, 'Salary') },
      { key: 'deadline', label: 'Closing date', w: 150, val: (j) => j.deadline, cell: (j) => cDate('job|' + j.id + '|deadline', j.deadline, 'Closing date') },
      { key: 'reqs', label: 'Requirements', w: 170, val: (j) => j.requirements.length, cell: (j) => ro(j.requirements.length ? pill('ok', j.requirements.length + ' found') : pill('soon', j.description ? 'None found' : 'Needs description')) },
    ];
    const newRow = '<tr class="r new"><td class="n">+</td>' + [['url', 'New job: paste a link', 'Paste link(s) here'], ['title', 'New job: title', 'Or type a job title'], ['company', 'New job: company', ''], ['location', 'New job: location', ''], ['salary', 'New job: salary', '']].map(([k, l, ph], i) => '<td' + (i ? '' : ' class="stick"') + '><input class="c" id="new-' + k + '" data-new="' + k + '" aria-label="' + l + '" placeholder="' + ph + '"></td>').join('') + '<td></td><td></td></tr>';
    return '<div class="page wide">' + head('Add jobs', 'Paste links into the bottom row, or type straight into any cell. Open a row with ▸ to add its description.') +
      '<div class="toolbar">' + filterBox('Title, company or location') + '<span class="hint mono">' + S.jobs.length + ' jobs</span></div>' +
      sheet('jobs', cols, S.jobs, { main: true, detail: jobDetail, newRow, hay: (j) => [j.url, j.title, j.company, j.location].join(' ') }) +
      '<details class="more"' + (S.jobs.length ? '' : ' open') + '><summary>Paste many links or a whole job description</summary><div class="grid-2"><div class="stack"><label class="f" for="new-links">Job links, one per line<textarea id="new-links" placeholder="https://…"></textarea></label><div class="row">' + btn('Save links', 'addLinks') + '</div></div>' +
      '<div class="stack"><label class="f" for="new-jd">Job description<textarea id="new-jd" placeholder="Use this when a link won’t open or has expired."></textarea></label><div class="row">' + btn('Save description', 'addJd', '', 'quiet') + '</div></div></div></details></div>';
  }

  /* ---------- stage 3 ---------- */
  const checkOf = (j, label) => { const c = j.evaluation && j.evaluation.checks.find((x) => x.label === label); return c ? pill(c.status === 'ok' ? 'ok' : c.status === 'flag' ? 'flag' : 'unknown', c.status === 'ok' ? 'OK' : c.status === 'flag' ? 'Below' : 'Check') : ''; };
  function evalDetail(j) {
    const ev = j.evaluation;
    let html = !j.requirements.length ? '<p class="hint">This job has no requirements yet. Add the description in Add jobs, or use Claude below.</p>' : '';
    if (ev) {
      const r = recOf(j);
      const results = [['strength', 'Strength'], ['gap', 'Gap'], ['unknown', 'Unknown']];
      const cols = [
        { key: 'text', label: 'Requirement', w: 240, val: (i) => i.text.toLowerCase(), cell: (i) => ro(esc(i.text), 'wrap') },
        { key: 'type', label: 'Type', w: 72, val: (i) => i.type, cell: (i) => ro(pill(i.type === 'must' ? 'info' : 'none', i.type === 'must' ? 'Must' : 'Nice')) },
        { key: 'status', label: 'Result', w: 124, val: (i) => i.status, cell: (i) => cSel('item|' + j.id + '|' + i.rid + '|status', i.status, results, 'Result', 'tone-' + i.status) },
        { key: 'evidence', label: 'Evidence from your CV', w: 280, cell: (i) => cArea('item|' + j.id + '|' + i.rid + '|evidence', i.evidence, 'Evidence') },
        { key: 'note', label: 'Note', w: 180, cell: (i) => ro((i.unverified ? pill('flag', 'Not found in your CV') + ' ' : '') + esc(i.note), 'wrap hint') },
      ];
      html += '<div class="verdict">' + (r.rec ? pill(r.rec, REC_NAME[r.rec]) : '') + '<p>' + esc(r.why) + '</p></div>' +
        (isStale(j) ? '<div class="banner warn"><p>Your profile or this job’s requirements changed after this check.</p>' + btn('Check again', 'evaluate', j.id, 'quiet') + '</div>' : '') +
        (ev.hits.length ? '<div class="stack">' + ev.hits.map((h) => '<div class="item">' + pill('flag', 'Deal-breaker: ' + h.rule) + '<div class="note">“' + esc(h.quote) + '”</div></div>').join('') + '</div>' : '') +
        (ev.checks.length ? '<div class="row">' + ev.checks.map((c) => '<span>' + pill(c.status === 'ok' ? 'ok' : c.status === 'flag' ? 'flag' : 'unknown', c.label) + ' <span class="hint">' + esc(c.note) + '</span></span>').join('') + '</div>' : '') +
        sheet('items-' + j.id, cols, ev.items, { numbered: false, rowId: (i) => i.rid }) +
        '<p class="hint">' + esc(SOURCE_NAME[ev.source] || 'Edited') + ', ' + fmtDate(ev.at) + '. ' + (ev.source === 'keyword' ? 'A keyword check compares words and can’t judge quality, so review each result.' : 'Review each result before relying on it.') + '</p>';
    }
    return html + claudePanel(j, 'eval');
  }
  function viewEvaluate() {
    const cvReady = !!S.profile.cv.trim();
    const pending = S.jobs.filter((j) => j.requirements.length && !j.evaluation).length;
    const count = (j, k) => (j.evaluation ? J.summarise(j.evaluation)[k] : '');
    const hint = { apply: 0, consider: 1, skip: 2 };
    const cols = [
      { key: 'job', label: 'Job', w: 240, val: (j) => jobName(j).toLowerCase(), cell: (j) => ro('<strong>' + esc(jobName(j)) + '</strong><small>' + esc(jobSub(j)) + '</small>', 'wrap') },
      { key: 'rec', label: 'Advice', w: 150, val: (j) => (recOf(j).rec ? hint[recOf(j).rec] : ''), cell: (j) => { if (!j.evaluation) return ro(recPill(j)); const r = J.recommend(j.evaluation).rec; const auto = j.evaluation.claudeRec || r; return cSel('job|' + j.id + '|evaluation.override', j.evaluation.override, [['', 'Auto: ' + (REC_NAME[auto] || 'None')], ['apply', 'Apply'], ['consider', 'Consider'], ['skip', 'Skip']], 'Advice', 'tone-' + recOf(j).rec); } },
      { key: 'ev', label: 'Must-haves met', w: 130, val: (j) => { const s = J.summarise(j.evaluation); return j.evaluation && s.total ? s.strengths / s.total : ''; }, cell: (j) => { const s = J.summarise(j.evaluation); return num(j.evaluation ? s.strengths + ' / ' + s.total : ''); } },
      { key: 'gaps', label: 'Gaps', w: 76, val: (j) => count(j, 'gaps'), cell: (j) => num(count(j, 'gaps')) },
      { key: 'unk', label: 'Unknowns', w: 96, val: (j) => count(j, 'unknowns'), cell: (j) => num(count(j, 'unknowns')) },
      { key: 'deal', label: 'Deal-breaker', w: 124, cell: (j) => ro(j.evaluation ? (j.evaluation.hits.length ? pill('flag', 'Yes') : pill('ok', 'None')) : '') },
      { key: 'sal', label: 'Salary', w: 84, cell: (j) => ro(checkOf(j, 'Salary')) },
      { key: 'loc', label: 'Location', w: 92, cell: (j) => ro(checkOf(j, 'Location')) },
      { key: 'go', label: 'Check', w: 110, cell: (j) => ro(btn(j.evaluation ? 'Re-check' : 'Check', 'evaluate', j.id, 'mini' + (j.evaluation ? ' quiet' : ''), cvReady && j.requirements.length ? '' : 'disabled')) },
    ];
    return '<div class="page wide">' + head('Evaluate matches', 'One row per job. Open a row with ▸ to see each requirement and change any result you disagree with.') +
      (!cvReady ? '<div class="banner warn"><p>Add your CV first. Every result is checked against it.</p><a href="#profile">Go to your profile</a></div>' : '') +
      (pending && cvReady ? '<div class="banner"><p>' + pending + (pending === 1 ? ' job is' : ' jobs are') + ' ready to check.</p>' + btn('Check all', 'evaluateAll') + '</div>' : '') +
      (S.jobs.length ? '<div class="toolbar">' + filterBox('Title or company') + '</div>' + sheet('evaluate', cols, S.jobs, { main: true, detail: evalDetail, hay: (j) => [j.title, j.company, j.location].join(' ') }) : empty('Evaluations appear here once you have saved a job.', go('Add a job', 'jobs'))) + '</div>';
  }

  /* ---------- stage 4 ---------- */
  function viewShortlist() {
    const rank = { apply: 0, consider: 1, '': 2, skip: 3 };
    const q = queue();
    const rest = S.jobs.filter((j) => j.evaluation && !q.includes(j)).sort((a, b) => rank[recOf(a).rec] - rank[recOf(b).rec]);
    const list = q.concat(rest);
    const decisions = [['', 'Decide…'], ['pursue', 'Pursue'], ['hold', 'Hold'], ['pass', 'Pass']];
    const stat = (j) => J.summarise(j.evaluation);
    const cols = [
      { key: 'p', label: 'Priority', w: 124, val: (j) => { const i = q.indexOf(j); return i < 0 ? '' : i; }, cell: (j) => { const i = q.indexOf(j); return i < 0 ? ro('') : '<div class="prio"><b class="mono">' + (i + 1) + '</b><button type="button" class="icon" aria-label="Move up" data-action="move" data-id="' + j.id + '|-1"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="icon" aria-label="Move down" data-action="move" data-id="' + j.id + '|1"' + (i < q.length - 1 ? '' : ' disabled') + '>↓</button></div>'; } },
      { key: 'job', label: 'Job', w: 230, val: (j) => jobName(j).toLowerCase(), cell: (j) => ro('<strong>' + esc(jobName(j)) + '</strong><small>' + esc(jobSub(j)) + '</small>', 'wrap') },
      { key: 'rec', label: 'Advice', w: 96, val: (j) => rank[recOf(j).rec], cell: (j) => ro(recPill(j)) },
      { key: 'ev', label: 'Must-haves met', w: 124, val: (j) => { const s = stat(j); return s.total ? s.strengths / s.total : ''; }, cell: (j) => { const s = stat(j); return num(s.strengths + ' / ' + s.total); } },
      { key: 'gaps', label: 'Gaps', w: 70, val: (j) => stat(j).gaps, cell: (j) => num(stat(j).gaps) },
      { key: 'unk', label: 'Unknowns', w: 92, val: (j) => stat(j).unknowns, cell: (j) => num(stat(j).unknowns) },
      { key: 'close', label: 'Closing', w: 150, val: (j) => j.deadline, cell: (j) => ro(deadlinePill(j) || '<span class="hint">Not stated</span>') },
      { key: 'dec', label: 'Your decision', w: 130, val: (j) => j.decision, cell: (j) => cSel('decision|' + j.id, j.decision, decisions, 'Your decision', 'tone-' + j.decision) },
      { key: 'why', label: 'Why it’s worth your time', w: 280, cell: (j) => cIn('job|' + j.id + '|why', j.why, 'Why it is worth your time', j.decision === 'pursue' ? 'One specific reason' : '') },
      { key: 'go', label: 'Next', w: 100, cell: (j) => ro(q.includes(j) ? '<a href="#prepare" data-action="openPrep" data-id="' + j.id + '">Prepare</a>' : '') },
    ];
    return '<div class="page wide">' + head('Shortlist', 'The advice is only a guide. Set Your decision to Pursue to add a job to your queue, then use the arrows to put the best one first.') +
      (list.length ? '<div class="toolbar">' + filterBox('Title or company') + '<span class="hint mono">' + q.length + ' in queue</span></div>' + sheet('shortlist', cols, list, { main: true, hay: (j) => [j.title, j.company].join(' ') }) : empty('Evaluated jobs appear here side by side.', go('Evaluate a job', 'evaluate'))) + '</div>';
  }

  /* ---------- stage 5 ---------- */
  function adviceList(items, none) {
    return items.length ? '<ul style="margin:0;padding-left:18px;display:grid;gap:6px">' + items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '<p class="hint">' + esc(none) + '</p>';
  }
  function viewPrepare() {
    const q = queue();
    if (!q.length) return '<div class="page">' + head('Prepare applications', 'Tailor one application at a time for the jobs you chose.') + empty('Jobs you choose to pursue appear here.', go('Open your shortlist', 'shortlist')) + '</div>';
    if (!q.find((j) => j.id === ui.prep)) ui.prep = q[0].id;
    const j = job(ui.prep);
    const items = (j.evaluation && j.evaluation.items) || [];
    const lead = items.filter((i) => i.status === 'strength').slice(0, 5).map((i) => i.text);
    const address = items.filter((i) => i.status === 'gap').map((i) => i.text);
    const confirm = items.filter((i) => i.status === 'unknown').map((i) => i.text);
    let body;
    if (ui.tab === 'answers') {
      body = '<div class="row">' + btn('Add question', 'addQ', j.id, 'quiet') + btn('Copy prompt for Claude', 'copyDraft', j.id + '|answers', 'quiet') + '</div>' +
        (j.drafts.answers.length ? j.drafts.answers.map((a) => '<div class="item">' + field('Question', 'q|' + j.id + '|' + a.id + '|q', a.q) + field('Answer', 'q|' + j.id + '|' + a.id + '|a', a.a, { area: 1 }) + '<div class="row">' + btn('Pull CV evidence', 'fillQ', j.id + '|' + a.id, 'quiet') + btn('Remove', 'delQ', j.id + '|' + a.id, 'quiet') + '</div></div>').join('') : '<p class="hint">Add each question from the application form.</p>');
    } else {
      const k = ui.tab;
      const has = !!j.drafts[k].trim();
      const genKey = 'gen:' + j.id + k;
      const gen = has && ui.confirm !== genKey ? btn('Rebuild from CV', 'askConfirm', genKey, 'quiet', 'data-confirm="' + genKey + '"') : btn(has ? 'Yes, replace my draft' : 'Build from CV', 'genDraft', j.id + '|' + k, has ? 'danger' : '');
      body = '<div class="row">' + gen + btn('Copy prompt for Claude', 'copyDraft', j.id + '|' + k, 'quiet') + btn('Copy draft', 'copyText', j.id + '|' + k, 'quiet') + '</div>' +
        field(k === 'cv' ? 'Tailored CV' : 'Cover letter', 'job|' + j.id + '|drafts.' + k, j.drafts[k], { area: 1, cls: 'draft', ph: 'Build a first version from your CV, paste Claude’s version, or write your own.' }) +
        '<p class="hint">Square brackets mark what you still need to write or confirm.</p>';
    }
    const tab = (k, t) => '<button type="button" role="tab" aria-selected="' + (ui.tab === k) + '" data-action="tab" data-id="' + k + '">' + t + '</button>';
    return '<div class="page">' + head('Prepare applications', 'Drafts start from what your CV proves. Anything missing stays visible in square brackets.') +
      '<section class="panel">' + select('Application', 'ui|prep', ui.prep, q.map((x, i) => [x.id, (i + 1) + '. ' + jobName(x)])) +
      '<div class="grid-3"><div class="stack"><h3>Lead with</h3>' + adviceList(lead, 'No evidenced strengths yet.') + '</div><div class="stack"><h3>Be ready to address</h3>' + adviceList(address, 'No gaps found.') + '</div><div class="stack"><h3>Confirm before sending</h3>' + adviceList(confirm, 'Nothing to confirm.') + '</div></div></section>' +
      '<section class="panel"><div class="tabs" role="tablist">' + tab('cv', 'Tailored CV') + tab('cover', 'Cover letter') + tab('answers', 'Application answers') + '</div>' + body + '</section>' +
      '<section class="panel"><div class="panel-head"><div><h2>Finished?</h2><p class="hint">This moves it to Track progress with today’s date.</p></div><div class="row">' + btn('Mark ready', 'setStatus', j.id + '|ready', 'quiet') + btn('Mark as applied', 'setStatus', j.id + '|applied') + '</div></div></section></div>';
  }

  /* ---------- stage 6 ---------- */
  function trackDetail(j) {
    const events = j.events.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return '<div class="stack"><h3>Add to the record</h3><div class="note-form"><label class="f" for="nt-' + j.id + '">Type<select id="nt-' + j.id + '">' + NOTE_TYPES.map((t) => '<option>' + t + '</option>').join('') + '</select></label><label class="f" for="nd-' + j.id + '">Date<input id="nd-' + j.id + '" type="date" value="' + today() + '"></label><label class="f" for="nn-' + j.id + '">What happened<input id="nn-' + j.id + '"></label>' + btn('Add', 'addNote', j.id) + '</div></div>' +
      '<div class="stack"><h3>History</h3><ol class="timeline">' + events.map((e) => '<li><span class="mono">' + esc(fmtDate(e.date)) + '</span><span><strong>' + esc(e.type) + '.</strong> ' + esc(e.note) + '</span></li>').join('') + '</ol></div>';
  }
  function viewTrack() {
    const t = tracked();
    const sent = t.filter((j) => ['applied', 'replied', 'interview', 'offer', 'rejected'].includes(j.status)).length;
    const replied = t.filter((j) => ['replied', 'interview', 'offer', 'rejected'].includes(j.status)).length;
    const interviews = t.filter((j) => j.events.some((e) => e.type === 'Interview') || ['interview', 'offer'].includes(j.status)).length;
    const isDue = (j) => j.nextDate && j.nextDate <= today() && !['offer', 'rejected', 'withdrawn'].includes(j.status);
    const due = t.filter(isDue).length;
    const stat = (n, l) => '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>';
    const chip = (v, l, n) => '<button type="button" class="chip" data-action="filter" data-id="' + v + '" aria-pressed="' + (ui.filter === v) + '">' + l + ' ' + n + '</button>';
    const shown = ui.filter === 'all' ? t : t.filter((j) => j.status === ui.filter);
    const last = (j) => j.events.reduce((m, e) => (e.date > m ? e.date : m), '');
    const cols = [
      { key: 'job', label: 'Job', w: 230, val: (j) => jobName(j).toLowerCase(), cell: (j) => ro('<strong>' + esc(jobName(j)) + '</strong><small>' + esc(jobSub(j)) + '</small>', 'wrap') },
      { key: 'status', label: 'Status', w: 150, val: (j) => STATUS.findIndex(([v]) => v === j.status), cell: (j) => cSel('status|' + j.id, j.status, STATUS, 'Status') },
      { key: 'applied', label: 'Applied on', w: 150, val: (j) => j.appliedOn, cell: (j) => cDate('job|' + j.id + '|appliedOn', j.appliedOn, 'Applied on') },
      { key: 'contact', label: 'Contact', w: 170, val: (j) => j.contact.toLowerCase(), cell: (j) => cIn('job|' + j.id + '|contact', j.contact, 'Contact') },
      { key: 'next', label: 'Next action', w: 220, val: (j) => j.nextAction.toLowerCase(), cell: (j) => cIn('job|' + j.id + '|nextAction', j.nextAction, 'Next action') },
      { key: 'due', label: 'Due', w: 150, val: (j) => j.nextDate, cell: (j) => cDate('job|' + j.id + '|nextDate', j.nextDate, 'Due') },
      { key: 'flag', label: 'Alert', w: 110, val: (j) => (isDue(j) ? 0 : ''), cell: (j) => ro(isDue(j) ? pill('late', 'Action due') : '') },
      { key: 'last', label: 'Last update', w: 130, val: last, cell: (j) => ro(esc(fmtDate(last(j))), 'mono') },
    ];
    return '<div class="page wide">' + head('Track progress', 'Every application in one sheet. Open a row with ▸ to log a call, email or interview.') +
      '<div class="stats">' + stat(sent, 'Applications sent') + stat(sent ? replied + ' of ' + sent : '0', 'Got a reply') + stat(interviews, 'Reached interview') + stat(due, 'Actions due') + '</div>' +
      '<div class="toolbar"><div class="chips">' + chip('all', 'All', t.length) + STATUS.filter(([v]) => t.some((j) => j.status === v)).map(([v, l]) => chip(v, l, t.filter((j) => j.status === v).length)).join('') + '</div>' + filterBox('Title or company') + '</div>' +
      (shown.length ? sheet('track', cols, shown, { main: true, detail: trackDetail, hay: (j) => [j.title, j.company, j.contact, STATUS_NAME[j.status]].join(' ') }) : empty('Applications appear here once you choose to pursue a job.', go('Open your shortlist', 'shortlist'))) + '</div>';
  }

  /* ---------- render ---------- */
  const VIEWS = { profile: viewProfile, jobs: viewJobs, evaluate: viewEvaluate, shortlist: viewShortlist, prepare: viewPrepare, track: viewTrack };
  const route = () => { const h = location.hash.slice(1); return VIEWS[h] ? h : 'profile'; };
  function renderNav() {
    const counts = { profile: S.profile.cv.trim() ? '✓' : '', jobs: S.jobs.length || '', evaluate: S.jobs.filter((j) => j.evaluation).length || '', shortlist: S.jobs.filter((j) => j.decision === 'pursue').length || '', prepare: queue().length || '', track: tracked().length || '' };
    const r = route();
    $('#nav').innerHTML = STAGES.map(([k, t], i) => '<a class="step" href="#' + k + '"' + (k === r ? ' aria-current="page"' : '') + '><span class="step-n">' + (i + 1) + '</span><span>' + t + '</span><span class="step-c">' + counts[k] + '</span></a>').join('');
    const current = $('.step[aria-current]');
    if (current) $('#nav').scrollLeft = current.offsetLeft - $('#nav').offsetLeft - 12;
  }
  function render() {
    const a = document.activeElement;
    const focusId = a && a.id;
    const focusAct = a && a.dataset && a.dataset.action ? '[data-action="' + a.dataset.action + '"]' + (a.dataset.id ? '[data-id="' + a.dataset.id + '"]' : '') : '';
    const replies = {};
    document.querySelectorAll('[data-reply]').forEach((t) => { if (t.value) replies[t.id] = t.value; });
    const y = window.scrollY;
    renderNav();
    $('#view').innerHTML = VIEWS[route()]();
    applyFilter();
    Object.keys(replies).forEach((id) => { const t = document.getElementById(id); if (t) t.value = replies[id]; });
    const f = (focusId && document.getElementById(focusId)) || (focusAct && $(focusAct));
    if (f) f.focus({ preventScroll: true });
    window.scrollTo(0, y);
  }
  function commit() { saveNow(); render(); }

  /* ---------- changes ---------- */
  function setPath(obj, path, value) { const keys = path.split('.'); let o = obj; keys.slice(0, -1).forEach((k) => { o = o[k]; }); o[keys[keys.length - 1]] = value; }
  function setBind(bind, value, final) {
    const [kind, a, b, c] = bind.split('|');
    if (kind === 'p') S.profile[a] = value;
    else if (kind === 'ui') { ui[a] = value; if (final) { ui.tab = 'cv'; render(); } return; }
    else if (kind === 'job') { const j = job(a); if (j) setPath(j, b, value); }
    else if (kind === 'req') { const j = job(a); const r = j && j.requirements.find((x) => x.id === b); if (r) r[c] = value; }
    else if (kind === 'q') { const j = job(a); const q = j && j.drafts.answers.find((x) => x.id === b); if (q) q[c] = value; }
    else if (kind === 'item') {
      const j = job(a);
      const i = j && j.evaluation.items.find((x) => x.rid === b);
      if (i) { i[c] = value; if (c === 'status') { j.evaluation.claudeRec = ''; j.evaluation.source = 'edited'; } if (c === 'evidence') i.unverified = i.status === 'strength' && !J.evidenceInCv(value, S.profile.cv); }
    } else if (kind === 'status') { changeStatus(job(a), value); } else if (kind === 'decision') { setDecision(job(a), value); }
    save();
  }
  function changeStatus(j, status, quiet) {
    if (!j || j.status === status) return;
    const from = j.status;
    j.status = status;
    if (status === 'applied' && !j.appliedOn) j.appliedOn = today();
    log(j, 'Status', (from ? STATUS_NAME[from] + ' → ' : '') + STATUS_NAME[status]);
    if (!quiet) saveNow();
  }
  function setDecision(j, d) {
    if (!j || j.decision === d) return;
    j.decision = d;
    if (d === 'pursue') { j.order = Math.max(0, ...S.jobs.map((x) => x.order || 0)) + 1; if (!j.status) changeStatus(j, 'preparing', true); }
    else if (j.status === 'preparing' || j.status === 'ready') j.status = '';
    log(j, 'Decision', d ? d[0].toUpperCase() + d.slice(1) : 'Cleared');
  }
  function addLinks(text) {
    const { valid, invalid } = J.parseLinks(text);
    if (!valid.length && !invalid.length) { toast('Paste at least one link first.'); return null; }
    const known = new Set(S.jobs.map((j) => J.cleanUrl(j.url)));
    const fresh = valid.filter((u) => !known.has(u));
    let last = null;
    fresh.forEach((url) => { last = newJob({ url }); log(last, 'Added', 'Link saved'); S.jobs.push(last); });
    commit();
    const dupes = valid.length - fresh.length;
    toast([fresh.length + (fresh.length === 1 ? ' link saved' : ' links saved'), dupes ? dupes + ' already saved' : '', invalid.length ? invalid.length + ' not a valid link' : ''].filter(Boolean).join(', '));
    return last;
  }
  function addFromNewRow(col, value) {
    const v = value.trim();
    if (!v) return;
    const active = document.activeElement;
    const nextCol = active && active.dataset && active.dataset.new ? active.dataset.new : active === document.body ? 'title' : '';
    const made = col === 'url' ? addLinks(v) : (() => { const j = newJob({ [col]: v }); log(j, 'Added', 'Added in the sheet'); S.jobs.push(j); commit(); return j; })();
    const input = $('#new-' + col);
    if (input) input.value = '';
    if (made && nextCol) { const el = document.getElementById(bid('job|' + made.id + '|' + nextCol)); if (el) el.focus(); }
  }
  function runEval(j) {
    const old = j.evaluation;
    j.evaluation = J.evaluate(j, S.profile);
    if (old && old.override) j.evaluation.override = old.override;
    log(j, 'Evaluated', (REC_NAME[recOf(j).rec] || 'No result') + ' from the keyword check');
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); } catch (e) { toast('Copying is blocked here. Select the text and copy it yourself.'); }
  }
  function setCv(text, name) { S.profile.cv = text; S.profile.cvFile = name; S.profile.cvRead = today(); }
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let pdfLib = null;
  function loadPdfLib() {
    if (!pdfLib) pdfLib = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = PDFJS + 'pdf.min.js';
      tag.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
      tag.onerror = () => { pdfLib = null; reject(new Error('library')); };
      document.head.appendChild(tag);
    });
    return pdfLib;
  }
  async function readPdf(file) {
    const lib = await loadPdfLib();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) pages.push((await (await doc.getPage(n)).getTextContent()).items);
    return J.pdfItemsToText(pages);
  }
  async function handleCvFile(file) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { toast('Please choose a PDF file.'); return; }
    if (file.size > 15 * 1024 * 1024) { toast('That PDF is over 15 MB. Try a smaller copy.'); return; }
    ui.cvBusy = true;
    render();
    let text = '';
    let problem = '';
    try {
      text = await readPdf(file);
      if (text.replace(/\s/g, '').length < 40) problem = 'This PDF is a scanned image, so it has no text to read. Export your CV as a text PDF, or paste it in.';
    } catch (e) {
      if (e && e.message === 'library') problem = 'Couldn’t load the PDF reader. Check your connection and try again, or paste your CV in.';
      else if (e && e.name === 'PasswordException') problem = 'This PDF is password protected. Remove the password and try again, or paste your CV in.';
      else problem = 'Couldn’t read this PDF. Try exporting it again, or paste your CV in.';
    }
    ui.cvBusy = false;
    if (problem) { render(); toast(problem); return; }
    if (S.profile.cv.trim()) { ui.cvPending = { text, name: file.name }; render(); return; }
    setCv(text, file.name);
    commit();
    toast('CV added. Check the text looks right.');
  }
  function fillFromDescription(j) {
    const d = J.extractDetails(j.description);
    ['title', 'company', 'location', 'salary', 'deadline'].forEach((k) => { if (d[k] && !j[k]) j[k] = d[k]; });
    j.requirements = J.extractRequirements(j.description);
    return j.requirements.length;
  }
  function loadExample() {
    S.profile = { name: 'Example Candidate', headline: 'Economics graduate moving into data analysis', goals: 'Become a senior analyst working on public policy questions.', mustHaves: 'Analytical work', dealBreakers: 'Commission only', minSalary: '£32,000', locations: 'London, Remote',
      cv: 'Built Python data pipelines to clean and analyse survey data for a university research team\nWrote SQL queries to report on 2 million customer records\nPresented statistical analysis findings to non-technical stakeholders\nBuilt Tableau dashboards used weekly by the operations team\nMSc Economics with a focus on applied statistics' };
    const mk = (o) => { const j = newJob({ example: true, ...o }); j.requirements = J.extractRequirements(j.description); log(j, 'Added', 'Saved to JobHunting (example)'); j.evaluation = J.evaluate(j, S.profile); return j; };
    const a = mk({ title: 'Data Analyst', company: 'Harbourline Insights (example)', location: 'London', salary: '£38,000 - £44,000', deadline: addDays(21), url: 'https://example.com/jobs/data-analyst', description: 'Data Analyst at Harbourline Insights\nLocation: London\nRequirements:\n- Experience writing SQL queries\n- Python for data analysis\n- Presenting findings to non-technical stakeholders\n- Right to work in the UK\nDesirable:\n- Experience with Tableau dashboards' });
    const b = mk({ title: 'Policy Research Officer', company: 'Civic Evidence Trust (example)', location: 'Remote', salary: '£33,000', deadline: addDays(5), url: 'https://example.com/jobs/policy-research', description: 'Policy Research Officer\nEssential:\n- Applied statistics training\n- Experience drafting government consultation responses\n- Stakeholder engagement with ministers\nRemote role' });
    const c = mk({ title: 'Sales Data Associate', company: 'Quickclose Ltd (example)', location: 'Leeds', salary: '£24,000', url: 'https://example.com/jobs/sales-data', description: 'Sales Data Associate\nCommission only for the first six months.\nRequirements:\n- Cold calling experience\n- CRM administration' });
    a.decision = 'pursue'; a.why = 'Uses SQL and Python daily, close to my target work.'; a.order = 1; a.status = 'applied'; a.appliedOn = addDays(-6); a.nextAction = 'Chase the recruiter'; a.nextDate = today();
    log(a, 'Status', 'Preparing → Applied', a.appliedOn);
    b.decision = 'pursue'; b.why = 'Direct route into public policy.'; b.order = 2; b.status = 'preparing'; log(b, 'Status', 'Preparing');
    c.decision = 'pass';
    S.jobs = [c, b, a];
    commit();
    toast('Example data loaded');
  }
  function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  const A = {
    toggle(id) { ui.open = ui.open === id ? null : id; render(); },
    askConfirm(key) { ui.confirm = key; render(); },
    cancelConfirm() { ui.confirm = null; render(); },
    tab(k) { ui.tab = k; ui.confirm = null; render(); },
    filter(v) { ui.filter = v; render(); },
    openPrep(id) { ui.prep = id; ui.tab = 'cv'; },
    pickCv() { $('#cv-file').click(); },
    useCv() { setCv(ui.cvPending.text, ui.cvPending.name); ui.cvPending = null; commit(); toast('CV added. Check the text looks right.'); },
    dropCv() { ui.cvPending = null; render(); },
    loadExample,
    removeExample() { const jobs = S.jobs.filter((j) => !j.example); const profile = S.profile.name === 'Example Candidate' ? blank().profile : S.profile; S = { ...blank(), profile, jobs }; ui.open = null; commit(); toast('Example data removed'); },
    addLinks() { if (addLinks($('#new-links').value)) $('#new-links').value = ''; },
    addJd() {
      const text = $('#new-jd').value.trim();
      if (!text) { toast('Paste a job description first.'); return; }
      const j = newJob({ description: text });
      const n = fillFromDescription(j);
      log(j, 'Added', 'Description pasted');
      S.jobs.push(j);
      ui.open = j.id;
      commit();
      toast(n ? n + ' requirements found. Check them below.' : 'No requirements found. Add them below or use Claude.');
    },
    extract(id) {
      const j = job(id);
      if (!j.description.trim()) { toast('Paste the job description first.'); return; }
      const n = fillFromDescription(j);
      commit();
      toast(n ? n + ' requirements found. Check them below.' : 'No requirements found. Add them yourself or use Claude.');
    },
    addReq(id) { const j = job(id); j.requirements.push({ id: J.uid(), text: '', type: 'must' }); commit(); },
    delReq(v) { const [a, b] = v.split('|'); const j = job(a); j.requirements = j.requirements.filter((r) => r.id !== b); commit(); },
    delJob(id) { S.jobs = S.jobs.filter((j) => j.id !== id); ui.confirm = null; ui.open = null; commit(); toast('Job removed'); },
    evaluate(id) { runEval(job(id)); ui.open = id; commit(); toast('Checked against your CV'); },
    evaluateAll() { const list = S.jobs.filter((j) => j.requirements.length && !j.evaluation); list.forEach(runEval); commit(); toast(list.length + ' checked against your CV'); },
    copyEval(id) { copy(J.evalPrompt(S.profile, job(id)), 'Prompt copied. Paste it into Claude.'); },
    importReply(v) {
      const [id, ctx] = v.split('|');
      const box = document.getElementById('reply-' + ctx + '-' + id);
      const j = job(id);
      let data;
      try { data = J.parseEvalReply(box.value); } catch (e) { toast('That reply isn’t in the expected format. Copy Claude’s whole reply and try again.'); return; }
      J.applyEvalReply(j, S.profile, data);
      log(j, 'Evaluated', (REC_NAME[recOf(j).rec] || 'No result') + ' from Claude');
      box.value = '';
      commit();
      const bad = j.evaluation.items.filter((i) => i.unverified).length;
      toast(bad ? bad + ' quoted lines weren’t found in your CV. They’re marked.' : 'Assessment added');
    },
    sort(v) { const [n, k] = v.split('|'); const c = ui.sort[n]; ui.sort[n] = c && c.key === k ? (c.dir > 0 ? { key: k, dir: -1 } : null) : { key: k, dir: 1 }; render(); },
    move(v) {
      const [id, dir] = v.split('|');
      const q = queue();
      const i = q.findIndex((j) => j.id === id);
      const other = q[i + Number(dir)];
      if (!other) return;
      q.forEach((j, n) => { j.order = n; });
      const t = q[i].order; q[i].order = other.order; other.order = t;
      commit();
    },
    genDraft(v) { const [id, k] = v.split('|'); const j = job(id); j.drafts[k] = k === 'cv' ? J.cvDraft(S.profile, j) : J.coverDraft(S.profile, j); ui.confirm = null; commit(); toast('Draft built from your CV'); },
    copyDraft(v) { const [id, k] = v.split('|'); copy(J.draftPrompt(S.profile, job(id), k), 'Prompt copied. Paste Claude’s reply into your draft.'); },
    copyText(v) { const [id, k] = v.split('|'); copy(job(id).drafts[k], 'Draft copied'); },
    addQ(id) { job(id).drafts.answers.push({ id: J.uid(), q: '', a: '' }); commit(); },
    delQ(v) { const [a, b] = v.split('|'); const j = job(a); j.drafts.answers = j.drafts.answers.filter((q) => q.id !== b); commit(); },
    fillQ(v) { const [a, b] = v.split('|'); const q = job(a).drafts.answers.find((x) => x.id === b); if (!q.q.trim()) { toast('Write the question first.'); return; } q.a = q.a ? q.a + '\n\n' + J.answerDraft(S.profile, q.q) : J.answerDraft(S.profile, q.q); commit(); },
    setStatus(v) { const [id, st] = v.split('|'); changeStatus(job(id), st); render(); toast('Marked as ' + STATUS_NAME[st].toLowerCase()); },
    addNote(id) {
      const note = $('#nn-' + id).value.trim();
      if (!note) { toast('Write what happened first.'); return; }
      log(job(id), $('#nt-' + id).value, note, $('#nd-' + id).value || today());
      commit();
    },
    export() {
      saveNow();
      const url = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'jobhunting-backup-' + today() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Backup downloaded');
    },
    confirmImport() { S = normalise(ui.importing); ui.importing = null; commit(); toast('Backup restored'); },
    cancelImport() { ui.importing = null; const banner = $('#import-banner'); if (banner) banner.remove(); },
  };

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t || t.disabled) return;
    const fn = A[t.dataset.action];
    if (fn) fn(t.dataset.id);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'sheet-filter') { ui.q = e.target.value; applyFilter(); return; }
    const b = e.target.dataset && e.target.dataset.bind;
    if (b && e.target.tagName !== 'SELECT') setBind(b, e.target.value, false);
  });
  document.addEventListener('paste', (e) => {
    if (e.target.id !== 'new-url') return;
    const text = e.clipboardData.getData('text');
    if (J.parseLinks(text).valid.length < 2) return;
    e.preventDefault();
    addLinks(text);
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t.classList || !t.classList.contains('c')) return;
    const key = e.key;
    if (key === 'Enter' && t.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (t.dataset.new) t.blur(); else moveCell(t, e.shiftKey ? -1 : 1, 0);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key) || t.type === 'date') return;
    const textual = t.tagName !== 'SELECT';
    const atStart = textual && t.selectionStart === 0 && t.selectionEnd === 0;
    const atEnd = textual && t.selectionStart === t.value.length && t.selectionEnd === t.value.length;
    const all = textual && t.selectionStart === 0 && t.selectionEnd === t.value.length;
    const vertical = key === 'ArrowUp' || key === 'ArrowDown';
    if (t.tagName === 'TEXTAREA' && !(key === 'ArrowUp' || key === 'ArrowLeft' ? atStart : atEnd) && !all) return;
    if (t.tagName === 'INPUT' && !vertical && !all && !(key === 'ArrowLeft' ? atStart : atEnd)) return;
    e.preventDefault();
    moveCell(t, key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0, key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0);
  });
  document.addEventListener('change', (e) => {
    const b = e.target.dataset && e.target.dataset.bind;
    if (e.target.dataset && e.target.dataset.new) { const col = e.target.dataset.new; const v = e.target.value; setTimeout(() => addFromNewRow(col, v), 0); return; }
    if (!b) return;
    if (e.target.tagName === 'SELECT') { setBind(b, e.target.value, true); saveNow(); render(); }
    else if (e.target.type === 'date') { setBind(b, e.target.value, true); saveNow(); needsRender = true; }
    else saveNow();
  });
  document.addEventListener('focusout', () => { if (saveTimer) saveNow(); if (needsRender) { needsRender = false; setTimeout(render, 0); } });
  window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });
  window.addEventListener('hashchange', () => { ui.open = null; ui.confirm = null; ui.cvPending = null; ui.q = ''; render(); window.scrollTo(0, 0); });
  window.addEventListener('storage', (e) => { if (e.key === KEY && document.hidden) { S = load(); render(); } });
  $('#cv-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) handleCvFile(f); });
  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let data;
      try { data = JSON.parse(r.result); if (!data || !Array.isArray(data.jobs) || !data.profile) throw new Error('shape'); } catch (err) { toast('That file isn’t a JobHunting backup.'); return; }
      ui.importing = data;
      const old = $('#import-banner'); if (old) old.remove();
      const div = document.createElement('div');
      div.id = 'import-banner'; div.className = 'banner warn'; div.style.marginBottom = '20px';
      div.innerHTML = '<p>Replace everything here with this backup of ' + data.jobs.length + ' jobs?</p><div class="row">' + btn('Replace', 'confirmImport', '', 'danger') + btn('Cancel', 'cancelImport', '', 'quiet') + '</div>';
      $('#view').prepend(div);
    };
    r.readAsText(file);
  });
  render();
})();
