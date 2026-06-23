/* ============================================================
   알고리즘·자료구조, 눈으로 보기 — 공통 헬퍼 (전역 VZ).
   코어 + linePlot + VZ.LA(arrow/tween) + VZ.AL(algorithms).
   모든 과정은 페이지에서 실시간 계산·기록·재생. 외부 출처 인용 없음.
   ============================================================ */
(function (global) {
  'use strict';

  const fmt = (n, d = 2) => {
    if (!isFinite(n)) return n > 0 ? '∞' : '−∞';
    const r = Number(n).toFixed(d);
    return Object.is(parseFloat(r), -0) ? (0).toFixed(d) : r;
  };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const PALETTE = ['#60a5fa', '#fbbf24', '#94a3b8', '#34d399', '#f472b6', '#c084fc', '#fb7185', '#37bdf8'];

  function setupStepper(stepperSel = '#stepper', panelSel = '[data-panel]') {
    const stepper = document.querySelector(stepperSel);
    if (!stepper) return;
    const panels = [...document.querySelectorAll(panelSel)];
    stepper.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const s = b.dataset.s;
      stepper.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      panels.forEach(p => p.classList.toggle('show', p.dataset.panel === s));
      const top = stepper.getBoundingClientRect().top + window.scrollY - 10;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  }

  function setupViewToggle(toggleSel, views, onShow) {
    const toggle = document.querySelector(toggleSel);
    if (!toggle) return;
    const shown = {};
    toggle.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const v = b.dataset.v;
      toggle.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if (onShow && !shown[v]) { onShow(v); shown[v] = true; }
      Object.keys(views).forEach(key => {
        const el = document.querySelector(views[key]);
        if (el) el.style.display = (key === v) ? '' : 'none';
      });
    });
  }

  function mountTopnav(sel, badge) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.innerHTML = `<a class="home" href="index.html">← 목차로</a><span class="chapbadge">${badge}</span>`;
  }

  function barRow(label, frac, { win = false, color = null, pctText = null } = {}) {
    const c = color || (win ? 'var(--hot)' : 'var(--q)');
    return `<div class="barrow ${win ? 'win' : ''}">
      <div class="bw">${label}${win ? ' 🏆' : ''}</div>
      <div class="track"><div class="fill" style="width:${(clamp(frac, 0, 1) * 100).toFixed(1)}%;background:${c}"></div></div>
      <div class="pct">${pctText != null ? pctText : (frac * 100).toFixed(1) + '%'}</div>
    </div>`;
  }

  global.VZ = { fmt, clamp, PALETTE, setupStepper, setupViewToggle, mountTopnav, barRow };
})(window);

/* ============================================================
   꺾은선 차트 (VZ.linePlot) — 수렴/손실/1변수 곡선용
   series:[{pts:[[x,y]],color,label,dash}], opts:{W,H,xlab,ylab,xmin..ymax,legend,hline,aria}
   ============================================================ */
