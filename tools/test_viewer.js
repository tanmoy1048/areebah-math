const fs = require('fs');
const { JSDOM } = require('jsdom');
const root = '/Users/rsadat/Desktop/Math/';
let html = fs.readFileSync(root + 'index.html', 'utf8').replace(/<script src="https?:[^"]*"><\/script>/g, '').replace(/<script src="(?!https?:)[^"]*"><\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.renderMathInElement = () => {};
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
w.eval(fs.readFileSync(root + 'data/solutions.js', 'utf8'));
w.eval(fs.readFileSync(root + 'app.js', 'utf8'));
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const go = (hash) => { w.location.hash = hash; w.dispatchEvent(new w.HashChangeEvent('hashchange')); };
const log = (...a) => console.log(...a);
let fails = 0;
const check = (name, cond) => { log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

// 1. Home
const chapterCount = JSON.parse(fs.readFileSync(root + 'data/solutions.json', 'utf8')).length;
check('home shows one tile per chapter (' + chapterCount + ')', $$('a.tile').filter(a => !a.classList.contains('tile-saved')).length === chapterCount);
check('home has saved tile', !!$('a.tile-saved'));
// 2. Chapter 6
go('#/c/ch06');
check('chapter view has nav list', !!$('#nav'));
const navCount = $$('#nav a.side-item').length;
check('ch06 nav lists all 260 questions (got ' + navCount + ')', navCount === 260);
check('first question shown', /Question 1(?!\d)/.test($('#content').textContent));
check('pos shows "1 of 260"', /1 of 260/.test($('#content').textContent));
// 3. Next / prev
const nextLink = $('a[rel="next"]');
check('next link exists', !!nextLink);
go(nextLink.getAttribute('href'));
check('after next, pos is "2 of 260"', /2 of 260/.test($('#content').textContent));
go($('a[rel="prev"]').getAttribute('href'));
check('prev returns to "1 of 260"', /1 of 260/.test($('#content').textContent));
check('no prev on first item', !$('a[rel="prev"]'));
// 4. Reveal solution
$('[data-act="reveal"]').click();
check('solution shown after reveal', !!$('.solution') && !!$('.block.answer'));
$('[data-act="reveal"]').click();
check('solution hidden again', !$('.solution'));
// 5. Search keeps focus node and narrows list
const search = $('#q');
search.value = 'triangle';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
const filtered = $$('#nav a.side-item').length;
check('search narrows list (' + filtered + ' hits)', filtered > 0 && filtered < 260);
check('search input node preserved', $('#q') === search);
// 6. Category filter
search.value = '';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
const cat = $('#cat');
cat.value = 'Master';
cat.dispatchEvent(new w.Event('change', { bubbles: true }));
const masterCount = $$('#nav a.side-item').length;
check('Master filter shows fewer items (' + masterCount + ')', masterCount > 0 && masterCount < 260);
cat.value = '';
cat.dispatchEvent(new w.Event('change', { bubbles: true }));
// 7. Save and saved list
$('[data-act="fav"]') && $('[data-act="fav"]').click();
check('favourite saved to localStorage', w.localStorage.getItem('maths-favourites') && JSON.parse(w.localStorage.getItem('maths-favourites')).length === 1);
go('#/c/saved');
check('saved list has 1 item', $$('#nav a.side-item').length === 1);
go('#/');
check('home saved tile reflects 1 saved', /1 saved/.test($('a.tile-saved').textContent));
// 8. Theme toggle persists as plain string
go('#/c/ch09');
check('ch09 nav has 507 items', $$('#nav a.side-item').length === 507);
$('[data-act="theme"]').click();
check('theme stored as plain string', ['light', 'dark'].includes(w.localStorage.getItem('maths-theme')));
// 9. Unknown route falls back to home
go('#/c/nonsense');
check('unknown chapter shows home', !!$('.home'));
log(fails ? fails + ' FAILED' : 'ALL PASSED');
