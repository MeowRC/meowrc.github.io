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

  /* ---- rendering tier -------------------------------------------------
     iOS exposes neither deviceMemory nor a trustworthy hardwareConcurrency
     (Safari reports a fixed low value), so the physical pixel area of the
     panel is used as the capability proxy:

       iPad / iPadOS (any panel)              -> full  (large, always recent)
       iPhone with >= 2.9M physical pixels    -> full  (iPhone 12 and later)
       other iPhones (8 / SE2 / SE3 / X / XS
       / XR / 11 / 12 mini)                   -> lite

     "iPhone 9" was never released: Apple went from iPhone 8 straight to
     iPhone X. "iPhone 9 and later" is therefore handled as "iPhone X and
     later", which this split covers together with the older iPhone 8/SE. */
  var sw = (w.screen && w.screen.width) || w.innerWidth || 0;
  var sh = (w.screen && w.screen.height) || w.innerHeight || 0;
  var dpr = w.devicePixelRatio || 1;
  var physics = sw * sh * dpr * dpr;
  var iPad = /iPad/i.test(ua) ||
             (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1 &&
              Math.min(sw, sh) >= 744);
  var reduced = false;
  try { reduced = !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch (e2) {}

  var lite = reduced || (!iPad && physics > 0 && physics < 2900000);
  r.setAttribute('data-ios-tier', lite ? 'lite' : 'full');
})(window, document);