(function (global) {
  'use strict';
  const VZ = global.VZ;
  function linePlot(series, opts = {}) {
    const W = opts.W || 460, H = opts.H || 230, padL = 44, padR = 14, padT = opts.legend === false ? 14 : 30, padB = 34;
    const all = series.filter(s => s.pts && s.pts.length);
    let xmin = opts.xmin, xmax = opts.xmax, ymin = opts.ymin, ymax = opts.ymax;
    if (xmin == null) xmin = Math.min(...all.flatMap(s => s.pts.map(p => p[0])), 0);
    if (xmax == null) xmax = Math.max(...all.flatMap(s => s.pts.map(p => p[0])), 1);
    if (ymin == null) ymin = Math.min(...all.flatMap(s => s.pts.map(p => p[1])), 0);
    if (ymax == null) ymax = Math.max(...all.flatMap(s => s.pts.map(p => p[1])), 1);
    if (ymax === ymin) ymax = ymin + 1;
    if (xmax === xmin) xmax = xmin + 1;
    const px = x => padL + (x - xmin) / (xmax - xmin) * (W - padL - padR);
    const py = y => H - padB - (y - ymin) / (ymax - ymin) * (H - padT - padB);
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const yv = ymin + (ymax - ymin) * i / 4, y = py(yv);
      g += `<line class="gridline" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/>`;
      g += `<text class="axislabel" x="${padL - 6}" y="${y + 3}" text-anchor="end">${VZ.fmt(yv, Math.abs(ymax - ymin) >= 10 ? 0 : 1)}</text>`;
    }
    for (let i = 1; i < 4; i++) { const xv = xmin + (xmax - xmin) * i / 4; g += `<line class="gridline" x1="${px(xv)}" y1="${padT}" x2="${px(xv)}" y2="${H - padB}"/>`; }
    g += `<line class="axis" x1="${padL}" y1="${py(ymin)}" x2="${W - padR}" y2="${py(ymin)}"/>`;
    g += `<line class="axis" x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}"/>`;
    g += `<text class="axislabel" x="${padL}" y="${H - padB + 16}" text-anchor="start">${VZ.fmt(xmin, 0)}</text>`;
    g += `<text class="axislabel" x="${W - padR}" y="${H - padB + 16}" text-anchor="end">${VZ.fmt(xmax, 0)}</text>`;
    if (opts.xlab) g += `<text class="axislabel" x="${(padL + W - padR) / 2}" y="${H - padB + 16}" text-anchor="middle">${opts.xlab}</text>`;
    if (opts.ylab) g += `<text class="axislabel" x="${padL - 30}" y="${(padT + H - padB) / 2}" text-anchor="middle" transform="rotate(-90 ${padL - 30} ${(padT + H - padB) / 2})">${opts.ylab}</text>`;
    if (opts.hline) {
      const y = py(opts.hline.y);
      g += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--faint)" stroke-width="1" stroke-dasharray="4 3"/>`;
      if (opts.hline.label) g += `<text class="axislabel" x="${W - padR}" y="${y - 4}" text-anchor="end" fill="var(--faint)">${opts.hline.label}</text>`;
    }
    all.forEach(s => {
      const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(' ');
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`;
    });
    if (opts.legend !== false) {
      let lx = padL;
      all.forEach(s => { if (!s.label) return;
        g += `<line x1="${lx}" y1="10" x2="${lx + 16}" y2="10" stroke="${s.color}" stroke-width="3" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`;
        g += `<text x="${lx + 20}" y="13" font-size="11" font-family="JetBrains Mono" fill="var(--muted)">${s.label}</text>`;
        lx += 26 + (s.label.length * 7.2); });
    }
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.aria || '꺾은선 차트'}" style="max-width:100%;display:block">${g}</svg>`;
  }
  VZ.linePlot = linePlot;
})(window);

/* ============================================================
   2D 보드/벡터/애니메이션 (VZ.LA) — 벡터장·등방 좌표용
   ============================================================ */
