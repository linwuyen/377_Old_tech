/**
 * A numerical lesson, not a plant or hardware simulation.
 * JS Number uses double precision; the firmware fields use float32.
 * runPI ordering: Include/PID_Control_Module.h, lines 140–184.
 */
export function simulatePI({ kp = 1.2, ki = 0.08, limit = 1, amplitude = 1, samples = 100, mode = 'firmware' } = {}) {
  if (![kp, ki, limit, amplitude].every(Number.isFinite) || limit <= 0) {
    throw new RangeError('PI parameters must be finite, and limit must be positive.');
  }
  if (!Number.isInteger(samples) || samples < 1 || samples > 10000) {
    throw new RangeError('samples must be an integer between 1 and 10000.');
  }
  if (!['firmware', 'unconditional'].includes(mode)) {
    throw new RangeError('mode must be firmware or unconditional.');
  }

  let ui = 0;
  let previousOut = 0;
  let previousPre = 0;
  const points = [];
  for (let index = 0; index < samples; index += 1) {
    const error = index < Math.ceil(samples / 2) ? amplitude : -0.35 * amplitude;
    const up = kp * error;
    // This compares the PREVIOUS call's values, before current OutPreSat is set.
    const frozen = mode === 'firmware' && previousOut !== previousPre;
    if (!frozen) ui += ki * up;
    const pre = up + ui;
    const out = Math.max(-limit, Math.min(limit, pre));
    points.push({ n: index + 1, error, up, ui, pre, out, frozen });
    previousOut = out;
    previousPre = pre;
  }
  return points;
}

const SOURCE_URL = 'https://github.com/linwuyen/ASR5K_Old/blob/5262007b56d420c74ac892692ea4d3969a3e3992/ASR5K_28377/TRACE_ASR5000_F28377S/Include/PID_Control_Module.h#L140-L184';
let labCount = 0;

