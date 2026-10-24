/* ============================================================
   重力 × 煙火：融入整頁的回饋效果
   - 點開作品、聯絡合作等動作時，從點擊位置噴出復古科學煙火
   - 煙火、原子、星星順著「重力」落下，原子碰到畫面邊緣會彈跳
   - 手機：傾斜手機改變重力方向；視窗的影子也跟著重力移動
   - 系統設定「減少動態」時全部關閉
   純裝飾，畫在一層不接收點擊的透明圖層上，不影響網站操作。
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  var hasDO = 'DeviceOrientationEvent' in window;
  var canAsk = hasDO && typeof DeviceOrientationEvent.requestPermission === 'function';

  var COLORS = ['#39FF14', '#00E5FF', '#FF3CC7', '#FFE600', '#FF7A00', '#B388FF'];
  var MAX = coarse ? 240 : 420;
  var G = 1150;                         // 重力加速度 px/s²

  var cv, ctx, W = 0, H = 0, DPR = 1;
  var parts = [];
  var running = false, last = 0;
  var g = { x: 0, y: 1 }, gt = { x: 0, y: 1 };
  var sensor = 'off';                   // off | waiting | on | ask | none
  var root = document.documentElement;
  var btn, note, noteTimer, waitTimer, shadowQueued = false;

  /* ── 圖層 ── */
  function setup() {
    cv = document.createElement('canvas');
    cv.id = 'fx';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  /* ── 噴發 ── */
  // size: 'big'（打開作品）| 'mid'（聯絡、主要按鈕）| 'small'（篩選）
  function burst(x, y, size) {
    if (reduced || !ctx) return;
    var n = size === 'big' ? 64 : size === 'small' ? 14 : 34;
    var power = size === 'big' ? 1 : size === 'small' ? 0.55 : 0.8;
    var base = pick(COLORS), alt = pick(COLORS);
    var gm = Math.hypot(g.x, g.y) || 1, ux = g.x / gm, uy = g.y / gm;
    for (var i = 0; i < n && parts.length < MAX; i++) {
      var a = Math.random() * Math.PI * 2, sp = rand(140, 460) * power;
      var r = Math.random();
      parts.push({
        k: r < 0.22 ? 'star' : 'px',
        x: x, y: y,
        // 先往「重力的反方向」拋出，再落下，像噴泉
        vx: Math.cos(a) * sp - ux * 260 * power,
        vy: Math.sin(a) * sp - uy * 260 * power,
        s: r < 0.22 ? rand(5, 9) : rand(3, 5.5),
        c: Math.random() < 0.7 ? base : alt,
        life: rand(1.1, 1.9), age: 0, rot: rand(0, 6), vr: rand(-6, 6)
      });
    }
    // 打開作品時，丟出幾顆會彈跳的原子
    var atoms = size === 'big' ? 3 : size === 'mid' ? 1 : 0;
    for (var j = 0; j < atoms && parts.length < MAX; j++) {
      var aa = Math.random() * Math.PI * 2, sa = rand(220, 420);
      parts.push({
        k: 'atom', x: x, y: y,
        vx: Math.cos(aa) * sa - ux * 320, vy: Math.sin(aa) * sa - uy * 320,
        s: rand(11, 15), c: pick(COLORS), life: rand(2.6, 3.4), age: 0, rot: rand(0, 6), vr: rand(-3, 3), bounces: 0
      });
    }
    if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
  }

  /* ── 物理 ── */
  function step(dt) {
    g.x += (gt.x - g.x) * Math.min(1, dt * 8);
    g.y += (gt.y - g.y) * Math.min(1, dt * 8);
    var gx = g.x * G, gy = g.y * G, drag = Math.pow(0.45, dt);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      if (p.k === 'atom') {
        p.vx += gx * dt; p.vy += gy * dt;
        p.vx *= Math.pow(0.8, dt); p.vy *= Math.pow(0.8, dt);
      } else {
        p.vx = p.vx * drag + gx * 0.55 * dt;
        p.vy = p.vy * drag + gy * 0.55 * dt;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.k === 'atom') {
        var e = 0.55, r = p.s, hit = false;
        if (p.x < r) { p.x = r; p.vx = Math.abs(p.vx) * e; hit = true; }
        if (p.x > W - r) { p.x = W - r; p.vx = -Math.abs(p.vx) * e; hit = true; }
        if (p.y < r) { p.y = r; p.vy = Math.abs(p.vy) * e; hit = true; }
        if (p.y > H - r) { p.y = H - r; p.vy = -Math.abs(p.vy) * e; hit = true; }
        if (hit) { p.vr *= -0.8; p.bounces++; }
      } else if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) {
        parts.splice(i, 1);
      }
    }
  }

  /* ── 繪圖：每顆都描黑邊，在黃紙、灰視窗、青色桌面上都看得清楚 ── */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], t = p.age / p.life;
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      if (p.k === 'px') {
        var s = p.s;
        ctx.fillStyle = '#000'; ctx.fillRect(p.x - s / 2 - 1, p.y - s / 2 - 1, s + 2, s + 2);
        ctx.fillStyle = p.c; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.k === 'star') {
        star(p.x, p.y, p.s * (0.85 + 0.25 * Math.sin(p.age * 14)), p.rot, p.c);
      } else {
        atom(p);
      }
    }
    ctx.globalAlpha = 1;
  }
  function star(x, y, r, rot, c) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot * 0.3);
    ctx.beginPath();
    for (var k = 0; k < 8; k++) {
      var a = k * Math.PI / 4, rr = k % 2 ? r * 0.28 : r;
      ctx[k ? 'lineTo' : 'moveTo'](Math.sin(a) * rr, -Math.cos(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = c; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.restore();
  }
  function atom(p) {
    var r = p.s;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    for (var k = 0; k < 3; k++) {
      ctx.save(); ctx.rotate(k * Math.PI / 3);
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.38, 0, 0, Math.PI * 2);
      ctx.lineWidth = 3.2; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#00E5FF'; ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = '#FF3CC7'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.restore();
  }

  function frame(now) {
    var dt = Math.min(0.033, (now - (last || now)) / 1000); last = now;
    step(dt); draw();
    if (parts.length) requestAnimationFrame(frame);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  /* ── 重力 → 視窗影子（CSS 變數 --gx / --gy）── */
  function setGravity(x, y) {
    var m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    gt.x = x; gt.y = y;
    if (!running) { g.x = x; g.y = y; }
    if (!shadowQueued) {
      shadowQueued = true;
      setTimeout(function () {
        shadowQueued = false;
        root.style.setProperty('--gx', gt.x.toFixed(2));
        root.style.setProperty('--gy', gt.y.toFixed(2));
      }, 90);
    }
  }

  /* ── 手機感應器 ── */
  function onOrient(e) {
    if (e.beta == null && e.gamma == null) return;
    if (sensor !== 'on') {
      sensor = 'on'; clearTimeout(waitTimer); updateBtn();
      say('重力感應已開啟：傾斜手機，煙火和影子會往低處去。');
    }
    var rad = Math.PI / 180;
    var x = Math.sin((e.gamma || 0) * rad), y = Math.sin((e.beta || 0) * rad);
    var ang = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
    var a = -ang * rad;
    setGravity(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
  }
  function listen() {
    window.addEventListener('deviceorientation', onOrient);
    if (sensor !== 'on') sensor = 'waiting';
    clearTimeout(waitTimer);
    waitTimer = setTimeout(function () {
      if (sensor === 'on') return;
      window.removeEventListener('deviceorientation', onOrient);
      sensor = canAsk ? 'ask' : 'none';
      updateBtn();
    }, 1500);
  }
  function stop() {
    window.removeEventListener('deviceorientation', onOrient);
    sensor = 'off'; updateBtn(); setGravity(0, 1);
    say('重力感應已關閉。');
  }
  function updateBtn() {
    if (!btn) return;
    btn.hidden = reduced || !coarse || !hasDO || sensor === 'none';
    var on = sensor === 'on';
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('is-ask', sensor === 'ask');
    btn.setAttribute('aria-label', on ? '關閉重力感應' : '開啟重力感應');
    btn.querySelector('.g-txt').textContent = on ? '重力開' : '重力';
  }
  function say(t) {
    if (!note) return;
    note.textContent = t; note.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { note.hidden = true; note.textContent = ''; }, 3200);
  }

  /* ── 什麼動作會噴煙火 ── */
  var BIG = 'a.card, a.work-row, .pager a';
  var MID = 'a[href="#contact"], a[href="#featured"], #copyMail, .ext a';
  function onClick(e) {
    if (reduced) return;
    var t = e.target.closest(BIG + ',' + MID);   // 篩選按鈕只是在找東西，不噴煙火
    if (!t) return;
    var x = e.clientX, y = e.clientY;
    if (!e.detail || (!x && !y)) {           // 鍵盤 Enter：從元素中心噴出
      var r = t.getBoundingClientRect();
      x = r.left + r.width / 2; y = r.top + Math.min(r.height / 2, 60);
    }
    // 起點一定在畫面內（例如鍵盤操作時頁面還在捲動）
    x = Math.min(Math.max(x, 24), W - 24); y = Math.min(Math.max(y, 70), H - 24);
    burst(x, y, t.matches(BIG) ? 'big' : 'mid');
  }

  function init() {
    setup();
    btn = document.getElementById('gBtn');
    note = document.getElementById('fxNote');
    document.addEventListener('click', onClick, true);
    if (btn) {
      btn.addEventListener('click', function () {
        if (sensor === 'on') { stop(); return; }
        if (canAsk) {
          DeviceOrientationEvent.requestPermission().then(function (res) {
            if (res === 'granted') { listen(); say('傾斜手機看看。'); }
            else { sensor = 'ask'; updateBtn(); say('沒有取得權限。可以在瀏覽器設定允許「動作與方向」後再試。'); }
          }).catch(function () { say('需要 https 網址才能使用重力感應。'); });
        } else listen();
      });
    }
    if (!reduced && coarse && hasDO) listen();   // 多數 Android 直接有訊號
    updateBtn();
  }

  // 給測試用
  window.__fx = {
    burst: burst,
    get count() { return parts.length; },
    get gravity() { return { x: gt.x, y: gt.y }; },
    get sensor() { return sensor; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
