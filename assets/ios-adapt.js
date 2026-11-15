/*!
 * ios-adapt.js — iOS / iPhone X-and-later device marker (v8.8)
 *
 * Runs synchronously in <head>, before every other script. ES5, zero
 * dependencies, no listeners and no timers.
 *
 *   data-ios="1"        iPhone / iPad / iPod, plus iPadOS 13+ desktop-UA
 *   data-ios-notch="1"  full-screen devices with a real safe area
 *                       (notch / Dynamic Island / Home Indicator)
 *
 * The notch test reads the *computed* env(safe-area-inset-*) value instead of
 * hard-coding screen sizes: iPhone X portrait reports >= 44px at the top,
 * classic iPhones report 20px, and iPad Pro reports a bottom inset. This
 * requires viewport-fit=cover, which every page now sets.
 *
 * All visual consequences live in assets/ios-adapt.css. Non-iOS devices are
 * completely untouched.
 */
(function (w, d) {
  var r = d.documentElement;
  if (!r || !r.setAttribute || !w.navigator) return;

  var nav = w.navigator;
  var ua = nav.userAgent || '';
  var ios = /iPhone|iPad|iPod/i.test(ua) ||
            (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  if (!ios) return;

  r.setAttribute('data-ios', '1');

  try {
    var probe = d.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:constant(safe-area-inset-top);' +
      'padding-top:env(safe-area-inset-top,0px);' +
      'padding-bottom:constant(safe-area-inset-bottom);' +
      'padding-bottom:env(safe-area-inset-bottom,0px);';
    r.appendChild(probe);
    var cs = w.getComputedStyle(probe);
    var top = parseFloat(cs.paddingTop) || 0;
    var bottom = parseFloat(cs.paddingBottom) || 0;
    r.removeChild(probe);
    /* >=44px is a notch/Dynamic Island top inset; >0 bottom means a Home
       Indicator. Either one means full-screen safe-area handling is needed. */
    if (top >= 44 || bottom > 0) r.setAttribute('data-ios-notch', '1');
  } catch (e) {
    /* getComputedStyle/env unavailable: keep the basic iOS marker only. */
  }
})(window, document);
