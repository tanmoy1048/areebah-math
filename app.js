(function () {
  'use strict';

  var FAV_KEY = 'maths-favourites';
  var THEME_KEY = 'maths-theme';

  var el = {
    search: document.getElementById('search'),
    chapter: document.getElementById('chapter'),
    category: document.getElementById('category'),
    favOnly: document.getElementById('favOnly'),
    theme: document.getElementById('theme'),
    status: document.getElementById('status'),
    toc: document.getElementById('toc'),
    list: document.getElementById('list'),
    pagerTop: document.getElementById('pagerTop'),
    pagerBottom: document.getElementById('pagerBottom'),
    pageSize: document.getElementById('pageSize')
  };

  // localStorage is only a per-viewer convenience: every read and write is guarded.
  function loadFavs() {
    try {
      return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function saveFavs(list) {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(list));
    } catch (e) { /* storage blocked: favourites just won't persist */ }
  }

  var favs = loadFavs();
  var data = [];
  var flat = [];

  function isFav(id) { return favs.indexOf(id) !== -1; }

  function toggleFav(id) {
    favs = isFav(id) ? favs.filter(function (x) { return x !== id; }) : favs.concat(id);
    saveFavs(favs);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Keep the surrounding text (and any LaTeX) intact; auto-render handles $...$ and $$...$$.
  function textBlock(s) { return '<div>' + esc(s).replace(/\n/g, '<br>') + '</div>'; }

  function figures(list) {
    return (list || []).map(function (src) {
      return '<img loading="lazy" alt="Figure" src="' + esc(src) + '">';
    }).join('');
  }

  function flatten() {
    flat = [];
    data.forEach(function (ch) {
      ch.topics.forEach(function (t) {
        t.exercises.forEach(function (ex) {
          flat.push({ ch: ch, topic: t, ex: ex });
        });
      });
    });
  }

  function populateChapters() {
    var opts = ['<option value="">All chapters</option>'];
    data.forEach(function (ch) {
      opts.push('<option value="' + esc(ch.chapterId) + '">Ch ' + esc(ch.chapterId.replace('ch0', '').replace('ch', '')) +
        ' · ' + esc(ch.chapterTitle) + '</option>');
    });
    el.chapter.innerHTML = opts.join('');
  }

  function matches(item) {
    var ch = el.chapter.value;
    var cat = el.category.value;
    var q = el.search.value.trim().toLowerCase();
    if (ch && item.ch.chapterId !== ch) return false;
    if (cat === 'none' && item.ex.category) return false;
    if (cat && cat !== 'none' && item.ex.category !== cat) return false;
    if (el.favOnly.getAttribute('aria-pressed') === 'true' && !isFav(item.ex.id)) return false;
    if (q) {
      var hay = (item.ex.number + ' ' + item.ex.questionText + ' ' + item.topic.topicTitle + ' ' +
        item.ch.chapterTitle + ' ' + item.ex.solution.finalAnswer).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function cardHtml(item) {
    var ex = item.ex;
    var sol = ex.solution || {};
    var cat = ex.category;
    var fav = isFav(ex.id);
    return '' +
      '<article class="card" id="' + esc(ex.id) + '">' +
        '<div class="card-head">' +
          '<span class="qnum">' + esc(item.ch.chapterId.replace('ch0', 'Ch ').replace('ch', 'Ch ')) + ' · ' + esc(item.topic.topicId) + ' · Q' + esc(ex.number) + '</span>' +
          (cat ? '<span class="badge ' + esc(cat) + '">' + esc(cat) + '</span>' : '') +
          '<button type="button" class="fav' + (fav ? ' on' : '') + '" data-id="' + esc(ex.id) +
            '" aria-pressed="' + fav + '" aria-label="Favourite">' + (fav ? '★' : '☆') + '</button>' +
        '</div>' +
        '<div class="question">' + textBlock(ex.questionText) + figures(ex.questionFigures) + '</div>' +
        '<details><summary>Show solution</summary>' +
          '<div class="solution">' +
            (sol.formula ? '<div class="formula"><strong>Key idea:</strong> ' + esc(sol.formula) + '</div>' : '') +
            (sol.steps && sol.steps.length ? '<ol>' + sol.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' : '') +
            (sol.finalAnswer ? '<div class="final"><strong>Answer:</strong> ' + esc(sol.finalAnswer) + '</div>' : '') +
            figures(sol.solutionFigures) +
            (sol.tip ? '<div class="tip"><strong>Tip:</strong> ' + esc(sol.tip) + '</div>' : '') +
          '</div>' +
        '</details>' +
      '</article>';
  }

  var page = 1;
  var pageSize = 25;

  function pagerHtml(totalPages) {
    if (totalPages <= 1) return '';
    // Show first, last and the pages around the current one; '…' marks skipped runs.
    var nums = [];
    for (var p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) nums.push(p);
      else if (nums[nums.length - 1] !== '…') nums.push('…');
    }
    return '<button type="button" data-page="' + (page - 1) + '"' + (page === 1 ? ' disabled' : '') + '>‹ Prev</button>' +
      nums.map(function (p) {
        if (p === '…') return '<span class="gap">…</span>';
        return '<button type="button" data-page="' + p + '"' +
          (p === page ? ' class="active" aria-current="page"' : '') + '>' + p + '</button>';
      }).join('') +
      '<button type="button" data-page="' + (page + 1) + '"' + (page === totalPages ? ' disabled' : '') + '>Next ›</button>';
  }

  function render() {
    var items = flat.filter(matches);
    var totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * pageSize;
    var shown = items.slice(start, start + pageSize);
    el.status.textContent = items.length
      ? 'Showing ' + (start + 1) + '–' + (start + shown.length) + ' of ' + items.length + ' questions (page ' + page + ' of ' + totalPages + ')'
      : 'No questions match these filters.';
    el.pagerTop.innerHTML = pagerHtml(totalPages);
    el.pagerBottom.innerHTML = pagerHtml(totalPages);

    // Group by topic, preserving order
    var groups = [];
    var seen = {};
    shown.forEach(function (item) {
      var key = item.ch.chapterId + '|' + item.topic.topicId;
      if (!seen[key]) {
        seen[key] = { key: key, label: 'Ch ' + item.ch.chapterId.replace('ch0', '').replace('ch', '') + ' · ' + item.topic.topicId + ' ' + item.topic.topicTitle, items: [] };
        groups.push(seen[key]);
      }
      seen[key].items.push(item);
    });

    el.toc.innerHTML = groups.map(function (g) {
      return '<a href="#g-' + esc(g.key.replace(/[^A-Za-z0-9]/g, '_')) + '">' + esc(g.label) + '</a>';
    }).join('');

    el.list.innerHTML = groups.length ? groups.map(function (g) {
      return '<h2 class="topic-heading" id="g-' + esc(g.key.replace(/[^A-Za-z0-9]/g, '_')) + '">' + esc(g.label) + '</h2>' +
        g.items.map(cardHtml).join('');
    }).join('') : '<p class="empty">No questions match these filters.</p>';

    if (window.renderMathInElement) {
      renderMathInElement(el.list, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    }
  }

  function applyTheme(mode) {
    if (mode) document.documentElement.setAttribute('data-theme', mode);
    else document.documentElement.removeAttribute('data-theme');
  }

  function init() {
    var theme = null;
    try { theme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
    applyTheme(theme);

    el.theme.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      var dark = current ? current === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = dark ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    });

    el.favOnly.addEventListener('click', function () {
      el.favOnly.setAttribute('aria-pressed', el.favOnly.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      page = 1;
      render();
    });

    function onPagerClick(e) {
      var btn = e.target.closest('button[data-page]');
      if (!btn || btn.disabled) return;
      page = parseInt(btn.getAttribute('data-page'), 10);
      render();
      el.list.scrollIntoView({ block: 'start' });
    }
    el.pagerTop.addEventListener('click', onPagerClick);
    el.pagerBottom.addEventListener('click', onPagerClick);

    el.pageSize.addEventListener('change', function () {
      pageSize = parseInt(el.pageSize.value, 10) || 25;
      page = 1;
      render();
    });

    el.list.addEventListener('click', function (e) {
      var btn = e.target.closest('.fav');
      if (!btn) return;
      toggleFav(btn.getAttribute('data-id'));
      render();
    });

    // Any filter change starts again from page 1.
    [el.search, el.chapter, el.category].forEach(function (node) {
      node.addEventListener('input', function () { page = 1; render(); });
      node.addEventListener('change', function () { page = 1; render(); });
    });

    data = (window.SOLUTIONS && window.SOLUTIONS.length) ? window.SOLUTIONS : [];
    if (data.length) {
      flatten();
      populateChapters();
      render();
    } else {
      el.status.textContent = 'No solutions data found. Run the build step to create data/solutions.js.';
    }
  }

  init();
})();
