#!/usr/bin/env node
/*
 * check-online-compat.js — v8.4 Fix regression check
 *
 * Verifies two things:
 *   1. Static: every /online/ page carries the capability probe, the legacy
 *      guard and the compat script; the CSS fallback exists; sub-project
 *      entry targets exist on disk.
 *   2. Behavioural: runs the actual probe + assets/online-compat.js inside a
 *      sandboxed "modern engine" and a sandboxed "IE9-class engine".
 *      Modern  -> data-compat is NOT set, enhancement layer stays active.
 *      IE9     -> data-compat="legacy" is set and all [data-reveal]
 *                 entry cards are forced visible.
 *
 * Usage: node tools/check-online-compat.js
 * No third-party dependencies.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var PAGES = [
  'online/index.html',
  'online/index-apple.html',
  'online/index-ie.html',
  'online/index-legacy.html',
  'online/download/index.html',
  'online/music/index.html',
  'online/game/index.html'
];

var checks = 0;
var failures = [];

function ok(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/* ---------------------------------------------------------------- static */
console.log('[1/2] Static checks');

var GUARD_RE = /if \(document\.documentElement\.getAttribute\('data-compat'\) === 'legacy'\) return;/;

PAGES.forEach(function (rel) {
  var s = read(rel);
  ok(s.indexOf('data-compat') !== -1, rel + ': missing capability probe');
  ok(/src="[^"]*online-compat\.js"/.test(s), rel + ': missing compat script tag');
  ok(GUARD_RE.test(s), rel + ': missing legacy guard in enhancement script');
  ok(s.indexOf('data-compat') > s.indexOf('charset'),
     rel + ': capability probe must sit after <meta charset>');
  ok(s.indexOf('online-compat.js"></script>') < s.indexOf('</body>') ||
     /src="[^"]*online-compat\.js"><\/script>\s*<\/body>/.test(s),
     rel + ': compat script must be inside <body>');
  console.log('  - ' + rel + ' checked');
});

