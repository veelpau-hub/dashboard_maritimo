// Gyreo — nautical instrument widgets (vanilla D3 / SVG)
// Ported from instruments.jsx — all SVG, monospaced, Gyreo design system.

// ── polar helper: (cx,cy,r,deg) → [x,y], 0°=North clockwise ──
function _polar(cx, cy, r, deg) {
  const a = (deg - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

// ── arc path helper ──
function _arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = _polar(cx, cy, r, a0);
  const [x1, y1] = _polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
}

// ── SVG namespace helper ──
const SVG_NS = 'http://www.w3.org/2000/svg';
function _svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// ── clear container before drawing ──
function _clearContainer(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '';
  return el;
}

// ─────────────────────────────────────────────────────
// WX-01  COMPASS ROSE — wind direction
// Signature: dibujarBrujula(grados, direccion)
// ─────────────────────────────────────────────────────
function dibujarBrujula(grados, direccion) {
  const container = _clearContainer('brujula-container');
  if (!container) return;

  const cx = 110, cy = 110, r = 92;

  // Wrapper div
  const wrap = document.createElement('div');
  wrap.className = 'compass-wrap';
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;width:100%';

  const svg = _svgEl('svg', { viewBox: '0 0 220 220', class: 'compass', style: 'width:100%;max-width:200px' });

  // Defs
  const defs = _svgEl('defs');
  const grad = _svgEl('radialGradient', { id: 'cmp-glow', cx: '50%', cy: '50%', r: '50%' });
  const s1 = _svgEl('stop', { offset: '60%', 'stop-color': 'transparent' });
  const s2 = _svgEl('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.08' });
  grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); svg.appendChild(defs);

  // Background glow + rings
  svg.appendChild(_svgEl('circle', { cx, cy, r: r + 8, fill: 'url(#cmp-glow)' }));
  svg.appendChild(_svgEl('circle', { cx, cy, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': '1' }));
  svg.appendChild(_svgEl('circle', { cx, cy, r: r - 14, fill: 'none', stroke: 'var(--line)', 'stroke-width': '0.5' }));

  // Radial ticks
  for (let d = 0; d < 360; d += 5) {
    const major = d % 30 === 0;
    const med = d % 10 === 0;
    const len = major ? 10 : med ? 6 : 3;
    const [x1, y1] = _polar(cx, cy, r, d);
    const [x2, y2] = _polar(cx, cy, r - len, d);
    svg.appendChild(_svgEl('line', {
      x1, y1, x2, y2,
      stroke: major ? 'var(--ink-2)' : 'var(--line)',
      'stroke-width': major ? '1' : '0.5'
    }));
  }

  // Cardinal labels
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([lbl, deg]) => {
    const [x, y] = _polar(cx, cy, r - 26, deg);
    const t = _svgEl('text', {
      x, y: y + 4, 'text-anchor': 'middle', class: 'compass-card'
    });
    t.textContent = lbl;
    svg.appendChild(t);
  });

  // Intercardinal labels
  [['NE', 45], ['SE', 135], ['SW', 225], ['NW', 315]].forEach(([lbl, deg]) => {
    const [x, y] = _polar(cx, cy, r - 26, deg);
    const t = _svgEl('text', {
      x, y: y + 3, 'text-anchor': 'middle', class: 'compass-inter'
    });
    t.textContent = lbl;
    svg.appendChild(t);
  });

  // Crosshair
  svg.appendChild(_svgEl('line', { x1: cx, y1: cy - r - 2, x2: cx, y2: cy + r + 2, stroke: 'var(--line)', 'stroke-width': '0.5' }));
  svg.appendChild(_svgEl('line', { x1: cx - r - 2, y1: cy, x2: cx + r + 2, y2: cy, stroke: 'var(--line)', 'stroke-width': '0.5' }));

  // Wind needle group (rotated by wind degrees)
  const needle = _svgEl('g', { transform: `rotate(${grados} ${cx} ${cy})` });
  const arrowPath = _svgEl('path', {
    d: `M ${cx} ${cy - r + 18} L ${cx - 7} ${cy - r + 34} L ${cx} ${cy - r + 28} L ${cx + 7} ${cy - r + 34} Z`,
    fill: 'var(--accent)', stroke: 'var(--accent)', 'stroke-width': '0.5'
  });
  const needleLine = _svgEl('line', {
    x1: cx, y1: cy - r + 28, x2: cx, y2: cy + r - 30,
    stroke: 'var(--accent)', 'stroke-width': '1.5', opacity: '0.6'
  });
  const tailDot = _svgEl('circle', {
    cx, cy: cy + r - 30, r: '3',
    fill: 'var(--bg-1)', stroke: 'var(--accent)', 'stroke-width': '1'
  });
  needle.appendChild(arrowPath);
  needle.appendChild(needleLine);
  needle.appendChild(tailDot);
  svg.appendChild(needle);

  // Center dot
  svg.appendChild(_svgEl('circle', { cx, cy, r: '3', fill: 'var(--accent)' }));

  // Center readout
  const degText = _svgEl('text', { x: cx, y: cy - 6, 'text-anchor': 'middle', class: 'compass-deg' });
  degText.textContent = Math.round(grados) + '°';
  svg.appendChild(degText);

  const dirText = _svgEl('text', { x: cx, y: cy + 10, 'text-anchor': 'middle', class: 'compass-dir' });
  dirText.textContent = direccion;
  svg.appendChild(dirText);

  wrap.appendChild(svg);
  container.appendChild(wrap);
}

// ─────────────────────────────────────────────────────
// WX-02  BEAUFORT GAUGE
// Signature: dibujarBeaufort(valor)
// ─────────────────────────────────────────────────────
function dibujarBeaufort(valor) {
  const container = _clearContainer('beaufort-container');
  if (!container) return;

  const cx = 130, cy = 130, r = 100;
  const a0 = -120, a1 = 120;
  const segs = 12;
  const pct = valor / 12;
  const needle = a0 + (a1 - a0) * pct;
  const beaufortName = ['Calm','Light air','Light breeze','Gentle','Moderate','Fresh','Strong','Near gale','Gale','Strong gale','Storm','Violent storm','Hurricane'];

  const wrap = document.createElement('div');
  wrap.className = 'gauge-wrap';

  const svg = _svgEl('svg', { viewBox: '0 0 260 200', class: 'gauge', style: 'width:100%;max-width:240px' });

  // Segmented arc
  for (let i = 0; i < segs; i++) {
    const sa = a0 + (a1 - a0) * (i / segs);
    const ea = a0 + (a1 - a0) * ((i + 0.92) / segs);
    const active = i < valor;
    let color = 'var(--line)';
    if (active) {
      if (i < 4) color = 'var(--accent)';
      else if (i < 7) color = 'var(--accent-warm)';
      else color = 'var(--alert)';
    }
    svg.appendChild(_svgEl('path', {
      d: _arcPath(cx, cy, r, sa, ea),
      stroke: color,
      'stroke-width': '14',
      fill: 'none',
      opacity: active ? '1' : '0.35'
    }));
  }

  // Tick labels
  [0, 3, 6, 9, 12].forEach(n => {
    const a = a0 + (a1 - a0) * (n / 12);
    const [x, y] = _polar(cx, cy, r - 26, a);
    const t = _svgEl('text', { x, y: y + 3, 'text-anchor': 'middle', class: 'gauge-tick' });
    t.textContent = n;
    svg.appendChild(t);
  });

  // Needle
  const needleG = _svgEl('g', { transform: `rotate(${needle} ${cx} ${cy})` });
  needleG.appendChild(_svgEl('line', { x1: cx, y1: cy, x2: cx, y2: cy - r + 10, stroke: 'var(--ink-1)', 'stroke-width': '2' }));
  needleG.appendChild(_svgEl('circle', { cx, cy: cy - r + 10, r: '3', fill: 'var(--ink-1)' }));
  svg.appendChild(needleG);
  svg.appendChild(_svgEl('circle', { cx, cy, r: '6', fill: 'var(--bg-1)', stroke: 'var(--ink-2)', 'stroke-width': '1' }));

  // Value
  const val = _svgEl('text', { x: cx, y: cy + 34, 'text-anchor': 'middle', class: 'gauge-val' });
  val.textContent = valor;
  svg.appendChild(val);

  const sub = _svgEl('text', { x: cx, y: cy + 52, 'text-anchor': 'middle', class: 'gauge-sub' });
  sub.textContent = 'FORCE · ' + (beaufortName[valor] || '').toUpperCase();
  svg.appendChild(sub);

  wrap.appendChild(svg);
  container.appendChild(wrap);
}

// ─────────────────────────────────────────────────────
// WX-03  PRESSURE GAUGE — barograph style
// Signature: dibujarPresion(valor)
// ─────────────────────────────────────────────────────
function dibujarPresion(valor) {
  const container = _clearContainer('presion-container');
  if (!container) return;

  const cx = 130, cy = 130, r = 96;
  const a0 = -135, a1 = 135;
  const min = 970, max = 1050;
  const pct = (valor - min) / (max - min);
  const needle = a0 + (a1 - a0) * pct;

  const wrap = document.createElement('div');
  wrap.className = 'gauge-wrap';

  const svg = _svgEl('svg', { viewBox: '0 0 260 220', class: 'gauge', style: 'width:100%;max-width:240px' });

  // Main arc
  svg.appendChild(_svgEl('path', {
    d: _arcPath(cx, cy, r, a0, a1),
    stroke: 'var(--line)', 'stroke-width': '6', fill: 'none'
  }));

  // Zone markers
  svg.appendChild(_svgEl('path', {
    d: _arcPath(cx, cy, r, a0, a0 + (a1 - a0) * 0.25),
    stroke: 'var(--alert)', 'stroke-width': '2', fill: 'none', opacity: '0.5'
  }));
  svg.appendChild(_svgEl('path', {
    d: _arcPath(cx, cy, r, a0 + (a1 - a0) * 0.75, a1),
    stroke: 'var(--accent)', 'stroke-width': '2', fill: 'none', opacity: '0.5'
  }));

  // Major ticks + labels
  [970, 990, 1010, 1013, 1030, 1050].forEach(v => {
    const p = (v - min) / (max - min);
    const a = a0 + (a1 - a0) * p;
    const [x1, y1] = _polar(cx, cy, r, a);
    const [x2, y2] = _polar(cx, cy, r - 12, a);
    const [tx, ty] = _polar(cx, cy, r - 24, a);
    const isStd = v === 1013;
    svg.appendChild(_svgEl('line', {
      x1, y1, x2, y2,
      stroke: isStd ? 'var(--accent)' : 'var(--ink-2)',
      'stroke-width': isStd ? '1.5' : '1'
    }));
    const t = _svgEl('text', { x: tx, y: ty + 3, 'text-anchor': 'middle', class: 'gauge-tick' });
    t.textContent = v;
    svg.appendChild(t);
  });

  // Needle
  const needleG = _svgEl('g', { transform: `rotate(${needle} ${cx} ${cy})` });
  needleG.appendChild(_svgEl('line', { x1: cx, y1: cy + 10, x2: cx, y2: cy - r + 14, stroke: 'var(--accent)', 'stroke-width': '2' }));
  const poly = _svgEl('polygon', { points: `${cx - 4},${cy - r + 14} ${cx + 4},${cy - r + 14} ${cx},${cy - r + 6}`, fill: 'var(--accent)' });
  needleG.appendChild(poly);
  svg.appendChild(needleG);
  svg.appendChild(_svgEl('circle', { cx, cy, r: '6', fill: 'var(--bg-1)', stroke: 'var(--accent)', 'stroke-width': '1.5' }));

  // Value
  const valText = _svgEl('text', { x: cx, y: cy + 50, 'text-anchor': 'middle', class: 'gauge-val' });
  valText.textContent = valor.toFixed ? valor.toFixed(1) : valor;
  svg.appendChild(valText);

  const subText = _svgEl('text', { x: cx, y: cy + 68, 'text-anchor': 'middle', class: 'gauge-sub' });
  subText.textContent = 'hPa';
  svg.appendChild(subText);

  wrap.appendChild(svg);
  container.appendChild(wrap);
}

// ─────────────────────────────────────────────────────
// WX-04  WAVE HEIGHT CHART
// Signature: dibujarOlas(containerId, alturaFija)
// ─────────────────────────────────────────────────────
function dibujarOlas(containerId, alturaFija) {
  const container = _clearContainer(containerId);
  if (!container || !horas || !alturas) return;

  const ancho = container.clientWidth || 540;
  const alto = alturaFija || container.clientHeight || 180;
  const pad = { l: 36, r: 12, t: 18, b: 28 };
  const iw = ancho - pad.l - pad.r;
  const ih = alto - pad.t - pad.b;

  const maxVal = (Math.max(...alturas) || 1) * 1.15;

  const svg = d3.select('#' + containerId)
    .append('svg')
    .attr('width', ancho)
    .attr('height', alto);

  const defs = svg.append('defs');
  const gradId = 'wave-area-' + containerId;
  const grad = defs.append('linearGradient')
    .attr('id', gradId)
    .attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
  grad.append('stop').attr('offset', '0%').attr('stop-color', 'var(--accent)').attr('stop-opacity', '0.32');
  grad.append('stop').attr('offset', '100%').attr('stop-color', 'var(--accent)').attr('stop-opacity', '0');

  const x = d3.scalePoint().domain(horas).range([pad.l, pad.l + iw]);
  const y = d3.scaleLinear().domain([0, maxVal]).range([pad.t + ih, pad.t]);

  // Grid lines
  svg.append('g')
    .call(d3.axisLeft(y).ticks(5).tickSize(-(iw)).tickFormat(''))
    .attr('transform', `translate(${pad.l},0)`)
    .selectAll('line')
    .attr('stroke', 'var(--line)')
    .attr('stroke-dasharray', '2 4')
    .attr('stroke-width', '0.5');
  svg.selectAll('.domain').attr('stroke', 'none');

  // Area
  const area = d3.area()
    .x((d, i) => x(horas[i]))
    .y0(pad.t + ih)
    .y1(d => y(d))
    .curve(d3.curveCatmullRom);

  svg.append('path')
    .datum(alturas)
    .attr('fill', `url(#${gradId})`)
    .attr('d', area);

  // Line
  const line = d3.line()
    .x((d, i) => x(horas[i]))
    .y(d => y(d))
    .curve(d3.curveCatmullRom);

  const path = svg.append('path')
    .datum(alturas)
    .attr('fill', 'none')
    .attr('stroke', 'var(--accent)')
    .attr('stroke-width', '1.5')
    .attr('d', line);

  // Animate
  const totalLen = path.node().getTotalLength();
  path.attr('stroke-dasharray', totalLen)
    .attr('stroke-dashoffset', totalLen)
    .transition().duration(1500).ease(d3.easeQuadInOut)
    .attr('stroke-dashoffset', 0);

  // X axis ticks (every 4h)
  svg.append('g')
    .attr('transform', `translate(0,${pad.t + ih})`)
    .call(d3.axisBottom(x).tickValues(horas.filter((d, i) => i % 4 === 0)))
    .selectAll('text')
    .attr('fill', 'var(--ink-3)')
    .attr('font-family', 'var(--mono-font)')
    .attr('font-size', '9px');
  svg.selectAll('.domain').attr('stroke', 'var(--line)');

  // Y axis
  svg.append('g')
    .attr('transform', `translate(${pad.l},0)`)
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text')
    .attr('fill', 'var(--ink-3)')
    .attr('font-family', 'var(--mono-font)')
    .attr('font-size', '9px');

  // NOW marker
  const nowHour = new Date().getHours();
  const nowLabel = String(nowHour).padStart(2, '0') + ':00';
  const nowX = x(nowLabel);
  if (nowX != null && !isNaN(nowX)) {
    svg.append('line')
      .attr('x1', nowX).attr('y1', pad.t)
      .attr('x2', nowX).attr('y2', pad.t + ih)
      .attr('stroke', 'var(--accent-warm)')
      .attr('stroke-width', '1')
      .attr('stroke-dasharray', '3 3');
    const nowT = svg.append('text')
      .attr('x', nowX).attr('y', pad.t - 4)
      .attr('text-anchor', 'middle')
      .attr('class', 'ax-now');
    nowT.textContent = 'NOW';
  }

  // Tooltip
  const tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip-d3')
    .style('opacity', 0);

  svg.selectAll('.wave-point')
    .data(alturas).enter()
    .append('circle')
    .attr('cx', (d, i) => x(horas[i]))
    .attr('cy', d => y(d))
    .attr('r', 4)
    .attr('fill', 'var(--accent)')
    .attr('opacity', 0)
    .on('mouseover', function(event, d) {
      const i = alturas.indexOf(d);
      d3.select(this).attr('opacity', 1).attr('r', 6);
      tooltip.transition().duration(200).style('opacity', 1);
      tooltip.html(`${horas[i]}<br><strong>${d}m</strong>`)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 30) + 'px');
    })
    .on('mouseout', function() {
      d3.select(this).attr('opacity', 0).attr('r', 4);
      tooltip.transition().duration(200).style('opacity', 0);
    });
}

