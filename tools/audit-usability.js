#!/usr/bin/env node
/*
 * audit-usability.js — whole-site usability audit
 *
 * Checks every site page for: broken local links, missing anchors, missing
 * assets, navigation structure, interaction bindings, accessibility basics,
 * duplicate ids, and regressions that hide visible content.
 *
 * Usage: node tools/audit-usability.js
 * Exit code 0 = no errors. Warnings are reported but do not fail the build.
 * No third-party dependencies.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var PAGES = [
  'index.html', 'index-apple.html', 'index-ie.html', 'index-legacy.html',
  'online/index.html', 'online/index-apple.html', 'online/index-ie.html',
  'online/index-legacy.html', 'online/download/index.html',
  'online/music/index.html', 'online/game/index.html'
];
var REDIRECT_PAGES = [
  'pdf/1/index.html', 'ppt/1/index.html', 'ppt/2/index.html'
];

var errors = [];
var warnings = [];
var checks = 0;

function ok(cond, file, msg, severity) {
  checks++;
  if (cond) return;
  (severity === 'warn' ? warnings : errors).push(file + ': ' + msg);
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function norm(p) { return p.replace(/\\/g, '/').replace(/^\/+/, ''); }

/* ------------------------------------------------------------- per page */
console.log('[1/5] Per-page usability audit');

