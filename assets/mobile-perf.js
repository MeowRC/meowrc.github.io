/*!
 * mobile-perf.js — Android mobile performance profile (v8.7)
 *
 * Runs synchronously in <head>, BEFORE every other script, so the heavy
 * enhancement layers (aesthetic.js, glow-fx.js) can short-circuit on the
 * same marker instead of creating GPU-expensive DOM and listeners first.
 *
 * ES5, zero dependencies, no timers, no listeners. Sets:
 *   data-perf="mobile"       on Android phones/tablets
 *   data-perf-tier="low"     additionally on low-core / low-RAM / slow-net
 *
 * All visual consequences live in assets/mobile-perf.css. Without the marker
 * this script has zero effect, and desktop / iOS / Android TV are untouched.
 */
(function (w, d) {
  var r = d.documentElement;
  if (!r || !r.setAttribute) return;

  var ua = w.navigator.userAgent || '';
  if (!/Android/i.test(ua)) return;

  function mq(query) {
    try { return !!(w.matchMedia && w.matchMedia(query).matches); }
    catch (e) { return false; }
  }

  /* A coarse pointer or a mobile/tablet UA marks a handheld Android device.
     Android TV / desktop builds (fine pointer, no Mobile token) stay full. */
  if (!mq('(pointer: coarse)') && !/Mobile|Tablet|Silk|Kindle/i.test(ua)) return;

  r.setAttribute('data-perf', 'mobile');

  var nav = w.navigator;
  var cores = nav.hardwareConcurrency || 0;
  var mem = nav.deviceMemory || 0;
  var conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  var low = (cores > 0 && cores <= 4) ||
            (mem > 0 && mem <= 3) ||
            (conn && (conn.saveData ||
              /^(slow-2g|2g|3g)$/.test(conn.effectiveType || '')));
  if (low) r.setAttribute('data-perf-tier', 'low');
})(window, document);
