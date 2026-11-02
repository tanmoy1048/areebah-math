(function () {
  'use strict';

  // ---------- Storage (per-viewer conveniences only; every access is guarded) ----------
  var FAV_KEY = 'maths-favourites';
  var THEME_KEY = 'maths-theme';

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage blocked: the feature just won't persist */ }
  }

  // ---------- State ----------
  var data = window.SOLUTIONS || [];
  var all = [];          // every exercise as { ch, topic, ex }
  var byChapter = {};    // chapterId -> chapter
  var favs = readJson(FAV_KEY, []);
  var app = document.getElementById('app');

  var view = {
    scope: null,         // 'saved' or a chapterId such as 'ch06'
    exId: null,          // currently open exercise
    skeletonFor: null,   // scope the chapter skeleton was built for
    search: '',
    category: '',       // '', 'Practice', 'Consolidate', 'Master', or 'none'
    favOnly: false,
    reveal: false        // whether the current solution is shown
  };

  // ---------- Helpers ----------
  function isFav(id) { return favs.indexOf(id) !== -1; }

  function toggleFav(id) {
    favs = isFav(id) ? favs.filter(function (x) { return x !== id; }) : favs.concat(id);
    writeJson(FAV_KEY, favs);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function chapterNumber(ch) { return ch.chapterId.replace(/^ch0?/, ''); }

  function snippet(text) {
    var t = String(text || '').replace(/\$+/g, '').replace(/\s+/g, ' ').trim();
    return t.length > 80 ? t.slice(0, 78).trim() + '…' : t;
  }

  function catClass(cat) { return cat ? cat : 'none'; }

  function href(scope, id) {
    return '#/c/' + encodeURIComponent(scope) + (id ? '/' + encodeURIComponent(id) : '');
  }

  function figures(list) {
    return (list || []).map(function (src) {
      return '<img loading="lazy" alt="Figure for this question" src="' + esc(src) + '">';
    }).join('');
  }

  function typeset(nodes) {
    if (!window.renderMathInElement) return;
    var opts = {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false
    };
    nodes.forEach(function (n) { if (n) renderMathInElement(n, opts); });
  }

  function textBlock(s) {
    return '<div>' + esc(s).replace(/\n/g, '<br>') + '</div>';
  }

  // ---------- Theme ----------
  function applyTheme(mode) {
    if (mode) document.documentElement.setAttribute('data-theme', mode);
    else document.documentElement.removeAttribute('data-theme');
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var dark = current ? current === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  }

  // ---------- Data scopes and filters ----------
  function scopeItems() {
    if (view.scope === 'saved') return all.filter(function (it) { return isFav(it.ex.id); });
    return all.filter(function (it) { return it.ch.chapterId === view.scope; });
  }

  function visible() {
    var q = view.search.trim().toLowerCase();
    return scopeItems().filter(function (it) {
      var cat = it.ex.category;
      if (view.category === 'none' ? cat : (view.category && cat !== view.category)) return false;
      if (view.favOnly && !isFav(it.ex.id)) return false;
      if (q) {
        var hay = (it.ex.number + ' ' + it.ex.questionText + ' ' + it.topic.topicTitle + ' ' +
          it.ch.chapterTitle + ' ' + (it.ex.solution && it.ex.solution.finalAnswer || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function chapterCounts(ch) {
    var counts = { Practice: 0, Consolidate: 0, Master: 0, other: 0, total: 0 };
    ch.topics.forEach(function (t) {
      t.exercises.forEach(function (ex) {
        counts.total++;
        if (ex.category) counts[ex.category]++;
        else counts.other++;
      });
    });
    return counts;
  }

  // ---------- Views ----------
  function renderHome() {
    view.skeletonFor = null;
    var tiles = data.map(function (ch) {
      var c = chapterCounts(ch);
      var total = c.total || 1;
      var segs = [['practice', c.Practice], ['consolidate', c.Consolidate], ['master', c.Master], ['other', c.other]]
        .map(function (s) {
          return '<span class="seg seg-' + s[0] + '" style="width:' + (s[1] / total * 100).toFixed(2) + '%"></span>';
        }).join('');
      return '<a class="tile" href="' + href(ch.chapterId) + '">' +
        '<span class="tile-num">Chapter ' + esc(chapterNumber(ch)) + '</span>' +
        '<h2>' + esc(ch.chapterTitle) + '</h2>' +
        '<p class="tile-meta">' + ch.topics.length + ' topics · ' + c.total + ' questions</p>' +
        '<div class="bar-seg" aria-hidden="true">' + segs + '</div>' +
        '<span class="tile-go">Open chapter →</span>' +
        '</a>';
    }).join('');

    var saved = all.filter(function (it) { return isFav(it.ex.id); }).length;
    var savedTile = '<a class="tile tile-saved" href="' + href('saved') + '">' +
      '<span class="tile-num">★ Saved</span>' +
      '<h2>My saved questions</h2>' +
      '<p class="tile-meta">' + saved + ' saved across all chapters</p>' +
      '<span class="tile-go">Open saved list →</span>' +
      '</a>';

    app.innerHTML =
      '<div class="home">' +
        '<header class="bar">' +
          '<span class="brand">Grade 10 Maths</span>' +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn" data-act="theme" aria-label="Toggle light or dark theme">Theme</button>' +
        '</header>' +
        '<section class="hero">' +
          '<h1>Choose a chapter</h1>' +
          '<p>Every exercise question with a step-by-step worked solution. Pick a chapter to browse its questions.</p>' +
        '</section>' +
        '<h2 class="group-title">Chapters</h2>' +
        '<div class="tiles">' + tiles + '</div>' +
        '<h2 class="group-title">Saved &amp; exams</h2>' +
        '<div class="tiles">' + examHomeTile() + savedTile + '</div>' +
      '</div>';
  }

  function buildSkeleton() {
    view.skeletonFor = view.scope;
    var isSaved = view.scope === 'saved';
    var title = isSaved ? 'My saved questions' : 'Chapter ' + chapterNumber(byChapter[view.scope]) + ' · ' + byChapter[view.scope].chapterTitle;

    app.innerHTML =
      '<div class="shell">' +
        '<aside class="side" id="side" aria-label="Questions">' +
          '<div class="side-head">' +
            '<a class="home-link" href="#/">⌂ Home</a>' +
            '<p class="side-title">' + esc(title) + '</p>' +
            '<div class="filters">' +
              '<input id="q" type="search" placeholder="Search questions" aria-label="Search questions" value="' + esc(view.search) + '">' +
              '<div class="row">' +
                '<select id="cat" aria-label="Difficulty" style="flex:1 1 150px">' +
                  '<option value="">All levels</option>' +
                  '<option value="Practice">Practice</option>' +
                  '<option value="Consolidate">Consolidate</option>' +
                  '<option value="Master">Master</option>' +
                  '<option value="none">Pre-test / Review</option>' +
                '</select>' +
                (isSaved ? '' : '<button type="button" class="chip" data-act="favonly" aria-pressed="false">★ Saved only</button>') +
              '</div>' +
              '<div class="row"><span class="count" id="count"></span></div>' +
            '</div>' +
          '</div>' +
          '<nav id="nav" class="nav-list" aria-label="Exercise list"></nav>' +
        '</aside>' +
        '<div class="scrim" id="scrim" data-act="drawer"></div>' +
        '<main class="main">' +
          '<header class="bar">' +
            '<button type="button" class="btn menu-btn" data-act="drawer" aria-controls="side">☰ Questions</button>' +
            '<a class="btn" href="#/">⌂ Home</a>' +
            '<span class="crumb">' + esc(title) + '</span>' +
            '<button type="button" class="btn" data-act="theme" aria-label="Toggle light or dark theme">Theme</button>' +
          '</header>' +
          '<div id="content"></div>' +
        '</main>' +
      '</div>';

    document.getElementById('cat').value = view.category;
    var fav = app.querySelector('[data-act="favonly"]');
    if (fav) fav.setAttribute('aria-pressed', String(view.favOnly));
  }

  function renderNav(vis, curId) {
    var nav = document.getElementById('nav');
    var count = document.getElementById('count');
    if (!nav) return;
    count.textContent = vis.length + ' of ' + scopeItems().length;
    if (!vis.length) {
      nav.innerHTML = '<p class="muted" style="padding:12px 10px">No questions match these filters.</p>';
      return;
    }
    var html = '';
    var lastKey = null;
    vis.forEach(function (it) {
      var key = it.ch.chapterId + '|' + it.topic.topicId;
      if (key !== lastKey) {
        var label = (view.scope === 'saved' ? 'Ch ' + chapterNumber(it.ch) + ' · ' : '') + it.topic.topicId + ' ' + it.topic.topicTitle;
        html += '<h3 class="side-topic">' + esc(label) + '</h3>';
        lastKey = key;
      }
      var active = it.ex.id === curId;
      html += '<a class="side-item' + (active ? ' active' : '') + '" href="' + href(view.scope, it.ex.id) + '"' +
        (active ? ' aria-current="true"' : '') + '>' +
        '<span class="dot ' + catClass(it.ex.category) + '" aria-hidden="true"></span>' +
        '<span class="side-num">' + esc(it.ex.number) + '</span>' +
        '<span class="side-text">' + esc(snippet(it.ex.questionText)) + '</span>' +
        '</a>';
    });
    nav.innerHTML = html;
    var activeEl = nav.querySelector('.active');
    if (activeEl && activeEl.scrollIntoView) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function solutionHtml(sol, tricks) {
    tricks = tricks || [];
    var steps = (sol.steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    return '<section class="solution" aria-label="Solution">' +
      (sol.formula ? '<div class="block key"><h3>Key idea</h3><p>' + esc(sol.formula) + '</p></div>' : '') +
      (steps ? '<div class="block"><h3>Working</h3><ol class="steps">' + steps + '</ol></div>' : '') +
      (sol.finalAnswer ? '<div class="block answer"><h3>Answer</h3><p>' + esc(sol.finalAnswer) + '</p></div>' : '') +
      figures(sol.solutionFigures) +
      (sol.tip ? '<div class="block tip"><h3>Tip</h3><p>' + esc(sol.tip) + '</p></div>' : '') +
      (tricks.length ? '<div class="block tricks"><h3>Tricks to remember</h3><ul>' +
        tricks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>' : '') +
      '</section>';
  }

  function renderContent(vis, cur) {
    var box = document.getElementById('content');
    if (!cur) {
      box.innerHTML = '<div class="empty"><p>No questions match these filters.</p>' +
        '<button type="button" class="btn" data-act="clear">Clear filters</button></div>';
      return;
    }
    var i = vis.indexOf(cur);
    var prev = vis[i - 1];
    var next = vis[i + 1];
    var ex = cur.ex;
    var fav = isFav(ex.id);
    var cat = ex.category;
    var topicLabel = cur.topic.topicId + ' ' + cur.topic.topicTitle;

    box.innerHTML =
      '<article class="ex" aria-labelledby="ex-title">' +
        '<div class="ex-crumb">Chapter ' + esc(chapterNumber(cur.ch)) + ' · ' + esc(topicLabel) + '</div>' +
        '<div class="ex-head">' +
          '<h1 id="ex-title">Question ' + esc(ex.number) + '</h1>' +
          '<span class="badge ' + catClass(cat) + '">' + (cat ? esc(cat) : 'Pre-test / Review') + '</span>' +
          '<button type="button" class="fav' + (fav ? ' on' : '') + '" data-act="fav" data-id="' + esc(ex.id) +
            '" aria-pressed="' + fav + '">' + (fav ? '★ Saved' : '☆ Save') + '</button>' +
        '</div>' +
        '<div class="ex-question">' + textBlock(ex.questionText) + figures(ex.questionFigures) + '</div>' +
        '<div class="reveal-row">' +
          '<button type="button" class="btn primary" data-act="reveal" aria-expanded="' + view.reveal + '">' +
            (view.reveal ? 'Hide solution' : 'Show solution') + '</button>' +
        '</div>' +
        (view.reveal ? solutionHtml(ex.solution || {}, ex.tricks) : '') +
        '<nav class="pager-nav" aria-label="Exercise navigation">' +
          (prev ? '<a class="btn" rel="prev" href="' + href(view.scope, prev.ex.id) + '">← ' + esc(prev.ex.number) + '</a>' : '<span></span>') +
          '<span class="pos">' + (i + 1) + ' of ' + vis.length + '</span>' +
          (next ? '<a class="btn" rel="next" href="' + href(view.scope, next.ex.id) + '">' + esc(next.ex.number) + ' →</a>' : '<span></span>') +
        '</nav>' +
      '</article>';
  }

  // Re-render only the list and the exercise, so the search box keeps focus while typing.
  function renderBody() {
    var vis = visible();
    var cur = null;
    vis.forEach(function (it) { if (it.ex.id === view.exId) cur = it; });
    if (!cur && vis.length) cur = vis[0];

    var curId = cur ? cur.ex.id : null;
    if (curId !== view.exId) {
      view.exId = curId;
      view.reveal = false;
      history.replaceState(null, '', href(view.scope, curId));
    }

    renderNav(vis, curId);
    renderContent(vis, cur);
    typeset([document.getElementById('nav'), document.getElementById('content')]);
  }

  function closeDrawer() {
    var side = document.getElementById('side');
    var scrim = document.getElementById('scrim');
    if (side) side.classList.remove('open');
    if (scrim) scrim.classList.remove('show');
  }

  function toggleDrawer() {
    var side = document.getElementById('side');
    var scrim = document.getElementById('scrim');
    if (!side) return;
    var open = !side.classList.contains('open');
    side.classList.toggle('open', open);
    scrim.classList.toggle('show', open);
  }

  // ---------- Mock exam: #/exam (setup), #/exam/run, #/exam/result ----------
  // The exam is kept in memory, so it survives moving between pages in this tab but not a reload.
  var EXAM_SIZES = [10, 15, 20, 25];
  var TIME_OPTIONS = [
    { key: 'off', label: 'No timer', mins: 0 },
    { key: '1', label: '1 minute per question', mins: 1 },
    { key: '1.5', label: '1.5 minutes per question', mins: 1.5 },
    { key: '2', label: '2 minutes per question', mins: 2 }
  ];
  var setup = { size: 10, chapters: null, timeKey: '1.5' };  // chapters null = all chapters
  var exam = null;

  function examPool() {
    return all.filter(function (it) { return setup.chapters.indexOf(it.ch.chapterId) !== -1; });
  }

  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function examBar(title, right) {
    return '<header class="bar">' +
      '<a class="btn" href="#/">⌂ Home</a>' +
      '<span class="crumb">' + esc(title) + '</span>' +
      (right || '') +
      '<button type="button" class="btn" data-act="theme" aria-label="Toggle light or dark theme">Theme</button>' +
      '</header>';
  }

  function examHomeTile() {
    if (exam && !exam.submittedAt) {
      var left = exam.endsAt ? ' · ' + clock(exam.endsAt - Date.now()) + ' left' : '';
      return '<a class="tile tile-exam" href="#/exam/run"><span class="tile-num">In progress</span>' +
        '<h2>Resume your mock exam</h2><p class="tile-meta">' + exam.size + ' questions' + left + '</p>' +
        '<span class="tile-go">Continue →</span></a>';
    }
    return '<a class="tile tile-exam" href="#/exam"><span class="tile-num">Exam mode</span>' +
      '<h2>Create a mock exam</h2>' +
      '<p class="tile-meta">Choose 10, 15, 20 or 25 questions from any chapters, with an optional timer.</p>' +
      '<span class="tile-go">Set up exam →</span></a>';
  }

  function renderExamSetup() {
    if (!setup.chapters) setup.chapters = data.map(function (ch) { return ch.chapterId; });
    var pool = examPool().length;
    var enough = pool >= setup.size;

    var sizes = EXAM_SIZES.map(function (n) {
      var on = setup.size === n;
      return '<button type="button" class="choice' + (on ? ' on' : '') + '" data-act="exam-size" data-n="' + n +
        '" aria-pressed="' + on + '">' + n + '</button>';
    }).join('');

    var times = TIME_OPTIONS.map(function (o) {
      return '<option value="' + o.key + '"' + (setup.timeKey === o.key ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');

    var boxes = data.map(function (ch) {
      var count = all.filter(function (it) { return it.ch.chapterId === ch.chapterId; }).length;
      var checked = setup.chapters.indexOf(ch.chapterId) !== -1;
      return '<label class="check"><input type="checkbox" data-act="exam-chapter" value="' + esc(ch.chapterId) + '"' +
        (checked ? ' checked' : '') + '>' +
        '<span>Chapter ' + esc(chapterNumber(ch)) + ' · ' + esc(ch.chapterTitle) + '</span>' +
        '<span class="muted">' + count + '</span></label>';
    }).join('');

    app.innerHTML =
      '<div class="home">' +
        examBar('Mock exam') +
        '<section class="exam-setup">' +
          '<h1>Create a mock exam</h1>' +
          '<p class="muted">Answers are marked at the end, not as you go. Work each question, then compare with the worked solution.</p>' +
          '<h2>1. Number of questions</h2>' +
          '<div class="choices">' + sizes + '</div>' +
          '<h2>2. Chapters</h2>' +
          '<div class="checks">' + boxes + '</div>' +
          '<div class="row-actions">' +
            '<button type="button" class="btn" data-act="exam-all">Select all</button>' +
            '<button type="button" class="btn" data-act="exam-none">Clear</button>' +
          '</div>' +
          '<h2>3. Timer</h2>' +
          '<select id="exam-time" aria-label="Timer">' + times + '</select>' +
          '<p class="' + (enough ? 'muted' : 'warn') + '">' + pool + ' questions available in the chosen chapters' +
            (enough ? '.' : ' — choose fewer questions or more chapters.') + '</p>' +
          '<button type="button" class="btn primary big" data-act="exam-start"' + (enough ? '' : ' disabled') + '>Start exam</button>' +
        '</section>' +
      '</div>';
  }

  function startExam() {
    if (exam && !exam.submittedAt &&
        !window.confirm('You have an exam in progress. Abandon it and start a new one?')) return;
    var picked = shuffled(examPool()).slice(0, setup.size);
    var option = TIME_OPTIONS.filter(function (o) { return o.key === setup.timeKey; })[0];
    var now = Date.now();
    var limit = option && option.mins ? option.mins * 60000 * picked.length : 0;
    exam = {
      items: picked,
      size: picked.length,
      index: 0,
      answers: {},
      marks: {},
      flags: {},
      startedAt: now,
      endsAt: limit ? now + limit : null,
      submittedAt: null,
      timedOut: false
    };
    location.hash = '#/exam/run';
  }

  function renderExamRun() {
    var it = exam.items[exam.index];
    var ex = it.ex;
    var timer = exam.endsAt
      ? '<span class="timer" id="exam-timer">' + clock(exam.endsAt - Date.now()) + '</span>'
      : '<span class="muted">No timer</span>';
    var palette = exam.items.map(function (x, i) {
      var cls = ['pal'];
      if (i === exam.index) cls.push('current');
      if ((exam.answers[x.ex.id] || '').trim()) cls.push('answered');
      if (exam.flags[x.ex.id]) cls.push('flagged');
      return '<button type="button" class="' + cls.join(' ') + '" data-act="exam-go" data-i="' + i +
        '" aria-label="Question ' + (i + 1) + '">' + (i + 1) + '</button>';
    }).join('');
    var flagged = !!exam.flags[ex.id];

    app.innerHTML =
      '<div class="home">' +
        examBar('Mock exam · ' + (exam.index + 1) + ' of ' + exam.size, timer) +
        '<nav class="palette" aria-label="Questions">' + palette + '</nav>' +
        '<article class="ex" aria-labelledby="exam-q">' +
          '<div class="ex-crumb">Chapter ' + esc(chapterNumber(it.ch)) + ' · ' + esc(it.topic.topicId + ' ' + it.topic.topicTitle) + '</div>' +
          '<h1 id="exam-q" class="exam-qhead">Question ' + esc(ex.number) + '</h1>' +
          '<div class="ex-question">' + textBlock(ex.questionText) + figures(ex.questionFigures) + '</div>' +
          '<label class="answer-label" for="exam-answer">Your answer</label>' +
          '<textarea id="exam-answer" rows="5" placeholder="Write your working and final answer. You can leave this blank.">' +
            esc(exam.answers[ex.id] || '') + '</textarea>' +
          '<div class="exam-actions">' +
            '<button type="button" class="btn" data-act="exam-prev"' + (exam.index === 0 ? ' disabled' : '') + '>← Previous</button>' +
            '<button type="button" class="btn' + (flagged ? ' on' : '') + '" data-act="exam-flag" aria-pressed="' + flagged + '">' +
              (flagged ? '⚑ Flagged' : '⚐ Flag for review') + '</button>' +
            '<button type="button" class="btn" data-act="exam-next"' +
              (exam.index === exam.size - 1 ? ' disabled' : '') + '>Next →</button>' +
          '</div>' +
          '<div class="exam-submit">' +
            '<button type="button" class="btn primary" data-act="exam-submit">Finish and see results</button>' +
          '</div>' +
        '</article>' +
      '</div>';
    // Only the question is typeset, so maths never rewrites the answer box.
    typeset([app.querySelector('.ex-question')]);
  }

  function submitExam(timedOut) {
    if (!exam || exam.submittedAt) return;
    exam.submittedAt = Date.now();
    exam.timedOut = !!timedOut;
    location.hash = '#/exam/result';
  }

  function confirmSubmit() {
    var unanswered = exam.items.filter(function (it) { return !(exam.answers[it.ex.id] || '').trim(); }).length;
    var msg = unanswered
      ? 'You have ' + unanswered + ' unanswered question' + (unanswered === 1 ? '' : 's') + '. Finish the exam now?'
      : 'Finish the exam and see your results?';
    if (window.confirm(msg)) submitExam(false);
  }

  function updateScore() {
    if (!exam) return;
    var right = exam.items.filter(function (it) { return exam.marks[it.ex.id] === true; }).length;
    var el = document.getElementById('exam-score');
    if (el) el.textContent = right + ' / ' + exam.size + ' (' + Math.round(right / exam.size * 100) + '%)';
    document.querySelectorAll('[data-act="exam-mark"]').forEach(function (b) {
      var v = b.getAttribute('data-v') === '1';
      var on = exam.marks[b.getAttribute('data-id')] === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function renderExamResult() {
    var answered = exam.items.filter(function (it) { return (exam.answers[it.ex.id] || '').trim(); }).length;
    var cards = exam.items.map(function (it, i) {
      var ex = it.ex;
      var ans = (exam.answers[ex.id] || '').trim();
      return '<article class="result-card">' +
        '<div class="card-top">' +
          '<span class="rnum">' + (i + 1) + '</span>' +
          '<span class="ex-crumb">Question ' + esc(ex.number) + ' · Chapter ' + esc(chapterNumber(it.ch)) + ' · ' + esc(it.topic.topicId) + '</span>' +
          (exam.flags[ex.id] ? '<span class="flag-note">⚑ flagged</span>' : '') +
        '</div>' +
        '<div class="ex-question">' + textBlock(ex.questionText) + figures(ex.questionFigures) + '</div>' +
        '<div class="your-answer"><strong>Your answer:</strong> ' +
          (ans ? esc(ans).replace(/\n/g, '<br>') : '<em class="muted">No answer given</em>') + '</div>' +
        '<details><summary>Show worked solution</summary>' + solutionHtml(ex.solution || {}, ex.tricks) + '</details>' +
        '<div class="mark-row"><span>Mark your answer:</span>' +
          '<button type="button" class="mark correct" data-act="exam-mark" data-id="' + esc(ex.id) + '" data-v="1" aria-pressed="false">✓ Correct</button>' +
          '<button type="button" class="mark wrong" data-act="exam-mark" data-id="' + esc(ex.id) + '" data-v="0" aria-pressed="false">✗ Incorrect</button>' +
        '</div>' +
      '</article>';
    }).join('');

    var used = exam.submittedAt - exam.startedAt;
    app.innerHTML =
      '<div class="home">' +
        examBar('Exam results') +
        '<section class="result-head">' +
          '<h1>Your results</h1>' +
          (exam.timedOut ? '<p class="warn">Time ran out, so the exam was submitted as it stood.</p>' : '') +
          '<div class="score"><span id="exam-score"></span><span class="muted">self-marked</span></div>' +
          '<p class="muted">' + answered + ' of ' + exam.size + ' answered · time used ' + clock(used) + '</p>' +
          '<p class="muted">Compare your working with each worked solution, then mark it correct or incorrect. The score updates as you mark.</p>' +
          '<div class="result-actions"><a class="btn primary" href="#/exam">New exam</a><a class="btn" href="#/">Home</a></div>' +
        '</section>' +
        cards +
      '</div>';
    updateScore();
    typeset([app]);
  }

  function examAction(act, t) {
    if (act === 'exam-size') {
      setup.size = parseInt(t.getAttribute('data-n'), 10);
      renderExamSetup();
    } else if (act === 'exam-all') {
      setup.chapters = data.map(function (ch) { return ch.chapterId; });
      renderExamSetup();
    } else if (act === 'exam-none') {
      setup.chapters = [];
      renderExamSetup();
    } else if (act === 'exam-start') {
      startExam();
    } else if (act === 'exam-go') {
      exam.index = parseInt(t.getAttribute('data-i'), 10);
      renderExamRun();
    } else if (act === 'exam-prev' && exam.index > 0) {
      exam.index--;
      renderExamRun();
    } else if (act === 'exam-next' && exam.index < exam.size - 1) {
      exam.index++;
      renderExamRun();
    } else if (act === 'exam-flag') {
      var fid = exam.items[exam.index].ex.id;
      exam.flags[fid] = !exam.flags[fid];
      renderExamRun();
    } else if (act === 'exam-submit') {
      confirmSubmit();
    } else if (act === 'exam-mark') {
      var mid = t.getAttribute('data-id');
      var v = t.getAttribute('data-v') === '1';
      exam.marks[mid] = exam.marks[mid] === v ? undefined : v;
      updateScore();
    }
  }

  function routeExam(sub) {
    view.scope = null;
    view.exId = null;
    if (sub === 'run' && exam && !exam.submittedAt) {
      renderExamRun();
    } else if (sub === 'result' && exam && exam.submittedAt) {
      renderExamResult();
    } else if (sub === 'run' || sub === 'result') {
      location.hash = '#/exam';
      return;
    } else {
      renderExamSetup();
    }
    window.scrollTo(0, 0);
  }

  // Exam inputs: the answer box saves as you type, without re-rendering (so typing keeps focus).
  app.addEventListener('input', function (e) {
    if (e.target.id !== 'exam-answer' || !exam) return;
    var id = exam.items[exam.index].ex.id;
    exam.answers[id] = e.target.value;
    var pal = app.querySelectorAll('.pal')[exam.index];
    if (pal) pal.classList.toggle('answered', e.target.value.trim() !== '');
  });

  app.addEventListener('change', function (e) {
    if (e.target.id === 'exam-time') {
      setup.timeKey = e.target.value;
      return;
    }
    if (e.target.getAttribute && e.target.getAttribute('data-act') === 'exam-chapter') {
      var cid = e.target.value;
      setup.chapters = e.target.checked
        ? setup.chapters.concat(cid)
        : setup.chapters.filter(function (c) { return c !== cid; });
      renderExamSetup();
    }
  });

  // Once the timer runs out the exam submits itself, even if the user is on another page.
  function tickExam() {
    if (!exam || exam.submittedAt || !exam.endsAt) return;
    var left = exam.endsAt - Date.now();
    if (left <= 0) {
      submitExam(true);
      return;
    }
    var el = document.getElementById('exam-timer');
    if (el) {
      el.textContent = clock(left);
      el.classList.toggle('low', left < 60000);
    }
  }
  setInterval(tickExam, 1000);

  // ---------- Routing: #/ (home), #/c/<scope>[/<exerciseId>] and #/exam ----------
  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'exam') {
      routeExam(parts[1]);
      return;
    }
    var valid = parts[0] === 'c' && parts[1] && (parts[1] === 'saved' || byChapter[parts[1]]);

    if (!valid) {
      view.scope = null;
      view.exId = null;
      renderHome();
      return;
    }

    var scope = parts[1];
    var exId = parts[2] || null;

    if (scope !== view.scope) {
      // A different chapter or list: start with clean filters.
      view.search = '';
      view.category = '';
      view.favOnly = false;
      view.skeletonFor = null;
    }
    if (exId !== view.exId) {
      view.reveal = false;
    }
    view.scope = scope;
    view.exId = exId;

    if (view.skeletonFor !== view.scope) buildSkeleton();
    closeDrawer();
    renderBody();
    typeset([document.getElementById('content')]);
    window.scrollTo(0, 0);
  }

  // ---------- Events ----------
  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');

    if (act === 'theme') {
      toggleTheme();
    } else if (act === 'drawer') {
      toggleDrawer();
    } else if (act === 'reveal') {
      view.reveal = !view.reveal;
      renderBody();
    } else if (act === 'fav') {
      toggleFav(t.getAttribute('data-id'));
      renderBody();
    } else if (act === 'favonly') {
      view.favOnly = !view.favOnly;
      t.setAttribute('aria-pressed', String(view.favOnly));
      renderBody();
    } else if (act.indexOf('exam-') === 0) {
      examAction(act, t);
    } else if (act === 'clear') {
      view.search = '';
      view.category = '';
      view.favOnly = false;
      buildSkeleton();
      renderBody();
    }
  });

  app.addEventListener('input', function (e) {
    if (e.target.id !== 'q') return;
    view.search = e.target.value;
    renderBody();
  });

  app.addEventListener('change', function (e) {
    if (e.target.id !== 'cat') return;
    view.category = e.target.value;
    renderBody();
  });

  // Keyboard: ← / → move between questions, S toggles the solution, Esc closes the drawer.
  document.addEventListener('keydown', function (e) {
    if (!view.scope) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target && e.target.closest && e.target.closest('input, select, textarea')) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      var link = document.querySelector(e.key === 'ArrowRight' ? 'a[rel="next"]' : 'a[rel="prev"]');
      if (link) {
        e.preventDefault();
        location.hash = link.getAttribute('href');
      }
    } else if (e.key === 's' || e.key === 'S') {
      var btn = document.querySelector('[data-act="reveal"]');
      if (btn) btn.click();
    } else if (e.key === 'Escape') {
      closeDrawer();
    }
  });

  window.addEventListener('hashchange', route);

  // ---------- Init ----------
  function init() {
    var savedTheme = null;
    try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
    applyTheme(savedTheme);

    if (!data.length) {
      app.innerHTML = '<p class="empty">No solutions data found. Run build_data.py to create data/solutions.js.</p>';
      return;
    }

    data.forEach(function (ch) {
      byChapter[ch.chapterId] = ch;
      ch.topics.forEach(function (t) {
        t.exercises.forEach(function (ex) {
          all.push({ ch: ch, topic: t, ex: ex });
        });
      });
    });

    route();
  }

  init();
})();
