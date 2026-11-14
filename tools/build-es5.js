#!/usr/bin/env node
/**
 * build-es5.js — 函数棋 ES5 兼容构建（v8.4）
 *
 * 目标：把 files/ 下 86 个游戏脚本编译为 ES5 语法并压缩，输出到 files/es5/。
 * 原始 ES6 源码保留在 files/ 下，供后续开发；页面只加载 files/es5/。
 *
 * 设计约束（重要）：
 *  1. 「逐文件编译」，不合并打包 —— 保持每个文件是独立 <script>，
 *     从而精确保留原有的 per-file 严格模式与全局作用域语义。
 *  2. 保持 index.html 中 <script defer> 的原始顺序不变。
 *  3. 含 vendor 在内的所有脚本统一编译（katex.min.js 内含 class 等 ES2015
 *     语法，不能原样复制到 ES5 产物目录）。
 *  4. 每个产物都用 acorn ecmaVersion:5 校验，确保老引擎可解析。
 *  5. 幂等：重复执行不会产生 files/es5/es5/ 嵌套。
 *
 * 依赖（仅在构建机需要，不进仓库）：
 *   @babel/core @babel/preset-env terser acorn
 *   core-js-bundle regenerator-runtime whatwg-fetch
 *
 * 用法：
 *   NODE_PATH=<dir-with-node_modules> node tools/build-es5.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const terser = require('terser');
const acorn = require('acorn');

const REPO = path.resolve(__dirname, '..');
const GAME = path.join(REPO, 'online', 'game', 'hanshuqi');
const HTML = path.join(GAME, 'index.html');
const FILES = path.join(GAME, 'files');
const OUT = path.join(FILES, 'es5');
const SHIMS = path.join(REPO, 'tools', 'legacy-shims.js');

const BABEL_OPTS = {
  babelrc: false,
  configFile: false,
  sourceType: 'script',
  comments: false,
  compact: false,
  presets: [[require.resolve('@babel/preset-env'), {
    targets: { ie: '11' },
    modules: false,
    useBuiltIns: false,
    bugfixes: true
  }]]
};

const TERSER_OPTS = {
  ecma: 5,
  compress: { passes: 2, toplevel: false, unsafe: false },
  mangle: { toplevel: false },   // 顶层类名/函数名必须保留（被内联脚本引用）
  format: { comments: false, ascii_only: false }
};

function ensureEs5(code, label) {
  acorn.parse(code, { ecmaVersion: 5 });
  return code;
}

function readBase(pkgRelative) {
  const candidates = [
    path.resolve(process.env.NODE_PATH || '', pkgRelative),
    path.join(__dirname, 'node_modules', pkgRelative)
  ];
  try { candidates.push(require.resolve(pkgRelative)); } catch (e) {}
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return fs.readFileSync(c, 'utf8'); } catch (e) {}
  }
  throw new Error('missing dependency: ' + pkgRelative +
    ' (set NODE_PATH to the directory containing node_modules)');
}

/* 找出一个不含 src 的内联 <script> 块，避免跨块误匹配 */
function findInlineScript(htmlText, predicate) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  const all = Array.from(htmlText.matchAll(re));
  return all.find(x => predicate(x[1], x[0])) || null;
}

