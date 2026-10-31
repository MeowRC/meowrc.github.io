/**
 * CompatManager —— 老旧设备 / 弱网 / 无障碍兼容层
 *
 * 目标：在不改变正常设备体验的前提下，为老旧设备提供更稳的运行环境：
 *  - 检测 reduced-motion（系统「减少动态效果」偏好）
 *  - 检测低端设备（低核心数 / 低内存 / 老 Android），开启「轻量模式」
 *  - 检测 WebRTC / Web Audio 支持情况，供联机 / 音频模块优雅降级
 *  - 限制 devicePixelRatio，降低高分屏下的填充率压力
 *  - 页面不可见时暂停背景音乐，回到可见时恢复（节省 CPU / 电量）
 *  - 向 <html> 打 data-compat / data-reduced-motion 标记，供 CSS 按需降配
 *
 * 设计原则：全程 try/catch 包裹，任何检测失败都退化为「完整模式」，绝不抛错阻断游戏。
 */
(function () {
  'use strict';
  var Compat = window.Compat || {};

  try {
    var nav = (typeof navigator !== 'undefined') ? navigator : {};
    var ua = nav.userAgent || '';
    var doc = (typeof document !== 'undefined') ? document : null;

    /* 1) 系统「减少动态效果」偏好 */
    var reduced = false;
    try {
      if (window.matchMedia) {
        reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
    } catch (e) { /* 忽略 */ }
    Compat.reducedMotion = reduced;

    /* 2) 低端设备检测（保守策略，宁可少判不可误判） */
    var cores = nav.hardwareConcurrency || 0;          // 逻辑核心数
    var mem = nav.deviceMemory || 0;                   // 设备内存(GB)，仅 Chromium 系
    var oldAndroid = false;
    var m = /Android\s([0-9]+)/.exec(ua);
    if (m && parseInt(m[1], 10) < 8) oldAndroid = true; // Android 8 以下视为老旧
    var tinyScreen = (window.screen &&
      Math.min(window.screen.width || 9999, window.screen.height || 9999) < 360);
    var lowEnd = (
      (cores > 0 && cores <= 2) ||
      (mem > 0 && mem <= 2) ||
      oldAndroid ||
      (cores > 0 && cores <= 4 && tinyScreen)
    );
    Compat.lowEnd = !!lowEnd;
    Compat.lite = !!lowEnd; // 轻量模式 = 低端设备

    /* 3) 关键能力支持情况 */
    Compat.webrtc = !!(window.RTCPeerConnection ||
      window.webkitRTCPeerConnection || window.mozRTCPeerConnection);
    Compat.webAudio = !!(window.AudioContext || window.webkitAudioContext);

    /* 4) devicePixelRatio 上限：低端 1.5，其余 2，避免高分屏过度填充 */
    var dpr = (typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0)
      ? window.devicePixelRatio : 1;
    Compat.dprCap = lowEnd ? Math.min(dpr, 1.5) : Math.min(dpr, 2);

    /* 5) 首次用户手势回调（音频 / 联机等需手势的能力挂载点） */
    Compat._gestureDone = false;
    Compat.onFirstGesture = function (cb) {
      if (Compat._gestureDone) { try { cb(); } catch (e) {} return; }
      var done = function () {
        Compat._gestureDone = true;
        window.removeEventListener('pointerdown', done, true);
        window.removeEventListener('keydown', done, true);
        window.removeEventListener('click', done, true);
        try { cb(); } catch (e) {}
      };
      window.addEventListener('pointerdown', done, true);
      window.addEventListener('keydown', done, true);
      window.addEventListener('click', done, true);
    };

    /* 6) 动态脚本加载（供需要时才拉取的依赖使用） */
    Compat.loadScript = function (src) {
      return new Promise(function (resolve, reject) {
        var s = doc.createElement('script');
        s.src = src; s.async = true;
        s.onload = function () { resolve(src); };
        s.onerror = function () { reject(new Error('script load failed: ' + src)); };
        doc.head.appendChild(s);
      });
    };

    /* 7) 页面可见性：隐藏时暂停 BGM，恢复时（若已手势解锁）继续 */
    if (doc) {
      doc.addEventListener('visibilitychange', function () {
        Compat.hidden = doc.hidden;
        var am = window.audioManager;
        try {
          if (doc.hidden) {
            if (am && am.stopBgm) am.stopBgm();
          } else if (am && am.startBgm && Compat._gestureDone) {
            am.startBgm();
          }
        } catch (e) { /* 忽略 */ }
        try {
          window.dispatchEvent(new CustomEvent('compat:visibility',
            { detail: { hidden: doc.hidden } }));
        } catch (e) { /* 忽略 */ }
      });
    }

    /* 8) 向 <html> 注入标记，供 CSS 降配 */
    function applyDataset() {
      if (!doc) return;
      var el = doc.documentElement;
      if (!el) return;
      el.dataset.compat = Compat.lite ? 'lite' : 'full';
      if (Compat.reducedMotion) el.dataset.reducedMotion = '1';
    }
    if (doc) {
      if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', applyDataset);
      } else {
        applyDataset();
      }
    }
  } catch (e) {
    // 任何异常都退化为完整模式，绝不影响游戏运行
    window.Compat = window.Compat || {};
    window.Compat.error = e;
    window.Compat.lite = false;
    window.Compat.reducedMotion = false;
  }

  window.Compat = Compat;
})();
