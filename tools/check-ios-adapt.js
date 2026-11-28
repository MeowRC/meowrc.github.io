#!/usr/bin/env node
/*
 * check-ios-adapt.js — iOS / iPhone X+ safe-area regression (v8.8)
 *
 *   1. Static: viewport-fit=cover on every page; ios-adapt.js placed AFTER
 *      the viewport meta but before body scripts; ios-adapt.css last in head;
 *      all CSS rules gated behind html[data-ios="1"].
 *   2. Redirect: ppt/1 meta refresh, location.replace and fallback link all
 *      point at the same ilanzou URL, with no stale signed URL left.
 *   3. Behavioural: real ios-adapt.js executed across 7 device profiles.
 *   4. Regression: all four existing suites.
 *
 * Usage: node tools/check-ios-adapt.js   (no third-party dependencies)
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
var NEW_URL = 'https://www.ilanzou.com/s/J1myTLqUr';

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
  var headEnd = s.indexOf('</head>');
  var head = s.slice(0, headEnd);
  var vp = head.indexOf('name="viewport"');
  var jsTag = '<script src="' + up + '/ios-adapt.js"></script>';
  var cssTag = '<link rel="stylesheet" href="' + up + '/ios-adapt.css">';
  var jsAt = s.indexOf(jsTag);
  var cssAt = s.indexOf(cssTag);

  ok(vp > -1, rel + ': missing viewport meta');
  ok(/viewport-fit=cover/.test(head), rel + ': viewport-fit=cover missing');
  ok(jsAt > -1, rel + ': missing ios-adapt.js');
  ok(cssAt > -1, rel + ': missing ios-adapt.css');
  /* env() only resolves to real insets after the viewport meta is parsed. */
  ok(jsAt > vp, rel + ': ios-adapt.js must run AFTER the viewport meta');
  ok(jsAt < headEnd, rel + ': ios-adapt.js must be in <head>');
  ok(cssAt > jsAt, rel + ': ios-adapt.css must follow the probe');
  ok(cssAt < headEnd, rel + ': ios-adapt.css must be in <head>');
  /* loader-media.css is intentionally appended after ios-adapt.css so its
     background override wins; no other stylesheet may follow ios-adapt.css. */
  var afterIos = head.slice(cssAt + cssTag.length);
  ok(afterIos.indexOf('<link rel="stylesheet"') === -1 ||
     (afterIos.indexOf('loader-media.css') > -1 &&
      afterIos.split('<link rel="stylesheet"').length === 2),
     rel + ': only loader-media.css may follow ios-adapt.css');
});
console.log('  - ' + PAGES.length + ' site pages wired in correct order');

