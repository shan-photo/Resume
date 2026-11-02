/* ============================================================
   動態效果：亂碼解讀、數字捲到才累加、拍立得洗牌
   系統設定「減少動態」時全部直接顯示最終畫面。
   作品資料由 app.js 讀完後發出 portfolio:ready 事件，這裡才開始。
   ============================================================ */
(function () {
  'use strict';
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function onVisible(el, fn, threshold) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (ents) {
      if (ents[0].isIntersecting) { io.disconnect(); fn(); }
    }, { threshold: threshold || 0.4 });
    io.observe(el);
  }

  /* ── 亂碼解讀：像舊電腦開機一樣，從亂碼逐字解出正確文字 ── */
  var LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@*$';
  var CJK = '▓▒░█▚▞文影像田野紀錄策展攝嘉南風港島街屋';
  function scramble(node, ms) {
    var final = node.textContent;
    if (!final.trim()) return;
    var start = performance.now();
    var n = final.length;
    var at = [];                                      // 每個字在什麼時候定下來
    for (var i = 0; i < n; i++) at.push((i / n) * ms * 0.75 + Math.random() * ms * 0.25);
    function tick(now) {
      var t = now - start, out = '', done = true;
      for (var i = 0; i < n; i++) {
        var ch = final[i];
        if (t >= at[i] || /[\s／・\/\-]/.test(ch)) { out += ch; continue; }
        done = false;
        var pool = /[㐀-鿿]/.test(ch) ? CJK : LATIN;
        out += pool[(Math.random() * pool.length) | 0];
      }
      node.textContent = out;
      if (!done) requestAnimationFrame(tick); else node.textContent = final;
    }
    requestAnimationFrame(tick);
  }
  function runScramble() {
    var h1 = $('#heroName');
    if (!h1 || reduced) return;
    h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());   // 讀螢幕軟體直接念正確姓名
    var eyebrow = $('.hero .eyebrow');
    var nameText = h1.firstChild && h1.firstChild.nodeType === 3 ? h1.firstChild : null;
    var en = $('.name-en', h1);
    [[eyebrow && eyebrow.firstChild, 900], [nameText, 1100], [en && en.firstChild, 1300]].forEach(function (p) {
      if (p[0] && p[0].nodeType === 3) scramble(p[0], p[1]);
    });
  }

  /* ── 數字捲到才累加 ── */
  function countUp(el) {
    var to = +el.getAttribute('data-to');
    if (!to || reduced) return;
    var start = performance.now(), dur = 900;
    el.textContent = '0';
    (function step(now) {
      var k = Math.min(1, (now - start) / dur);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step); else el.textContent = String(to);
    })(start);
  }
  function runCounts() {
    var stats = $('#stats');
    onVisible(stats, function () {
      Array.prototype.forEach.call(stats.querySelectorAll('.num[data-to]'), countUp);
    }, 0.6);
  }

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
    runScramble();
    runCounts();
    buildPolaroids(state);
  });
})();
