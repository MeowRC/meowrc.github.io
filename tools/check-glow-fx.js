#!/usr/bin/env node
/*
 * check-glow-fx.js — v8.5 conditional light-effects regression check
 *
 *   1. Static: every site page wires glow-fx.css / glow-fx.js in the right
 *      place; every top-level CSS rule is gated behind html[data-glow=...];
 *      reduced-motion / visibility-pause / print fallbacks exist.
 *   2. Behavioural: executes the real assets/glow-fx.js in a sandbox across
 *      11 device profiles and asserts the marker is set ONLY for capable,
 *      high-performance devices.
 *   3. Regression: re-runs the v8.4 Fix compatibility suite.
 *
 * Usage: node tools/check-glow-fx.js   (no third-party dependencies)
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var PAGES = [
  ['index.html', 'assets'],
  ['index-apple.html', 'assets'],
  ['index-ie.html', 'assets'],
  ['index-legacy.html', 'assets'],
  ['online/index.html', '../assets'],
  ['online/index-apple.html', '../assets'],
  ['online/index-ie.html', '../assets'],
  ['online/index-legacy.html', '../assets'],
  ['online/download/index.html', '../../assets'],
  ['online/music/index.html', '../../assets'],
  ['online/game/index.html', '../../assets']
];
/* Pages intentionally excluded: pure redirects + the 34 MB canvas game. */
var EXCLUDED = [
  'pdf/1/index.html',
  'ppt/1/index.html',
  'ppt/2/index.html',
  'online/game/hanshuqi/index.html',
  'online/game/hanshuqi/legacy.html'
];

