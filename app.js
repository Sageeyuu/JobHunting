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

  const blank = () => ({ profile: { name: '', headline: '', cv: '', goals: '', mustHaves: '', dealBreakers: '', minSalary: '', locations: '' }, jobs: [] });
  const ui = { open: null, prep: null, tab: 'cv', filter: 'all', confirm: null, importing: null };
  let S = load();
  let storageOk = true;
  let saveTimer = null;

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

  /* ---------- stage 1 ---------- */
  function viewProfile() {
    const p = S.profile;
    const done = [p.cv, p.goals, p.mustHaves || p.dealBreakers].filter((v) => v && v.trim()).length;
    const lines = J.cvLines(p.cv).length;
    const intro = !S.jobs.length && !p.cv ? '<div class="banner"><p>Want to see how it works first? Load a made-up candidate and three made-up jobs, then remove them when you’re done.</p>' + btn('Load example data', 'loadExample', '', 'quiet') + '</div>' : '';
    const ex = S.jobs.some((j) => j.example) ? '<div class="banner warn"><p>You’re viewing example data. Remove it before adding your own.</p>' + btn('Remove example data', 'removeExample', '', 'quiet') + '</div>' : '';
    return '<div class="page">' + head('Your profile', 'Everything else is measured against this. Update it whenever your CV or priorities change.') + intro + ex +
      '<section class="panel"><div class="panel-head"><h2>Who you are</h2>' + pill(done === 3 ? 'ok' : 'none', done + ' of 3 essentials filled') + '</div>' +
      '<div class="grid-2">' + field('Name', 'p|name', p.name) + field('Headline', 'p|headline', p.headline, { ph: 'e.g. Economics PhD moving into data science' }) + '</div>' +
      field('CV', 'p|cv', p.cv, { area: 1, cls: 'tall', ph: 'Paste your full CV as text. One achievement per line gives the best matching.' }) +
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
  function jobCard(j) {
    const open = ui.open === j.id;
    const state = j.requirements.length ? pill('ok', j.requirements.length + ' requirements') : pill('soon', j.description ? 'No requirements found' : 'Needs description');
    return '<article class="card"><button type="button" class="card-top" data-action="toggle" data-id="' + j.id + '" aria-expanded="' + open + '"><span class="card-title"><strong>' + esc(jobName(j)) + '</strong><small>' + esc(jobSub(j)) + '</small></span><span class="card-tags">' + state + deadlinePill(j) + '</span></button>' +
      (open ? '<div class="card-body">' + (j.url ? '<p class="hint"><a href="' + safeHref(j.url) + '" target="_blank" rel="noopener">Open the advert</a></p>' : '') +
        '<div class="grid-2">' + field('Job title', 'job|' + j.id + '|title', j.title) + field('Company', 'job|' + j.id + '|company', j.company) + field('Location', 'job|' + j.id + '|location', j.location) + field('Salary', 'job|' + j.id + '|salary', j.salary) + field('Closing date', 'job|' + j.id + '|deadline', j.deadline, { type: 'date' }) + '</div>' +
        field('Job description', 'job|' + j.id + '|description', j.description, { area: 1, cls: 'tall', ph: 'Open the advert, copy the whole text and paste it here.' }) +
        '<div class="row">' + btn('Find requirements', 'extract', j.id) + '</div>' + reqEditor(j) + (j.description && j.requirements.length ? '' : claudePanel(j, 'jobs')) +
        '<div class="row">' + twoStep('Remove job', 'delJob', j.id) + '</div></div>' : '') + '</article>';
  }
  function viewJobs() {
    return '<div class="page">' + head('Add jobs', 'Save links as you find them. Add the description when you are ready to assess one.') +
      '<section class="panel"><div class="grid-2"><div class="stack">' + '<label class="f" for="new-links">Job links, one per line<textarea id="new-links" placeholder="https://…"></textarea></label><div class="row">' + btn('Save links', 'addLinks') + '</div></div>' +
      '<div class="stack"><label class="f" for="new-jd">Or paste a job description<textarea id="new-jd" placeholder="Use this when a link won’t open or has expired."></textarea></label><div class="row">' + btn('Save description', 'addJd', '', 'quiet') + '</div></div></div></section>' +
      (S.jobs.length ? '<section class="stack">' + S.jobs.slice().reverse().map(jobCard).join('') + '</section>' : empty('Your saved jobs will appear here with their requirements listed.')) + '</div>';
  }

  /* ---------- stage 3 ---------- */
  function itemCard(j, i) {
    const opts = [['strength', 'Strength'], ['gap', 'Gap'], ['unknown', 'Unknown']];
    return '<div class="item"><div class="row">' + pill(i.type === 'must' ? 'info' : 'none', i.type === 'must' ? 'Must' : 'Nice') + (i.unverified ? pill('flag', 'Not found in your CV') : '') + '</div><div>' + esc(i.text) + '</div>' +
      (i.note ? '<div class="note">' + esc(i.note) + '</div>' : '') +
      '<label class="f" for="' + bid('ev|' + i.rid) + '">Evidence<textarea id="' + bid('ev|' + i.rid) + '" data-bind="item|' + j.id + '|' + i.rid + '|evidence">' + esc(i.evidence) + '</textarea></label>' +
      select('Result', 'item|' + j.id + '|' + i.rid + '|status', i.status, opts) + '</div>';
  }
  function evalDetail(j) {
    const ev = j.evaluation;
    if (!ev) return '';
    const r = recOf(j);
    const lane = (s, name) => { const list = ev.items.filter((i) => i.status === s); return '<div class="lane"><h3>' + name + '<span class="mono">' + list.length + '</span></h3>' + (list.map((i) => itemCard(j, i)).join('') || '<p class="hint">None</p>') + '</div>'; };
    return '<div class="verdict">' + (r.rec ? pill(r.rec, REC_NAME[r.rec]) : '') + '<p>' + esc(r.why) + '</p>' + select('Your call', 'job|' + j.id + '|evaluation.override', ev.override, [['', 'Follow the checks'], ['apply', 'Apply'], ['consider', 'Consider'], ['skip', 'Skip']]) + '</div>' +
      (isStale(j) ? '<div class="banner warn"><p>Your profile or this job’s requirements changed after this check.</p>' + btn('Check again', 'evaluate', j.id, 'quiet') + '</div>' : '') +
      (ev.hits.length ? '<div class="stack">' + ev.hits.map((h) => '<div class="item">' + pill('flag', 'Deal-breaker: ' + h.rule) + '<div class="note">“' + esc(h.quote) + '”</div></div>').join('') + '</div>' : '') +
      (ev.checks.length ? '<div class="row">' + ev.checks.map((c) => '<span>' + pill(c.status === 'ok' ? 'ok' : c.status === 'flag' ? 'flag' : 'unknown', c.label) + ' <span class="hint">' + esc(c.note) + '</span></span>').join('') + '</div>' : '') +
      '<div class="ledger">' + lane('strength', 'Strengths') + lane('gap', 'Gaps') + lane('unknown', 'Unknowns') + '</div>' +
      '<p class="hint">' + esc(SOURCE_NAME[ev.source] || 'Edited') + ', ' + fmtDate(ev.at) + '. ' + (ev.source === 'keyword' ? 'A keyword check compares words and can’t judge quality, so review each result.' : 'Review each result before relying on it.') + '</p>';
  }
  function evalCard(j) {
    const open = ui.open === j.id;
    const s = J.summarise(j.evaluation);
    const cvReady = !!S.profile.cv.trim();
    return '<article class="card"><button type="button" class="card-top" data-action="toggle" data-id="' + j.id + '" aria-expanded="' + open + '"><span class="card-title"><strong>' + esc(jobName(j)) + '</strong><small>' + esc(jobSub(j)) + '</small></span><span class="card-tags">' + (j.evaluation ? '<span class="mono">' + s.strengths + '/' + s.total + ' ' + s.label + '</span>' : '') + recPill(j) + '</span></button>' +
      (open ? '<div class="card-body"><div class="row">' + btn(j.evaluation ? 'Check again' : 'Check this job', 'evaluate', j.id, '', (cvReady && j.requirements.length) ? '' : 'disabled') + '</div>' +
        (!j.requirements.length ? '<p class="hint">This job has no requirements yet. Add the description in Add jobs, or use Claude below.</p>' : '') + evalDetail(j) + claudePanel(j, 'eval') + '</div>' : '') + '</article>';
  }
  function viewEvaluate() {
    const cvReady = !!S.profile.cv.trim();
    const pending = S.jobs.filter((j) => j.requirements.length && !j.evaluation).length;
    return '<div class="page">' + head('Evaluate matches', 'See what your CV proves, what it doesn’t, and what only you can confirm. Change any result you disagree with.') +
      (!cvReady ? '<div class="banner warn"><p>Add your CV first. Every result is checked against it.</p><a href="#profile">Go to your profile</a></div>' : '') +
      (pending && cvReady ? '<div class="banner"><p>' + pending + (pending === 1 ? ' job is' : ' jobs are') + ' ready to check.</p>' + btn('Check all', 'evaluateAll') + '</div>' : '') +
      (S.jobs.length ? '<section class="stack">' + S.jobs.slice().reverse().map(evalCard).join('') + '</section>' : empty('Evaluations appear here once you have saved a job.', go('Add a job', 'jobs'))) + '</div>';
  }

  /* ---------- stage 4 ---------- */
  function seg(j) {
    return '<div class="seg" role="group" aria-label="Decision">' + [['pursue', 'Pursue'], ['hold', 'Hold'], ['pass', 'Pass']].map(([v, t]) => '<button type="button" data-action="decide" data-id="' + j.id + '|' + v + '" aria-pressed="' + (j.decision === v) + '">' + t + '</button>').join('') + '</div>';
  }
  function viewShortlist() {
    const rank = { apply: 0, consider: 1, '': 2, skip: 3 };
    const list = S.jobs.filter((j) => j.evaluation).sort((a, b) => rank[recOf(a).rec] - rank[recOf(b).rec]);
    const q = queue();
    const rows = list.map((j) => { const s = J.summarise(j.evaluation); return '<tr><td><strong>' + esc(jobName(j)) + '</strong><br><span class="hint">' + esc(jobSub(j)) + '</span></td><td>' + recPill(j) + '</td><td class="mono">' + s.strengths + '/' + s.total + '</td><td class="mono">' + s.gaps + '</td><td class="mono">' + s.unknowns + '</td><td>' + (deadlinePill(j) || '<span class="hint">Not stated</span>') + '</td><td>' + seg(j) + '</td></tr>'; }).join('');
    const qRows = q.map((j, i) => '<div class="queue-row"><div class="queue-n">' + (i + 1) + '</div><div class="stack"><div><strong>' + esc(jobName(j)) + '</strong> ' + deadlinePill(j) + '<br><span class="hint">' + esc(jobSub(j)) + '</span></div>' + field('Why this one is worth your time', 'job|' + j.id + '|why', j.why, { ph: 'One specific reason' }) + '<div class="row"><a href="#prepare" data-action="openPrep" data-id="' + j.id + '">Prepare this application</a></div></div><div class="arrows"><button type="button" class="icon" aria-label="Move up" data-action="move" data-id="' + j.id + '|-1"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="icon" aria-label="Move down" data-action="move" data-id="' + j.id + '|1"' + (i < q.length - 1 ? '' : ' disabled') + '>↓</button></div></div>').join('');
    return '<div class="page">' + head('Shortlist', 'The recommendation is only advice. Your decision is what puts a job in the queue.') +
      (list.length ? '<section class="panel"><h2>Compare</h2><div class="table-wrap"><table><thead><tr><th>Job</th><th>Advice</th><th>Evidenced</th><th>Gaps</th><th>Unknowns</th><th>Closing</th><th>Your decision</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>' : empty('Evaluated jobs appear here side by side.', go('Evaluate a job', 'evaluate'))) +
      '<section class="panel"><div class="panel-head"><h2>Application queue</h2><span class="mono">' + q.length + ' in queue</span></div>' + (q.length ? '<div class="stack">' + qRows + '</div>' : '<p class="hint">Choose Pursue on a job above to add it. Use the arrows to put the best one first.</p>') + '</section></div>';
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
  function trackRow(j) {
    const open = ui.open === j.id;
    const due = j.nextDate && j.nextDate <= today();
    const events = j.events.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return '<article class="card"><button type="button" class="card-top" data-action="toggle" data-id="' + j.id + '" aria-expanded="' + open + '"><span class="card-title"><strong>' + esc(jobName(j)) + '</strong><small>' + esc(jobSub(j)) + (j.appliedOn ? ' · applied ' + fmtDate(j.appliedOn) : '') + '</small></span><span class="card-tags">' + (due ? pill('late', 'Action due') : j.nextDate ? pill('none', 'Next ' + fmtDate(j.nextDate)) : '') + pill('info', STATUS_NAME[j.status]) + '</span></button>' +
      (open ? '<div class="card-body"><div class="grid-3">' + select('Status', 'status|' + j.id, j.status, STATUS) + field('Applied on', 'job|' + j.id + '|appliedOn', j.appliedOn, { type: 'date' }) + field('Contact', 'job|' + j.id + '|contact', j.contact, { ph: 'Name or email' }) + '</div>' +
        '<div class="grid-2">' + field('Next action', 'job|' + j.id + '|nextAction', j.nextAction, { ph: 'e.g. Chase recruiter' }) + field('Due', 'job|' + j.id + '|nextDate', j.nextDate, { type: 'date' }) + '</div>' +
        '<div class="stack"><h3>Add to the record</h3><div class="note-form"><label class="f" for="nt-' + j.id + '">Type<select id="nt-' + j.id + '">' + NOTE_TYPES.map((t) => '<option>' + t + '</option>').join('') + '</select></label><label class="f" for="nd-' + j.id + '">Date<input id="nd-' + j.id + '" type="date" value="' + today() + '"></label><label class="f" for="nn-' + j.id + '">What happened<input id="nn-' + j.id + '"></label>' + btn('Add', 'addNote', j.id) + '</div></div>' +
        '<div class="stack"><h3>History</h3><ol class="timeline">' + events.map((e) => '<li><span class="mono">' + esc(fmtDate(e.date)) + '</span><span><strong>' + esc(e.type) + '.</strong> ' + esc(e.note) + '</span></li>').join('') + '</ol></div></div>' : '') + '</article>';
  }
  function viewTrack() {
    const t = tracked();
    const sent = t.filter((j) => ['applied', 'replied', 'interview', 'offer', 'rejected'].includes(j.status)).length;
    const replied = t.filter((j) => ['replied', 'interview', 'offer', 'rejected'].includes(j.status)).length;
    const interviews = t.filter((j) => j.events.some((e) => e.type === 'Interview') || ['interview', 'offer'].includes(j.status)).length;
    const due = t.filter((j) => j.nextDate && j.nextDate <= today() && !['offer', 'rejected', 'withdrawn'].includes(j.status)).length;
    const stat = (n, l) => '<div class="stat"><b>' + n + '</b><span>' + l + '</span></div>';
    const chip = (v, l, n) => '<button type="button" class="chip" data-action="filter" data-id="' + v + '" aria-pressed="' + (ui.filter === v) + '">' + l + ' ' + n + '</button>';
    const shown = ui.filter === 'all' ? t : t.filter((j) => j.status === ui.filter);
    return '<div class="page">' + head('Track progress', 'Every application, reply and interview in one record.') +
      '<div class="stats">' + stat(sent, 'Applications sent') + stat(sent ? replied + ' of ' + sent : '0', 'Got a reply') + stat(interviews, 'Reached interview') + stat(due, 'Actions due') + '</div>' +
      '<div class="chips">' + chip('all', 'All', t.length) + STATUS.filter(([v]) => t.some((j) => j.status === v)).map(([v, l]) => chip(v, l, t.filter((j) => j.status === v).length)).join('') + '</div>' +
      (shown.length ? '<section class="stack">' + shown.map(trackRow).join('') + '</section>' : empty('Applications appear here once you choose to pursue a job.', go('Open your shortlist', 'shortlist'))) + '</div>';
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
    } else if (kind === 'status') { changeStatus(job(a), value); }
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
  function runEval(j) {
    const old = j.evaluation;
    j.evaluation = J.evaluate(j, S.profile);
    if (old && old.override) j.evaluation.override = old.override;
    log(j, 'Evaluated', (REC_NAME[recOf(j).rec] || 'No result') + ' from the keyword check');
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); } catch (e) { toast('Copying is blocked here. Select the text and copy it yourself.'); }
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
    loadExample,
    removeExample() { const jobs = S.jobs.filter((j) => !j.example); const profile = S.profile.name === 'Example Candidate' ? blank().profile : S.profile; S = { ...blank(), profile, jobs }; ui.open = null; commit(); toast('Example data removed'); },
    addLinks() {
      const { valid, invalid } = J.parseLinks($('#new-links').value);
      if (!valid.length && !invalid.length) { toast('Paste at least one link first.'); return; }
      const known = new Set(S.jobs.map((j) => J.cleanUrl(j.url)));
      const fresh = valid.filter((u) => !known.has(u));
      fresh.forEach((url) => { const j = newJob({ url }); log(j, 'Added', 'Link saved'); S.jobs.push(j); });
      commit();
      const dupes = valid.length - fresh.length;
      toast([fresh.length + (fresh.length === 1 ? ' link saved' : ' links saved'), dupes ? dupes + ' already saved' : '', invalid.length ? invalid.length + ' not a valid link' : ''].filter(Boolean).join(', '));
    },
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
    decide(v) {
      const [id, d] = v.split('|');
      const j = job(id);
      j.decision = j.decision === d ? '' : d;
      if (j.decision === 'pursue') { j.order = Math.max(0, ...S.jobs.map((x) => x.order || 0)) + 1; if (!j.status) changeStatus(j, 'preparing', true); }
      else if (j.status === 'preparing' || j.status === 'ready') { j.status = ''; }
      log(j, 'Decision', j.decision ? d[0].toUpperCase() + d.slice(1) : 'Cleared');
      commit();
    },
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
  document.addEventListener('input', (e) => { const b = e.target.dataset && e.target.dataset.bind; if (b && e.target.tagName !== 'SELECT') setBind(b, e.target.value, false); });
  document.addEventListener('change', (e) => {
    const b = e.target.dataset && e.target.dataset.bind;
    if (!b) return;
    if (e.target.tagName === 'SELECT' || e.target.type === 'date') { setBind(b, e.target.value, true); saveNow(); render(); } else saveNow();
  });
  document.addEventListener('focusout', () => { if (saveTimer) saveNow(); });
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