// ─────────────────────────────────────────────────────
// WX-05  DAYLIGHT ARC
// Signature: dibujarSol(sunrise, sunset)
// ─────────────────────────────────────────────────────
function dibujarSol(srStr, ssStr) {
  const container = _clearContainer('sol-container');
  if (!container) return;

  const cx = 140, cy = 150, r = 105;
  const a0 = -90, a1 = 90;
  const segs = 24;

  // Calculate day progress
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [hSR, mSR] = srStr.split(':').map(Number);
  const [hSS, mSS] = ssStr.split(':').map(Number);
  const srMins = hSR * 60 + mSR;
  const ssMins = hSS * 60 + mSS;
  const dayPct = Math.min(1, Math.max(0, (nowMins - srMins) / (ssMins - srMins)));
  const sunAngle = a0 + (a1 - a0) * dayPct;
  const [sx, sy] = _polar(cx, cy, r, sunAngle);

  const nowStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const daylightMins = ssMins - srMins;
  const dlH = Math.floor(daylightMins / 60);
  const dlM = daylightMins % 60;
  const dlStr = `${dlH}:${String(dlM).padStart(2, '0')}`;

  const wrap = document.createElement('div');
  wrap.className = 'sun-wrap';

  const svg = _svgEl('svg', { viewBox: '0 0 280 180', class: 'sun-arc', style: 'width:100%;max-width:280px' });

  // Defs — gradient
  const defs = _svgEl('defs');
  const grad = _svgEl('linearGradient', { id: 'sun-grad', x1: '0', y1: '0', x2: '1', y2: '0' });
  const g1 = _svgEl('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.2' });
  const g2 = _svgEl('stop', { offset: '50%', 'stop-color': 'var(--accent-warm)', 'stop-opacity': '0.6' });
  const g3 = _svgEl('stop', { offset: '100%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.2' });
  grad.appendChild(g1); grad.appendChild(g2); grad.appendChild(g3);
  defs.appendChild(grad); svg.appendChild(defs);

  // Horizon line
  svg.appendChild(_svgEl('line', { x1: '20', y1: cy, x2: '260', y2: cy, stroke: 'var(--line)', 'stroke-width': '0.5', 'stroke-dasharray': '2 3' }));

  // Arc segments
  for (let i = 0; i < segs; i++) {
    const sa = a0 + (a1 - a0) * (i / segs);
    const ea = a0 + (a1 - a0) * ((i + 0.85) / segs);
    const active = (i / segs) <= dayPct;
    svg.appendChild(_svgEl('path', {
      d: _arcPath(cx, cy, r, sa, ea),
      stroke: active ? 'url(#sun-grad)' : 'var(--line)',
      'stroke-width': active ? '2' : '1',
      fill: 'none',
      opacity: active ? '0.9' : '0.4'
    }));
  }

  // Sun glow + dot
  svg.appendChild(_svgEl('circle', { cx: sx, cy: sy, r: '9', fill: 'var(--accent-warm)', opacity: '0.25' }));
  svg.appendChild(_svgEl('circle', { cx: sx, cy: sy, r: '5', fill: 'var(--accent-warm)' }));

  // Labels
  const srX = cx - r, ssX = cx + r;
  const t1 = _svgEl('text', { x: srX, y: cy + 18, 'text-anchor': 'middle', class: 'sun-edge' });
  t1.textContent = srStr;
  const t2 = _svgEl('text', { x: ssX, y: cy + 18, 'text-anchor': 'middle', class: 'sun-edge' });
  t2.textContent = ssStr;
  const l1 = _svgEl('text', { x: srX, y: cy + 30, 'text-anchor': 'middle', class: 'sun-edge-lbl' });
  l1.textContent = 'SUNRISE';
  const l2 = _svgEl('text', { x: ssX, y: cy + 30, 'text-anchor': 'middle', class: 'sun-edge-lbl' });
  l2.textContent = 'SUNSET';
  const nowT = _svgEl('text', { x: cx, y: cy - r - 10, 'text-anchor': 'middle', class: 'sun-now' });
  nowT.textContent = nowStr;
  svg.appendChild(t1); svg.appendChild(t2);
  svg.appendChild(l1); svg.appendChild(l2);
  svg.appendChild(nowT);

  wrap.appendChild(svg);

  // Footer
  const foot = document.createElement('div');
  foot.className = 'sun-foot';
  foot.innerHTML = `
    <div><span class="stat-k">DAYLIGHT</span><span class="stat-v sm">${dlStr}</span></div>
    <div><span class="stat-k">SR/SS</span><span class="stat-v sm">${srStr}&middot;${ssStr}</span></div>`;
  wrap.appendChild(foot);

  container.appendChild(wrap);
}

