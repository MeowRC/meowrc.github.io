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

  /* ------------------------------------------------------ 临界阻尼弹簧引擎
     跟手类动效（倾斜 / 磁吸 / 光标 / 视差）统一由它逐帧驱动：
     CSS transition 每帧被打断重启会产生顿挫，弹簧则是连续积分，观感圆滑。
     公式：vel = (vel + (target - cur) * k) * damp;  cur += vel;
     k 越大越快跟手，damp 越小越快止住（越小越稳、越大越弹）。          */
  var springs = [];
  var springRaf = 0;

  function makeSpring(init, k, damp, eps, apply, onRest) {
    var n = init.length;
    var s = {
      v: init.slice(),
      t: init.slice(),
      vel: [],
      eps: (typeof eps === 'number') ? (function () {
        var a = []; for (var i = 0; i < n; i++) { a.push(eps); } return a;
      })() : eps.slice(),
      k: k, damp: damp, apply: apply, onRest: onRest,
      active: false, resting: false
    };
    for (var j = 0; j < n; j++) { s.vel.push(0); }
    springs.push(s);
    return s;
  }

  /* 设定目标值：undefined 表示该维度保持不变 */
  function springTo(s, arr) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] !== undefined) { s.t[i] = arr[i]; }
    }
    s.active = true;
    s.resting = false;
    if (!springRaf) { springRaf = raf_(springStep); }
  }

  /* 直接落位（首帧 / 尺寸变化时用，避免从 0 弹一次） */
  function springSnap(s, arr) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] !== undefined) { s.t[i] = arr[i]; s.v[i] = arr[i]; s.vel[i] = 0; }
    }
    s.active = false;
    s.apply(s.v);
  }

  /* 回到静止态：到位后执行收尾（清掉内联 transform / will-change） */
  function springRest(s, arr, done) {
    s.onRest = done;
    s.resting = true;
    springTo(s, arr);
  }

  function springStep() {
    var alive = false;
    for (var i = 0; i < springs.length; i++) {
      var s = springs[i];
      if (!s.active) { continue; }
      var moving = false;
      for (var j = 0; j < s.v.length; j++) {
        var d = s.t[j] - s.v[j];
        if (Math.abs(d) > s.eps[j] || Math.abs(s.vel[j]) > s.eps[j]) {
          s.vel[j] = (s.vel[j] + d * s.k) * s.damp;
          s.v[j] += s.vel[j];
          moving = true;
        } else {
          s.v[j] = s.t[j];
          s.vel[j] = 0;
        }
      }
      s.apply(s.v);
      if (moving) {
        alive = true;
      } else {
        s.active = false;
        if (s.resting) { s.resting = false; if (s.onRest) { s.onRest(); } }
      }
    }
    springRaf = alive ? raf_(springStep) : 0;
  }

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

  /* --------------------------------------------------- Hero 漂浮光球 */
  function buildHeroOrb() {
    if (reduced) { return; }
    var hero = doc.querySelector('.hero') || doc.querySelector('.page-hero');
    if (!hero) { return; }
    var orb = make('div', 'fx-hero-orb');
    orb.setAttribute('aria-hidden', 'true');
    hero.insertBefore(orb, hero.firstChild);
  }

  /* --------------------------------------------------- Hero 漂浮光球 */
  function buildHeroOrb() {
    if (reduced) { return; }
    var hero = doc.querySelector('.hero') || doc.querySelector('.page-hero');
    if (!hero) { return; }
    var orb = make('div', 'fx-hero-orb');
    orb.setAttribute('aria-hidden', 'true');
    hero.insertBefore(orb, hero.firstChild);
  }

  /* ------------------------------------------------------------ 滚动进度条 */
  function buildProgress() {
    var bar = make('div', 'fx-progress');
    bar.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(bar);
    return bar;
  }

  /* ---------------------------------------------------------------- 入场 */
  /* 入场闸门：加载页退场后才统一放行，避免内容在遮罩下白白播完 */
  var gateOpen = false;
  var pending = [];

  function revealEl(t) {
    t.classList.add('fx-in');
    if (t.hasAttribute('data-reveal')) {
      setTimeout(function () { t.classList.add('fx-done'); }, 1500);
    }
    /* 卡片子元素的分层动画播完后卸载，交还给页面自身的 hover 规则。
       无条件添加：无加载页时入场可能早于 data-fx 注入，不能靠属性判断。 */
    setTimeout(function () { t.classList.add('fx-settled'); }, 1700);
  }

  function openGate() {
    if (gateOpen) { return; }
    gateOpen = true;
    /* 加载页光圈打开时，已在视口内的元素依次放行，形成一道自上而下的瀑布，
       而不是「唰」地一起弹出 */
    for (var i = 0; i < pending.length; i++) {
      (function (t, k) {
        setTimeout(function () { revealEl(t); }, Math.min(k * 75, 480));
      })(pending[i], i);
    }
    pending.length = 0;
  }

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
      openGate();
      els.forEach(function (el) { el.classList.add('fx-in', 'fx-done'); });
      heads.forEach(function (h) { h.classList.add('fx-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        var t = entry.target;
        io.unobserve(t);
        if (!gateOpen) { pending.push(t); return; }
        revealEl(t);
      });
    }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });

    els.forEach(function (el) { io.observe(el); });
    heads.forEach(function (h) { io.observe(h); });
  }

  /* ------------------------------------------------------ 卡片入场光扫元素 */
  function initSweep() {
    if (reduced) { return; }
    $$('.card, .dl-card').forEach(function (h) {
      h.setAttribute('data-fx', '');
      var sweep = make('span', 'fx-sweep');
      sweep.setAttribute('aria-hidden', 'true');
      h.appendChild(sweep);
    });
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
      var lift0 = h.classList.contains('dl-card') ? 0 : -6;

      /* 维度：rx, ry, 光斑x%, 光斑y%, 抬升px, 缩放 */
      var s = makeSpring(
        [0, 0, 50, 50, 0, 1],
        .14, .70,
        [.008, .008, .04, .04, .03, .0004],
        function (v) {
          h.style.setProperty('--fx-mx', v[2].toFixed(2) + '%');
          h.style.setProperty('--fx-my', v[3].toFixed(2) + '%');
          h.style.setProperty('--fx-sx', (-v[1] * 1.6).toFixed(2) + 'px');
          h.style.setProperty('--fx-sy', (v[0] * 1.6).toFixed(2) + 'px');
          h.style.transform =
            'perspective(950px) rotateX(' + v[0].toFixed(3) + 'deg) rotateY(' + v[1].toFixed(3) + 'deg) ' +
            'translate3d(0,' + v[4].toFixed(2) + 'px,0) scale(' + v[5].toFixed(4) + ')';
        },
        function () {
          /* 完全静止后再摘掉内联 transform 与合成层，交还给页面自身的 hover 规则 */
          h.classList.remove('fx-tilting');
          h.style.transform = '';
        }
      );

      h.addEventListener('mouseenter', function () {
        rect = h.getBoundingClientRect();
        h.classList.add('fx-tilting');
      });

      h.addEventListener('mousemove', function (e) {
        if (!rect) { rect = h.getBoundingClientRect(); }
        var px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        var py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
        springTo(s, [
          (0.5 - py) * 6.4,        /* rotateX */
          (px - 0.5) * 7.2,        /* rotateY */
          px * 100, py * 100,      /* 光斑位置 */
          lift0,                   /* 抬升 */
          1.014                    /* 轻微放大 */
        ]);
      });

      h.addEventListener('mouseleave', function () {
        rect = null;
        springRest(s, [0, 0, 50, 50, 0, 1]);
      });

      var REST = [undefined, undefined, undefined, undefined, lift0 * .3, .982];
      var LIVE = [undefined, undefined, undefined, undefined, lift0, 1.014];
      h.addEventListener('pointerdown', function () { springTo(s, REST); });
      h.addEventListener('pointerup', function () { springTo(s, LIVE); });
      h.addEventListener('pointercancel', function () { springTo(s, LIVE); });
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

      /* 维度：x位移, y位移, 缩放 */
      var s = makeSpring(
        [0, 0, 1],
        .18, .62,
        [.02, .02, .0006],
        function (v) {
          el.style.transform =
            'translate3d(' + v[0].toFixed(2) + 'px,' + v[1].toFixed(2) + 'px,0) scale(' + v[2].toFixed(4) + ')';
        },
        function () {
          el.classList.remove('fx-magneting');
          el.style.transform = '';
        }
      );

      el.addEventListener('mouseenter', function () {
        rect = el.getBoundingClientRect();
        el.classList.add('fx-magneting');
      });

      el.addEventListener('mousemove', function (e) {
        if (!rect) { rect = el.getBoundingClientRect(); }
        var px = (e.clientX - rect.left) / rect.width - .5;
        var py = (e.clientY - rect.top) / rect.height - .5;
        springTo(s, [px * 13, py * 13 - 3, 1.035]);
      });

      el.addEventListener('mouseleave', function () {
        rect = null;
        springRest(s, [0, 0, 1]);
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

    var ringEl = make('div', 'fx-cursor');
    var dot = make('div', 'fx-cursor-dot');
    ringEl.setAttribute('aria-hidden', 'true');
    dot.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(ringEl);
    doc.body.appendChild(dot);
    /* 首次移动前先隐藏，避免光标圈停在左上角 */
    ringEl.style.opacity = '0';
    dot.style.opacity = '0';

    var cx = window.innerWidth / 2;
    var cy = window.innerHeight / 2;
    var seen = false;

    /* 圆环：低刚度 + 高阻尼 = 绵长的拖尾；缩放单独一维度，按下时轻缩 */
    var ring = makeSpring(
      [cx, cy, 1],
      .11, .76,
      [.25, .25, .0012],
      function (v) {
        ringEl.style.transform =
          'translate3d(' + v[0].toFixed(1) + 'px,' + v[1].toFixed(1) + 'px,0) scale(' + v[2].toFixed(3) + ')';
      }
    );
    springSnap(ring, [cx, cy, 1]);

    doc.addEventListener('mousemove', function (e) {
      /* 圆点几乎不延迟，保证指针的精确感 */
      dot.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
      springTo(ring, [e.clientX, e.clientY]);
      if (!seen) {
        seen = true;
        ringEl.style.opacity = '';
        dot.style.opacity = '';
      }
    }, { passive: true });

    doc.addEventListener('pointerdown', function () { springTo(ring, [undefined, undefined, .78]); });
    doc.addEventListener('pointerup', function () { springTo(ring, [undefined, undefined, 1]); });

    doc.addEventListener('mouseover', function (e) {
      var t = e.target, hit = false;
      while (t && t !== doc) {
        var tag = t.tagName;
        if (tag === 'A' || tag === 'BUTTON') { hit = true; break; }
        if (t.classList && (t.classList.contains('card') || t.classList.contains('dl-card'))) { hit = true; break; }
        t = t.parentNode;
      }
      /* 悬停可交互元素时，圆环缓慢胀大（由 spring 缩放，不涉及宽高，始终居中） */
      springTo(ring, [undefined, undefined, hit ? 1.6 : 1]);
      if (hit) { ringEl.classList.add('is-active'); }
      else { ringEl.classList.remove('is-active'); }
    }, { passive: true });

    doc.addEventListener('mouseleave', function () {
      ringEl.style.opacity = '0';
      dot.style.opacity = '0';
    });
    doc.addEventListener('mouseenter', function () {
      ringEl.style.opacity = '';
      dot.style.opacity = '';
    });
  }

  /* ------------------------------------------------------------ 视差 & 进度 */
  function initScrollFx(bar) {
    var heroInner = doc.querySelector('.hero-inner') || doc.querySelector('.page-hero-inner');
    var heroEl = doc.querySelector('.hero') || doc.querySelector('.page-hero');
    var particles = doc.querySelector('.hero-particles');
    var ticking = false;
    var started = false;

    /* 视差：跟随滚动位置但慢半拍，弹簧让停滚时也有一段柔和的收尾 */
    var par = (reduced || !heroEl || !heroInner) ? null : makeSpring(
      [0], .14, .74, [.04],
      function (v) {
        var y = v[0];
        var hh = heroEl.offsetHeight || 1;
        if (y > hh + 160) { return; }
        heroInner.style.transform = 'translate3d(0,' + (y * .2).toFixed(2) + 'px,0)';
        heroInner.style.opacity = String(clamp(1 - (y / hh) * .8, 0, 1));
        if (particles) {
          particles.style.transform = 'translate3d(0,' + (y * .34).toFixed(2) + 'px,0)';
        }
      }
    );

    /* 进度条：刚度偏大，跟手但不生硬 */
    var prog = bar ? makeSpring(
      [0], .3, .68, [.0006],
      function (v) { bar.style.transform = 'scaleX(' + v[0].toFixed(4) + ')'; }
    ) : null;

    function apply() {
      ticking = false;
      var y = window.pageYOffset || doc.documentElement.scrollTop || 0;

      var h = doc.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? clamp(y / h, 0, 1) : 0;
      if (prog) {
        if (started) { springTo(prog, [p]); } else { springSnap(prog, [p]); }
      }

      if (!par) { started = true; return; }
      if (started) { springTo(par, [y]); } else { springSnap(par, [y]); }   /* 首帧直接落位 */
      started = true;
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
    var n = lowEnd ? 5 : 10;
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

  /* -------------------------------------------------------------- 加载页编排 */
  function initLoader() {
    var loader = doc.getElementById('loader');
    if (!loader || reduced) { openGate(); return; }

    var logo = loader.querySelector('.loader-logo');
    if (logo) { logo.classList.add('fx-logo'); }

    var halo = make('div', 'fx-load-halo');
    var ring = make('div', 'fx-load-ring');
    var ring2 = make('div', 'fx-load-ring-2');
    halo.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    ring2.setAttribute('aria-hidden', 'true');
    loader.insertBefore(halo, loader.firstChild);
    loader.insertBefore(ring, loader.firstChild);
    loader.insertBefore(ring2, loader.firstChild);

    var dots = make('div', 'fx-load-dots');
    dots.setAttribute('aria-hidden', 'true');
    dots.appendChild(make('i'));
    dots.appendChild(make('i'));
    dots.appendChild(make('i'));
    loader.appendChild(dots);

    /* 各变体退场标记不同：index 用 is-out，apple / legacy 用 slide-out */
    var OUT = ['is-out', 'slide-out'];
    var done = false;

    function isOut() {
      for (var i = 0; i < OUT.length; i++) {
        if (loader.classList.contains(OUT[i])) { return true; }
      }
      return false;
    }

    function startExit() {
      if (done) { return; }
      done = true;
      if (poll) { clearInterval(poll); }
      if (mo) { mo.disconnect(); }
      /* 低端设备跳过光圈收缩（全屏 blur 开销大），直接沿用页面自带的淡出 */
      if (lowEnd) { openGate(); return; }
      loader.classList.add('fx-out');
      setTimeout(openGate, 380);              /* 光圈收缩露出页面后再放行内容 */
    }

    /* MutationObserver 即时捕获，退场动画才有完整的 1.12s 可跑 */
    var mo = null;
    if ('MutationObserver' in window) {
      mo = new MutationObserver(function () {
        if (!loader.isConnected) { startExit(); return; }
        if (isOut()) { startExit(); }
      });
      mo.observe(loader, { attributes: true, attributeFilter: ['class'] });
    }

    var ticks = 0;
    var poll = setInterval(function () {
      ticks++;
      if (!loader.isConnected) { startExit(); openGate(); return; }
      if (isOut()) { startExit(); return; }
      if (ticks > 100) { clearInterval(poll); openGate(); }   /* 兜底，约 18s */
    }, 180);
  }

  /* ------------------------------------------------------------------ 启动 */
  function boot() {
    buildDecor();
    buildHeroOrb();
    var bar = buildProgress();
    initLoader();
    /* 先给卡片挂上 data-fx，再开启入场观察，保证子层动画与落定逻辑生效 */
    initSweep();
    initTilt();
    initReveal();
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
    openGate();
    $$('[data-reveal]').forEach(function (el) { el.classList.add('fx-in', 'fx-done'); });
    $$('.section-head').forEach(function (h) { h.classList.add('fx-in'); });
  }
})();
