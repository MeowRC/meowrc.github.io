/*!
 * glow-fx.js — v8.5 conditional light effects
 *
 * Decides whether a device may enable assets/glow-fx.css by setting
 * <html data-glow="on">. Without the marker the stylesheet is a no-op, so
 * legacy / low-end / motion-sensitive devices keep the exact v8.4 rendering.
 *
 * ES5 syntax, zero dependencies, no framework. Pointer tracking is done in a
 * single rAF-throttled listener; no scroll/resize loops, no timers.
 */
(function (w, d) {
  var r = d.documentElement;
  if (!r || !r.setAttribute || !r.style || !r.style.setProperty) return;

  /* 1) Never override the v8.4 Fix legacy fallback. */
  if (r.getAttribute('data-compat') === 'legacy') return;

  /* 1b) Android mobile uses the reduced rendering budget (v8.7): skip the
         GPU-heavy light layer entirely; mobile-perf.css handles the visuals. */
  if (r.getAttribute('data-perf') === 'mobile') return;

  function mq(query) {
    try { return !!(w.matchMedia && w.matchMedia(query).matches); }
    catch (e) { return false; }
  }

  /* 2) Explicit opt-out (privacy-mode storage failures are ignored). */
  try {
    if (w.localStorage && w.localStorage.getItem('glowFx') === 'off') return;
  } catch (e) {}

  /* 3) Modern capability floor. */
  if (!w.matchMedia || typeof w.requestAnimationFrame !== 'function') return;
  if (!w.CSS || typeof w.CSS.supports !== 'function') return;
  if (!w.CSS.supports('--gx', '0') || !w.CSS.supports('display', 'grid')) return;
  if (!('IntersectionObserver' in w)) return;

  /* 4) Accessibility and data-saver preferences. */
  if (mq('(prefers-reduced-motion: reduce)')) return;
  if (mq('(prefers-reduced-data: reduce)')) return;
  var conn = w.navigator.connection ||
             w.navigator.mozConnection ||
             w.navigator.webkitConnection;
  if (conn && (conn.saveData ||
      /^(slow-2g|2g|3g)$/.test(conn.effectiveType || ''))) return;

  /* 5) Performance floor. Missing signals are not treated as "fast". */
  var cores = w.navigator.hardwareConcurrency || 0;
  var mem = w.navigator.deviceMemory || 0;
  var dpr = w.devicePixelRatio || 1;
  if (cores && cores < 4) return;
  if (mem && mem < 4) return;
  if (dpr > 2.5) return;
  if (!cores && !mem && !mq('(pointer: fine)') && !mq('(min-width: 1024px)')) return;
  if (mq('(pointer: coarse)') && (w.innerWidth || 0) < 768) return;

  /* 6) Activate. */
  r.setAttribute('data-glow', 'on');

  var fine = mq('(pointer: fine)');
  var CARD_SELECTOR = '.card,.dl-card,.hub-card,.project,.post,.contact';
  var pending = false;
  var px = 50, py = 22, card = null, cx = 0, cy = 0;

  function matches(el, selector) {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches) return el.matches(selector);
    if (el.msMatchesSelector) return el.msMatchesSelector(selector);
    if (el.webkitMatchesSelector) return el.webkitMatchesSelector(selector);
    return false;
  }

  function findCard(node) {
    while (node && node !== d.body && node.nodeType === 1) {
      if (matches(node, CARD_SELECTOR)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function flush() {
    pending = false;
    r.style.setProperty('--px', px + '%');
    r.style.setProperty('--py', py + '%');
    if (card && card.style && card.style.setProperty) {
      var box = card.getBoundingClientRect ? card.getBoundingClientRect() : null;
      if (box && box.width && box.height) {
        card.style.setProperty('--gx', ((cx - box.left) / box.width * 100).toFixed(1) + '%');
        card.style.setProperty('--gy', ((cy - box.top) / box.height * 100).toFixed(1) + '%');
      }
    }
  }

  if (fine && d.addEventListener) {
    d.addEventListener('mousemove', function (e) {
      px = (e.clientX / (w.innerWidth || 1) * 100).toFixed(2);
      py = (e.clientY / (w.innerHeight || 1) * 100).toFixed(2);
      cx = e.clientX;
      cy = e.clientY;
      card = findCard(e.target);
      if (!pending) {
        pending = true;
        w.requestAnimationFrame(flush);
      }
    }, { passive: true });
  }

  /* 7) Stop animating while the tab is hidden. */
  if (d.addEventListener) {
    d.addEventListener('visibilitychange', function () {
      if (d.hidden) r.setAttribute('data-glow-paused', '1');
      else r.removeAttribute('data-glow-paused');
    }, false);
  }
})(window, document);
