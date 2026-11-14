/*!
 * legacy-shims.js — ES5 browser API shims for 函数棋
 *
 * Bundled into files/es5/polyfills.min.js by tools/build-es5.js.
 * Loaded ONLY when the runtime is missing a modern capability.
 * All code here is ES5 syntax and must stay that way.
 */
(function (global) {
  'use strict';

  var w = global;
  var d = w.document;
  var EP = w.Element && w.Element.prototype;

  /* ---- DOM: Element.remove ---- */
  if (EP && !EP.remove) {
    EP.remove = function () {
      if (this.parentNode) this.parentNode.removeChild(this);
    };
  }

  /* ---- DOM: Element.matches ---- */
  if (EP && !EP.matches) {
    EP.matches = EP.msMatchesSelector || EP.webkitMatchesSelector ||
      EP.mozMatchesSelector || function (sel) {
        var nodes = (this.parentNode || d).querySelectorAll(sel);
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i] === this) return true;
        }
        return false;
      };
  }

  /* ---- DOM: Element.closest ---- */
  if (EP && !EP.closest) {
    EP.closest = function (sel) {
      var el = this;
      while (el && el.nodeType === 1) {
        if (el.matches(sel)) return el;
        el = el.parentElement || el.parentNode;
      }
      return null;
    };
  }

  /* ---- DOM: NodeList.forEach / HTMLCollection.forEach ---- */
  function addForEach(ctor) {
    if (!ctor || !ctor.prototype || ctor.prototype.forEach) return;
    ctor.prototype.forEach = function (fn, thisArg) {
      for (var i = 0; i < this.length; i++) {
        fn.call(thisArg, this[i], i, this);
      }
    };
  }
  addForEach(w.NodeList);
  addForEach(w.HTMLCollection);

  /* ---- DOM: classList.toggle(token, force) ----
   * IE11 ignores the second argument; normalise to spec behaviour. */
  if (w.DOMTokenList && w.DOMTokenList.prototype &&
      typeof w.DOMTokenList.prototype.toggle === 'function') {
    var nativeToggle = w.DOMTokenList.prototype.toggle;
    w.DOMTokenList.prototype.toggle = function (token, force) {
      if (arguments.length > 1) {
        if (force) { this.add(token); return true; }
        this.remove(token);
        return false;
      }
      return nativeToggle.call(this, token);
    };
  }

  /* dataset is intentionally NOT shimmed: a getter-only polyfill cannot
   * reflect writes back to attributes, and the game relies on data-* writes.
   * IE11 (our ES5 floor) implements dataset natively; IE10 and older are
   * routed to the static fallback page by the entry detector. */

  /* ---- CustomEvent ---- */
  if (typeof w.CustomEvent !== 'function' && d && d.createEvent) {
    w.CustomEvent = function (type, params) {
      params = params || {};
      var e = d.createEvent('CustomEvent');
      e.initCustomEvent(type, !!params.bubbles, !!params.cancelable, params.detail);
      return e;
    };
    if (w.Event) w.CustomEvent.prototype = w.Event.prototype;
  }

  /* ---- requestAnimationFrame ---- */
  if (!w.requestAnimationFrame) {
    w.requestAnimationFrame = function (fn) { return w.setTimeout(fn, 16); };
    w.cancelAnimationFrame = function (id) { w.clearTimeout(id); };
  }

  /* ---- structuredClone (JSON fallback) ---- */
  if (typeof w.structuredClone !== 'function') {
    w.structuredClone = function (value) {
      if (value === null || typeof value !== 'object') return value;
      try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
    };
  }

  /* ---- ResizeObserver (resize-event fallback) ---- */
  if (typeof w.ResizeObserver === 'undefined') {
    w.ResizeObserver = function (callback) {
      var self = this;
      var targets = [];
      var timer = null;
      function fire() {
        var entries = [], i, el;
        for (i = 0; i < targets.length; i++) {
          el = targets[i];
          entries.push({
            target: el,
            contentRect: { width: el.offsetWidth || 0, height: el.offsetHeight || 0 }
          });
        }
        if (entries.length) callback(entries, self);
      }
      this.observe = function (el) {
        if (targets.indexOf(el) === -1) targets.push(el);
        fire();
      };
      this.unobserve = function (el) {
        var idx = targets.indexOf(el);
        if (idx !== -1) targets.splice(idx, 1);
      };
      this.disconnect = function () { targets = []; };
      w.addEventListener('resize', function () {
        if (timer) w.clearTimeout(timer);
        timer = w.setTimeout(fire, 120);
      }, false);
    };
  }

  /* ---- IntersectionObserver (always-visible fallback) ----
   * The game only uses it to trigger reveal animations; treating every
   * observed element as visible is the correct degradation. */
  if (typeof w.IntersectionObserver === 'undefined') {
    w.IntersectionObserver = function (callback) {
      var self = this;
      this.observe = function (el) {
        w.setTimeout(function () {
          var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { top: 0 };
          callback([{
            target: el,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: rect
          }], self);
        }, 0);
      };
      this.unobserve = function () {};
      this.disconnect = function () {};
    };
  }

  /* ---- navigator.clipboard: no-op that never throws ---- */
  try {
    if (w.navigator && !w.navigator.clipboard) {
      w.navigator.clipboard = {
        writeText: function () {
          return (w.Promise && w.Promise.resolve) ? w.Promise.resolve() :
            { then: function (fn) { fn(); return this; }, catch: function () { return this; } };
        },
        readText: function () {
          return (w.Promise && w.Promise.resolve) ? w.Promise.resolve('') :
            { then: function (fn) { fn(''); return this; }, catch: function () { return this; } };
        }
      };
    }
  } catch (e) {}

  /* ---- CSS.supports ---- */
  if (!w.CSS) w.CSS = {};
  if (typeof w.CSS.supports !== 'function') {
    w.CSS.supports = function () { return false; };
  }
})(typeof window !== 'undefined' ? window : this);