var js = read('assets/ios-adapt.js');
var jsCode = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
ok(!/(=>|\bconst\b|\blet\b|\?\.|`)/.test(jsCode), 'ios-adapt.js must stay ES5');
ok(/MacIntel/.test(js) && /maxTouchPoints/.test(js),
   'ios-adapt.js must detect iPadOS desktop-UA devices');
ok(/safe-area-inset-top/.test(js) && /getComputedStyle/.test(js),
   'ios-adapt.js must measure the real safe area, not hard-code screen sizes');

var css = read('assets/ios-adapt.css');
var clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
ok(clean.split('{').length === clean.split('}').length, 'ios-adapt.css: unbalanced braces');

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
    if (t.charAt(0) === '@' || t.indexOf('html[data-ios') === 0) return;
    ungated.push(t);
  });
});
ok(ungated.length === 0, 'ios-adapt.css: ungated rules -> ' + ungated.slice(0, 3).join(' | '));
[
  'safe-area-inset-top', 'safe-area-inset-bottom', 'safe-area-inset-left',
  'safe-area-inset-right', 'constant(safe-area-inset-top)', '92dvh'
].forEach(function (token) {
  ok(clean.indexOf(token) !== -1, 'ios-adapt.css: missing ' + token);
});
ok(clean.indexOf('data-ios-tier="lite"') !== -1,
   'ios-adapt.css: missing lite-tier rendering budget');
var liteBlock = clean.slice(clean.indexOf('data-ios-tier="lite"'));
ok(/\.fx-aurora[\s\S]{0,1200}display:\s*none\s*!important/.test(liteBlock),
   'ios-adapt.css: lite tier must drop the full-screen aurora layer');
ok(/\[data-reveal\][\s\S]{0,400}opacity:\s*1\s*!important/.test(liteBlock),
   'ios-adapt.css: lite tier must keep reveal content visible without JS');
ok(js.indexOf('data-ios-tier') !== -1 &&
   js.indexOf('devicePixelRatio') !== -1,
   'ios-adapt.js: missing tier split');
ok(/data-ios-tier"\)\s*===\s*"lite"/.test(read('assets/aesthetic.js')),
   'aesthetic.js: missing iOS lite-tier short-circuit');
console.log('  - ' + selectors.length + ' CSS blocks, 0 ungated, 6 safe-area + lite-tier verified');

/* ---------------------------------------------------------------- redirect */
console.log('[2/4] ppt/1 redirect');
var redirect = read('ppt/1/index.html');
var urls = redirect.match(/https?:\/\/[^"\s<]+/g) || [];
ok(urls.length >= 3, 'ppt/1: expected meta + script + fallback link URLs');
ok(urls.every(function (u) { return u === NEW_URL; }),
   'ppt/1: URLs are not all ' + NEW_URL + ' -> ' + urls.join(', '));
ok(/http-equiv="refresh"/.test(redirect), 'ppt/1: missing meta refresh fallback');
ok(/location\.replace/.test(redirect), 'ppt/1: missing location.replace');
ok(/<a href="https?:[^"]+"/.test(redirect), 'ppt/1: missing no-script fallback link');
ok(redirect.indexOf('shusheng2.mini189.cn') === -1 &&
   redirect.indexOf('X-Amz-Signature') === -1,
   'ppt/1: stale signed URL still present');
ok(redirect.indexOf('glow-fx') === -1, 'ppt/1: redirect page must not load site effects');
console.log('  - 3 URL occurrences, no stale signed link');

/* ------------------------------------------------------------- behavioural */
console.log('[3/4] Device profile simulation');

var IPHONE_X = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
var IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
var ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
var DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function env(cfg) {
  var attrs = {};
  var root = {
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) {
      return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null;
    },
    appendChild: function () {},
    removeChild: function () {}
  };
  var w = {
    navigator: {
      userAgent: cfg.ua,
      platform: cfg.platform || '',
      maxTouchPoints: cfg.touch || 0
    },
    screen: { width: cfg.sw || 0, height: cfg.sh || 0 },
    devicePixelRatio: cfg.dpr === undefined ? 1 : cfg.dpr,
    matchMedia: function (q) {
      return { matches: q.indexOf('prefers-reduced-motion') !== -1 && cfg.reduced === true };
    },
    document: {
      documentElement: root,
      createElement: function () { return { style: { cssText: '' } }; }
    },
    getComputedStyle: function () {
      if (cfg.noEnv) throw new Error('getComputedStyle unavailable');
      return {
        paddingTop: (cfg.top || 0) + 'px',
        paddingBottom: (cfg.bottom || 0) + 'px'
      };
    }
  };
  w.window = w;
  return { sandbox: w, attrs: attrs };
}

var PROFILES = [
  /* iPhone 8 / SE2 / SE3: 750x1334@2 = 1.00M */
  { label: 'iPhone 8 (375x667@2, no notch)', ua: IPHONE_X, sw: 375, sh: 667, dpr: 2, top: 20, bottom: 0, ios: true, notch: false, tier: 'lite' },
  /* iPhone X / XS: 1125x2436 = 2.74M */
  { label: 'iPhone X (375x812@3)', ua: IPHONE_X, sw: 375, sh: 812, dpr: 3, top: 44, bottom: 34, ios: true, notch: true, tier: 'lite' },
  /* iPhone XR / 11: 828x1792 = 1.48M */
  { label: 'iPhone 11 (414x896@2)', ua: IPHONE_X, sw: 414, sh: 896, dpr: 2, top: 44, bottom: 34, ios: true, notch: true, tier: 'lite' },
  /* iPhone X landscape */
  { label: 'iPhone X landscape (top 0, bottom 21)', ua: IPHONE_X, sw: 812, sh: 375, dpr: 3, top: 0, bottom: 21, ios: true, notch: true, tier: 'lite' },
  /* iPhone 13: 1170x2532 = 2.96M */
  { label: 'iPhone 13 (390x844@3)', ua: IPHONE_X, sw: 390, sh: 844, dpr: 3, top: 47, bottom: 34, ios: true, notch: true, tier: 'full' },
  /* iPhone 15 Pro Max: 1290x2796 = 3.61M */
  { label: 'iPhone 15 Pro Max (430x932@3)', ua: IPHONE_X, sw: 430, sh: 932, dpr: 3, top: 59, bottom: 34, ios: true, notch: true, tier: 'full' },
  /* iPad Pro 12.9: 2048x2732 = 5.60M */
  { label: 'iPad Pro (1024x1366@2)', ua: IPHONE_X.replace('iPhone', 'iPad'), sw: 1024, sh: 1366, dpr: 2, top: 24, bottom: 20, ios: true, notch: true, tier: 'full' },
  { label: 'iPadOS desktop-UA (1366x1024@2)', ua: IPADOS, platform: 'MacIntel', touch: 5, sw: 1366, sh: 1024, dpr: 2, top: 24, bottom: 20, ios: true, notch: true, tier: 'full' },
  { label: 'iPhone 13 + prefers-reduced-motion', ua: IPHONE_X, sw: 390, sh: 844, dpr: 3, top: 47, bottom: 34, reduced: true, ios: true, notch: true, tier: 'lite' },
  { label: 'iOS without env() support', ua: IPHONE_X, sw: 375, sh: 812, dpr: 3, noEnv: true, ios: true, notch: false, tier: 'lite' },
  { label: 'Android phone', ua: ANDROID, sw: 390, sh: 844, dpr: 3, top: 24, bottom: 0, ios: false, notch: false, tier: null },
  { label: 'Windows desktop', ua: DESKTOP, sw: 1920, sh: 1080, dpr: 1, top: 0, bottom: 0, ios: false, notch: false, tier: null },
  { label: 'macOS desktop (MacIntel, no touch)', ua: MAC, platform: 'MacIntel', touch: 0, sw: 1440, sh: 900, dpr: 2, top: 0, bottom: 0, ios: false, notch: false, tier: null }
];

PROFILES.forEach(function (p) {
  var e = env(p);
  vm.runInNewContext(js, e.sandbox, { filename: 'ios-adapt.js' });
  var isIOS = e.attrs['data-ios'] === '1';
  var notch = e.attrs['data-ios-notch'] === '1';
  var tier = e.attrs['data-ios-tier'] || null;
  ok(isIOS === p.ios, p.label + ': expected iOS=' + p.ios + ', got ' + isIOS);
  ok(notch === p.notch, p.label + ': expected notch=' + p.notch + ', got ' + notch);
  ok(tier === p.tier, p.label + ': expected tier=' + p.tier + ', got ' + tier);
  console.log('  - ' + (isIOS ? (p.tier === 'lite' ? 'LITE ' : 'FULL ') : 'NONE ') +
              (notch ? 'notch' : '     ') + '  ' + p.label);
});

/* -------------------------------------------------------------- regression */
console.log('[4/4] Existing suites');
[
  ['tools/audit-usability.js', 'usability audit'],
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

/* ------------------------------------------------------------------ report */
console.log('');
console.log('checks: ' + checks + ', failures: ' + failures.length);
if (failures.length) {
  failures.forEach(function (f) { console.error('  FAIL ' + f); });
  process.exit(1);
}
console.log('PASS — iOS safe-area adaptation and ppt/1 redirect are intact.');