PAGES.forEach(function (rel) {
  var s = read(rel);
  var dir = path.posix.dirname(rel);

  /* 1. Local link targets */
  var hrefs = [];
  var reLink = /\bhref="([^"]*)"/g, m;
  while ((m = reLink.exec(s))) hrefs.push(m[1]);
  hrefs.forEach(function (href) {
    if (!href || href.charAt(0) === '#' ||
        /^(https?:|mailto:|tel:|javascript:|data:)/i.test(href)) return;
    var clean = href.split('#')[0].split('?')[0];
    if (!clean) return;
    /* Local files may be referenced with percent-encoded names (e.g. the
       Chinese-named game manual); decode before resolving on disk. */
    try { clean = decodeURIComponent(clean); } catch (e) {}
    var target;
    if (clean.charAt(0) === '/') target = norm(clean);
    else target = norm(path.posix.join(dir, clean));
    var okTarget = exists(target) ||
                   exists(path.posix.join(target, 'index.html')) ||
                   (fs.existsSync(path.join(ROOT, target)) &&
                    fs.statSync(path.join(ROOT, target)).isDirectory());
    ok(okTarget, rel, 'broken local link -> ' + href + ' (resolved ' + target + ')');
  });

  /* 2. Local anchors */
  hrefs.filter(function (h) { return h.charAt(0) === '#'; }).forEach(function (h) {
    var id = h.slice(1);
    if (!id) return;
    ok(new RegExp('id=["\']' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']').test(s),
       rel, 'missing anchor target ' + h);
  });
  /* Cross-page anchors (../index.html#projects etc.) */
  hrefs.filter(function (h) { return h.indexOf('#') > 0 && !/^https?:/.test(h); })
    .forEach(function (h) {
      var parts = h.split('#');
      var target = parts[0].charAt(0) === '/' ? norm(parts[0]) : norm(path.posix.join(dir, parts[0]));
      if (!exists(target)) return; // link check above reports it
      var t = read(target);
      ok(new RegExp('id=["\']' + parts[1] + '["\']').test(t),
         rel, 'cross-page anchor missing -> ' + h);
    });

  /* 3. Local assets */
  var assets = [];
  var reAsset = /<(?:script|link)\b[^>]*\b(?:src|href)="([^"]*)"/g;
  while ((m = reAsset.exec(s))) assets.push(m[1]);
  assets.forEach(function (a) {
    if (/^(https?:|\/\/|data:)/i.test(a)) return;
    var target = a.charAt(0) === '/' ? norm(a) : norm(path.posix.join(dir, a));
    ok(exists(target), rel, 'missing asset -> ' + a);
  });

  /* 4. Document basics */
  ok(/<html\b[^>]*\blang=/.test(s), rel, 'missing <html lang>');
  ok(/<meta\s+charset=/i.test(s), rel, 'missing charset');
  ok(/<meta\s+name="viewport"/i.test(s), rel, 'missing viewport meta');
  ok(/<title>[^<]+<\/title>/.test(s), rel, 'missing/empty <title>');
  ok(/<h1\b|<h2\b/.test(s), rel, 'no heading element');

  /* 5. Navigation structure */
  var brand = /<a\b[^>]*class="nav-brand"[^>]*>([\s\S]*?)<\/a>/.exec(s);
  ok(!!brand, rel, 'missing global nav brand (.nav-brand)', 'warn');
  if (brand) {
    ok(/MeowRc/.test(brand[1]), rel, 'nav brand does not contain "MeowRc"');
    ok(/Blog/.test(brand[1]), rel, 'nav brand does not contain "Blog"');
    ok(/href="[^"]+"/.test(brand[0]), rel, 'nav brand is not a link');
  }
  /* The game board page has its own compact top navigation. */
  ok(/class="nav-links"|class="game-topnav-links"/.test(s), rel,
     'missing nav menu list', 'warn');

  /* 6. Interaction bindings */
  var ids = {};
  var reId = /\bid="([^"]+)"/g;
  while ((m = reId.exec(s))) {
    ids[m[1]] = (ids[m[1]] || 0) + 1;
  }
  Object.keys(ids).forEach(function (id) {
    ok(ids[id] === 1, rel, 'duplicate id="' + id + '"');
  });
  if (rel === 'online/game/index.html') {
    /* Independent game page: its own theme controls + compact navigation. */
    ok(/data-mode=/.test(s), rel, 'missing theme controls (data-mode)', 'warn');
    ok(/class="nav-brand"/.test(s), rel, 'missing brand link', 'warn');
  } else {
    ['themeToggle', 'mobileMenuBtn', 'navLinks', 'toTop'].forEach(function (id) {
      if (!ids[id]) ok(false, rel, 'missing interaction element #' + id, 'warn');
    });
  }

  /* 7. Accessibility basics */
  var imgs = s.match(/<img\b[^>]*>/g) || [];
  imgs.forEach(function (tag) {
    ok(/\balt=/.test(tag), rel, 'image without alt -> ' + tag.slice(0, 60));
  });
  var extLinks = s.match(/<a\b[^>]*href="https?:\/\/[^"]*"[^>]*>/g) || [];
  extLinks.forEach(function (tag) {
    if (/target="_blank"/.test(tag)) {
      ok(/rel="[^"]*noopener/.test(tag), rel, 'target=_blank without rel=noopener', 'warn');
    }
  });
  var buttons = s.match(/<button\b[^>]*>/g) || [];
  buttons.forEach(function (tag) {
    ok(/\btype=/.test(tag), rel, 'button without explicit type', 'warn');
  });

  /* 8. Visible-content regressions */
  ok(s.indexOf('data-reveal') === -1 || /online-compat\.js/.test(s),
     rel, 'has [data-reveal] but no legacy fallback script');
  ok(/glow-fx\.css/.test(s), rel, 'missing glow-fx.css');
  ok(/glow-fx\.js/.test(s), rel, 'missing glow-fx.js');
  ok(s.indexOf('>??<') === -1, rel, 'placeholder "??" text left in visible content');
});
console.log('  - ' + PAGES.length + ' site pages audited');

/* --------------------------------------------------------- redirect pages */
console.log('[2/5] Redirect pages');
REDIRECT_PAGES.forEach(function (rel) {
  var s = read(rel);
  ok(/location\.replace|http-equiv="refresh"/.test(s), rel, 'no redirect mechanism');
  ok(s.indexOf('glow-fx') === -1, rel, 'redirect page should not load glow-fx');
});
console.log('  - ' + REDIRECT_PAGES.length + ' redirect pages audited');

