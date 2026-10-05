/* ==========================================================================
   MeowRc Blog — Aesthetic Layer (动效脚本)
   与 aesthetic.css 配套。全部为渐进增强：
   不支持 / 关闭动效时页面保持原有行为，不会白屏。
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  function mq(q) {
    return (window.matchMedia && window.matchMedia(q)) ? window.matchMedia(q) : { matches: false };
  }

  var reduced = mq('(prefers-reduced-motion: reduce)').matches;
  var finePointer = mq('(pointer: fine)').matches;
  var coarse = mq('(pointer: coarse)').matches;
  var lowEnd = (navigator.hardwareConcurrency || 4) <= 2;
  var isTouch = coarse || !finePointer;

  /* 开启增强层的可见性前缀（避免无 JS 时内容被隐藏） */
  root.classList.add('fx-on');

  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel));
  }
  function make(tag, cls) {
    var n = doc.createElement(tag);
    if (cls) { n.className = cls; }
    return n;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  var raf_ = (window.requestAnimationFrame && window.requestAnimationFrame.bind(window)) ||
             function (f) { return setTimeout(f, 16); };

  /* ---------------------------------------------------------------- 装饰层 */
  function buildDecor() {
    if (reduced) { return; }

    var aurora = make('div', 'fx-aurora');
    aurora.setAttribute('aria-hidden', 'true');
    aurora.appendChild(make('i'));
    aurora.appendChild(make('i'));
    if (!lowEnd) { aurora.appendChild(make('i')); }
    doc.body.insertBefore(aurora, doc.body.firstChild);

    var grain = make('div', 'fx-grain');
    grain.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(grain);
  }

  /* ------------------------------------------------------------ 滚动进度条 */
  function buildProgress() {
    var bar = make('div', 'fx-progress');
    bar.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(bar);
    return bar;
  }

  /* ---------------------------------------------------------------- 入场 */
  function initReveal() {
    var els = $$('[data-reveal]');
    var heads = $$('.section-head');
    if (!els.length && !heads.length) { return; }

    /* 按父级分组设置错峰延迟（用 --fx-d，避开页面自带的 --reveal-delay） */
    var counters = [];
    var lastParent = null;
    var idx = 0;
    els.forEach(function (el) {
      var p = el.parentNode;
      if (p !== lastParent) { lastParent = p; idx = 0; }
      el.style.setProperty('--fx-d', Math.min(idx * 90, 450) + 'ms');
      idx++;
    });

    if (reduced || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('fx-in', 'fx-done'); });
      heads.forEach(function (h) { h.classList.add('fx-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        var t = entry.target;
        t.classList.add('fx-in');
        if (t.hasAttribute('data-reveal')) {
          setTimeout(function () { t.classList.add('fx-done'); }, 1400);
        }
        io.unobserve(t);
      });
    }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });

    els.forEach(function (el) { io.observe(el); });
    heads.forEach(function (h) { io.observe(h); });
  }

  /* ------------------------------------------------- 卡片光斑 + 3D 倾斜 */
  function initTilt() {
    if (reduced || isTouch || lowEnd) { return; }
    var hosts = $$('.card, .dl-card');
    if (!hosts.length) { return; }

    hosts.forEach(function (h) {
      h.setAttribute('data-fx', '');
      h.setAttribute('data-fx-tilt', '');

      var spot = make('span', 'fx-spot');
      spot.setAttribute('aria-hidden', 'true');
      h.appendChild(spot);

      var rect = null;
      var lift = h.classList.contains('dl-card') ? 0 : -5;

      function enter() {
        rect = h.getBoundingClientRect();
        h.classList.add('fx-tilting');
      }
      function move(e) {
        if (!rect) { rect = h.getBoundingClientRect(); }
        var px = (e.clientX - rect.left) / rect.width;
        var py = (e.clientY - rect.top) / rect.height;
        h.style.setProperty('--fx-mx', (px * 100).toFixed(2) + '%');
        h.style.setProperty('--fx-my', (py * 100).toFixed(2) + '%');
        var rx = (0.5 - py) * 5.2;
        var ry = (px - 0.5) * 6;
        h.style.transform =
          'perspective(950px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) ' +
          'translate3d(0,' + lift + 'px,0) scale(1.012)';
      }
      function leave() {
        rect = null;
        h.classList.remove('fx-tilting');
        h.style.transform = '';
      }

      h.addEventListener('mouseenter', enter);
      h.addEventListener('mousemove', move);
      h.addEventListener('mouseleave', leave);
    });
  }

  /* -------------------------------------------------------------- 磁吸按钮 */
  function initMagnet() {
    if (reduced || isTouch) { return; }
    /* 注意：.scroll-hint 依赖 translateX(-50%) 居中，不参与磁吸，否则会跑偏 */
    var sels = '.social-link, .dl-btn';
    $$('.social-link').forEach(function (el) { el.classList.add('fx-sheen'); });
    $$('.dl-btn').forEach(function (el) { el.classList.add('fx-sheen'); });

    $$(sels).forEach(function (el) {
      el.setAttribute('data-fx-magnet', '');
      var rect = null;

      el.addEventListener('mouseenter', function () {
        rect = el.getBoundingClientRect();
        el.classList.add('fx-magneting');
      });
      el.addEventListener('mousemove', function (e) {
        if (!rect) { rect = el.getBoundingClientRect(); }
        var px = (e.clientX - rect.left) / rect.width - .5;
        var py = (e.clientY - rect.top) / rect.height - .5;
        el.style.transform =
          'translate3d(' + (px * 12).toFixed(2) + 'px,' + (py * 12 - 3).toFixed(2) + 'px,0) scale(1.03)';
      });
      el.addEventListener('mouseleave', function () {
        rect = null;
        el.classList.remove('fx-magneting');
        el.style.transform = '';
      });
    });
  }

  /* ------------------------------------------------------------------ 涟漪 */
  function initRipple() {
    if (reduced) { return; }
    var hosts = $$('.social-link, .dl-btn, .icon-btn, .nav-links a');
    hosts.forEach(function (h) { h.classList.add('fx-ripple-host'); });

    doc.addEventListener('pointerdown', function (e) {
      var t = e.target;
      while (t && t !== doc) {
        if (t.classList && t.classList.contains('fx-ripple-host')) { break; }
        t = t.parentNode;
      }
      if (!t || t === doc) { return; }

      var r = t.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 2.4;
      var rip = make('span', 'fx-ripple');
      rip.setAttribute('aria-hidden', 'true');
      rip.style.width = rip.style.height = size + 'px';
      rip.style.left = (e.clientX - r.left) + 'px';
      rip.style.top = (e.clientY - r.top) + 'px';
      t.appendChild(rip);
      setTimeout(function () {
        if (rip.parentNode) { rip.parentNode.removeChild(rip); }
      }, 750);
    });
  }

  /* ------------------------------------------------------------ 自定义光标 */
  function initCursor() {
    if (reduced || isTouch || !finePointer) { return; }

    var ring = make('div', 'fx-cursor');
    var dot = make('div', 'fx-cursor-dot');
    ring.setAttribute('aria-hidden', 'true');
    dot.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(ring);
    doc.body.appendChild(dot);
    /* 首次移动前先隐藏，避免光标圈停在左上角 */
    ring.style.opacity = '0';
    dot.style.opacity = '0';

    var tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    var cx = tx, cy = ty;
    var raf = 0;
    var seen = false;

    function loop() {
      var dx = tx - cx, dy = ty - cy;
      cx += dx * .18;
      cy += dy * .18;
      ring.style.transform = 'translate3d(' + (cx - 17).toFixed(1) + 'px,' + (cy - 17).toFixed(1) + 'px,0)';
      if (Math.abs(dx) > .3 || Math.abs(dy) > .3) {
        raf = raf_(loop);
      } else {
        raf = 0;
      }
    }

    doc.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      dot.style.transform = 'translate3d(' + (tx - 2.5) + 'px,' + (ty - 2.5) + 'px,0)';
      if (!seen) {
        seen = true;
        ring.style.opacity = '';
        dot.style.opacity = '';
      }
      if (!raf) { raf = raf_(loop); }
    }, { passive: true });

    doc.addEventListener('mouseover', function (e) {
      var t = e.target, hit = false;
      while (t && t !== doc) {
        var tag = t.tagName;
        if (tag === 'A' || tag === 'BUTTON') { hit = true; break; }
        if (t.classList && (t.classList.contains('card') || t.classList.contains('dl-card'))) { hit = true; break; }
        t = t.parentNode;
      }
      ring.classList.toggle('is-active', !!hit);
    }, { passive: true });

    doc.addEventListener('mouseleave', function () {
      ring.style.opacity = '0';
      dot.style.opacity = '0';
    });
    doc.addEventListener('mouseenter', function () {
      ring.style.opacity = '';
      dot.style.opacity = '';
    });
  }

  /* ------------------------------------------------------------ 视差 & 进度 */
  function initScrollFx(bar) {
    var heroInner = doc.querySelector('.hero-inner') || doc.querySelector('.page-hero-inner');
    var heroEl = doc.querySelector('.hero') || doc.querySelector('.page-hero');
    var particles = doc.querySelector('.hero-particles');
    var ticking = false;

    function apply() {
      ticking = false;
      var y = window.pageYOffset || doc.documentElement.scrollTop || 0;

      /* 进度条 */
      var h = doc.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? clamp(y / h, 0, 1) : 0;
      if (bar) { bar.style.transform = 'scaleX(' + p.toFixed(4) + ')'; }

      if (reduced) { return; }

      /* Hero 视差 */
      if (heroEl && heroInner) {
        var hh = heroEl.offsetHeight || 1;
        if (y < hh + 120) {
          var k = y / hh;
          heroInner.style.transform = 'translate3d(0,' + (y * .22).toFixed(1) + 'px,0)';
          heroInner.style.opacity = String(clamp(1 - k * .85, 0, 1));
          if (particles) {
            particles.style.transform = 'translate3d(0,' + (y * .38).toFixed(1) + 'px,0)';
          }
        }
      }
    }

    window.addEventListener('scroll', function () {
      if (ticking) { return; }
      ticking = true;
      requestAnimationFrame(apply);
    }, { passive: true });

    window.addEventListener('resize', function () {
      if (ticking) { return; }
      ticking = true;
      requestAnimationFrame(apply);
    }, { passive: true });

    apply();
  }

  /* -------------------------------------------------------------- 导航胶囊 */
  function initNavPill() {
    var list = doc.getElementById('navLinks');
    if (!list) { return; }

    var pill = make('span', 'fx-nav-pill');
    pill.setAttribute('aria-hidden', 'true');
    list.appendChild(pill);
    list.classList.add('fx-has-pill');

    function place() {
      var active = list.querySelector('a.active');
      if (!active || window.innerWidth <= 720) {
        pill.style.opacity = '0';
        pill.style.height = '0';
        return;
      }
      var lr = list.getBoundingClientRect();
      var ar = active.getBoundingClientRect();
      if (!ar.width) { pill.style.opacity = '0'; return; }
      pill.style.width = ar.width + 'px';
      pill.style.height = ar.height + 'px';
      pill.style.transform = 'translate3d(' + (ar.left - lr.left) + 'px,' + (ar.top - lr.top) + 'px,0)';
      pill.style.opacity = '1';
    }

    place();
    window.addEventListener('resize', place, { passive: true });
    window.addEventListener('scroll', function () {
      if (!initNavPill._t) {
        initNavPill._t = setTimeout(function () { initNavPill._t = 0; place(); }, 120);
      }
    }, { passive: true });

    if ('MutationObserver' in window) {
      var mo = new MutationObserver(place);
      $$('a', list).forEach(function (a) {
        mo.observe(a, { attributes: true, attributeFilter: ['class'] });
      });
    }
  }

  /* ------------------------------------------------------------ 主题切换光晕 */
  function initThemeFlash() {
    var btn = doc.getElementById('themeToggle');
    if (!btn || reduced) { return; }

    btn.addEventListener('click', function () {
      var r = btn.getBoundingClientRect();
      var f = make('div', 'fx-flash');
      f.setAttribute('aria-hidden', 'true');
      f.style.left = (r.left + r.width / 2) + 'px';
      f.style.top = (r.top + r.height / 2) + 'px';
      doc.body.appendChild(f);
      setTimeout(function () {
        if (f.parentNode) { f.parentNode.removeChild(f); }
      }, 950);

      btn.classList.remove('fx-spin');
      void btn.offsetWidth;
      btn.classList.add('fx-spin');
      setTimeout(function () { btn.classList.remove('fx-spin'); }, 750);
    });
  }

  /* -------------------------------------------------------- Hero 新增粒子 */
  function initParticles() {
    var wrap = doc.querySelector('.hero-particles');
    if (!wrap || reduced) { return; }

    var frag = doc.createDocumentFragment();
    var n = lowEnd ? 6 : 14;
    for (var i = 0; i < n; i++) {
      var p = make('i');
      var s = (3 + Math.random() * 7).toFixed(1);
      p.style.width = s + 'px';
      p.style.height = s + 'px';
      p.style.left = (Math.random() * 96).toFixed(2) + '%';
      p.style.top = (18 + Math.random() * 76).toFixed(2) + '%';
      p.style.animationDelay = (Math.random() * 10).toFixed(2) + 's';
      p.style.animationDuration = (9 + Math.random() * 9).toFixed(2) + 's';
      frag.appendChild(p);
    }
    wrap.appendChild(frag);
  }

  /* ------------------------------------------------------------------ 启动 */
  function boot() {
    buildDecor();
    var bar = buildProgress();
    initReveal();
    initTilt();
    initMagnet();
    initRipple();
    initCursor();
    initScrollFx(bar);
    initNavPill();
    initThemeFlash();
    initParticles();
  }

  try {
    boot();
  } catch (err) {
    /* 增强层出错时，确保内容可见，不影响原页面 */
    $$('[data-reveal]').forEach(function (el) { el.classList.add('fx-in', 'fx-done'); });
  }
})();