var checks = 0;
var failures = [];
function ok(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* ------------------------------------------------------------------ static */
console.log('[1/3] Static checks');

PAGES.forEach(function (item) {
  var rel = item[0], up = item[1];
  var s = read(rel);
  var cssTag = '<link rel="stylesheet" href="' + up + '/glow-fx.css">';
  var jsTag = '<script src="' + up + '/glow-fx.js"></script>';
  ok(s.indexOf(cssTag) !== -1, rel + ': missing glow-fx.css link');
  ok(s.indexOf(jsTag) !== -1, rel + ': missing glow-fx.js script');
  ok(s.indexOf(cssTag) < s.indexOf('</head>'), rel + ': css link must be in <head>');
  ok(s.indexOf(jsTag) > s.lastIndexOf('<body'), rel + ': script must be in <body>');
  ok(s.lastIndexOf(jsTag) < s.indexOf('</body>'), rel + ': script must precede </body>');
});
console.log('  - ' + PAGES.length + ' site pages wired');

EXCLUDED.forEach(function (rel) {
  var s = read(rel);
  ok(s.indexOf('glow-fx') === -1, rel + ': redirect/game page must NOT load glow-fx');
});
console.log('  - ' + EXCLUDED.length + ' intentionally excluded pages confirmed');

var css = read('assets/glow-fx.css');
var clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
ok(clean.split('{').length === clean.split('}').length, 'glow-fx.css: unbalanced braces');

/* Collect top-level selectors and require an explicit gate on each. */
var selectors = [];
var buf = '';
var depth = 0;
for (var i = 0; i < clean.length; i++) {
  var ch = clean[i];
  if (ch === '{') {
    if (depth === 0) selectors.push(buf.trim());
    depth++;
    buf = '';
  } else if (ch === '}') {
    depth--;
    buf = '';
  } else {
    buf += ch;
  }
}
var ungated = [];
selectors.forEach(function (sel) {
  if (!sel) return;
  sel.split(',').forEach(function (one) {
    var t = one.trim();
    if (!t) return;
    if (t.charAt(0) === '@' || t.indexOf('html[data-glow') === 0) return;
    ungated.push(t);
  });
});
ok(ungated.length === 0,
   'glow-fx.css: ungated top-level rules would affect all devices -> ' +
   ungated.slice(0, 3).join(' | '));
ok(clean.indexOf('pointer-events: none') !== -1, 'glow-fx.css: decorative layers must be pointer-events:none');
ok(clean.indexOf('@media (prefers-reduced-motion: reduce)') !== -1, 'glow-fx.css: missing reduced-motion fallback');
ok(clean.indexOf('html[data-glow-paused]') !== -1, 'glow-fx.css: missing visibility pause');
ok(clean.indexOf('@media print') !== -1, 'glow-fx.css: missing print fallback');
/* Every visible top-level container of all 11 pages must be lifted above the
   z-index:0 aurora layer; otherwise the decoration would cover real content. */
['#blog', '.hero', '.page-hero', '.main', '.footer', '.wrap'].forEach(function (sel) {
  ok(clean.indexOf(sel) !== -1, 'glow-fx.css: content lift selector missing ' + sel);
});
console.log('  - ' + selectors.length + ' top-level CSS blocks, 0 ungated, 6 content lifts');

var js = read('assets/glow-fx.js');
var jsCode = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
ok(!/(=>|\bconst\b|\blet\b|\?\.|`)/.test(jsCode), 'glow-fx.js: must stay ES5');
[
  "data-compat", "prefers-reduced-motion", "prefers-reduced-data",
  "hardwareConcurrency", "deviceMemory", "devicePixelRatio",
  "saveData", "IntersectionObserver", "visibilitychange"
].forEach(function (token) {
  ok(js.indexOf(token) !== -1, 'glow-fx.js: missing gate ' + token);
});
console.log('  - glow-fx.js ES5 + 9 gate conditions checked');

/* ------------------------------------------------------------- behavioural */
console.log('[2/3] Device-profile simulation');

var glowCode = js;

function makeEnv(cfg) {
  var attrs = {};
  if (cfg.compat) attrs['data-compat'] = cfg.compat;
  var styleVars = {};
  var handlers = {};

  var root = {
    style: {
      setProperty: function (k, v) { styleVars[k] = v; }
    },
    getAttribute: function (k) {
      return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
    },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    removeAttribute: function (k) { delete attrs[k]; }
  };

  var body = { nodeType: 1, tagName: 'BODY' };
  var doc = {
    documentElement: root,
    body: body,
    hidden: false,
    addEventListener: function (type, fn) { handlers[type] = fn; }
  };

  var nav = {
    connection: cfg.connection || null,
    hardwareConcurrency: cfg.cores,
    deviceMemory: cfg.mem
  };

  var w = {
    document: doc,
    navigator: nav,
    devicePixelRatio: cfg.dpr === undefined ? 1 : cfg.dpr,
    innerWidth: cfg.width === undefined ? 1440 : cfg.width,
    innerHeight: 900,
    matchMedia: function (q) {
      var matches = false;
      if (q.indexOf('prefers-reduced-motion') !== -1) matches = !!cfg.reducedMotion;
      else if (q.indexOf('prefers-reduced-data') !== -1) matches = !!cfg.reducedData;
      else if (q.indexOf('pointer: fine') !== -1) matches = cfg.fine !== false;
      else if (q.indexOf('pointer: coarse') !== -1) matches = cfg.fine === false;
      else if (q.indexOf('min-width: 1024px') !== -1) matches = (cfg.width || 1440) >= 1024;
      return { matches: matches };
    },
    requestAnimationFrame: function (fn) { fn(); return 1; },
    localStorage: {
      getItem: function (k) { return k === 'glowFx' && cfg.optOut ? 'off' : null; }
    },
    addEventListener: function () {}
  };

  if (cfg.modern !== false) {
    w.CSS = { supports: function () { return true; } };
    w.IntersectionObserver = function () {};
    if (!w.matchMedia) w.matchMedia = function () { return { matches: false }; };
    w.requestAnimationFrame = function (fn) { fn(); return 1; };
  } else {
    /* IE9-class: no CSS.supports, no IntersectionObserver, no rAF. */
    w.requestAnimationFrame = undefined;
  }
  w.window = w;
  return { sandbox: w, attrs: attrs, styleVars: styleVars, handlers: handlers, doc: doc };
}

var PROFILES = [
  { label: 'modern desktop (8c/8GB/DPR1)',       cfg: {},                                   expect: true  },
  { label: 'desktop Safari (no cores/mem)',       cfg: { cores: 0, mem: 0 },               expect: true  },
  { label: 'high-DPR 4K (DPR 3)',                cfg: { dpr: 3 },                         expect: false },
  { label: 'dual-core device',                   cfg: { cores: 2 },                       expect: false },
  { label: '1 GB RAM device',                    cfg: { mem: 1 },                         expect: false },
  { label: 'prefers-reduced-motion',             cfg: { reducedMotion: true },            expect: false },
  { label: 'prefers-reduced-data',               cfg: { reducedData: true },              expect: false },
  { label: 'data saver enabled',                 cfg: { connection: { saveData: true } }, expect: false },
  { label: '3G connection',                      cfg: { connection: { effectiveType: '3g' } }, expect: false },
  { label: 'v8.4 Fix legacy device',             cfg: { compat: 'legacy' },               expect: false },
  { label: 'IE9-class engine',                   cfg: { modern: false },                  expect: false },
  { label: 'small touch phone',                  cfg: { fine: false, width: 390 },        expect: false },
  { label: 'manual opt-out (glowFx=off)',        cfg: { optOut: true },                   expect: false }
];

PROFILES.forEach(function (p) {
  var env = makeEnv(p.cfg);
  var ctx = vm.createContext(env.sandbox);
  vm.runInContext(glowCode, ctx, { filename: 'glow-fx.js' });
  var enabled = env.attrs['data-glow'] === 'on';
  ok(enabled === p.expect,
     p.label + ': expected ' + (p.expect ? 'ON' : 'OFF') + ', got ' + (enabled ? 'ON' : 'OFF'));
  console.log('  - ' + (enabled ? 'ON ' : 'OFF') + '  ' + p.label);
});

/* Interaction checks on a capable device. */
var env = makeEnv({});
var ctx = vm.createContext(env.sandbox);
vm.runInContext(glowCode, ctx, { filename: 'glow-fx.js' });
ok(typeof env.handlers.mousemove === 'function', 'pointer tracking listener not registered');
if (env.handlers.mousemove) {
  env.handlers.mousemove({ clientX: 720, clientY: 180, target: env.doc.body });
  ok(env.styleVars['--px'] === '50.00%', 'aurora --px not updated from pointer');
  ok(env.styleVars['--py'] === '20.00%', 'aurora --py not updated from pointer');
}
ok(typeof env.handlers.visibilitychange === 'function', 'visibilitychange listener not registered');
if (env.handlers.visibilitychange) {
  env.doc.hidden = true;
  env.handlers.visibilitychange();
  ok(env.attrs['data-glow-paused'] === '1', 'hidden tab must pause animations');
  env.doc.hidden = false;
  env.handlers.visibilitychange();
  ok(!env.attrs['data-glow-paused'], 'visible tab must resume animations');
}
console.log('  - pointer tracking + visibility pause verified');

/* -------------------------------------------------------------- regression */
console.log('[3/3] v8.4 Fix regression suite');
var out = cp.execFileSync(process.execPath,
  [path.join(ROOT, 'tools/check-online-compat.js')],
  { encoding: 'utf8' });
ok(out.indexOf('PASS') !== -1, 'v8.4 Fix compatibility suite regressed');
console.log('  - ' + out.trim().split('\n').slice(-1)[0]);

/* ------------------------------------------------------------------ report */
console.log('');
console.log('checks: ' + checks + ', failures: ' + failures.length);
if (failures.length) {
  failures.forEach(function (f) { console.error('  FAIL ' + f); });
  process.exit(1);
}
console.log('PASS — v8.5 glow layer is gated correctly.');
