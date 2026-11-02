/* ============================================================
   拍立得洗牌：點一下才會動（只保留回應操作的動畫）
   系統設定「減少動態」時直接換張、不播放動畫。
   作品資料由 app.js 讀完後發出 portfolio:ready 事件，這裡才開始。
   ============================================================ */
(function () {
  'use strict';
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };


  /* ── 拍立得洗牌：肖像＋代表作品照片疊成一疊，點一下抽到最底 ── */
  function shortTitle(t) { return String(t).replace(/[《》〈〉]/g, '').split(/[｜|]/)[0].trim(); }
  function buildPolaroids(state) {
    var fig = $('.hero .portrait');
    if (!fig) return;
    var feats = state.works.filter(function (w) { return w.featured && w.cover; });
    var portrait = fig.querySelector('img');
    var items = [{ src: portrait.getAttribute('src'), cap: '吳佩珊', alt: portrait.alt, pos: 'center 22%' }].concat(
      feats.map(function (w) {
        var src = /^(https?:)?\/\//.test(w.cover) || w.cover.indexOf('/') > -1 ? w.cover : 'images/' + w.cover;
        return { src: src, cap: shortTitle(w.title), alt: w.title + ' 作品照片', id: w.id, pos: 'center' };
      }));
    if (items.length < 2) return;

    var tilt = [-4, 3, -2, 5, -5, 2];
    var wrap = document.createElement('div');
    wrap.className = 'pola-wrap';
    wrap.innerHTML =
      '<button class="pola-stack" type="button" aria-describedby="polaNow">' +
        items.map(function (it, i) {
          return '<span class="pola" data-i="' + i + '" style="--r:' + tilt[i % tilt.length] + 'deg">' +
            '<img src="' + it.src + '" alt="" loading="' + (i ? 'lazy' : 'eager') + '" decoding="async" style="object-position:' + it.pos + '">' +
            '<span class="cap">' + it.cap.replace(/</g, '&lt;') + '</span></span>';
        }).join('') +
      '</button>' +
      '<p class="pola-now" id="polaNow" aria-live="polite"></p>';
    fig.replaceWith(wrap);

    var stack = wrap.querySelector('.pola-stack');
    var cards = Array.prototype.slice.call(wrap.querySelectorAll('.pola'));
    var order = cards.map(function (_, i) { return i; });    // order[0] = 最上面那張
    var busy = false;

    function layout() {
      order.forEach(function (ci, depth) {
        var c = cards[ci];
        c.style.zIndex = String(cards.length - depth);
        c.style.setProperty('--d', depth);
        c.classList.toggle('is-top', depth === 0);
      });
      var top = items[order[0]];
      stack.setAttribute('aria-label', '照片：' + top.cap + '。按一下換下一張（共 ' + items.length + ' 張）');
      // 照片上已經寫了標題，這裡只放動作
      $('#polaNow').innerHTML = top.id
        ? '<a href="#/work/' + encodeURIComponent(top.id) + '" aria-label="看作品：' + top.cap.replace(/"/g, '&quot;') + '">看這件作品 ▸</a><span class="hint">點照片翻下一張</span>'
        : '<span class="hint">點照片翻下一張</span>';
    }
    layout();

    stack.addEventListener('click', function () {
      if (busy) return;
      var top = cards[order[0]];
      var next = function () { order.push(order.shift()); layout(); busy = false; };
      if (reduced || !top.animate) { next(); return; }
      busy = true;
      // 依重力方向抽走（預設往右下），再塞回最底
      var gx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gx')) || 0;
      var dir = gx < -0.2 ? -1 : 1;
      var out = top.animate([
        { transform: 'translate(0,0) rotate(var(--r))' },
        { transform: 'translate(' + (dir * 115) + '%, -6%) rotate(' + (dir * 16) + 'deg)' }
      ], { duration: 260, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
      out.onfinish = function () {
        order.push(order.shift());
        layout();
        top.animate([
          { transform: 'translate(' + (dir * 115) + '%, -6%) rotate(' + (dir * 16) + 'deg)' },
          { transform: 'translate(0,0) rotate(var(--r))' }
        ], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1.15)' }).onfinish = function () { busy = false; };
        out.cancel();
      };
    });
  }

  document.addEventListener('portfolio:ready', function (e) {
    var state = e.detail;
    buildPolaroids(state);
  });
})();
