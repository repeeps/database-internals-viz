/* ============================================================
   데이터베이스 엔진 (VZ.DB)
   "데이터베이스, 눈으로 보기" 전용 렌더러. 순수 함수(상태→SVG 문자열),
   전부 방어적(빈 배열·0 division·음수 가드). 베이스 lib.js(VZ.AL 스텝
   플레이어 + VZ.LA.tween)를 그대로 쓰고, DB 도메인 시각만 여기 추가.
   - svg/box/pill/edge/packet/cell/kv : 기본 도형
   - page(디스크 페이지·버퍼) / table(행 스캔)
   - btree(다진 노드·탐색 경로·연결 리프)  [B 하이라이트]
   - planTree(실행계획 트리) / costBar(비용 막대 비교, "길 고르기")
   - txTimeline(트랜잭션×시간, 락 보유/대기)  [D 하이라이트]
   - lockMatrix(S/X 호환) / versionChain(MVCC 버전·스냅샷)
   - walStrip(로그 선기록) / ledger(종이 장부)
   상태색: data=청록(--q) index=보라(--v) active=앰버(--hot)
           ok/commit=초록(--good) conflict/abort=코랄(--drop)
           wait=슬레이트(--slate) version=핑크(--pink)
   ============================================================ */
(function (global) {
  'use strict';
  const VZ = global.VZ;
  const LA = VZ.LA, fmt = VZ.fmt, clamp = VZ.clamp;

  const C = {
    data: 'var(--q)', index: 'var(--v)', active: 'var(--hot)', hot: 'var(--hot)',
    ok: 'var(--good)', commit: 'var(--good)', conflict: 'var(--drop)', abort: 'var(--drop)',
    wait: 'var(--slate)', ver: 'var(--pink)', miss: 'var(--slate)', line: 'var(--line)',
  };

  function svg(W, H, inner, aria) {
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${aria || 'DB 그림'}" style="max-width:100%;display:block;background:var(--panel-2);border:1px solid var(--line);border-radius:12px">${inner}</svg>`;
  }
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  // ---- 기본 도형 ----
  function box(x, y, w, h, label, opts = {}) {
    const col = opts.color || C.data, fill = opts.fill || 'var(--panel)';
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${opts.rx ?? 9}" fill="${fill}" stroke="${col}" stroke-width="${opts.lw || 2}"${opts.dim ? ' opacity="0.45"' : ''}/>`;
    if (label != null) s += `<text x="${x + w / 2}" y="${y + (opts.sub ? h / 2 - 1 : h / 2 + 4)}" text-anchor="middle" font-size="${opts.fs || 12.5}" font-family="JetBrains Mono" font-weight="700" fill="${opts.dim ? 'var(--muted)' : 'var(--ink)'}">${label}</text>`;
    if (opts.sub) s += `<text x="${x + w / 2}" y="${y + h - 7}" text-anchor="middle" font-size="9" font-family="JetBrains Mono" fill="var(--muted)">${opts.sub}</text>`;
    return s;
  }
  function pill(cx, cy, label, opts = {}) {
    const col = opts.color || C.data, w = Math.max(46, String(label).length * 7.3 + 16), h = 21;
    return `<rect x="${(cx - w / 2).toFixed(1)}" y="${cy - h / 2}" width="${w.toFixed(1)}" height="${h}" rx="10.5" fill="${opts.fill || 'none'}" stroke="${col}" stroke-width="${opts.active ? 2.3 : 1.3}"${opts.dim ? ' opacity="0.4"' : ''}/>` +
      `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10.5" font-family="JetBrains Mono" fill="${opts.tcol || col}">${label}</text>`;
  }
  function edge(x1, y1, x2, y2, opts = {}) {
    const col = opts.color || C.line;
    if (opts.dash) return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${opts.lw || 1.6}" stroke-dasharray="${opts.dash}"${opts.dim ? ' opacity="0.4"' : ''}/>`;
    return LA.arrowPx(x1, y1, x2, y2, col, { lw: opts.lw || 1.8 });
  }
  function packet(x, y, opts = {}) {
    return `<circle cx="${(+x).toFixed(1)}" cy="${(+y).toFixed(1)}" r="${opts.r || 5}" fill="${opts.color || C.active}"${opts.drop ? ' opacity="0.4"' : ''}/>`;
  }
  // 키 셀 한 칸
  function cell(x, y, w, h, label, opts = {}) {
    const col = opts.color || C.line, fill = opts.fill || 'var(--panel)';
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${col}" stroke-width="${opts.lw || 1}"${opts.dim ? ' opacity="0.5"' : ''}/>`;
    if (label != null && label !== '') s += `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="${opts.fs || 11}" font-family="JetBrains Mono" fill="${opts.tcol || 'var(--ink)'}" font-weight="${opts.bold ? 700 : 400}">${label}</text>`;
    return s;
  }
  // 키:값 한 줄
  function kv(x, y, w, k, v, opts = {}) {
    const col = opts.color || C.line;
    return `<rect x="${x}" y="${y}" width="${w}" height="22" rx="5" fill="var(--panel)" stroke="${col}" stroke-width="1"/>` +
      `<text x="${x + 8}" y="${y + 15}" font-size="10" font-family="JetBrains Mono" fill="var(--muted)">${k}</text>` +
      `<text x="${x + w - 8}" y="${y + 15}" text-anchor="end" font-size="10.5" font-family="JetBrains Mono" fill="${opts.vcol || 'var(--ink)'}" font-weight="700">${v}</text>`;
  }

  // ---- 디스크 페이지 / 버퍼풀 칸 (행 슬롯 포함) ----
  // rows: [{label,state}] | 숫자(빈 슬롯 수)
  function page(x, y, w, h, title, rows, opts = {}) {
    const col = opts.color || (opts.cached ? C.ok : C.data);
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${opts.fill || 'var(--panel)'}" stroke="${col}" stroke-width="${opts.lw || 1.6}"${opts.dim ? ' opacity="0.5"' : ''}${opts.dash ? ` stroke-dasharray="${opts.dash}"` : ''}/>`;
    if (title != null) s += `<text x="${x + w / 2}" y="${y + 13}" text-anchor="middle" font-size="9" font-family="JetBrains Mono" fill="var(--muted)">${title}</text>`;
    const arr = Array.isArray(rows) ? rows : [];
    const top = title != null ? 18 : 5, rh = Math.max(8, (h - top - 5) / Math.max(1, arr.length));
    arr.forEach((r, i) => {
      const ry = y + top + i * rh;
      const rf = r.state ? (C[r.state] || r.state) : 'var(--panel-2)';
      s += `<rect x="${x + 5}" y="${ry}" width="${w - 10}" height="${rh - 2}" rx="2" fill="${rf}" opacity="${r.state ? 0.9 : 1}" stroke="var(--line)" stroke-width="0.6"/>`;
      if (r.label != null && rh > 11) s += `<text x="${x + w / 2}" y="${ry + rh / 2 + 3}" text-anchor="middle" font-size="9" font-family="JetBrains Mono" fill="${r.state ? '#0b0e14' : 'var(--muted)'}">${r.label}</text>`;
    });
    return s;
  }

  // ---- 테이블 행 스캔 (세로 스택) ----
  // rows: [{label,state}]  state: '' | 'active'(현재) | 'ok'(매치) | 'miss'(스킵) | 'data'
  function table(x, y, w, rows, opts = {}) {
    const rh = opts.rh || 18, gap = opts.gap ?? 2; let s = '';
    (rows || []).forEach((r, i) => {
      const ry = y + i * (rh + gap);
      const f = r.state ? (C[r.state] || r.state) : 'var(--panel)';
      s += `<rect x="${x}" y="${ry}" width="${w}" height="${rh}" rx="3" fill="${f}" opacity="${r.state && r.state !== 'data' ? 0.92 : 1}" stroke="var(--line)" stroke-width="0.8"/>`;
      if (r.label != null) s += `<text x="${x + 8}" y="${ry + rh / 2 + 4}" font-size="10" font-family="JetBrains Mono" fill="${r.state && r.state !== 'data' ? '#0b0e14' : 'var(--ink)'}">${r.label}</text>`;
      if (r.note) s += `<text x="${x + w - 8}" y="${ry + rh / 2 + 4}" text-anchor="end" font-size="9" font-family="JetBrains Mono" fill="${r.state ? '#0b0e14' : 'var(--muted)'}">${r.note}</text>`;
    });
    return s;
  }

  // ---- B+tree (다진 노드·탐색 경로·연결 리프) ----  [B 하이라이트]
  // nodes: [{id,x,y,keys:[],hl,hlKey,leaf}]  (x,y 0..1)
  // edges: [{from,to}]  parent→child (id 기준)
  // opts.leafOrder: [id,...] 정렬 연결 리프를 점선으로 잇기
  function btree(W, H, nodes, edges, opts = {}) {
    const byId = {}; (nodes || []).forEach(n => byId[n.id] = n);
    const px = n => 20 + n.x * (W - 40);
    const py = n => 24 + n.y * (H - 48);
    const cw = opts.cw || 26, ch = opts.ch || 22;
    const nodeW = n => Math.max(cw, n.keys.length * cw);
    let s = '';
    // edges
    (edges || []).forEach(e => {
      const a = byId[e.from], b = byId[e.to]; if (!a || !b) return;
      const col = e.hl ? C.active : C.line;
      s += `<line x1="${px(a)}" y1="${py(a) + ch / 2 + 2}" x2="${px(b)}" y2="${py(b) - ch / 2 - 2}" stroke="${col}" stroke-width="${e.hl ? 2.4 : 1.3}"/>`;
    });
    // leaf links (sorted doubly-linked)
    const lo = opts.leafOrder || [];
    for (let i = 0; i < lo.length - 1; i++) {
      const a = byId[lo[i]], b = byId[lo[i + 1]]; if (!a || !b) continue;
      const aw = nodeW(a) / 2, bw = nodeW(b) / 2;
      s += `<line x1="${px(a) + aw}" y1="${py(a)}" x2="${px(b) - bw}" y2="${py(b)}" stroke="${C.index}" stroke-width="1.4" stroke-dasharray="4 3"/>`;
    }
    // nodes (key-cell rows)
    (nodes || []).forEach(n => {
      const nw = nodeW(n), x0 = px(n) - nw / 2, y0 = py(n) - ch / 2;
      const border = n.hl ? C.active : (n.leaf ? C.index : C.data);
      s += `<rect x="${x0 - 2}" y="${y0 - 2}" width="${nw + 4}" height="${ch + 4}" rx="4" fill="none" stroke="${border}" stroke-width="${n.hl ? 2.2 : 1.4}"/>`;
      n.keys.forEach((k, i) => {
        const cx = x0 + i * cw, hit = n.hlKey === i;
        s += cell(cx, y0, cw, ch, k, { color: 'var(--line)', fill: hit ? C.active : 'var(--panel)', tcol: hit ? '#0b0e14' : 'var(--ink)', bold: hit, fs: 10.5 });
      });
    });
    return s;
  }

  // ---- 실행계획 트리 (연산자 박스) ----  root:{label,sub,state,children:[]}
  function planTree(W, H, root, opts = {}) {
    let leaf = 0, dmax = 0;
    function assign(nd, d) { nd._d = d; dmax = Math.max(dmax, d);
      if (!nd.children || !nd.children.length) { nd._x = leaf++; return nd._x; }
      const xs = nd.children.map(c => assign(c, d + 1)); nd._x = (Math.min(...xs) + Math.max(...xs)) / 2; return nd._x; }
    assign(root, 0);
    const leaves = Math.max(1, leaf), bw = opts.bw || 96, bh = opts.bh || 36;
    const X = lx => 20 + (leaves === 1 ? 0.5 : lx / (leaves - 1)) * (W - 40 - bw) + bw / 2;
    const Y = d => 24 + (dmax === 0 ? 0 : d / dmax) * (H - 48 - bh) + bh / 2;
    let es = '', ns = '';
    function walk(nd) {
      const x = X(nd._x), y = Y(nd._d);
      (nd.children || []).forEach(c => { es += `<line x1="${x}" y1="${y + bh / 2}" x2="${X(c._x)}" y2="${Y(c._d) - bh / 2}" stroke="${C.line}" stroke-width="1.4"/>`; walk(c); });
      const col = nd.state ? (C[nd.state] || nd.state) : C.data;
      ns += box(x - bw / 2, y - bh / 2, bw, bh, nd.label, { color: col, sub: nd.sub, fs: 11 });
      if (nd.cost != null) ns += `<text x="${x}" y="${y - bh / 2 - 4}" text-anchor="middle" font-size="9" font-family="JetBrains Mono" fill="${C.hot}">비용 ${nd.cost}</text>`;
    }
    walk(root);
    return es + ns;
  }

  // ---- 비용 막대 비교 ("길 고르기") ----  items:[{label,cost,picked,best}]
  function costBar(x, y, w, items, opts = {}) {
    const max = Math.max(1, ...(items || []).map(i => i.cost || 0));
    const bh = opts.bh || 26, gap = opts.gap ?? 10; let s = '';
    (items || []).forEach((it, i) => {
      const by = y + i * (bh + gap), bw = (w - 120) * (it.cost || 0) / max;
      const col = it.best ? C.ok : (it.picked ? C.active : C.data);
      s += `<text x="${x}" y="${by + bh / 2 + 4}" font-size="10.5" font-family="JetBrains Mono" fill="${it.picked ? col : 'var(--muted)'}" font-weight="${it.picked ? 700 : 400}">${it.picked ? '▶ ' : ''}${it.label}</text>`;
      s += `<rect x="${x + 96}" y="${by}" width="${Math.max(2, bw).toFixed(0)}" height="${bh}" rx="4" fill="${col}" opacity="0.9"/>`;
      s += `<text x="${x + 96 + Math.max(2, bw) + 6}" y="${by + bh / 2 + 4}" font-size="10" font-family="JetBrains Mono" fill="${col}">${it.cost}</text>`;
    });
    return s;
  }

  // ---- 트랜잭션 타임라인 (lanes×time) ----  [D 하이라이트]
  // ops: [{lane,t0,dur,label,kind}]  kind: read|write|wait|hold|commit|abort
  function txTimeline(W, H, lanes, ops, tmax, opts = {}) {
    tmax = Math.max(1e-6, tmax);
    const padL = opts.padL || 64, padR = 14, padT = 16, padB = 22;
    const laneH = (H - padT - padB) / Math.max(1, lanes.length);
    const xx = t => padL + (t / tmax) * (W - padL - padR);
    let s = `<defs><pattern id="dbwait" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--slate)" stroke-width="2" opacity="0.5"/></pattern></defs>`;
    lanes.forEach((ln, i) => {
      const y = padT + i * laneH;
      s += `<line x1="${padL}" y1="${y + laneH}" x2="${W - padR}" y2="${y + laneH}" stroke="var(--line)" opacity="0.4"/>`;
      s += `<text x="8" y="${y + laneH / 2 + 4}" font-size="10" font-family="JetBrains Mono" fill="var(--muted)">${ln}</text>`;
    });
    (ops || []).forEach(op => {
      const li = lanes.indexOf(op.lane); if (li < 0) return;
      const y = padT + li * laneH + 4, h = laneH - 8;
      const dur = Math.max(0, op.dur || 0), x0 = xx(op.t0), w = Math.max(3, xx(op.t0 + dur) - x0);
      if (op.kind === 'wait') {
        s += `<rect x="${x0.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="url(#dbwait)" stroke="var(--slate)" stroke-width="1" stroke-dasharray="3 2" opacity="0.7"/>`;
        if (w > 26 && op.label) s += `<text x="${(x0 + w / 2).toFixed(1)}" y="${(y + h / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="9" font-family="JetBrains Mono" fill="var(--muted)">${op.label}</text>`;
      } else if (op.kind === 'hold') {
        s += `<rect x="${x0.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="none" stroke="${C.hot}" stroke-width="1.4" stroke-dasharray="2 2"/>`;
        if (w > 22 && op.label) s += `<text x="${(x0 + w / 2).toFixed(1)}" y="${(y + h / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="8.5" font-family="JetBrains Mono" fill="${C.hot}">${op.label}</text>`;
      } else {
        const col = op.kind === 'write' ? C.ver : op.kind === 'commit' ? C.ok : op.kind === 'abort' ? C.abort : op.kind === 'read' ? C.data : (C[op.kind] || C.data);
        s += `<rect x="${x0.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${col}" opacity="0.92"/>`;
        if (w > 18 && op.label) s += `<text x="${(x0 + w / 2).toFixed(1)}" y="${(y + h / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="9" font-family="JetBrains Mono" fill="#0b0e14" font-weight="700">${op.label}</text>`;
      }
    });
    if (opts.playhead != null) { const pxh = xx(opts.playhead); s += `<line x1="${pxh}" y1="${padT}" x2="${pxh}" y2="${H - padB}" stroke="var(--ink)" stroke-width="1.5"/>`; }
    for (let t = 0; t <= tmax + 1e-6; t += (opts.tick || tmax / 4)) s += `<text x="${xx(t)}" y="${H - 6}" text-anchor="middle" font-size="9" font-family="JetBrains Mono" fill="var(--faint)">${fmt(t, 0)}</text>`;
    return s;
  }

  // ---- 락 호환 행렬 (S/X) ----  held vs requested
  function lockMatrix(x, y, opts = {}) {
    const cs = opts.cs || 46, modes = ['S', 'X']; let s = '';
    s += `<text x="${x + cs + cs}" y="${y - 16}" text-anchor="middle" font-size="9.5" font-family="JetBrains Mono" fill="var(--muted)">요청 ↓ / 보유 →</text>`;
    modes.forEach((m, c) => s += `<text x="${x + cs * (c + 1) + cs / 2}" y="${y + 14}" text-anchor="middle" font-size="11" font-family="JetBrains Mono" fill="${C.hot}" font-weight="700">${m}</text>`);
    // compat: S+S ok, others conflict
    const compat = { 'S,S': true, 'S,X': false, 'X,S': false, 'X,X': false };
    modes.forEach((rm, r) => {
      s += `<text x="${x + cs / 2 + 6}" y="${y + cs * (r + 1) + cs / 2 + 4}" text-anchor="middle" font-size="11" font-family="JetBrains Mono" fill="${C.hot}" font-weight="700">${rm}</text>`;
      modes.forEach((hm, c) => {
        const ok = compat[hm + ',' + rm], cx = x + cs * (c + 1), cy = y + cs * (r + 1);
        const hl = opts.hl && opts.hl[0] === hm && opts.hl[1] === rm;
        s += `<rect x="${cx}" y="${cy}" width="${cs - 3}" height="${cs - 3}" rx="5" fill="${ok ? C.ok : C.conflict}" opacity="${hl ? 0.95 : 0.55}" stroke="${hl ? 'var(--ink)' : 'var(--line)'}" stroke-width="${hl ? 2 : 1}"/>`;
        s += `<text x="${cx + (cs - 3) / 2}" y="${cy + (cs - 3) / 2 + 5}" text-anchor="middle" font-size="13" font-family="JetBrains Mono" fill="#0b0e14" font-weight="700">${ok ? '✓' : '✗'}</text>`;
      });
    });
    return s;
  }

  // ---- MVCC 버전 사슬 + 스냅샷 리더 ----
  // versions: [{ver,val,by,committed}]  readers: [{name,sees,color}]
  function versionChain(W, H, versions, readers, opts = {}) {
    const vs = versions || [], n = vs.length;
    const bw = 78, bh = 40, gap = 30, total = n * bw + (n - 1) * gap;
    const x0 = Math.max(16, (W - total) / 2), y = opts.y || (H / 2 - bh / 2);
    let s = '';
    for (let i = 0; i < n - 1; i++) s += edge(x0 + (i + 1) * bw + i * gap, y + bh / 2, x0 + (i + 1) * (bw + gap), y + bh / 2, { color: C.ver, lw: 1.6 });
    vs.forEach((v, i) => {
      const vx = x0 + i * (bw + gap);
      const col = v.committed === false ? C.wait : C.ver;
      s += box(vx, y, bw, bh, `${v.val}`, { color: col, fs: 13, sub: `v${v.ver}${v.by ? '·' + v.by : ''}` });
    });
    // readers 말풍선 (각자 다른 시간의 사진)
    (readers || []).forEach((rd, k) => {
      const idx = Math.max(0, Math.min(n - 1, rd.sees));
      const vx = x0 + idx * (bw + gap) + bw / 2;
      const ry = (rd.below ? y + bh + 22 : y - 30);
      const col = rd.color || C.data;
      s += `<rect x="${vx - 36}" y="${ry - 13}" width="72" height="22" rx="11" fill="var(--panel)" stroke="${col}" stroke-width="1.4"/>`;
      s += `<text x="${vx}" y="${ry + 2}" text-anchor="middle" font-size="9.5" font-family="JetBrains Mono" fill="${col}" font-weight="700">${rd.name}</text>`;
      s += edge(vx, rd.below ? ry - 13 : ry + 9, vx, rd.below ? y + bh : y, { color: col, lw: 1.2, dash: '3 2' });
    });
    return s;
  }

  // ---- WAL: 로그 스트립 + 데이터 페이지 (로그 먼저) ----
  // log: [{label,state}]  state: '' | 'ok'(flush됨) | 'active'
  function walStrip(W, H, log, opts = {}) {
    const cw = opts.cw || 54, y = opts.y || 34, x0 = 16; let s = '';
    s += `<text x="${x0}" y="${y - 8}" font-size="10" font-family="JetBrains Mono" fill="${C.hot}" font-weight="700">WAL 로그 (먼저 기록)</text>`;
    (log || []).forEach((e, i) => {
      const ex = x0 + i * (cw + 4);
      const f = e.state ? (C[e.state] || e.state) : 'var(--panel)';
      s += `<rect x="${ex}" y="${y}" width="${cw}" height="26" rx="4" fill="${f}" opacity="${e.state ? 0.9 : 1}" stroke="${C.hot}" stroke-width="1"/>`;
      s += `<text x="${ex + cw / 2}" y="${y + 17}" text-anchor="middle" font-size="9.5" font-family="JetBrains Mono" fill="${e.state ? '#0b0e14' : 'var(--ink)'}">${e.label}</text>`;
    });
    return s;
  }

  // ---- 종이 장부 (행 N줄) ----  rows:[{cells:[..],state}]  cols 헤더 opts.head
  function ledger(x, y, w, head, rows, opts = {}) {
    const ncol = head.length, cw = w / ncol, rh = opts.rh || 22; let s = '';
    s += `<rect x="${x}" y="${y}" width="${w}" height="${rh}" fill="var(--panel-2)" stroke="${C.line}" stroke-width="1"/>`;
    head.forEach((hh, c) => s += `<text x="${x + c * cw + cw / 2}" y="${y + 15}" text-anchor="middle" font-size="10" font-family="JetBrains Mono" fill="var(--muted)" font-weight="700">${hh}</text>`);
    (rows || []).forEach((r, i) => {
      const ry = y + rh + i * rh;
      const f = r.state ? (C[r.state] || r.state) : 'var(--panel)';
      s += `<rect x="${x}" y="${ry}" width="${w}" height="${rh}" fill="${f}" opacity="${r.state ? 0.85 : 1}" stroke="${C.line}" stroke-width="0.8"/>`;
      (r.cells || []).forEach((cv, c) => s += `<text x="${x + c * cw + cw / 2}" y="${ry + 15}" text-anchor="middle" font-size="10" font-family="JetBrains Mono" fill="${r.state ? '#0b0e14' : 'var(--ink)'}">${cv}</text>`);
    });
    return s;
  }

  VZ.DB = { C, svg, lerp2, box, pill, edge, packet, cell, kv, page, table, btree, planTree, costBar, txTimeline, lockMatrix, versionChain, walStrip, ledger };
})(window);
