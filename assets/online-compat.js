/*!
 * online-compat.js — v8.4 Fix
 *
 * Old-engine fallback for every page under /online/.
 * Activated ONLY when <html data-compat="legacy"> is set by the inline
 * capability probe in <head>. Modern browsers do nothing here.
 *
 * Constraints (deliberate, do not "modernise" this file):
 *   - ES3 syntax only. No const/let/arrow/template literal/"use strict" deps.
 *   - No classList, no Array#forEach, no querySelector(All),
 *     no addEventListener, no IntersectionObserver, no CSS variables,
 *     no Promise, no matchMedia, no Date.now(), no localStorage assumption.
 *   - Only getElementById / getElementsByTagName / getAttribute /
 *     setAttribute / className / style / attachEvent-onclick fallbacks.
 *
 * Why it exists: online-base.css hides [data-reveal] with opacity:0 and
 * relies on the enhancement scripts to add .is-in. On old engines those
 * scripts abort on classList / forEach, so the hub cards (the entries to
 * the download / music / game sub-projects) stay invisible forever.
 * This file makes content visible first, then restores basic interactions.
 */
(function (w, d) {
  var r = d.documentElement;

  if (!r.getAttribute || r.getAttribute('data-compat') !== 'legacy') {
    return;
  }

  function hasClass(el, name) {
    if (!el) return false;
    return (' ' + (el.className || '') + ' ').indexOf(' ' + name + ' ') > -1;
  }

  function addClass(el, name) {
    if (!el || hasClass(el, name)) return;
    el.className = el.className ? el.className + ' ' + name : name;
  }

  function removeClass(el, name) {
    if (!el || !hasClass(el, name)) return;
    var c = (' ' + (el.className || '') + ' ').replace(' ' + name + ' ', ' ');
    el.className = c.replace(/^\s+|\s+$/g, '');
  }

  function toggleClass(el, name) {
    if (hasClass(el, name)) {
      removeClass(el, name);
      return false;
    }
    addClass(el, name);
    return true;
  }

  function on(el, type, fn) {
    if (!el) return;
    if (el.addEventListener) el.addEventListener(type, fn, false);
    else if (el.attachEvent) el.attachEvent('on' + type, fn);
    else el['on' + type] = fn;
  }

  function setStyle(el, prop, value) {
    if (!el || !el.style) return;
    try { el.style[prop] = value; } catch (e) {}
  }

  function collect(attr) {
    var nodes = d.getElementsByTagName('*');
    var out = [];
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute && nodes[i].getAttribute(attr) !== null) {
        out.push(nodes[i]);
      }
    }
    return out;
  }

  /* 1) Content first: force every reveal element visible.
        Inline styles are a second safety net on top of the CSS override,
        so the entries are visible even if a stylesheet fails to load. */
  function forceVisible() {
    var els = collect('data-reveal');
    var i, el;
    for (i = 0; i < els.length; i++) {
      el = els[i];
      addClass(el, 'is-in');
      addClass(el, 'fx-in');
      setStyle(el, 'opacity', '1');
      setStyle(el, 'visibility', 'visible');
      setStyle(el, 'filter', 'none');
      setStyle(el, 'transform', 'none');
      setStyle(el, 'webkitTransform', 'none');
      setStyle(el, 'msTransform', 'none');
    }

    var heads = d.getElementsByTagName('header');
    for (i = 0; i < heads.length; i++) {
      if (hasClass(heads[i], 'section-head')) {
        addClass(heads[i], 'fx-in');
        setStyle(heads[i], 'opacity', '1');
      }
    }
  }

  /* 2) Theme toggle (no dataset, no CSS variables) */
  function initTheme() {
    var btn = d.getElementById('themeToggle');
    if (!btn) return;
    on(btn, 'click', function () {
      var cur = r.getAttribute('data-theme');
      var next = cur === 'dark' ? 'light' : 'dark';
      r.setAttribute('data-theme', next);
      var metas = d.getElementsByTagName('meta');
      var i;
      for (i = 0; i < metas.length; i++) {
        if (metas[i].getAttribute('name') === 'theme-color') {
          metas[i].content = next === 'dark' ? '#14121a' : '#fdfbfc';
        }
      }
      try {
        if (w.localStorage) {
          w.localStorage.setItem('theme', next);
          w.localStorage.setItem('themeAt', String(new Date().getTime()));
        }
      } catch (e) {}
    });
  }

  /* 3) Expandable download cards (kernel / ROM / ShenEternal lists) */
  function initExpand() {
    var btns = d.getElementsByTagName('button');
    var i, btn, card;
    for (i = 0; i < btns.length; i++) {
      btn = btns[i];
      if (!hasClass(btn, 'dl-expand-head')) continue;
      card = btn.parentNode;
      while (card && card.nodeType === 1 && !hasClass(card, 'dl-card--expand')) {
        card = card.parentNode;
      }
      (function (b, c) {
        if (!c) return;
        on(b, 'click', function () {
          var open = toggleClass(c, 'expanded');
          b.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      })(btn, card);
    }
  }

  /* 4) Mobile nav */
  function initMenu() {
    var btn = d.getElementById('mobileMenuBtn');
    var list = d.getElementById('navLinks');
    if (!btn || !list) return;
    on(btn, 'click', function () {
      var open = toggleClass(list, 'open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* 5) Back to top */
  function initToTop() {
    var btn = d.getElementById('toTop');
    if (!btn) return;
    on(btn, 'click', function () {
      try { w.scrollTo(0, 0); } catch (e) {
        try { d.body.scrollTop = 0; } catch (e2) {}
      }
    });
  }

  /* 6) Never let the enhancement layer hide content on old engines */
  function stripFx() {
    removeClass(r, 'fx-on');
  }

  function boot() {
    stripFx();
    forceVisible();
    initTheme();
    initExpand();
    initMenu();
    initToTop();
  }

  /* defer is ignored by IE8, so this script is placed at the end of <body>.
     Keep the ready fallback anyway for robustness. */
  if (d.body) {
    boot();
  } else if (d.addEventListener) {
    d.addEventListener('DOMContentLoaded', boot, false);
  } else if (d.attachEvent) {
    d.attachEvent('onreadystatechange', function () {
      if (d.readyState === 'complete' || d.readyState === 'interactive') boot();
    });
  } else {
    var prev = w.onload;
    w.onload = function () {
      if (prev) prev();
      boot();
    };
  }
})(window, document);