// ─────────────────────────────────────────────────────
// WX-06  THERMOMETER — air / sea / feel
// Signature: dibujarTermometro(air, sea, feel) [called from main flow]
// Also: dibujarTempAgua(valor) for sea temp widget
// ─────────────────────────────────────────────────────
function dibujarTermometro(airVal, seaVal, feelVal) {
  const container = _clearContainer('termometro-container');
  if (!container) return;

  const air = parseFloat(airVal) || 0;
  const sea = parseFloat(seaVal) || 0;
  const feel = parseFloat(feelVal) || 0;
  const tMin = 0, tMax = 35;
  const pct = Math.min(1, Math.max(0, (air - tMin) / (tMax - tMin)));
  const seaPct = Math.min(1, Math.max(0, (sea - tMin) / (tMax - tMin)));

  const wrap = document.createElement('div');
  wrap.className = 'thermo-wrap';

  // Thermometer SVG column
  const col = document.createElement('div');
  col.className = 'thermo-col';

  const svg = _svgEl('svg', { viewBox: '0 0 60 200', class: 'thermo', style: 'width:60px;height:200px' });
  const defs = _svgEl('defs');
  const grad = _svgEl('linearGradient', { id: 'thermo-fill', x1: '0', y1: '1', x2: '0', y2: '0' });
  const gs1 = _svgEl('stop', { offset: '0%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.2' });
  const gs2 = _svgEl('stop', { offset: '50%', 'stop-color': 'var(--accent)', 'stop-opacity': '0.7' });
  const gs3 = _svgEl('stop', { offset: '100%', 'stop-color': 'var(--accent-warm)' });
  grad.appendChild(gs1); grad.appendChild(gs2); grad.appendChild(gs3);
  defs.appendChild(grad); svg.appendChild(defs);

  // Tube background
  svg.appendChild(_svgEl('rect', { x: '22', y: '10', width: '16', height: '160', rx: '8', fill: 'var(--bg-2)', stroke: 'var(--line)', 'stroke-width': '1' }));

  // Fill
  const fillH = pct * 156;
  svg.appendChild(_svgEl('rect', { x: '24', y: String(10 + (1 - pct) * 156), width: '12', height: String(fillH), fill: 'url(#thermo-fill)' }));

  // Bulb
  svg.appendChild(_svgEl('circle', { cx: '30', cy: '180', r: '14', fill: 'var(--accent-warm)' }));
  svg.appendChild(_svgEl('circle', { cx: '30', cy: '180', r: '9', fill: 'var(--accent)', opacity: '0.6' }));

  // Sea level marker
  svg.appendChild(_svgEl('line', {
    x1: '14', y1: String(10 + (1 - seaPct) * 156),
    x2: '46', y2: String(10 + (1 - seaPct) * 156),
    stroke: 'var(--accent-2)', 'stroke-width': '1', 'stroke-dasharray': '2 2'
  }));

  // Ticks
  [0, 10, 20, 30].forEach(v => {
    const p = (v - tMin) / (tMax - tMin);
    const yy = 10 + (1 - p) * 156;
    svg.appendChild(_svgEl('line', { x1: '38', y1: yy, x2: '44', y2: yy, stroke: 'var(--ink-2)', 'stroke-width': '0.5' }));
    const t = _svgEl('text', { x: '48', y: yy + 3, class: 'thermo-tick' });
    t.textContent = v;
    svg.appendChild(t);
  });

  col.appendChild(svg);
  wrap.appendChild(col);

  // Data column
  const data = document.createElement('div');
  data.className = 'thermo-data';
  data.innerHTML = `
    <div class="thermo-row">
      <span class="thermo-k">AIR</span>
      <span class="thermo-v">${air.toFixed(1)}<sup>&deg;C</sup></span>
    </div>
    <div class="thermo-row">
      <span class="thermo-k">SEA</span>
      <span class="thermo-v dim">${sea > 0 ? sea.toFixed(1) : '–'}<sup>${sea > 0 ? '°C' : ''}</sup></span>
    </div>
    <div class="thermo-row">
      <span class="thermo-k">FEEL</span>
      <span class="thermo-v dim">${feel.toFixed(1)}<sup>&deg;C</sup></span>
    </div>`;
  wrap.appendChild(data);
  container.appendChild(wrap);
}

