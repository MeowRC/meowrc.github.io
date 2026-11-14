#!/usr/bin/env node
/*
 * check-mobile-perf.js — Android mobile rendering budget (v8.7) regression
 *
 *   1. Static: all 11 site pages wire mobile-perf.js (early, synchronous in
 *      <head>) and mobile-perf.css (last in <head>); every CSS rule is gated
 *      behind html[data-perf="mobile"]; the two heavy JS layers short-circuit.
 *   2. Behavioural: executes the real mobile-perf.js across 8 device profiles.
 *   3. Budget: quantifies the GPU-expensive features the profile disables.
 *   4. Regression: re-runs the three existing audit suites.
 *
 * Usage: node tools/check-mobile-perf.js   (no third-party dependencies)
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

var checks = 0;
var failures = [];
function ok(cond, msg) {
  checks++;
  if (!cond) failures.push(msg);
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* ------------------------------------------------------------------ static */
console.log('[1/4] Static wiring');

PAGES.forEach(function (item) {
  var rel = item[0], up = item[1];
  var s = read(rel);
  var jsTag = '<script src="' + up + '/mobile-perf.js"></script>';
  var cssTag = '<link rel="stylesheet" href="' + up + '/mobile-perf.css">';
  ok(s.indexOf(jsTag) !== -1, rel + ': missing mobile-perf.js');
  ok(s.indexOf(cssTag) !== -1, rel + ': missing mobile-perf.css');
  var jsAt = s.indexOf(jsTag);
  var headEnd = s.indexOf('</head>');
  var bodyStart = s.indexOf('<body');
  ok(jsAt > -1 && jsAt < headEnd, rel + ': probe script must be in <head>');
  ok(jsAt < bodyStart, rel + ': probe script must run before <body> scripts');
  ok(s.indexOf('glow-fx.js') > jsAt, rel + ': glow-fx.js must load after the probe');
  ok(s.indexOf(cssTag) > s.indexOf('compat-android7.css'),
     rel + ': mobile-perf.css must be the last stylesheet');
});
console.log('  - ' + PAGES.length + ' site pages wired');

