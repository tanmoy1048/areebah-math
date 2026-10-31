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
        '<div class="tiles">' + tiles + savedTile + '</div>' +
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

  function solutionHtml(sol) {
    var steps = (sol.steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    return '<section class="solution" aria-label="Solution">' +
      (sol.formula ? '<div class="block key"><h3>Key idea</h3><p>' + esc(sol.formula) + '</p></div>' : '') +
      (steps ? '<div class="block"><h3>Working</h3><ol class="steps">' + steps + '</ol></div>' : '') +
      (sol.finalAnswer ? '<div class="block answer"><h3>Answer</h3><p>' + esc(sol.finalAnswer) + '</p></div>' : '') +
      figures(sol.solutionFigures) +
      (sol.tip ? '<div class="block tip"><h3>Tip</h3><p>' + esc(sol.tip) + '</p></div>' : '') +
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
        (view.reveal ? solutionHtml(ex.solution || {}) : '') +
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

  // ---------- Routing: #/ (home) and #/c/<scope>[/<exerciseId>] ----------
  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
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