// ─────────────────────────────────────────────────────
// WX-07  VISIBILITY — bar chart style
// Signature: dibujarVisibilidad(km)
// ─────────────────────────────────────────────────────
function dibujarVisibilidad(km) {
  const container = _clearContainer('visibilidad-container');
  if (!container) return;

  const maxKm = 25;
  const pct = Math.min(km / maxKm, 1);
  const bars = 28;
  const visLabel = km > 10 ? 'EXCELLENT — clear horizon' : km > 4 ? 'GOOD' : km > 1 ? 'MODERATE' : 'POOR';
  const dotColor = km > 10 ? 'var(--good)' : km > 4 ? 'var(--accent)' : km > 1 ? 'var(--accent-warm)' : 'var(--alert)';

  const wrap = document.createElement('div');
  wrap.className = 'vis-wrap';

  // Readout
  const readout = document.createElement('div');
  readout.className = 'vis-readout';
  readout.innerHTML = `<span class="vis-val">${parseFloat(km).toFixed(1)}</span><span class="vis-unit">km</span>`;
  wrap.appendChild(readout);

  // Bars
  const barsDiv = document.createElement('div');
  barsDiv.className = 'vis-bars';
  for (let i = 0; i < bars; i++) {
    const filled = (i / bars) < pct;
    const bar = document.createElement('i');
    bar.className = 'vis-bar' + (filled ? ' on' : '');
    bar.style.height = (20 + (i / bars) * 60) + '%';
    barsDiv.appendChild(bar);
  }
  wrap.appendChild(barsDiv);

  // Scale
  const scale = document.createElement('div');
  scale.className = 'vis-scale';
  scale.innerHTML = '<span>0</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25+</span>';
  wrap.appendChild(scale);

  // Status
  const status = document.createElement('div');
  status.className = 'vis-status';
  status.style.color = dotColor;
  status.innerHTML = `<span class="vis-dot" style="background:${dotColor};box-shadow:0 0 6px ${dotColor}"></span><span>${visLabel}</span>`;
  wrap.appendChild(status);

  container.appendChild(wrap);
}

