/* ============================================================
   吳佩珊 作品集 — 讀取 CSV、渲染頁面、作品詳細頁路由
   平常更新作品只要改 data/works.csv，不需要改這個檔案。
   ============================================================ */
(function () {
  'use strict';

  var SITE = window.SITE || {};
  var PREFERRED_CATS = ['策展', '活動企劃執行', '採訪出版', '影像紀錄', '設計編排', '國際交流', '社群經營'];
  var TODO = '<span class="todo">待補</span>';
  // 公開網站不顯示「待補」：沒填的欄位直接省略；只有檢查模式（?check=1）才標出來
  function todo(prefix) { return checkMode ? (prefix || '') + TODO : ''; }

  var state = {
    all: [], works: [], byId: {}, source: '', errors: [],
    cat: 'all', q: '', expanded: false,
    view: 'init', homeHash: '', homeScroll: 0, fromWorkId: null, fromElId: null, cameFromHome: false
  };
  var checkMode = /[?&]check=1\b/.test(location.search);

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── 工具 ── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function isYes(v) { return /^\s*(y|yes|是|v|o|1|true|✓|✔)\s*$/i.test(v || ''); }
  function isNo(v) { return /^\s*(n|no|否|x|0|false)\s*$/i.test(v || ''); }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:)?\/\//i.test(u) || /^mailto:/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return ''; // 擋掉 javascript: 之類
    return u;
  }
  function imgPath(f) {
    f = String(f || '').trim();
    if (!f) return '';
    if (/^(https?:)?\/\//i.test(f) || f.indexOf('/') !== -1) return safeUrl(f);
    return 'images/' + f;
  }
  // YouTube 網址 → 影片 ID（watch?v=、youtu.be/、shorts/、embed/ 都可以）
  function ytId(u) {
    var m = String(u || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : '';
  }
  function splitList(s) { return String(s || '').split(/\s*[|｜\n]\s*/).filter(Boolean); }
  function yearKey(y) {
    var m = String(y || '').match(/(\d{4})(?:\s*[–\-~～至]\s*(\d{2,4}))?/);
    if (!m) return 0;
    var start = +m[1], end = start;
    if (m[2]) end = m[2].length === 2 ? Math.floor(start / 100) * 100 + +m[2] : +m[2];
    return end + start / 10000;
  }
  function paragraphs(s) {
    return String(s || '').split(/\n\s*\n/).map(function (p) {
      return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  /* ── CSV 解析（支援引號、逗號、換行、BOM）── */
  function parseCSV(text) {
    text = String(text).replace(/^\uFEFF/, '');
    var rows = [], row = [], f = '', i = 0, q = false, c;
    while (i < text.length) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
      i++;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return String(h).trim(); });
    return rows.slice(1).map(function (r, n) {
      var o = { _row: n + 2 };
      head.forEach(function (h, k) { if (h) o[h] = (r[k] == null ? '' : String(r[k])).trim(); });
      return o;
    });
  }

  function fetchText(url, ms) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 8000) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal, cache: 'no-cache' } : { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function loadWorks() {
    var local = function () {
      return fetchText(SITE.worksCsv || 'data/works.csv').then(function (t) { state.source = 'data/works.csv'; return t; });
    };
    if (!SITE.sheetCsvUrl) return local();
    return fetchText(SITE.sheetCsvUrl, 6000).then(function (t) {
      if (t.indexOf('標題') === -1) throw new Error('試算表沒有「標題」欄');
      state.source = 'Google 試算表';
      return t;
    }).catch(function (e) {
      state.errors.push('試算表讀取失敗（' + e.message + '），已改用 data/works.csv');
      return local();
    });
  }

  function normalize(o) {
    var imgs = splitList(o['圖片']);
    var cover = o['封面圖'] || imgs[0] || '';
    if (cover && imgs.indexOf(cover) === -1) imgs.unshift(cover);
    return {
      row: o._row,
      id: (o['代號'] || '').trim(),
      show: !isNo(o['顯示']),
      featured: isYes(o['精選']),
      live: isYes(o['進行中']),
      year: o['年份'] || '',
      yk: yearKey(o['年份']),
      title: o['標題'] || '',
      cat: o['類別'] || '',
      role: o['角色'] || '',
      partner: o['合作單位'] || '',
      summary: o['摘要'] || '',
      body: o['內容'] || '',
      outputs: o['成果'] || '',
      cover: cover,
      images: imgs,
      credit: o['圖片來源'] || '',
      video: ytId(o['影片']),
      videoUrl: safeUrl(o['影片']),
      link: safeUrl(o['外部連結']),
      linkText: o['連結文字'] || '',
      note: o['備註'] || ''
    };
  }
  // 有內容可以看的作品才能點進去；只有標題、角色的作品在列表上就是一行字
  function hasDetail(w) {
    return !!(w.summary || w.body || w.outputs || w.cover || w.videoUrl || w.link);
  }

  function sorted(list, dir) {
    var copy = list.map(function (w, i) { return { w: w, i: i }; });
    copy.sort(function (a, b) {
      var d = dir === 'old' ? a.w.yk - b.w.yk : b.w.yk - a.w.yk;
      return d || a.i - b.i;
    });
    return copy.map(function (x) { return x.w; });
  }

  function categories() {
    var seen = {}, out = [];
    PREFERRED_CATS.concat(state.works.map(function (w) { return w.cat; })).forEach(function (c) {
      if (c && !seen[c] && state.works.some(function (w) { return w.cat === c; })) { seen[c] = 1; out.push(c); }
    });
    return out;
  }

  function workHref(w) { return '#/work/' + encodeURIComponent(w.id); }

  function media(w, cls) {
    if (w.cover) {
      return '<img src="' + esc(imgPath(w.cover)) + '" alt="' + esc(w.title) + ' 作品圖" loading="lazy" decoding="async" width="1000" height="750">';
    }
    return '<div class="ph ' + (cls || '') + '">' + (checkMode ? '[ 圖片待補 ]' : '<span aria-hidden="true">★</span>') + '</div>';
  }

  /* ── 首頁：統計 ── */
  function renderStats() {
    var starts = state.works.map(function (w) { var m = String(w.year).match(/\d{4}/); return m ? +m[0] : 0; }).filter(Boolean);
    var ends = state.works.map(function (w) { return Math.floor(w.yk); }).filter(Boolean);
    var minY = starts.length ? Math.min.apply(null, starts) : 0;
    var maxY = ends.length ? Math.max.apply(null, ends) : 0;
    var dist = categories().map(function (c) { return { c: c, n: state.works.filter(function (w) { return w.cat === c; }).length }; })
      .sort(function (x, y) { return y.n - x.n; }).slice(0, 3);
    $('#stats').innerHTML =
      '<div><dt>收錄作品</dt><dd>' + state.works.length + ' 件</dd></div>' +
      '<div><dt>年份</dt><dd>' + (minY ? minY + '–' + String(maxY).slice(2) : '—') + '</dd></div>' +
      '<div class="dist"><dt>作品最多的領域</dt><dd>' + dist.map(function (d) { return esc(d.c) + ' <b>' + d.n + '</b>'; }).join('<span class="sep">・</span>') + '</dd></div>';
  }

  /* ── 首頁：代表作品 ── */
  function renderFeatured() {
    var list = state.works.filter(function (w) { return w.featured; });
    var grid = $('#featuredGrid');
    if (!list.length) { grid.innerHTML = '<p class="loading">尚未設定代表作品（在 works.csv 的「精選」欄填 Y）。</p>'; return; }
    grid.innerHTML = list.map(function (w, i) {
      return '<a class="card drop" style="animation-delay:' + (i * 70) + 'ms" id="card-' + esc(w.id) + '" href="' + workHref(w) + '">' +
        '<div class="card-img">' + media(w) + '</div>' +
        '<div class="card-body">' +
          '<div class="meta"><span class="yr">' + (w.year ? esc(w.year) : TODO) + '</span><span class="cat">' + esc(w.cat) + '</span>' + (w.videoUrl ? '<span class="vid">▶ 影片</span>' : '') + '</div>' +
          '<h3>' + esc(w.title) + '</h3>' +
          (w.summary ? '<p class="card-sum">' + esc(w.summary) + '</p>' : '') +
          (w.role || checkMode ? '<div class="role">' + (w.role ? esc(w.role) : todo('角色 ')) + '</div>' : '') +
          '<span class="more" aria-hidden="true">開啟作品 ▸</span>' +
        '</div></a>';
    }).join('');
  }

  /* ── 首頁：全部作品 ── */
  function renderFilters() {
    var cats = categories();
    var btn = function (id, label, n) {
      var on = state.cat === id;
      return '<button class="btn' + (on ? ' is-active' : '') + '" type="button" data-cat="' + esc(id) + '" aria-pressed="' + on + '">' +
        esc(label) + ' <span class="n">' + n + '</span></button>';
    };
    $('#filters').innerHTML = btn('all', '全部', state.works.length) + cats.map(function (c) {
      return btn(c, c, state.works.filter(function (w) { return w.cat === c; }).length);
    }).join('');
  }

  function matches(w) {
    if (state.cat !== 'all' && w.cat !== state.cat) return false;
    if (!state.q) return true;
    var hay = [w.title, w.role, w.cat, w.partner, w.year, w.summary].join(' ').toLowerCase();
    return state.q.toLowerCase().split(/\s+/).every(function (t) { return hay.indexOf(t) !== -1; });
  }

  var COLLAPSED = 12;   // 沒有搜尋或篩選時，先列出最新幾件

  function catIndex(c) { var i = categories().indexOf(c); return i < 0 ? 0 : i % 8; }

  function renderList() {
    var list = sorted(state.works.filter(matches), 'new');
    var narrowed = state.cat !== 'all' || !!state.q;
    var shown = (!narrowed && !state.expanded) ? list.slice(0, COLLAPSED) : list;
    var hiddenN = list.length - shown.length;

    $('#count').textContent = narrowed ? '找到 ' + list.length + ' 件' :
      (hiddenN ? '最新 ' + shown.length + ' 件・共 ' + list.length + ' 件' : '共 ' + list.length + ' 件');

    var more = $('#moreWrap');
    if (!list.length) {
      $('#workList').innerHTML = '<li class="empty">找不到符合的作品。 <button class="btn" type="button" id="clearFilters">清除搜尋與篩選</button></li>';
      more.hidden = true;
      return;
    }

    // 依年份分組（跨年的作品歸在結束那一年），年份只出現一次
    var groups = [], cur = null;
    shown.forEach(function (w) {
      var y = Math.floor(w.yk) || '年份待補';
      if (!cur || cur.y !== y) { cur = { y: y, items: [] }; groups.push(cur); }
      cur.items.push(w);
    });

    $('#workList').innerHTML = groups.map(function (g) {
      return '<li class="yr-group"><h3 class="yr-head"><span class="yr-num">' + esc(g.y) + '</span><span class="yr-n">' + g.items.length + ' 件</span></h3>' +
        '<ol class="rows">' + g.items.map(function (w) {
          var range = /[–\-~～]/.test(w.year) ? '<span class="span">' + esc(w.year) + '</span>' : '';
          var open = hasDetail(w) || checkMode;
          return '<li>' + (open ? '<a class="work-row" id="row-' + esc(w.id) + '" href="' + workHref(w) + '">' : '<div class="work-row static" id="row-' + esc(w.id) + '">') +
            '<span class="main"><span class="t">' + esc(w.title) + '</span>' +
              (w.live ? '<span class="live">進行中</span>' : '') +
              (w.videoUrl ? '<span class="vid">▶ 影片</span>' : '') +
              (w.role ? '<span class="role">' + esc(w.role) + '</span>' : '') + range +
            '</span>' +
            '<span class="cat-tag c' + catIndex(w.cat) + '">' + esc(w.cat || '未分類') + '</span>' +
            (open ? '<span class="go" aria-hidden="true">▸</span></a>' : '</div>') + '</li>';
        }).join('') + '</ol></li>';
    }).join('');

    more.hidden = !hiddenN;
    if (hiddenN) $('#showAll').textContent = '展開全部作品（還有 ' + hiddenN + ' 件）';
  }

  /* ── 關於：經歷／學歷 ── */
  function renderExperience(rows) {
    var exp = rows.filter(function (r) { return r['類型'] !== '學歷'; });
    var edu = rows.filter(function (r) { return r['類型'] === '學歷'; });
    $('#expTbl tbody').innerHTML = exp.map(function (r) {
      return '<tr><td class="yr">' + esc(r['年份']) + '</td><td><b>' + esc(r['單位']) + '</b><br>' + esc(r['職稱或說明']) + '</td></tr>';
    }).join('');
    $('#eduTbl tbody').innerHTML = edu.map(function (r) {
      return '<tr><td><b>' + esc(r['單位']) + '</b><br>' + esc(r['職稱或說明']) + '</td></tr>';
    }).join('');
  }

  /* ── 現在在做：「進行中」填 Y 的作品 ── */
  function renderNow() {
    var live = sorted(state.works.filter(function (w) { return w.live; }), 'new');
    if (!live.length) { $('#now').hidden = true; return; }
    $('#nowList').innerHTML = live.map(function (w) {
      var inner = '<span class="t">' + esc(w.title) + '</span>' + (w.role ? '<span class="role">' + esc(w.role) + '</span>' : '');
      return '<li>' + (hasDetail(w) ? '<a href="' + workHref(w) + '">' + inner + ' <span aria-hidden="true">▸</span></a>' : inner) + '</li>';
    }).join('');
    var av = (SITE.availability || '').trim();
    $('#nowAvail').hidden = !av;
    $('#nowAvail').textContent = av;
    $('#now').hidden = false;
  }

  /* ── 跑馬燈：只放資料裡的真實內容 ── */
  function renderMarquee() {
    var items = state.works.filter(function (w) { return w.live; }).map(function (w) { return '<b>▶ 進行中</b> ' + esc(w.title); });
    sorted(state.works, 'new').slice(0, 3).forEach(function (w) { items.push('<b>★ 最新收錄</b> ' + esc(w.title) + '（' + esc(w.year) + '）'); });
    if (!items.length) return;
    var html = items.map(function (s) { return '<span>' + s + '</span>'; }).join('');
    $('#marqTrack').innerHTML = html + '<span aria-hidden="true"></span>' + html;
    $('#marqTrack').setAttribute('aria-hidden', 'true');
    $('#marquee').hidden = false;
  }

  /* ── 詳細頁 ── */
  function fact(label, val) {
    if (!val && !checkMode) return '';
    return '<dt>' + label + '</dt><dd>' + (val ? esc(val) : TODO) + '</dd>';
  }
  function credit(w, style) {
    if (!w.credit && !checkMode) return '';
    return '<figcaption' + (style ? ' style="' + style + '"' : '') + '>圖片來源：' + (w.credit ? esc(w.credit) : TODO) + '</figcaption>';
  }

  function renderDetail(id) {
    var w = state.byId[id];
    var view = $('#view-detail');
    var hiddenWork = w && !w.show;
    if (!w || (hiddenWork && !checkMode)) {
      document.title = '找不到作品｜吳佩珊';
      view.innerHTML = '<div class="win"><div class="win-title">⚠ 錯誤</div><div class="win-body notfound">' +
        '<h1>找不到這件作品</h1><p>連結可能已更改。可以回到作品列表，或直接聯絡我。</p>' +
        '<p><a class="btn" href="#works">← 回作品列表</a> <a class="btn" href="#contact">✉ 聯絡合作</a></p></div></div>';
      return;
    }
    document.title = w.title + '｜吳佩珊 作品集';
    var list = sorted(state.works.filter(function (x) { return x === w || hasDetail(x); }), 'new');
    var idx = list.indexOf(w);
    var prev = idx > 0 ? list[idx - 1] : null;
    var next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
    var gallery = w.images.length > 1 ? '<div class="gallery">' + w.images.slice(1).map(function (f) {
      return '<figure><img src="' + esc(imgPath(f)) + '" alt="' + esc(w.title) + ' 作品圖" loading="lazy" decoding="async">' + credit(w) + '</figure>';
    }).join('') + '</div>' : '';

    var facts = fact('我的角色', w.role) + fact('合作／主辦', w.partner) + fact('成果', w.outputs) + fact('年份', w.year);
    // 沒有圖片也沒有影片：不放空白圖框，文字佔滿整欄
    var visual = w.videoUrl ? videoBlock(w) :
      (w.cover || checkMode) ? '<figure class="detail-hero" style="margin:0">' + media(w) + (w.cover ? credit(w, 'background:var(--silver);font-size:12px;padding:4px 6px') : '') + '</figure>' : '';

    view.innerHTML =
      (hiddenWork ? '<p class="todo" style="display:block;margin-bottom:10px">檢查模式：這件作品目前「顯示＝N」，訪客看不到。</p>' : '') +
      '<div class="win detail drop">' +
        '<div class="win-title"><span aria-hidden="true">🖼️</span> 作品內容 <span class="en">WORK.VIEW</span><span class="win-ctrl" aria-hidden="true"><b>_</b><b>□</b><b>×</b></span></div>' +
        '<div class="win-body paper">' +
          '<div class="crumbs"><a class="btn" href="#works" id="backBtn">← 回作品列表</a>' +
            '<span class="addr" aria-hidden="true">C:\\作品\\' + esc(w.cat || '未分類') + '\\' + esc(w.title) + '</span></div>' +
          '<div class="detail-head' + (visual ? '' : ' solo') + '">' +
            '<div>' +
              '<div class="meta"><span class="yr">' + (w.year ? esc(w.year) : TODO) + '</span><span class="cat">' + esc(w.cat || '未分類') + '</span>' + (w.live ? '<span class="live">進行中</span>' : '') + '</div>' +
              '<h1 id="detailTitle" tabindex="-1">' + esc(w.title) + '</h1>' +
              (w.summary ? '<p class="summary">' + esc(w.summary) + '</p>' : checkMode ? '<p class="summary">作品介紹 ' + TODO + '</p>' : '') +
              (facts ? '<dl class="facts">' + facts + '</dl>' : '') +
            '</div>' +
            visual +
          '</div>' +
          (w.body ? '<div class="prose">' + paragraphs(w.body) + '</div>' : '') +
          gallery +
          '<div class="ext">' +
            (w.link ? '<a class="btn" href="' + esc(w.link) + '" target="_blank" rel="noopener">↗ ' + esc(w.linkText || '相關連結') + '（新分頁）</a>' : '') +
            '<a class="btn btn-holo" href="#contact">✉ 想談類似的合作？</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<nav class="pager" aria-label="上一件／下一件">' +
        (prev ? '<a class="prev" href="' + workHref(prev) + '"><span class="dir">◂ 較新的作品</span>' + esc(prev.title) + '</a>' : '<span></span>') +
        (next ? '<a class="next" href="' + workHref(next) + '"><span class="dir">較早的作品 ▸</span>' + esc(next.title) + '</a>' : '<span></span>') +
      '</nav>';
  }

  /* ── 影片：先顯示封面，按下才載入 YouTube（頁面輕、也不會先送資料給 YouTube）── */
  function videoBlock(w) {
    if (!w.video) {
      // YouTube 以外（例如 Facebook）：無法內嵌，封面直接連到原影片
      var host = /facebook\.com|fb\.watch/i.test(w.videoUrl) ? 'Facebook' : /instagram\.com/i.test(w.videoUrl) ? 'Instagram' : /vimeo\.com/i.test(w.videoUrl) ? 'Vimeo' : '原網站';
      return '<figure class="video" style="margin:0">' +
        '<a class="video-poster" href="' + esc(w.videoUrl) + '" target="_blank" rel="noopener" aria-label="在 ' + host + ' 觀看影片：' + esc(w.title) + '（新分頁）">' +
          (w.cover ? '<img src="' + esc(imgPath(w.cover)) + '" alt="" loading="lazy" decoding="async">' : '<span class="ph" aria-hidden="true"></span>') +
          '<span class="play" aria-hidden="true">▶</span><span class="play-txt">在 ' + host + ' 觀看 ↗</span>' +
        '</a></figure>';
    }
    var poster = w.cover ? imgPath(w.cover) : 'https://i.ytimg.com/vi/' + w.video + '/hqdefault.jpg';
    return '<figure class="video" style="margin:0">' +
      '<button class="video-poster" type="button" data-yt="' + esc(w.video) + '" aria-label="播放影片：' + esc(w.title) + '">' +
        '<img src="' + esc(poster) + '" alt="" loading="lazy" decoding="async">' +
        '<span class="play" aria-hidden="true">▶</span><span class="play-txt">播放影片</span>' +
      '</button>' +
      '<figcaption><a href="' + esc(w.videoUrl || ('https://www.youtube.com/watch?v=' + w.video)) + '" target="_blank" rel="noopener">在 YouTube 觀看（新分頁）</a></figcaption>' +
    '</figure>';
  }

  /* ── 路由 ── */
  function setNavCurrent(key) {
    $$('.task').forEach(function (a) { a.classList.toggle('is-current', a.getAttribute('data-nav') === key); });
  }

  function jump(y) { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); }

  function focusSilently(el) {
    if (!el) return;
    var native = el.matches('a[href],button,input,select,textarea');
    if (!native && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }

  function route() {
    var h = location.hash || '';
    var m = h.match(/^#\/work\/(.+)$/);
    if (m) {
      var id = decodeURIComponent(m[1]);
      if (state.view === 'home') {
        state.homeScroll = window.scrollY;
        state.homeHash = state.lastHomeHash || '';
        state.fromWorkId = id;
        state.cameFromHome = true;
      } else if (state.view === 'init') {
        state.cameFromHome = false;     // 直接用連結打開詳細頁
      }
      state.view = 'detail';
      $('#view-home').hidden = true;
      $('#view-detail').hidden = false;
      renderDetail(id);
      jump(0);
      focusSilently($('#detailTitle') || $('#view-detail h1'));
      setNavCurrent('works');
      return;
    }
    var wasDetail = state.view === 'detail', wasInit = state.view === 'init';
    state.view = 'home';
    document.title = '吳佩珊 Pei-Shan Wu｜文化工作者・紀實攝影・策展';
    $('#view-detail').hidden = true;
    $('#view-home').hidden = false;
    var target = h.length > 1 ? document.getElementById(h.slice(1)) : null;
    var returning = wasDetail && state.cameFromHome && h === state.homeHash;
    state.lastHomeHash = h;
    if (returning) {
      // 從詳細頁返回：回到原本的位置，焦點放回剛剛點的那件作品
      var back = (state.fromElId && document.getElementById(state.fromElId)) ||
        document.getElementById('card-' + state.fromWorkId) || document.getElementById('row-' + state.fromWorkId);
      jump(state.homeScroll);
      if (back) focusSilently(back);
    } else if (target) {
      if (wasDetail || wasInit) requestAnimationFrame(function () { target.scrollIntoView({ behavior: 'instant' }); });
      focusSilently(target.querySelector('h1,h2') || target);
    }
    state.cameFromHome = false;
  }

  /* ── 事件 ── */
  function bind() {
    $('#filters').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-cat]');
      if (!b) return;
      state.cat = b.getAttribute('data-cat');
      renderFilters(); renderList();
      var nb = $('#filters button[data-cat="' + CSS.escape(state.cat) + '"]');
      if (nb) nb.focus();
    });
    $('#q').addEventListener('input', function (e) { state.q = e.target.value.trim(); renderList(); });
    $('#showAll').addEventListener('click', function () {
      var first = state.works.length > COLLAPSED ? sorted(state.works, 'new')[COLLAPSED] : null;
      state.expanded = true; renderList();
      var el = first && document.getElementById('row-' + first.id);
      if (el) focusSilently(el);   // 焦點移到第一件新出現的作品（純文字列也可以）
    });
    $('#workList').addEventListener('click', function (e) {
      if (e.target.id === 'clearFilters') {
        state.cat = 'all'; state.q = ''; $('#q').value = '';
        renderFilters(); renderList(); $('#q').focus();
      }
    });

    // 返回鍵：從列表點進來就用瀏覽器上一頁（保留捲動位置）
    document.addEventListener('click', function (e) {
      var back = e.target.closest('#backBtn');
      if (back && state.cameFromHome) { e.preventDefault(); history.back(); return; }

      // 聯絡：不換頁，直接捲到聯絡區（詳細頁也適用）
      var c = e.target.closest('a[href="#contact"]');
      if (c) {
        e.preventDefault();
        var box = $('#contact');
        box.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        focusSilently($('#contactTitle'));
        box.classList.remove('flash', 'thud'); void box.offsetWidth; box.classList.add('flash', 'thud');
        setNavCurrent('contact');
      }
    });

    // 複製信箱
    $('#copyMail').addEventListener('click', function () {
      var text = this.getAttribute('data-copy');
      var done = function (ok) {
        var t = $('#toast');
        t.textContent = ok ? '已複製：' + text : '無法自動複製，請手動選取：' + text;
        clearTimeout(t._t); t._t = setTimeout(function () { t.textContent = ''; }, 4000);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
      } else done(fallbackCopy(text));
    });

    // 跑馬燈暫停
    $('#marqToggle').addEventListener('click', function () {
      var m = $('#marquee'), on = !m.classList.contains('is-paused');
      m.classList.toggle('is-paused', on);
      this.setAttribute('aria-pressed', String(on));
      this.textContent = on ? '▶' : '❚❚';
      this.setAttribute('aria-label', on ? '播放跑馬燈' : '暫停跑馬燈');
    });

    // 圖片壞掉時換成佔位
    document.addEventListener('error', function (e) {
      var img = e.target;
      if (img.tagName !== 'IMG' || img.dataset.broken) return;
      img.dataset.broken = '1';
      if (img.closest('.video-poster')) { img.remove(); return; }   // 影片封面讀不到：留黑底和播放鍵
      var ph = document.createElement('div');
      ph.className = 'ph';
      ph.textContent = '[ 圖片讀取失敗 ]';
      img.replaceWith(ph);
      state.errors.push('圖片讀不到：' + img.getAttribute('src'));
    }, true);

    // 播放影片
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button.video-poster');
      if (!b) return;
      var id = b.getAttribute('data-yt');
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0&playsinline=1';
      f.title = b.getAttribute('aria-label').replace('播放影片：', '') + '（YouTube 影片）';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.className = 'video-frame';
      b.replaceWith(f);
      f.focus();
    });

    // 上一件／下一件：取代目前紀錄，讓「返回」永遠回到列表
    document.addEventListener('click', function (e) {
      var a = e.target.closest('.pager a');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      location.replace(a.getAttribute('href'));
    });

    window.addEventListener('hashchange', route);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    // 記住從哪個卡片／列點進去，返回時焦點放回原處
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#/work/"]');
      if (a && state.view === 'home') state.fromElId = a.id || null;
    }, true);

    // 工作列標示目前區塊
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        if (state.view !== 'home') return;
        ents.forEach(function (en) {
          if (en.isIntersecting) {
            var id = en.target.id;
            setNavCurrent(id === 'featured' || id === 'works' ? 'works' : id === 'about' ? 'about' : id === 'contact' ? 'contact' : '');
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      ['top', 'featured', 'works', 'about', 'contact'].forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
    }

    // 時鐘
    var tick = function () { var d = new Date(); $('#clock').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
    tick(); setInterval(tick, 15000);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove(); return ok;
  }

  /* ── 檢查模式（網址加 ?check=1）── */
  function renderCheck() {
    var p = $('#checkPanel');
    var ids = {}, dup = [], missing = [], todo = [], hidden = [];
    state.all.forEach(function (w) {
      if (w.id) { if (ids[w.id]) dup.push(w.id); ids[w.id] = 1; }
      var need = [];
      if (!w.id) need.push('代號'); if (!w.title) need.push('標題'); if (!w.year) need.push('年份'); if (!w.cat) need.push('類別');
      if (need.length) missing.push('第 ' + w.row + ' 列：缺 ' + need.join('、'));
      if (!w.show) { hidden.push('第 ' + w.row + ' 列 ' + (w.title || '(無標題)') + (w.note ? '｜' + w.note : '')); return; }
      var t = [];
      if (!w.summary) t.push('摘要'); if (!w.role) t.push('角色'); if (!w.partner) t.push('合作單位'); if (!w.outputs) t.push('成果');
      if (!w.cover) t.push('圖片'); else if (!w.credit) t.push('圖片來源');
      if (t.length) todo.push((w.featured ? '★ ' : '') + (w.title || w.id) + '：' + t.join('、'));
    });
    todo.sort(function (a, b) { return (b[0] === '★') - (a[0] === '★'); });
    var li = function (a) { return '<ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; };
    p.innerHTML = '<div class="win-title">🔧 檢查模式 CHECK.EXE</div><div class="win-body">' +
      '<p>資料來源：<b>' + esc(state.source) + '</b>｜總列數 ' + state.all.length + '｜公開 ' + state.works.length + '｜隱藏 ' + hidden.length + '</p>' +
      (state.errors.length ? '<p class="bad">錯誤：</p>' + li(state.errors) : '') +
      (dup.length ? '<p class="bad">代號重複（詳細頁網址會衝突）：</p>' + li(dup) : '') +
      (missing.length ? '<p class="bad">必填欄位缺漏（這些作品不會顯示）：</p>' + li(missing) : '<p class="ok">✓ 必填欄位（代號、標題、年份、類別）都有填</p>') +
      '<details><summary>待補欄位（' + todo.length + ' 件，★ 為代表作品）</summary>' + li(todo) + '</details>' +
      '<details><summary>目前隱藏的作品（' + hidden.length + '）</summary>' + li(hidden) + '</details>' +
      '</div>';
    p.hidden = false;
    $('#main').insertBefore(p, $('#main').firstChild);
  }

  function showLoadError(msg) {
    var html = '<p class="load-err">⚠ 作品資料暫時讀不到（' + esc(msg) + '）。' +
      (location.protocol === 'file:' ? '直接用檔案開啟時瀏覽器會擋住資料讀取，請上傳到 GitHub Pages 或用本機伺服器預覽。' : '可以先到 <a href="https://www.instagram.com/3_s_photo/" target="_blank" rel="noopener">IG @3_s_photo</a> 看作品，或直接聯絡我。') + '</p>';
    $('#featuredGrid').innerHTML = html;
    $('#workList').innerHTML = '';
    $('#count').textContent = '';
  }

  /* ── 啟動 ── */
  function start() {
    bind();
    Promise.all([
      loadWorks(),
      fetchText(SITE.experienceCsv || 'data/experience.csv').catch(function () { return ''; })
    ]).then(function (res) {
      state.all = parseCSV(res[0]).map(normalize);
      state.works = state.all.filter(function (w) { return w.show && w.id && w.title && w.year && w.cat; });
      state.byId = {};
      state.all.forEach(function (w) { if (w.id && !state.byId[w.id]) state.byId[w.id] = w; });
      renderStats(); renderFeatured(); renderFilters(); renderList(); renderMarquee(); renderNow();
      if (res[1]) renderExperience(parseCSV(res[1]));
      if (checkMode) renderCheck();
      document.documentElement.setAttribute('data-ready', '1');
      route();
    }).catch(function (e) {
      state.errors.push(e.message);
      showLoadError(e.message);
      document.documentElement.setAttribute('data-ready', 'error');
      if (checkMode) renderCheck();
    });
  }

  // 給測試與除錯用
  window.__portfolio = { state: state, parseCSV: parseCSV, yearKey: yearKey };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