/* --------------------------------------------------------------- global */
console.log('[3/5] Cross-cutting checks');

['index.html', 'index-apple.html', 'index-ie.html', 'index-legacy.html',
 'online/index.html', 'online/index-apple.html', 'online/index-ie.html',
 'online/index-legacy.html'].forEach(function (rel) {
  var s = read(rel);
  var targets = (s.match(/target\s*=\s*'([^']+\.html)'/g) || [])
    .map(function (x) { return x.match(/'([^']+)'/)[1]; });
  var uniq = {};
  targets.forEach(function (t) { uniq[t] = 1; });
  Object.keys(uniq).forEach(function (t) {
    var base = path.posix.join(path.posix.dirname(rel), t);
    ok(exists(norm(base)), rel, 'UA redirect target missing -> ' + t);
  });
});

/* hero title must stay visible without JS/animation */
['index.css', 'index-apple.css', 'index-ie.css', 'index-legacy.css'].forEach(function (f) {
  var s = read('assets/' + f);
  ok(/\.hero-title\{opacity:1\}/.test(s), 'assets/' + f,
     'missing static visibility fallback for .hero-title');
  ok(!/@keyframes shine\{to\{background-position:(?:2\d\d|[3-9]\d\d)%/.test(s),
     'assets/' + f, 'shine keyframe exceeds 100% (gradient may leave transparent text)');
});
var glow = read('assets/glow-fx.css');
ok(!/html\[data-glow="on"\] \.hero-title\s*\{\s*animation/.test(glow),
   'assets/glow-fx.css', 'glow layer must not override the .hero-title entrance animation');
ok(glow.split('{').length === glow.split('}').length, 'assets/glow-fx.css', 'unbalanced braces');
['index.css', 'index-apple.css', 'index-ie.css', 'index-legacy.css',
 'online-base.css', 'aesthetic.css', 'polish.css', 'compat-android7.css'].forEach(function (f) {
  var p = path.join(ROOT, 'assets', f);
  if (!fs.existsSync(p)) { ok(false, 'assets/' + f, 'stylesheet missing'); return; }
  var s = fs.readFileSync(p, 'utf8');
  ok(s.split('{').length === s.split('}').length, 'assets/' + f, 'unbalanced braces');
});
console.log('  - cross-cutting checks done');

/* --------------------------------------------- Android 7 compatibility */
console.log('[4/5] Android 7 / Chrome 51+ compatibility');
var a7 = read('assets/compat-android7.css');
[
  ['@supports not (font-size: clamp', 'clamp() fallback'],
  ['@supports not ((backdrop-filter', 'backdrop-filter fallback'],
  ['@supports not (display: grid)', 'CSS Grid fallback'],
  ['@supports not (inset: 0)', 'inset shorthand fallback'],
  ['gap', 'flex/grid gap fallback']
].forEach(function (item) {
  ok(a7.indexOf(item[0]) !== -1, 'assets/compat-android7.css',
     'missing ' + item[1]);
});
PAGES.forEach(function (rel) {
  ok(/compat-android7\.css/.test(read(rel)), rel, 'missing Android 7 compatibility stylesheet');
});

/* Evaluate the real isModern() under an Android 7 / Chrome 51 capability set. */
var pageSrc = read('index.html');
var fnMatch = /function isModern\(\)\s*\{[\s\S]*?\n  \}/.exec(pageSrc);
ok(!!fnMatch, 'index.html', 'cannot extract isModern() for simulation');
if (fnMatch) {
  function evalModern(cfg) {
    var css = cfg.css ? {
      supports: function (prop, value) {
        if (prop === 'display' && value === 'flex') return true;
        if (prop === '--probe') return true;
        if (prop === 'transform') return true;
        return false; /* no individual translate, no inset, no grid */
      }
    } : undefined;
    var sandbox = {
      window: { CSS: css, matchMedia: function () { return { matches: false }; } }
    };
    sandbox.CSS = css;
    sandbox.result = null;
    vm.runInNewContext(fnMatch[0] + '\nresult = isModern();', sandbox,
                       { filename: 'isModern.js' });
    return sandbox.result;
  }
  ok(evalModern({ css: true }) === true, 'index.html',
     'Android 7 / Chrome 51 capability set must be routed to the modern skin');
  ok(evalModern({ css: false }) === false, 'index.html',
     'engines without CSS.supports must stay on the legacy skin');
  ok(pageSrc.indexOf("CSS.supports('translate', '0 64px')") === -1,
     'index.html', 'isModern() still requires Chrome 104+ translate property');
}
console.log('  - CSS fallbacks + capability simulation done');

/* --------------------------------------------- contact + hover stability */
console.log('[5/5] Contact section and hover stability');
var HOME_VARIANTS = ['index.html', 'index-apple.html', 'index-ie.html', 'index-legacy.html'];
HOME_VARIANTS.forEach(function (rel) {
  var s = read(rel);
  ok((s.match(/class="contact-row"/g) || []).length === 1,
     rel + ': expected exactly 1 contact row after removing QQ/所在地');
  ok(s.indexOf('contact-label">QQ<') === -1, rel + ': QQ row still present');
  ok(s.indexOf('contact-label">所在地<') === -1, rel + ': 所在地 row still present');
  ok((s.match(/class="social-link"/g) || []).length === 3,
     rel + ': expected 3 social links (GitHub/Bilibili/AcFun)');
});
['index.css', 'index-apple.css', 'index-ie.css', 'index-legacy.css'].forEach(function (f) {
  var s = read('assets/' + f);
  ok(/\.contact-row\+\.contact-row/.test(s),
     'assets/' + f + ': missing adjacent-row separator (prevents a double line)');
  ok(s.indexOf('.contact-row:last-of-type') === -1,
     'assets/' + f + ': stale :last-of-type rule (never matched, socials is last div)');
  ok(s.indexOf('.social-link:active{transform:none}') !== -1,
     'assets/' + f + ': missing :active transform override for polish.css');
  var hovers = s.match(/\.social-link:hover\{[^}]*\}/g) || [];
  ok(hovers.length > 0, 'assets/' + f + ': no .social-link:hover rule found');
  hovers.forEach(function (rule) {
    ok(!/transform\s*:/.test(rule) && !/top\s*:\s*-/.test(rule),
       'assets/' + f + ': hover rule still shifts geometry -> ' + rule.slice(0, 70));
  });
  var bases = s.match(/\.social-link\{[^}]*\}/g) || [];
  ok(bases.length > 0, 'assets/' + f + ': no .social-link base rule found');
  bases.forEach(function (rule) {
    ok(!/\btransition:[^}]*\b(top|transform)\b/.test(rule),
       'assets/' + f + ': .social-link transition still animates geometry -> ' +
       rule.slice(0, 70));
  });
});
var aestheticSrc = read('assets/aesthetic.js');
ok(aestheticSrc.indexOf('$$(".social-link, .dl-btn").forEach') === -1,
   'assets/aesthetic.js: magnet spring still bound to .social-link');
ok(aestheticSrc.indexOf('$$(".dl-btn").forEach(function(e){e.setAttribute("data-fx-magnet"') !== -1,
   'assets/aesthetic.js: magnet should remain active for .dl-btn');
console.log('  - 4 variants, 4 stylesheets, 1 enhancement script verified');

/* ---------------------------------------------------------------- report */
console.log('');
console.log('checks: ' + checks + ', errors: ' + errors.length + ', warnings: ' + warnings.length);
if (warnings.length) {
  console.log('--- warnings ---');
  warnings.forEach(function (w) { console.log('  WARN ' + w); });
}
if (errors.length) {
  console.log('--- errors ---');
  errors.forEach(function (e) { console.log('  FAIL ' + e); });
  process.exit(1);
}
console.log('PASS — no blocking usability errors.');