/** Mount one self-contained, accessible lab. Returns a listener cleanup function. */
export function renderLab(container) {
  if (!container || typeof container.querySelector !== 'function') throw new TypeError('renderLab needs a DOM container.');
  const id = `pi-lab-${++labCount}`;
  const control = (name, title, min, max, step, value, hint) => `
    <div class="pi-control">
      <label for="${id}-${name}"><span>${title}</span><output data-output="${name}" for="${id}-${name}">${value}</output></label>
      <input id="${id}-${name}" data-control="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
      <small>${hint}</small>
    </div>`;
  container.innerHTML = `
    <style>
      .pi-lab{--pi-output:#24b9a3;--pi-integral:#d59a45;--pi-muted:color-mix(in srgb,currentColor 62%,transparent)}
      .pi-lab .lab-layout{display:grid;grid-template-columns:minmax(210px,.65fr) minmax(0,1.9fr);gap:28px;align-items:start}
      .pi-lab .lab-controls{display:grid;gap:20px;min-width:0}
      .pi-lab .pi-control label{display:flex;justify-content:space-between;gap:12px;font-size:14px;font-weight:600}
      .pi-lab output,.pi-lab .pi-number{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
      .pi-lab .pi-control output{color:var(--pi-output)}
      .pi-lab input[type=range]{display:block;width:100%;margin:12px 0 5px;accent-color:var(--pi-output);cursor:pointer;min-height:24px}
      .pi-lab small{color:var(--pi-muted);font-size:12px;line-height:1.65}
      .pi-lab select{width:100%;padding:10px 11px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:7px;background:var(--panel,#171c22);color:inherit;font:inherit;font-size:13px;line-height:1.5;margin-top:8px}
      .pi-lab .pi-mode-label{font-size:13px;font-weight:600}
      .pi-lab .lab-chart{min-width:0;margin:0}
      .pi-lab svg{display:block;width:100%;height:auto;overflow:visible;font-family:inherit}
      .pi-lab svg text{fill:currentColor;font-size:12px}
      .pi-lab .pi-legend{display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:12px;margin-bottom:14px}
      .pi-lab .pi-legend span{display:inline-flex;gap:7px;align-items:center}
      .pi-lab .pi-legend i{display:inline-block;width:17px;border-top:3px solid var(--pi-output)}
      .pi-lab .pi-legend .pi-integral{border-color:var(--pi-integral)}
      .pi-lab .pi-legend .pi-limit{border-color:currentColor;border-top-style:dashed;opacity:.5}
      .pi-lab .pi-legend .pi-count{margin-left:auto;color:var(--pi-muted)}
      .pi-lab .pi-sample{margin:14px 0 12px}
      .pi-lab .pi-status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 0;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}
      .pi-lab .pi-status dt{font-size:11px;color:var(--pi-muted);margin-bottom:5px}
      .pi-lab .pi-status dd{margin:0;font-size:16px}
      .pi-lab .pi-note{font-size:13px;line-height:1.85;color:var(--pi-muted);margin:14px 0 0}
      .pi-lab .equation{font-size:13px;line-height:1.8;white-space:normal;padding:13px 16px;margin:22px 0 12px;border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
      .pi-lab .pi-explanation{font-size:13px;line-height:1.9;margin:12px 0}
      .pi-lab .pi-reset{justify-self:start;font-size:12px;padding:8px 13px;cursor:pointer}
      .pi-lab .source-link{font-size:12px;overflow-wrap:anywhere}
      .pi-lab :focus-visible{outline:2px solid var(--pi-output);outline-offset:4px}
      @media(max-width:720px){.pi-lab .lab-layout{grid-template-columns:1fr;gap:26px}.pi-lab .lab-controls{grid-template-columns:1fr 1fr;gap:17px}.pi-lab .pi-mode{grid-column:1/-1}.pi-lab .pi-status{gap:6px}.pi-lab .pi-status dd{font-size:14px}.pi-lab .pi-legend .pi-count{margin-left:0}}
      @media(max-width:360px){.pi-lab .lab-controls{grid-template-columns:1fr}.pi-lab .pi-status{grid-template-columns:1fr 1fr}}
    </style>
    <div class="pi-lab">
      <div class="lab-layout">
        <div class="lab-controls">
          <div class="pi-mode">
            <label class="pi-mode-label" for="${id}-mode">積分更新方式</label>
            <select id="${id}-mode" data-control="mode">
              <option value="firmware">韌體邏輯 · 前一拍飽和時凍結</option>
              <option value="unconditional">對照實驗 · 無條件積分（非韌體）</option>
            </select>
          </div>
          ${control('kp', '比例增益 Kp', 0, 3, 0.05, 1.2, 'Up = Kp × error')}
          ${control('ki', '積分係數 Ki', 0, 0.2, 0.005, 0.08, '每拍增加 Ki × Up；不是 Ki × error')}
          ${control('limit', '輸出上限 OutMax', 0.25, 2, 0.05, 1, '本實驗設定 OutMin = −OutMax')}
          ${control('amplitude', '合成誤差振幅 A', 0, 2, 0.05, 1, '第 1–50 拍：+A；第 51–100 拍：−0.35A')}
          <button class="btn pi-reset" type="button" data-reset>還原參數</button>
        </div>
        <figure class="lab-chart">
          <div class="pi-legend" aria-label="圖例">
            <span><i aria-hidden="true"></i>輸出 Out</span>
            <span><i class="pi-integral" aria-hidden="true"></i>積分 Ui</span>
            <span><i class="pi-limit" aria-hidden="true"></i>上下限 ±OutMax</span>
            <span class="pi-count">100 拍 · 無量綱</span>
          </div>
          <svg data-chart viewBox="0 0 700 310" role="img" aria-labelledby="${id}-chart-title ${id}-chart-description"></svg>
          <div class="pi-sample">${control('sample', '逐拍觀察', 1, 100, 1, 51, '拖動游標，對照當拍數值與前一拍的飽和判斷。')}</div>
          <div data-status aria-live="polite" aria-atomic="true"></div>
          <figcaption class="pi-note">固定輸入一段合成誤差，在第 51 拍反向。這是 PI 數值序列教學，未包含電源電路、負載或閉迴路受控系統模型。</figcaption>
        </figure>
      </div>
      <div class="equation">e[n] = Ref − Fdb &nbsp;·&nbsp; Up[n] = Kp × e[n]<br>Ui[n] = Ui[n−1] + Ki × Up[n]（僅前一拍 Out = OutPreSat 時）<br>OutPreSat[n] = Up[n] + Ui[n] &nbsp;·&nbsp; Out[n] = clamp(OutPreSat[n], −OutMax, OutMax)</div>
      <p class="pi-explanation"><strong>先看上一拍，再算這一拍。</strong>韌體在更新 OutPreSat 前比較 Out 與 OutPreSat，因此即使當拍誤差反向，也會先沿用前一拍的飽和判斷。當前一拍剛好等於上限、沒有被截斷時，積分仍可更新。切換到「無條件積分」可觀察持續累積的差異；該選項僅用於對照。</p>
      <p class="pi-note">數值條件：Ui、Out、OutPreSat 初始值皆為 0。網頁使用 JavaScript 雙精度浮點數；韌體欄位為 float32，因此此圖不是位元精確的韌體模擬。Ki 的原始註解為 T/Ti，本實驗不指定真實取樣週期，也不提供硬體調參建議。</p>
      <p><a class="source-link" href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">查看依據：PID_Control_Module.h · runPI · L140–184 ↗</a></p>
    </div>`;

  const controls = Object.fromEntries([...container.querySelectorAll('[data-control]')].map(element => [element.dataset.control, element]));
  const chart = container.querySelector('[data-chart]');
  const status = container.querySelector('[data-status]');
  const format = value => Math.abs(value) < 0.00005 ? '0.000' : value.toFixed(3);

  function update() {
    const options = { kp: +controls.kp.value, ki: +controls.ki.value, limit: +controls.limit.value, amplitude: +controls.amplitude.value, mode: controls.mode.value };
    const points = simulatePI(options);
    const selected = points[+controls.sample.value - 1];
    for (const [name, element] of Object.entries(controls)) {
      const output = container.querySelector(`[data-output="${name}"]`);
      if (output) output.value = name === 'sample' ? `${element.value} / 100` : name === 'ki' ? (+element.value).toFixed(3) : (+element.value).toFixed(2);
    }
    const frame = { left: 54, right: 680, top: 30, bottom: 263 };
    const max = Math.max(options.limit, ...points.map(point => Math.abs(point.ui)), 0.1) * 1.18;
    const x = n => frame.left + ((n - 1) / 99) * (frame.right - frame.left);
    const y = value => (frame.top + frame.bottom) / 2 - (value / max) * (frame.bottom - frame.top) / 2;
    const path = key => points.map((point, index) => `${index ? 'L' : 'M'}${x(point.n).toFixed(2)},${y(point[key]).toFixed(2)}`).join(' ');
    const grid = [-max, -max / 2, 0, max / 2, max].map(value => `
      <line x1="${frame.left}" x2="${frame.right}" y1="${y(value)}" y2="${y(value)}" stroke="currentColor" opacity="${value === 0 ? '.22' : '.08'}"/>
      <text x="44" y="${y(value) + 4}" text-anchor="end" opacity=".6">${value.toFixed(1)}</text>`).join('');
    const ticks = [1, 25, 50, 75, 100].map(n => `<text x="${x(n)}" y="285" text-anchor="middle" opacity=".6">${n}</text>`).join('');
    const limitLines = [-options.limit, options.limit].map(value => `<line x1="${frame.left}" x2="${frame.right}" y1="${y(value)}" y2="${y(value)}" stroke="currentColor" stroke-dasharray="5 5" opacity=".4"/>`).join('');
    const frozenTicks = points.filter(point => point.frozen).map(point => `<line x1="${x(point.n)}" x2="${Math.min(x(point.n) + 4, frame.right)}" y1="${frame.top - 9}" y2="${frame.top - 9}" stroke="var(--pi-integral)" stroke-width="3" opacity=".55"/>`).join('');
    chart.innerHTML = `
      <title id="${id}-chart-title">PI 輸出與積分的 100 拍數值序列</title>
      <desc id="${id}-chart-description">綠線為輸出，橙線為積分，虛線為正負 ${options.limit} 的輸出限值。第 51 拍誤差反向。上緣橙色短線表示該拍積分凍結。${options.mode === 'firmware' ? '使用韌體凍結邏輯。' : '使用非韌體的無條件積分對照模式。'}</desc>
      ${grid}${ticks}${limitLines}${frozenTicks}
      <line x1="${x(51)}" x2="${x(51)}" y1="${frame.top}" y2="${frame.bottom}" stroke="currentColor" stroke-dasharray="3 5" opacity=".22"/>
      <text x="${x(51) + 7}" y="16" opacity=".65">誤差反向</text>
      <text x="${frame.left}" y="16" opacity=".6">積分凍結區間</text>
      <path d="${path('ui')}" fill="none" stroke="var(--pi-integral)" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="${path('out')}" fill="none" stroke="var(--pi-output)" stroke-width="3" stroke-linejoin="round"/>
      <line x1="${x(selected.n)}" x2="${x(selected.n)}" y1="${frame.top}" y2="${frame.bottom}" stroke="currentColor" opacity=".45"/>
      <circle cx="${x(selected.n)}" cy="${y(selected.out)}" r="5" fill="var(--pi-output)" stroke="var(--panel,#171c22)" stroke-width="2"/>
      <circle cx="${x(selected.n)}" cy="${y(selected.ui)}" r="4" fill="var(--pi-integral)" stroke="var(--panel,#171c22)" stroke-width="2"/>
      <text x="680" y="307" text-anchor="end" opacity=".6">取樣拍數 n（非真實時間）</text>`;
    const gate = options.mode === 'unconditional' ? '無條件更新（對照模式）' : selected.frozen ? '凍結：前一拍曾被限幅' : '更新：前一拍未被限幅';
    const saturated = selected.out !== selected.pre;
    status.innerHTML = `
      <dl class="pi-status">
        <div><dt>誤差 e · 第 ${selected.n} 拍</dt><dd class="pi-number">${format(selected.error)}</dd></div>
        <div><dt>比例 Up</dt><dd class="pi-number">${format(selected.up)}</dd></div>
        <div><dt>積分 Ui</dt><dd class="pi-number">${format(selected.ui)}</dd></div>
        <div><dt>輸出 Out</dt><dd class="pi-number">${format(selected.out)}</dd></div>
      </dl>
      <p class="pi-note">積分狀態：<strong>${gate}</strong>。當拍 OutPreSat = <span class="pi-number">${format(selected.pre)}</span>，${saturated ? '輸出已被限幅' : '輸出未被限幅'}。</p>`;
  }

  function reset(event) {
    if (!event.target.closest('[data-reset]')) return;
    const defaults = { kp: 1.2, ki: 0.08, limit: 1, amplitude: 1, sample: 51, mode: 'firmware' };
    for (const [name, value] of Object.entries(defaults)) controls[name].value = value;
    update();
  }
  container.addEventListener('input', update);
  container.addEventListener('click', reset);
  update();
  return () => {
    container.removeEventListener('input', update);
    container.removeEventListener('click', reset);
  };
}