(function (global) {
  'use strict';
  const VZ = global.VZ;
  function arrowDefsAndLine(x1, y1, x2, y2, color, lw) {
    const id = 'ah' + Math.round(Math.abs(x1 * 7 + y1 * 13 + x2 * 17 + y2 * 23)) + color.replace(/[^a-z0-9]/gi, '');
    let s = `<defs><marker id="${id}" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="${color}"/></marker></defs>`;
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${lw}" marker-end="url(#${id})"/>`;
    return s;
  }
  // 두 픽셀점 사이 화살표 (범용)
  function arrowPx(x1, y1, x2, y2, color, { lw = 2.5 } = {}) { return arrowDefsAndLine(x1, y1, x2, y2, color, lw); }
  // 보간 애니메이션(스칼라 t): cb(t∈0..1) 반복 호출. 취소함수 반환.
  function tween(cb, dur = 800, done) {
    const t0 = performance.now(); let cancelled = false, raf = 0;
    function frame(now) {
      if (cancelled) return;
      let t = Math.min(1, (now - t0) / dur);
      t = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      cb(t);
      if (t < 1) raf = requestAnimationFrame(frame); else if (done) done();
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }
  VZ.LA = { arrowPx, tween };
})(window);

/* ============================================================
   알고리즘·자료구조 엔진 (VZ.AL)
   설계 철학: "기록-재생". 알고리즘을 한 번 돌리며 상태 스냅샷을 rec.snap()으로
   쌓고, player가 그 프레임들을 ▶/⏸/⏭/스크럽/속도로 재생. 렌더러는 순수 함수
   (상태 → SVG 문자열). DOM diff 없이 매 프레임 통짜 재렌더.
   - recorder()                : {snap(state,meta), frames}
   - player(frames,render,opts) : {play,pause,step,seek,reset,setSpeed,cancel,idx,playing,length}
   - transport(sel,frames,render,opts) : 컨트롤 UI 마운트 + player 생성·반환
   - bars(values,opts)          : 배열 막대 (상태색·포인터)
   - grid(rows,cols,opts)       : 격자 (BFS/DFS·미로·DP-on-grid)
   - dpTable(grid2d,opts)       : 2D DP 표 (셀 채우기·의존 화살표)
   - graph(nodes,edges,opts)    : 노드·엣지 (좌표 저자 지정)
   - tree(root,opts)            : 트리 / 재귀 호출트리
   - heatColor(t)               : 값→색 (낮음 남보라 → 높음 노랑)
   상태색 규약: idle=슬레이트, compare=청록(--q), swap/active=앰버(--hot),
                done/sorted=초록(--good), pivot/special=보라(--v),
                min/sel=핑크(--pink), wall/excl=코랄(--k), frontier=핑크(--pink)
   ============================================================ */
(function (global) {
  'use strict';
  const VZ = global.VZ;

  function heatColor(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [[30, 27, 75], [37, 99, 142], [52, 211, 153], [251, 191, 36]];
    const seg = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(seg)), f = seg - i;
    const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  const STATE = {
    idle: 'var(--slate)', compare: 'var(--q)', swap: 'var(--hot)', active: 'var(--hot)',
    done: 'var(--good)', sorted: 'var(--good)', pivot: 'var(--v)', special: 'var(--v)',
    min: 'var(--pink)', sel: 'var(--pink)', frontier: 'var(--pink)', visiting: 'var(--hot)',
    wall: 'var(--k)', excl: 'var(--k)', path: 'var(--good)'
  };
  const col = s => STATE[s] || (s && s.startsWith('var(') ? s : 'var(--slate)');

  // ---- 기록-재생 코어 ----
  function recorder() {
    const frames = [];
    return {
      frames,
      snap(state, meta = {}) { frames.push({ state: JSON.parse(JSON.stringify(state)), meta }); return frames.length; },
    };
  }

  function player(frames, render, opts = {}) {
    const baseInterval = opts.interval || 600;
    let idx = 0, playing = false, timer = null, speed = 1;
    function show() { if (frames.length) render(frames[idx], idx, frames); if (opts.onIdx) opts.onIdx(idx, playing); }
    function stop() { playing = false; if (timer) { clearTimeout(timer); timer = null; } }
    function tick() {
      if (!playing) return;
      if (idx >= frames.length - 1) { stop(); show(); return; }
      idx++; show(); timer = setTimeout(tick, baseInterval / speed);
    }
    function play() { if (playing || !frames.length) return; if (idx >= frames.length - 1) idx = 0; playing = true; show(); timer = setTimeout(tick, baseInterval / speed); }
    function pause() { stop(); show(); }
    function step(d = 1) { stop(); idx = Math.max(0, Math.min(frames.length - 1, idx + d)); show(); }
    function seek(i) { stop(); idx = Math.max(0, Math.min(frames.length - 1, i)); show(); }
    function reset() { stop(); idx = 0; show(); }
    function setSpeed(m) { speed = m; if (playing && timer) { clearTimeout(timer); timer = setTimeout(tick, baseInterval / speed); } }
    function cancel() { stop(); }
    return {
      play, pause, step, seek, reset, setSpeed, cancel, show,
      get idx() { return idx; }, get playing() { return playing; }, get length() { return frames.length; },
    };
  }

  // 컨트롤 바 + 스크러버 + 속도. player를 만들어 반환. 같은 컨테이너 재호출 시 이전 player 취소.
  function transport(sel, frames, render, opts = {}) {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return null;
    if (el._alPlayer) el._alPlayer.cancel();
    const speeds = opts.speeds || [0.5, 1, 2], scrubber = opts.scrubber !== false;
    const N = frames.length;
    el.innerHTML =
      `<div class="al-transport">
        <button class="btn" data-a="play">▶ 재생</button>
        <button class="btn" data-a="pause" style="display:none">⏸ 정지</button>
        <button class="btn" data-a="prev">⏮</button>
        <button class="btn" data-a="next">⏭</button>
        <button class="btn" data-a="reset">↺</button>
        ${scrubber ? `<input class="al-scrub" type="range" min="0" max="${Math.max(0, N - 1)}" value="0" style="flex:1;min-width:90px">` : ''}
        <span class="al-speed">${speeds.map((s, i) => `<button class="btn sp ${s === 1 ? 'on' : ''}" data-sp="${s}">${s}×</button>`).join('')}</span>
      </div>
      <div class="al-stepinfo" data-role="stepinfo"></div>`;
    const playBtn = el.querySelector('[data-a=play]'), pauseBtn = el.querySelector('[data-a=pause]');
    const scrub = el.querySelector('.al-scrub'), info = el.querySelector('[data-role=stepinfo]');
    function onIdx(i, playing) {
      if (scrub) scrub.value = i;
      playBtn.style.display = playing ? 'none' : '';
      pauseBtn.style.display = playing ? '' : 'none';
      const m = frames[i] && frames[i].meta;
      if (info) info.innerHTML = m && m.note ? `<span class="al-stepnum">${i}/${N - 1}</span> ${m.note}` : `<span class="al-stepnum">${i}/${N - 1}</span>`;
    }
    const p = player(frames, render, { interval: opts.interval || 600, onIdx });
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'play') p.play();
      else if (b.dataset.a === 'pause') p.pause();
      else if (b.dataset.a === 'next') p.step(1);
      else if (b.dataset.a === 'prev') p.step(-1);
      else if (b.dataset.a === 'reset') p.reset();
      else if (b.dataset.sp) { p.setSpeed(+b.dataset.sp); el.querySelectorAll('.sp').forEach(x => x.classList.toggle('on', x === b)); }
    });
    if (scrub) scrub.addEventListener('input', e => p.seek(+e.target.value));
    el._alPlayer = p; p.reset();
    return p;
  }

  // ---- 배열 막대 (정렬·탐색) ----
  function bars(values, opts = {}) {
    const W = opts.W || 540, H = opts.H || 240, pad = opts.pad ?? 26, gap = opts.gap ?? 4;
    const n = values.length, maxV = opts.maxV || Math.max(...values, 1);
    const botPad = opts.pointers ? 30 : 14, topPad = 18;
    const plotW = W - pad * 2, plotH = H - botPad - topPad;
    const bw = n ? (plotW - gap * (n - 1)) / n : plotW;
    const state = opts.state || {}, ptr = opts.pointers || {};
    let g = '';
    values.forEach((v, i) => {
      const h = Math.max(2, v / maxV * plotH), x = pad + i * (bw + gap), y = H - botPad - h;
      g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2.5" fill="${col(state[i])}" opacity="0.92"/>`;
      if (opts.showVals !== false && n <= 26) g += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="JetBrains Mono">${v}</text>`;
    });
    Object.entries(ptr).forEach(([name, i]) => {
      if (i == null || i < 0 || i >= n) return;
      const x = pad + i * (bw + gap) + bw / 2;
      g += `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11.5" fill="var(--hot)" font-family="JetBrains Mono" font-weight="700">↑${name}</text>`;
    });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%;display:block">${g}</svg>`;
  }

  // ---- 격자 (BFS/DFS·미로·grid-DP) ----
  function grid(rows, cols, opts = {}) {
    const W = opts.W || 420, H = opts.H || 420, pad = 8;
    const cw = (W - pad * 2) / cols, ch = (H - pad * 2) / rows;
    const cellState = opts.cellState || (() => ''), labels = opts.labels || (() => '');
    let g = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = pad + c * cw, y = pad + r * ch, s = cellState(r, c);
      const fill = s ? col(s) : 'var(--panel-2)';
      g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cw - 1.5).toFixed(1)}" height="${(ch - 1.5).toFixed(1)}" rx="3" fill="${fill}" opacity="${s ? 0.9 : 1}" stroke="var(--line)" stroke-width="1"/>`;
      const lab = labels(r, c);
      if (lab !== '' && lab != null) g += `<text x="${(x + cw / 2).toFixed(1)}" y="${(y + ch / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="${Math.min(15, cw * 0.4).toFixed(0)}" fill="var(--ink)" font-family="JetBrains Mono">${lab}</text>`;
    }
    (opts.arrows || []).forEach(([r1, c1, r2, c2]) => {
      const x1 = pad + c1 * cw + cw / 2, y1 = pad + r1 * ch + ch / 2, x2 = pad + c2 * cw + cw / 2, y2 = pad + r2 * ch + ch / 2;
      g += VZ.LA.arrowPx(x1, y1, x2, y2, 'var(--hot)', { lw: 2 });
    });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%;display:block">${g}</svg>`;
  }

  // ---- 2D DP 표 ----
  function dpTable(grid2d, opts = {}) {
    const rows = grid2d.length, cols = grid2d[0] ? grid2d[0].length : 0;
    const rl = opts.rowLabels || [], cl = opts.colLabels || [];
    const hasR = rl.length > 0, hasC = cl.length > 0;
    const W = opts.W || 480, H = opts.H || 320, m = 26;
    const ox = hasR ? m : 4, oy = hasC ? m : 4;
    const cw = (W - ox - 4) / cols, ch = (H - oy - 4) / rows;
    const fill = opts.fill || {}, active = opts.active || null, deps = opts.deps || [];
    let g = '';
    if (hasC) cl.forEach((t, c) => { g += `<text x="${(ox + c * cw + cw / 2).toFixed(1)}" y="16" text-anchor="middle" font-size="12" fill="var(--faint)" font-family="JetBrains Mono">${t}</text>`; });
    if (hasR) rl.forEach((t, r) => { g += `<text x="${(ox - 6).toFixed(1)}" y="${(oy + r * ch + ch / 2 + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="var(--faint)" font-family="JetBrains Mono">${t}</text>`; });
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = ox + c * cw, y = oy + r * ch, key = r + ',' + c;
      const isActive = active && active[0] === r && active[1] === c;
      const fs = fill[key];
      const bg = isActive ? 'var(--hot)' : fs ? col(fs) : 'var(--panel-2)';
      g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cw - 2).toFixed(1)}" height="${(ch - 2).toFixed(1)}" rx="3" fill="${bg}" opacity="${isActive || fs ? 0.92 : 1}" stroke="var(--line)" stroke-width="1"/>`;
      const val = grid2d[r][c];
      if (val !== '' && val != null) g += `<text x="${(x + cw / 2).toFixed(1)}" y="${(y + ch / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="13" fill="${isActive ? '#0b0e14' : 'var(--ink)'}" font-family="JetBrains Mono">${val}</text>`;
    }
    if (active) deps.forEach(([dr, dc]) => {
      if (dr < 0 || dc < 0 || dr >= rows || dc >= cols) return;
      const x1 = ox + dc * cw + cw / 2, y1 = oy + dr * ch + ch / 2, x2 = ox + active[1] * cw + cw / 2, y2 = oy + active[0] * ch + ch / 2;
      g += VZ.LA.arrowPx(x1, y1, x2, y2, 'var(--q)', { lw: 2 });
    });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%;display:block">${g}</svg>`;
  }

  // ---- 그래프 (좌표는 노드에 0..1 정규화로 주어짐) ----
  function graph(nodes, edges, opts = {}) {
    const W = opts.W || 460, H = opts.H || 380, pad = 34, r = opts.r || 17;
    const X = nx => pad + nx * (W - pad * 2), Y = ny => pad + ny * (H - pad * 2);
    const pos = {}; nodes.forEach(nd => pos[nd.id] = [X(nd.x), Y(nd.y)]);
    const nodeState = opts.nodeState || {}, edgeState = opts.edgeState || {}, dist = opts.distances || {};
    const directed = opts.directed;
    let g = '';
    edges.forEach(([a, b, w]) => {
      const [x1, y1] = pos[a], [x2, y2] = pos[b], key = a + '-' + b, es = edgeState[key] || edgeState[b + '-' + a];
      const stroke = es ? col(es) : 'var(--line)', sw = es ? 3 : 1.6;
      if (directed) g += VZ.LA.arrowPx(x1, y1, x2, y2, stroke, { lw: sw });
      else g += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}"/>`;
      if (w != null) { const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; g += `<rect x="${(mx - 9).toFixed(1)}" y="${(my - 9).toFixed(1)}" width="18" height="16" rx="3" fill="var(--bg)" opacity="0.85"/><text x="${mx.toFixed(1)}" y="${(my + 3).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="JetBrains Mono">${w}</text>`; }
    });
    nodes.forEach(nd => {
      const [x, y] = pos[nd.id], s = nodeState[nd.id];
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${s ? col(s) : 'var(--panel-2)'}" stroke="${s ? '#0b0e14' : 'var(--line)'}" stroke-width="2"/>`;
      g += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="13" fill="${s ? '#0b0e14' : 'var(--ink)'}" font-family="JetBrains Mono" font-weight="700">${nd.label != null ? nd.label : nd.id}</text>`;
      if (dist[nd.id] != null) g += `<text x="${x.toFixed(1)}" y="${(y - r - 5).toFixed(1)}" text-anchor="middle" font-size="11.5" fill="var(--hot)" font-family="JetBrains Mono">${dist[nd.id] === Infinity ? '∞' : dist[nd.id]}</text>`;
    });
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%;display:block">${g}</svg>`;
  }

  // 원형 배치 헬퍼: id 배열 → [{id,x,y}]
  function layoutCircle(ids, { cx = 0.5, cy = 0.5, rad = 0.4 } = {}) {
    const n = ids.length;
    return ids.map((id, i) => { const a = -Math.PI / 2 + i / n * 2 * Math.PI; return { id, x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) }; });
  }

  // ---- 트리 / 재귀 호출트리 ----  root: {id?,label,children:[...],state?}
  function tree(root, opts = {}) {
    const W = opts.W || 520, H = opts.H || 320, pad = 24, r = opts.r || 16;
    // 깊이별 배치: 각 리프에 가로 슬롯 할당
    let leaf = 0; const depthMax = { d: 0 };
    function assign(nd, depth) {
      nd._d = depth; depthMax.d = Math.max(depthMax.d, depth);
      if (!nd.children || !nd.children.length) { nd._x = leaf++; return nd._x; }
      const xs = nd.children.map(c => assign(c, depth + 1));
      nd._x = (Math.min(...xs) + Math.max(...xs)) / 2; return nd._x;
    }
    assign(root, 0);
    const leaves = Math.max(1, leaf);
    const X = lx => pad + (leaves === 1 ? 0.5 : lx / (leaves - 1)) * (W - pad * 2);
    const Y = d => pad + (depthMax.d === 0 ? 0 : d / depthMax.d) * (H - pad * 2);
    let edgesSvg = '', nodesSvg = '';
    function walk(nd) {
      const x = X(nd._x), y = Y(nd._d);
      (nd.children || []).forEach(c => {
        const cx = X(c._x), cy = Y(c._d);
        edgesSvg += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${c.edgeState ? col(c.edgeState) : 'var(--line)'}" stroke-width="${c.edgeState ? 3 : 1.6}"/>`;
        walk(c);
      });
      const s = nd.state;
      nodesSvg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${s ? col(s) : 'var(--panel-2)'}" stroke="${s ? '#0b0e14' : 'var(--line)'}" stroke-width="2"/>`;
      nodesSvg += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="${s ? '#0b0e14' : 'var(--ink)'}" font-family="JetBrains Mono" font-weight="700">${nd.label}</text>`;
    }
    walk(root);
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="max-width:100%;display:block">${edgesSvg}${nodesSvg}</svg>`;
  }

  // 색 범례: items = [['비교','compare'], ['교환','swap'], ...] → 작은 칩 줄
  function legend(items) {
    return '<div class="al-legend">' + items.map(([label, st]) =>
      `<span class="al-leg"><i style="background:${col(st)}"></i>${label}</span>`).join('') + '</div>';
  }

  VZ.AL = { heatColor, recorder, player, transport, bars, grid, dpTable, graph, layoutCircle, tree, legend, STATE };
})(window);