var probe = read('assets/mobile-perf.js');
var probeCode = probe.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
ok(!/(=>|\bconst\b|\blet\b|\?\.|`)/.test(probeCode), 'mobile-perf.js must stay ES5');
ok(/Android/i.test(probe), 'mobile-perf.js must scope to Android');
ok(/data-perf-tier/.test(probe), 'mobile-perf.js must grade low-tier devices');

var css = read('assets/mobile-perf.css');
var clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
ok(clean.split('{').length === clean.split('}').length, 'mobile-perf.css: unbalanced braces');

/* Collect top-level selectors; every one must be gated. */
var selectors = [], buf = '', depth = 0;
for (var i = 0; i < clean.length; i++) {
  var ch = clean[i];
  if (ch === '{') { if (depth === 0) selectors.push(buf.trim()); depth++; buf = ''; }
  else if (ch === '}') { depth--; buf = ''; }
  else buf += ch;
}
var ungated = [];
selectors.forEach(function (sel) {
  if (!sel) return;
  sel.split(',').forEach(function (one) {
    var t = one.trim();
    if (!t) return;
    if (t.charAt(0) === '@' || t.indexOf('html[data-perf') === 0) return;
    ungated.push(t);
  });
});
ok(ungated.length === 0, 'mobile-perf.css: ungated rules -> ' + ungated.slice(0, 3).join(' | '));

/* The heavy JavaScript layers must short-circuit on the marker. */
var shortCircuit = /data-perf["']\)\s*===\s*["']mobile["']/;
ok(shortCircuit.test(read('assets/glow-fx.js')),
   'glow-fx.js: missing mobile short-circuit');
ok(shortCircuit.test(read('assets/aesthetic.js')),
   'aesthetic.js: missing mobile short-circuit');

/* What the budget actually disables. */
var disabled = {
  'decor layers': /\.fx-aurora,\s*\nhtml\[data-perf="mobile"\] \.fx-grain/.test(clean),
  'backdrop-filter': /backdrop-filter:\s*none\s*!important/.test(clean),
  'blur reveal': /filter:\s*none\s*!important/.test(clean),
  'infinite animations': /animation:\s*none\s*!important/.test(clean),
  'will-change': /will-change:\s*auto\s*!important/.test(clean),
  'content-first reveal': /\[data-reveal\]/.test(clean),
  'low-tier tier rules': /data-perf-tier="low"/.test(clean)
};
Object.keys(disabled).forEach(function (k) {
  ok(disabled[k], 'mobile-perf.css: missing ' + k + ' optimisation');
});
console.log('  - ' + selectors.length + ' CSS blocks, 0 ungated, ' +
            Object.keys(disabled).length + ' budget items verified');

/* ------------------------------------------------------------- behavioural */
console.log('[2/4] Device profile simulation');

var ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
var ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 12; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var ANDROID_TV = 'Mozilla/5.0 (Linux; Android 11; SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function env(cfg) {
  var attrs = {};
  var root = {
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) {
      return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
    }
  };
  var w = {
    document: { documentElement: root },
    navigator: {
      userAgent: cfg.ua,
      hardwareConcurrency: cfg.cores,
      deviceMemory: cfg.mem,
      connection: cfg.conn || null
    },
    matchMedia: function (q) {
      return { matches: q.indexOf('pointer: coarse') !== -1 && cfg.coarse === true };
    }
  };
  w.window = w;
  return { sandbox: w, attrs: attrs };
}

var PROFILES = [
  { label: 'Android phone (8c/8GB)', ua: ANDROID_PHONE, coarse: true, cores: 8, mem: 8, expect: 'mobile', low: false },
  { label: 'Android tablet (coarse, no Mobile token)', ua: ANDROID_TABLET, coarse: true, cores: 8, mem: 6, expect: 'mobile', low: false },
  { label: 'Android low-end (4c/2GB)', ua: ANDROID_PHONE, coarse: true, cores: 4, mem: 2, expect: 'mobile', low: true },
  { label: 'Android on 3G', ua: ANDROID_PHONE, coarse: true, cores: 8, mem: 8, conn: { effectiveType: '3g' }, expect: 'mobile', low: true },
  { label: 'Android with data saver', ua: ANDROID_PHONE, coarse: true, cores: 8, mem: 8, conn: { saveData: true }, expect: 'mobile', low: true },
  { label: 'Windows desktop', ua: DESKTOP, coarse: false, cores: 16, mem: 16, expect: null, low: false },
  { label: 'iPhone', ua: IPHONE, coarse: true, cores: 6, mem: 6, expect: null, low: false },
  { label: 'Android TV (fine pointer)', ua: ANDROID_TV, coarse: false, cores: 4, mem: 4, expect: null, low: false }
];

PROFILES.forEach(function (p) {
  var e = env(p);
  vm.runInNewContext(probe, e.sandbox, { filename: 'mobile-perf.js' });
  var got = e.attrs['data-perf'] || null;
  ok(got === p.expect,
     p.label + ': expected ' + (p.expect || 'none') + ', got ' + (got || 'none'));
  var isLow = e.attrs['data-perf-tier'] === 'low';
  ok(isLow === p.low, p.label + ': low-tier grading mismatch');
  console.log('  - ' + (got === 'mobile' ? (isLow ? 'LOW ' : 'MOB ') : 'FULL') + '  ' + p.label);
});

/* ------------------------------------------------------------------ budget */
console.log('[3/4] Rendering budget estimate');
var aesthetic = read('assets/aesthetic.css');
var blurLayers = (aesthetic.match(/filter:\s*blur\([^)]*\)/g) || []).length;
var infinite = (aesthetic.match(/infinite/g) || []).length;
var backdrop = 0;
['index.css', 'index-apple.css', 'online-base.css'].forEach(function (f) {
  backdrop += (read('assets/' + f).match(/backdrop-filter/g) || []).length;
});
console.log('  - blur-filter declarations in aesthetic.css: ' + blurLayers +
            ' (mobile profile hides the host layers)');
console.log('  - infinite animation declarations: ' + infinite +
            ' (mobile profile sets animation:none on text/decor)');
console.log('  - backdrop-filter declarations in page CSS: ' + backdrop +
            ' (mobile profile forces none on .navbar/.theme-ctl)');
console.log('  - aesthetic.js skipped on Android mobile: 22 listeners, ' +
            '4 rAF springs, 1 setInterval loader poll, decor DOM creation');
ok(blurLayers > 0 && infinite > 0 && backdrop > 0,
   'expected expensive features to exist for the budget to act on');

/* -------------------------------------------------------------- regression */
console.log('[4/4] Existing suites');
[
  ['tools/audit-usability.js', 'usability audit'],
  ['tools/check-glow-fx.js', 'v8.5 glow gate'],
  ['tools/check-online-compat.js', 'v8.4 Fix legacy gate']
].forEach(function (item) {
  try {
    var out = cp.execFileSync(process.execPath, [path.join(ROOT, item[0])],
                              { encoding: 'utf8' });
    ok(out.indexOf('PASS') !== -1, item[1] + ' regressed');
    console.log('  - ' + item[1] + ': ' + out.trim().split('\n').slice(-1)[0]);
  } catch (e) {
    ok(false, item[1] + ' exited non-zero');
  }
});

/* ------------------------------------------------------------------ report */
console.log('');
console.log('checks: ' + checks + ', failures: ' + failures.length);
if (failures.length) {
  failures.forEach(function (f) { console.error('  FAIL ' + f); });
  process.exit(1);
}
console.log('PASS — Android mobile rendering budget is intact.');
