#!/usr/bin/env node
/*
 * check-legacy-browser.js — legacy engine compatibility regression (v10)
 *
 * Targets: EdgeHTML 18 ("Edge 2019"), Chrome 57~83, Android 7 WebView.
 * Those engines support CSS Grid but NOT flex `gap`, `inset`, `clamp()` or
 * `min()`. The previous compatibility layer bundled several fixes inside
 * `@supports not (display:grid)`, so they never applied. This suite verifies
 * each fallback is gated on its own capability and covers every affected
 * selector, plus the runtime flex-gap probe and all existing suites.
 *
 * Usage: node tools/check-legacy-browser.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var PAGES = [
  ['index.html', 'assets'], ['index-apple.html', 'assets'],
  ['index-ie.html', 'assets'], ['index-legacy.html', 'assets'],
  ['online/index.html', '../assets'], ['online/index-apple.html', '../assets'],
  ['online/index-ie.html', '../assets'], ['online/index-legacy.html', '../assets'],
  ['online/download/index.html', '../../assets'],
  ['online/music/index.html', '../../assets'],
  ['online/game/index.html', '../../assets']
];

var checks = 0;
var failures = [];
function ok(cond, msg) { checks++; if (!cond) failures.push(msg); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* --------------------------------------------------------- static wiring */
console.log('[1/4] Static wiring');

PAGES.forEach(function (item) {
  var rel = item[0], up = item[1];
  var s = read(rel);
  var tag = '<script src="' + up + '/compat-detect.js"></script>';
  var mobile = '<script src="' + up + '/mobile-perf.js"></script>';
  var head = s.slice(0, s.indexOf('</head>'));
  ok(s.indexOf(tag) !== -1, rel + ': missing compat-detect.js');
  ok(head.indexOf(tag) > -1, rel + ': compat-detect.js must be in <head>');
  ok(head.indexOf(tag) < head.indexOf(mobile),
     rel + ': compat-detect.js must precede mobile-perf.js');
  ok(s.indexOf(up + '/compat-android7.css') !== -1,
     rel + ': missing compat-android7.css');
});
console.log('  - ' + PAGES.length + ' pages wired');