// ─────────────────────────────────────────────────────
// WX-08  HUMIDITY — track bar + dew point
// Signature: dibujarHumedad(rh, dew)
// ─────────────────────────────────────────────────────
function dibujarHumedad(rh, dew) {
  const container = _clearContainer('humidity-container');
  if (!container) return;

  const rhVal = Math.round(parseFloat(rh) || 0);
  const dewVal = parseFloat(dew) || 0;

  const wrap = document.createElement('div');
  wrap.className = 'hum-wrap';

  wrap.innerHTML = `
    <div class="hum-readout">
      <span class="hum-val">${rhVal}</span><span class="hum-unit">%</span>
    </div>
    <div class="hum-track">
      <div class="hum-fill" style="width:${rhVal}%"></div>
    </div>
    <div class="hum-foot">
      <span class="stat-k">DEW</span>
      <span class="stat-v sm">${dewVal.toFixed(1)}&deg;C</span>
    </div>`;

  container.appendChild(wrap);
}

// ─────────────────────────────────────────────────────
// WX-09  SEA TEMPERATURE (thermometer variant)
// Signature: dibujarTempAgua(valor)
// ─────────────────────────────────────────────────────
function dibujarTempAgua(valor) {
  const container = _clearContainer('temp-agua-container');
  if (!container) return;

  const v = parseFloat(valor) || 0;
  const tMin = 10, tMax = 30;
  const pct = Math.min(1, Math.max(0, (v - tMin) / (tMax - tMin)));
  const color = v < 18 ? 'var(--accent)' : v < 24 ? 'var(--good)' : 'var(--accent-warm)';

  const wrap = document.createElement('div');
  wrap.className = 'thermo-wrap';
  wrap.style.justifyContent = 'center';

  const col = document.createElement('div');
  col.className = 'thermo-col';

  const svg = _svgEl('svg', { viewBox: '0 0 60 200', class: 'thermo', style: 'width:60px;height:160px' });

  // Tube
  svg.appendChild(_svgEl('rect', { x: '22', y: '10', width: '16', height: '140', rx: '8', fill: 'var(--bg-2)', stroke: 'var(--line)', 'stroke-width': '1' }));
  const fillH = pct * 136;
  svg.appendChild(_svgEl('rect', { x: '24', y: String(10 + (1 - pct) * 136), width: '12', height: String(fillH), fill: color }));
  svg.appendChild(_svgEl('circle', { cx: '30', cy: '160', r: '12', fill: color }));

  col.appendChild(svg);
  wrap.appendChild(col);

  const data = document.createElement('div');
  data.className = 'thermo-data';
  data.innerHTML = `
    <div class="thermo-row">
      <span class="thermo-k">SEA</span>
      <span class="thermo-v" style="color:${color}">${v.toFixed(1)}<sup>&deg;C</sup></span>
    </div>`;
  wrap.appendChild(data);
  container.appendChild(wrap);
}