var css = read('assets/online-base.css');
ok(/html\[data-compat="legacy"\] \[data-reveal\][^{]*\{[^}]*opacity:1!important/.test(css),
   'online-base.css: missing legacy visibility override');
console.log('  - assets/online-base.css fallback rule checked');

var aesthetic = read('assets/aesthetic.js');
ok(/data-compat"\)\s*===\s*"legacy"/.test(aesthetic),
   'aesthetic.js: missing old-engine guard');
console.log('  - assets/aesthetic.js guard checked');

var compat = read('assets/online-compat.js');
/* Comments deliberately name the forbidden APIs, so strip them first. */
var compatCodeOnly = compat
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
ok(!/(=>|\bconst\b|\blet\b|\?\.|`|\bclass\s+\w)/.test(compatCodeOnly),
   'online-compat.js: must stay ES3 (no ES2015+ syntax)');
ok(!/\.classList|\.forEach\(|\.querySelector/.test(compatCodeOnly),
   'online-compat.js: must not depend on classList/forEach/querySelector');
console.log('  - assets/online-compat.js ES3 constraint checked');

['download', 'music', 'game'].forEach(function (dir) {
  ok(fs.existsSync(path.join(ROOT, 'online', dir, 'index.html')),
     'missing sub-project entry: online/' + dir + '/index.html');
});
ok(fs.existsSync(path.join(ROOT, 'online', 'index-ie.html')),
   'missing online/index-ie.html referenced by index-ie.html');
console.log('  - sub-project entry targets checked');

/* ------------------------------------------------------------ behavioural */
console.log('[2/2] Behavioural simulation (modern vs IE9-class engine)');

/* Extract the probe script from a page (first inline <script> after charset). */
var probeHtml = read('online/index.html');
var probeMatch = probeHtml.match(/<script>([\s\S]*?)<\/script>/);
if (!probeMatch) throw new Error('cannot extract capability probe');
var probeCode = probeMatch[1];
var compatCode = compat;

function makeElement(tag, attrs, className, legacy) {
  var el = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: className || '',
    _attrs: attrs || {},
    style: {},
    parentNode: null,
    getAttribute: function (k) {
      return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
    },
    setAttribute: function (k, v) { this._attrs[k] = String(v); }
  };
  if (legacy) el.attachEvent = function () {};
  else el.addEventListener = function () {};
  return el;
}

function buildSandbox(legacy) {
  var rootAttrs = {};
  var root = {
    className: 'fx-on',
    getAttribute: function (k) {
      return Object.prototype.hasOwnProperty.call(rootAttrs, k) ? rootAttrs[k] : null;
    },
    setAttribute: function (k, v) { rootAttrs[k] = String(v); }
  };
  if (!legacy) root.classList = { add: function () {}, remove: function () {} };

  /* Three hub cards = the three sub-project entries. */
  var cards = [
    makeElement('a', { 'data-reveal': '' }, 'hub-card', legacy),
    makeElement('a', { 'data-reveal': '' }, 'hub-card', legacy),
    makeElement('a', { 'data-reveal': '' }, 'hub-card', legacy)
  ];
  var toggle = makeElement('button', {}, 'icon-btn', legacy);
  var menuBtn = makeElement('button', {}, 'icon-btn', legacy);
  var navList = makeElement('ul', {}, 'nav-links', legacy);
  var toTop = makeElement('button', {}, 'to-top', legacy);
  var sectionHead = makeElement('header', {}, 'section-head', legacy);
  var all = cards.concat([toggle, menuBtn, navList, toTop, sectionHead]);

  var body = {
    getElementsByTagName: function (t) {
      if (t === '*') return all;
      return all.filter(function (e) { return e.tagName === t.toUpperCase(); });
    }
  };

  var doc = {
    documentElement: root,
    body: body,
    readyState: 'complete',
    getElementsByTagName: body.getElementsByTagName,
    getElementById: function (id) {
      if (id === 'themeToggle') return toggle;
      if (id === 'mobileMenuBtn') return menuBtn;
      if (id === 'navLinks') return navList;
      if (id === 'toTop') return toTop;
      return null;
    }
  };
  if (!legacy) doc.querySelector = function () { return null; };

  var sandbox = {
    document: doc,
    navigator: { userAgent: 'test' },
    setTimeout: function () {},
    setInterval: function () {},
    scrollTo: function () {},
    Date: Date,
    Math: Math,
    String: String,
    Object: Object,
    RegExp: RegExp
  };
  if (!legacy) {
    sandbox.addEventListener = function () {};
    sandbox.CSS = { supports: function () { return true; } };
    sandbox.IntersectionObserver = function () {};
    sandbox.localStorage = { setItem: function () {}, getItem: function () { return null; } };
  }
  sandbox.window = sandbox;
  sandbox.document.body = body;
  return { sandbox: sandbox, root: root, rootAttrs: rootAttrs, cards: cards };
}

function run(legacy, label) {
  var env = buildSandbox(legacy);
  var ctx = vm.createContext(env.sandbox);
  if (legacy) {
    /* IE9 and older: no Array#forEach, no addEventListener, no CSS.supports,
       no IntersectionObserver, no classList on documentElement. */
    vm.runInContext('delete Array.prototype.forEach;', ctx);
  }
  vm.runInContext(probeCode, ctx, { filename: 'capability-probe.js' });
  var marked = env.rootAttrs['data-compat'] === 'legacy';

  if (!legacy) {
    ok(!marked, label + ': modern engine must NOT be marked legacy');
    console.log('  - modern engine: data-compat absent (enhancements active)');
    return;
  }

  ok(marked, label + ': old engine must be marked legacy');
  vm.runInContext(compatCode, ctx, { filename: 'online-compat.js' });
  var visible = env.cards.every(function (c) {
    return (' ' + c.className + ' ').indexOf(' is-in ') > -1 && c.style.opacity === '1';
  });
  ok(visible, label + ': all three sub-project entry cards must be visible');
  console.log('  - IE9-class engine: data-compat="legacy", 3/3 entry cards forced visible');
}

run(false, 'modern');
run(true, 'IE9');

/* ------------------------------------------------------------------ report */
console.log('');
console.log('checks: ' + checks + ', failures: ' + failures.length);
if (failures.length) {
  failures.forEach(function (f) { console.error('  FAIL ' + f); });
  process.exit(1);
}
console.log('PASS — v8.4 Fix compatibility layer is intact.');