var probe = read('assets/compat-detect.js');
var probeCode = probe.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
ok(!/(=>|\bconst\b|\blet\b|\?\.|`)/.test(probeCode), 'compat-detect.js must stay ES3-compatible');
ok(probe.indexOf('getBoundingClientRect') !== -1,
   'compat-detect.js must measure flex gap, not rely on @supports');
ok(probe.indexOf('data-no-flex-gap') !== -1, 'compat-detect.js missing marker');

var css = read('assets/compat-android7.css');
var clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
ok(clean.split('{').length === clean.split('}').length, 'compat CSS: unbalanced braces');
ok(clean.indexOf('@supports not (font-size: clamp(1rem, 2vw, 3rem))') !== -1,
   'clamp fallback missing');
ok(clean.indexOf('@supports not (width: min(1px, 2px))') !== -1,
   'min() fallback missing');
ok(clean.indexOf('.loader-logo') !== -1, 'clamp fallback misses .loader-logo');
ok(clean.indexOf('@supports not (inset: 0)') !== -1, 'inset fallback missing');
ok(clean.indexOf('@supports not ((background-clip: text) or (-webkit-background-clip: text))') !== -1,
   'gradient-text fallback missing');
/* The flex-gap block must be marker-driven, never nested under a Grid gate. */
ok(clean.indexOf('html[data-no-flex-gap]') !== -1,
   'flex-gap fallback must be gated on the measured marker');
var gapBlock = clean.slice(clean.indexOf('html[data-no-flex-gap]'));
gapBlock = gapBlock.slice(0, gapBlock.indexOf('@supports not ((background-clip'));
ok(gapBlock.length > 0 && gapBlock.indexOf('@supports not (display: grid)') === -1,
   'flex-gap fallback must NOT depend on Grid support');
console.log('  - 7 independent fallback groups verified');

/* --------------------------------------------------- coverage of selectors */
console.log('[2/4] Selector coverage');

var sources = ['assets/index.css', 'assets/online-base.css', 'assets/aesthetic.css'];
var usedGap = {}, usedInset = {};
sources.forEach(function (rel) {
  var s = read(rel);
  var re = /([^{}]+)\{([^{}]*)\}/g, m;
  while ((m = re.exec(s))) {
    if (/\bgap\s*:/.test(m[2])) {
      m[1].split(',').forEach(function (sel) {
        var t = sel.trim().replace(/::?[\w-]+$/, '');
        if (t) usedGap[t] = 1;
      });
    }
    if (/\binset\s*:/.test(m[2])) {
      m[1].split(',').forEach(function (sel) {
        var t = sel.trim().replace(/::?[\w-]+$/, '');
        if (t) usedInset[t] = 1;
      });
    }
  }
});

var missingGap = [], missingInset = [];
Object.keys(usedGap).forEach(function (sel) {
  if (css.indexOf(sel) === -1) missingGap.push(sel);
});
Object.keys(usedInset).forEach(function (sel) {
  if (css.indexOf(sel) === -1) missingInset.push(sel);
});
ok(missingGap.length === 0,
   'gap users without fallback -> ' + missingGap.slice(0, 8).join(' | '));
ok(missingInset.length === 0,
   'inset users without fallback -> ' + missingInset.slice(0, 8).join(' | '));
/* Critical homepage rules must be explicitly listed. */
['.navbar', '#loader', '.hero::before', '.hero::after', '.hero-particles',
 '.post-list', '.projects', '.contact-row', '.contact-socials',
 '.navbar-inner', '.nav-links', '.nav-actions'].forEach(function (sel) {
  var key = sel.replace(/::?[\w-]+$/, '');
  ok(css.indexOf(key) !== -1, 'compat CSS missing critical selector ' + sel);
});
console.log('  - gap selectors: ' + Object.keys(usedGap).length +
            ', inset selectors: ' + Object.keys(usedInset).length +
            ', all covered');

/* ------------------------------------------------------- runtime probe */
console.log('[3/4] Flex-gap probe simulation');

function runProbe(distance, throws) {
  var attrs = {};
  var root = {
    setAttribute: function (k, v) { attrs[k] = String(v); },
    appendChild: function () {},
    removeChild: function () {}
  };
  var mk = function () {
    return {
      style: { cssText: '' },
      childNodes: [],
      appendChild: function (c) { this.childNodes.push(c); },
      getBoundingClientRect: function () {
        if (throws) throw new Error('no layout');
        return { left: this.id === 'b' ? distance : 0, right: 0 };
      }
    };
  };
  var a = mk(), b = mk();
  b.id = 'b';
  var n = 0;
  var sandbox = {
    document: {
      documentElement: root,
      createElement: function () { return mk(); }
    }
  };
  /* Override the two created <i> elements with deterministic geometry. */
  sandbox.document.createElement = function () {
    n++;
    return n === 2 ? a : (n === 3 ? b : mk());
  };
  sandbox.window = sandbox;
  vm.runInNewContext(probe, sandbox, { filename: 'compat-detect.js' });
  return attrs['data-no-flex-gap'] === '1';
}

ok(runProbe(10) === false, 'modern flex gap (10px) must NOT be marked');
ok(runProbe(0) === true, 'legacy flex gap (0px) must be marked');
ok(runProbe(0, true) === true, 'missing layout API must fall back to marked');
console.log('  - 3 probe states (supported / unsupported / no API) verified');

/* ----------------------------------------------------------- regression */
console.log('[4/4] Existing suites');
[
  ['tools/audit-usability.js', 'usability audit'],
  ['tools/check-ios-adapt.js', 'iOS adaptation'],
  ['tools/check-mobile-perf.js', 'Android rendering budget'],
  ['tools/check-glow-fx.js', 'v8.5 glow gate'],
  ['tools/check-online-compat.js', 'v8.4 Fix legacy gate']
].forEach(function (item) {
  try {
    var out = cp.execFileSync(process.execPath, [path.join(ROOT, item[0])],
                              { encoding: 'utf8' });
    ok(out.indexOf('PASS') !== -1, item[1] + ' regressed');
    console.log('  - ' + item[1] + ': ' + out.trim().split('\n').slice(-1)[0]);
  } catch (err) {
    ok(false, item[1] + ' exited non-zero');
  }
});

console.log('');
console.log('checks: ' + checks + ', failures: ' + failures.length);
if (failures.length) {
  failures.forEach(function (f) { console.error('  FAIL ' + f); });
  process.exit(1);
}
console.log('PASS — legacy engine fallbacks are complete and isolated.');
