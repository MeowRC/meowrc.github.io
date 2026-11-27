/*!
 * compat-detect.js — legacy engine capability probe (v10)
 *
 * Runs synchronously in <head>, before any stylesheet or script. ES3 syntax
 * only, no listeners, no timers, no dependencies.
 *
 * CSS @supports cannot distinguish flex `gap` from grid `gap`: EdgeHTML 18
 * and Chrome 57~83 support Grid (so `@supports not (display:grid)` is false)
 * but ignore `gap` on flex containers. This probe measures an actual two-item
 * flex row and marks the document only when the spacing is missing.
 *
 *   data-no-flex-gap="1"  -> compat-android7.css restores margins
 *
 * Capable engines are completely untouched.
 */
(function (w, d) {
  var r = d.documentElement;
  if (!r || !r.setAttribute || !d.createElement) return;

  try {
    var box = d.createElement('div');
    var a = d.createElement('i');
    var b = d.createElement('i');
    box.style.cssText = 'display:-webkit-box;display:flex;gap:10px;' +
      'position:absolute;left:-9999px;top:0;visibility:hidden';
    a.style.cssText = 'display:block;width:1px;height:1px;font-size:0';
    b.style.cssText = a.style.cssText;
    box.appendChild(a);
    box.appendChild(b);
    r.appendChild(box);
    var measured = b.getBoundingClientRect().left - a.getBoundingClientRect().right;
    r.removeChild(box);
    if (measured < 9) r.setAttribute('data-no-flex-gap', '1');
  } catch (e) {
    /* No layout API at all: assume the oldest path. */
    try { r.setAttribute('data-no-flex-gap', '1'); } catch (e2) {}
  }
})(window, document);