function originalSrc(src) {
  // 幂等：若上次已改写为 es5 路径，先还原成源路径
  return src.replace(/^files\/es5\//, 'files/');
}

function outSrc(src) {
  return src.replace(/^files\//, 'files/es5/');
}

/* ---------- 1. 提取 index.html 中的外部脚本（保持顺序） ---------- */
let html = fs.readFileSync(HTML, 'utf8');
const tagRe = /<script\s+src=["']([^"']+)["']\s+defer><\/script>/g;
const tags = Array.from(html.matchAll(tagRe));
if (!tags.length) throw new Error('no deferred script tags found');

const stats = { files: 0, srcBytes: 0, outBytes: 0, vendors: 0, failures: [] };
fs.mkdirSync(OUT, { recursive: true });

for (const m of tags) {
  const src = originalSrc(m[1]);
  const rel = src.replace(/^files\//, '');
  const inFile = path.join(FILES, rel);
  const outFile = path.join(OUT, rel);

  if (!fs.existsSync(inFile)) {
    stats.failures.push(src + ' (source missing)');
    continue;
  }
  const source = fs.readFileSync(inFile, 'utf8');
  stats.files++;
  stats.srcBytes += Buffer.byteLength(source);

  if (rel.indexOf('vendor/') === 0) stats.vendors++;
  let emitted;
  try {
    const es5 = babel.transformSync(source, BABEL_OPTS).code;
    emitted = awaitMinify(es5, src);
    ensureEs5(emitted, src);
  } catch (e) {
    stats.failures.push(src + ' (' + e.message + ')');
    emitted = source;   // 保留可诊断产物，不静默丢弃
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, emitted, 'utf8');
  stats.outBytes += Buffer.byteLength(emitted);
}

function awaitMinify(code, label) {
  // terser v5 的 minify() 是异步的；使用同步版本 minify_sync()
  const out = terser.minify_sync(code, TERSER_OPTS);
  if (!out || typeof out.code !== 'string') {
    throw new Error('terser failed on ' + label);
  }
  return out.code;
}

/* ---------- 2. polyfills.min.js ---------- */
const polyParts = [
  '/* v8.4 ES5 runtime polyfills — loaded only when a capability is missing */',
  readBase('core-js-bundle/minified.js'),
  readBase('regenerator-runtime/runtime.js'),
  readBase('whatwg-fetch/dist/fetch.umd.js'),
  fs.readFileSync(SHIMS, 'utf8')
];
let poly = polyParts.join('\n;\n');
// core-js / fetch 已是压缩产物，shims 未压缩；整体做一次保守压缩
poly = awaitMinify(poly, 'polyfills');
ensureEs5(poly, 'polyfills');
fs.writeFileSync(path.join(OUT, 'polyfills.min.js'), poly, 'utf8');
stats.polyfillBytes = Buffer.byteLength(poly);

/* ---------- 3. 改写 index.html ---------- */
// 3.1 脚本路径指向 es5 产物
html = html.replace(tagRe, (all, src) => {
  return '<script src="' + outSrc(originalSrc(src)) + '" defer></script>';
});

// 3.2 版本号
html = html.replace(/函数棋2\.0\.\d+\.\d+/, '函数棋2.0.2.0');

// 3.3 head 引导块（幂等：先删旧块再插入）
const BOOT_START = '<!-- v8.4 compat bootstrap:start -->';
const BOOT_END = '<!-- v8.4 compat bootstrap:end -->';
const bootRe = new RegExp(BOOT_START + '[\\s\\S]*?' + BOOT_END + '\\n?', 'g');
html = html.replace(bootRe, '');

const BOOT = BOOT_START + `
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<script>
/* v8.4 兼容引导：ES5 语法，必须保持为 ES5。
   - IE10 及以下 / 无 Canvas 2D：跳转静态降级页
   - IE11 及旧内核：按需加载 polyfill（现代浏览器零开销）
   - 打 data-legacy 标记供 CSS 关闭高开销装饰 */
(function () {
  var w = window, d = document, dm = d.documentMode;
  var canvasOK = false;
  try { canvasOK = !!(d.createElement('canvas').getContext); } catch (e) {}
  if ((dm && dm < 11) || !canvasOK) {
    location.replace('legacy.html' + location.search + location.hash);
    return;
  }
  var EP = (w.Element && w.Element.prototype) ? w.Element.prototype : {};
  var need = (
    typeof w.Promise !== 'function' ||
    typeof w.Map !== 'function' ||
    typeof w.Symbol !== 'function' ||
    typeof w.fetch !== 'function' ||
    typeof Object.assign !== 'function' ||
    typeof Object.entries !== 'function' ||
    !Array.prototype.includes ||
    !Array.prototype.flat ||
    !String.prototype.padStart ||
    !EP.remove ||
    !(w.NodeList && w.NodeList.prototype && w.NodeList.prototype.forEach) ||
    typeof w.CustomEvent !== 'function'
  );
  if (need) {
    d.documentElement.setAttribute('data-legacy', '1');
    /* 同步写入：保证 polyfill 一定早于所有 defer 游戏脚本执行 */
    d.write('<script src="files/es5/polyfills.min.js"><\\/script>');
  }
})();
</script>
` + BOOT_END + '\n';

html = html.replace('</head>', BOOT + '</head>');

// 3.4 内联初始化脚本 -> ES5（保持 DOMContentLoaded 时序）
const INIT_MARK = 'data-hsq="init"';
let initMatch = findInlineScript(html, function (body, full) {
  return /data-hsq="init"/.test(full) || /new GridSystem\(/.test(body);
});
if (initMatch) {
  const es5Init = babel.transformSync(initMatch[1], BABEL_OPTS).code;
  ensureEs5(es5Init, 'inline init');
  const initBlock = '<script ' + INIT_MARK + '>\n' + es5Init + '\n    </script>';
  html = html.replace(initMatch[0], initBlock);
} else {
  stats.failures.push('inline init script not found');
}

// 3.5 内联按钮增强脚本 -> 手写 ES5（不依赖 NodeList.forEach / .remove()）
const BUTTON_BLOCK = String.raw`<script data-hsq="buttons">
/* v8.4：ES5 重写，移除 NodeList.forEach / Element.remove / 自定义属性
   setProperty 的硬依赖；轻量/老设备跳过涟漪与磁性效果以省渲染开销。 */
(function () {
  var sel = '.btn, .btn-exit, .mode-btn, .btn-small, .summa-dialog-option-btn, ' +
            '.summa-dialog-skip-btn, .summa-dialog-exit-btn, ' +
            '.campaign-difficulty-grid .btn, .campaign-level-cell, ' +
            '.summa-dialog-input-buttons .btn';
  var btns = document.querySelectorAll(sel);
  var light = document.documentElement.getAttribute('data-legacy') === '1';
  var reduced = false;
  try {
    reduced = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {}
  var skipFx = light || reduced;
  var i, el, arrow;

  for (i = 0; i < btns.length; i++) {
    el = btns[i];
    if (el.hasAttribute('data-arrow') && !el.querySelector('.btn-arrow')) {
      arrow = document.createElement('span');
      arrow.className = 'btn-arrow';
      arrow.appendChild(document.createTextNode('\u2192'));
      el.appendChild(arrow);
    }
  }

  function bind(el) {
    el.addEventListener('click', function (e) {
      if (skipFx) return;
      var rect = el.getBoundingClientRect();
      var ripple = document.createElement('span');
      var size = Math.max(rect.width, rect.height);
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      el.appendChild(ripple);
      setTimeout(function () {
        if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
      }, 650);
    });
    el.addEventListener('mousemove', function (e) {
      if (skipFx || this.disabled) return;
      var r = this.getBoundingClientRect();
      try {
        this.style.setProperty('--gx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        this.style.setProperty('--gy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
        this.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) / r.width * 6).toFixed(1) + 'px');
        this.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) / r.height * 6).toFixed(1) + 'px');
      } catch (err) {}
    });
    el.addEventListener('mouseleave', function () {
      try {
        this.style.removeProperty('--gx');
        this.style.removeProperty('--gy');
        this.style.removeProperty('--mx');
        this.style.removeProperty('--my');
      } catch (err) {}
    });
  }

  for (i = 0; i < btns.length; i++) bind(btns[i]);
})();
    </script>`;

const buttonMatch = findInlineScript(html, function (body, full) {
  return /data-hsq="buttons"/.test(full) || /initButtonEnhancements/.test(body);
});
if (buttonMatch) html = html.replace(buttonMatch[0], BUTTON_BLOCK);
else stats.failures.push('inline button script not found');

// 3.6 图片：解码异步；装饰图懒加载（幂等）
html = html.replace(/<img\b([^>]*)>/g, function (all, attrs) {
  if (/decoding=/.test(attrs)) return all;
  var selfClose = /\/\s*$/.test(attrs);
  var clean = attrs.replace(/\/\s*$/, '');
  var lazy = /summa-emoji-pop-img|leaderboard-open-icon|summa-dialog-icon/.test(clean)
    ? ' loading="lazy"' : '';
  return '<img' + clean + ' decoding="async"' + lazy + (selfClose ? ' /' : '') + '>';
});

// 3.7 无脚本提示
if (!/<noscript>/.test(html)) {
  html = html.replace('<body>', '<body>\n    <noscript><div style="padding:16px;font:16px/1.6 sans-serif;color:#7a2038">' +
    '函数棋需要启用 JavaScript 才能运行，请在浏览器设置中开启后刷新页面。</div></noscript>');
}

fs.writeFileSync(HTML, html, 'utf8');

/* ---------- 4. 输出统计 ---------- */
stats.scriptTags = tags.length;
stats.savedJsBytes = stats.srcBytes - stats.outBytes;
stats.savedJsPercent = stats.srcBytes
  ? +(stats.savedJsBytes * 100 / stats.srcBytes).toFixed(1) : 0;
fs.writeFileSync(path.join(__dirname, 'build-es5.stats.json'),
  JSON.stringify(stats, null, 2), 'utf8');

console.log(JSON.stringify(stats, null, 2));
if (stats.failures.length) {
  console.error('BUILD HAS FAILURES');
  process.exitCode = 1;
}