// ─────────────────────────────────────────────────────
// LEGACY no-op / compatibility
// ─────────────────────────────────────────────────────
function dibujarOlaIndicador(max, min, media) {
  // No longer displayed as a standalone widget in Gyreo layout.
  // Data is shown in the WX-04 wave chart footer instead.
}

// ─────────────────────────────────────────────────────
// INITIALISATION
// Called after DOM ready, variables populated by index.html
// ─────────────────────────────────────────────────────
(function initWidgets() {
  // Temperature widget: air + sea + feel
  if (document.getElementById('termometro-container')) {
    const seaVal = typeof tempAguaValor !== 'undefined' ? tempAguaValor : 0;
    dibujarTermometro(tempC, seaVal || 0, sensacionC);
  }

  // Pressure
  if (document.getElementById('presion-container')) dibujarPresion(presionValor);

  // Visibility
  if (document.getElementById('visibilidad-container')) dibujarVisibilidad(visibilidadValor);

  // Sea temp
  if (document.getElementById('temp-agua-container') && tempAguaValor) dibujarTempAgua(tempAguaValor);

  // Wave chart (main) — slight delay to ensure container has width
  setTimeout(() => {
    if (document.getElementById('grafico-olas')) dibujarOlas('grafico-olas', null);
  }, 50);

  // Compass rose
  if (document.getElementById('brujula-container')) dibujarBrujula(vientoGrados, vientoDir);

  // Beaufort
  if (document.getElementById('beaufort-container')) dibujarBeaufort(beaufortValor);

  // Sun arc
  if (document.getElementById('sol-container')) dibujarSol(sunrise, sunset);

  // Humidity — loaded asynchronously once /api/datos returns humidity
  // (called from index.html inline script loadHumidityWidget())
})();
