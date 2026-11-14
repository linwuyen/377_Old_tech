import { DEFAULTS, PRESETS, simulateClosedLoop } from './simulation.js';
import { renderLabGuide } from './lab-guide.js';
import { renderFrequencyPanel } from './frequency-view.js';
import { renderFrequencyGuide } from './frequency-guide.js';
import { renderDelayGuide } from './delay-guide.js';

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

const number = (value, digits = 3) => Math.abs(value) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : value.toFixed(digits);
const duration = metric => metric.status === 'measured' ? `${number(metric.value)} s` : metric.status === 'not-applicable' ? '不適用' : metric.status === 'insufficient-window' ? '觀察時間不足' : '觀察窗內未達成';
let labCount = 0;

/** Mount a deterministic, source-grounded educational closed loop. */
export function renderLab(container) {
  if (!container?.querySelector) throw new TypeError('renderLab needs a DOM container.');
  const id = `closed-loop-${++labCount}`;
  const specs = [
    ['kp', '比例增益 Kp', 0, 8, 0.05, 'Up = Kp × e；較大增益可觀察極點越界'],
    ['ki', '每拍積分係數 Ki', 0, 0.4, 0.005, 'Ui 每拍增加 Ki × Up'],
    ['ts', '控制取樣週期 Ts（s）', 0.005, 0.1, 0.005, '控制器呼叫間隔；改變 Ts 時保持 Ki'],
    ['load', '負載擾動 d', 0, 1.2, 0.05, '3 s 加載、5 s 卸載；無量綱'],
    ['limit', '輸出限幅 ±Umax', 0.5, 1.5, 0.05, '對稱限幅；模型直流增益為 1'],
    ['delaySamples', '額外控制延遲 D（拍）', 0, 8, 1, '命令限幅後延遲 D 拍，再作用於被控體'],
    ['cutoffHz', '量測低通截止 fc（Hz）', 0.1, 45, 0.1, '預扭曲 Tustin；fc 處為 −3.01 dB']
  ];
  const controlsHTML = specs.map(([key, label, min, max, step, hint]) => `${key === 'delaySamples' ? '<div class="cl-dynamics-title">延遲與量測路徑</div>' : ''}${key === 'cutoffHz' ? `<label class="cl-checkbox cl-filter-toggle"><input type="checkbox" data-filter-enabled>啟用量測低通 F(z)</label>` : ''}<div class="cl-control" data-parameter-group="${key}">
    <label for="${id}-${key}">${label}</label>
    <input type="number" id="${id}-${key}-value" data-number="${key}" aria-label="${label}數值" min="${min}" max="${max}" step="${step}" value="${DEFAULTS[key]}">
    <input type="range" id="${id}-${key}" data-param="${key}" aria-describedby="${id}-${key}-hint" min="${min}" max="${max}" step="${step}" value="${DEFAULTS[key]}">
    <small id="${id}-${key}-hint">${hint}</small></div>`).join('');
  container.innerHTML = `<div class="closed-loop-lab">
    <div class="cl-intro"><span class="cl-badge">CLOSED LOOP / 一階教學模型</span><div class="cl-nav-links"><button type="button" class="cl-text-button" data-frequency-nav>Bode / 極點 ↓</button><button type="button" class="cl-text-button" data-guide>模型、公式與原碼 ↓</button></div></div>
    <div class="cl-presets" role="group" aria-label="實驗情境">${PRESETS.map(p => `<button type="button" data-preset="${p.id}" aria-pressed="false" title="${p.description}">${p.label}</button>`).join('')}</div>
    <p class="cl-preset-note" data-preset-note>每次調整即從零初始狀態重算完整實驗。</p>
    <div class="cl-workbench">
      <section class="cl-controls" aria-label="閉迴路模擬參數">
        <div class="cl-mode"><label for="${id}-mode">積分更新方式</label><select id="${id}-mode" data-mode><option value="firmware">原碼邏輯 · 上一拍飽和凍結</option><option value="unconditional">對照實驗 · 無條件積分</option></select></div>
        ${controlsHTML}
        <p class="cl-dynamics-note" data-dynamics-note></p>
        <p class="cl-clamp-note" data-cutoff-adjustment role="status" hidden></p>
        <button type="button" class="cl-controls-jump" data-bypass-dynamics>旁路延遲與低通（保留增益）</button>
        <p class="cl-parameter-error" data-parameter-error role="status" hidden>請輸入範圍內且符合步進的數值；圖表保留上次有效結果。</p>
        <p class="cl-equivalent" data-equivalent></p>
        <label class="cl-checkbox"><input type="checkbox" data-compare checked>疊加另一種積分方式的對照曲線</label>
        <button type="button" class="btn secondary cl-reset" data-reset>還原預設參數</button>
        <button type="button" class="cl-controls-jump" data-frequency-nav>觀察 Bode 圖與極點 ↓</button>
      </section>
      <section class="cl-results" aria-label="模擬結果">
        <div class="cl-metrics" data-metrics></div>
        <p class="cl-feasibility" data-feasibility></p>
        <div class="cl-legend"><span class="cl-y">實體 y / 命令 u</span><span class="cl-measurement" data-dynamics-legend>量測 m / 致動 ua</span><span class="cl-r">目標 r / 限幅</span><span class="cl-i">積分 Ui</span><span class="cl-other" data-compare-legend>對照</span></div>
        <figure class="cl-figure"><div class="cl-chart-scroll" tabindex="0" aria-label="響應圖表，可水平捲動"><svg data-chart viewBox="0 0 900 550" role="img" aria-labelledby="${id}-title ${id}-desc"></svg></div>
          <figcaption>上圖：目標、實體輸出 y、濾波後回授 m；下圖：限幅命令 u、延遲後致動 ua、積分 Ui。藍線只在對應功能啟用時顯示。橙底為負載期間，紅／橙上緣為命令限幅／積分凍結。點圖或拖動游標逐拍核對。</figcaption>
        </figure>
        <div class="cl-cursor"><label for="${id}-sample">逐拍觀察 <output data-sample-label for="${id}-sample"></output></label><input id="${id}-sample" type="range" min="0" max="800" value="500" step="1" data-sample><div class="cl-jumps"><button type="button" data-jump="step">跳至階躍</button><button type="button" data-jump="loadOn">跳至加載</button><button type="button" data-jump="loadOff">跳至卸載</button></div></div>
        <div class="cl-sample-status" data-status aria-live="polite" aria-atomic="true"></div>
        <details class="cl-extra"><summary>更多指標與量測範圍</summary><div data-extra-metrics></div></details>
        <div data-frequency-root></div>
      </section>
    </div>
    <p class="cl-model-note">假設：τ = 0.25 s、直流增益 = 1、初始狀態 = 0；目標 0 → 0.6。所有振幅皆無量綱。被控體為教學假設，未由 ASR5000 功率級辨識；控制器依原碼順序、以 JavaScript 雙精度計算。原碼連結需登入具有來源儲存庫讀取權限的 GitHub 帳號。</p>
    <div class="cl-guide" data-lab-guide>${renderLabGuide()}</div>
    <div class="cl-guide" data-frequency-guide>${renderFrequencyGuide()}</div>
    <div class="cl-guide" data-delay-guide>${renderDelayGuide()}</div>
  </div>`;

  const find = selector => container.querySelector(selector);
  const ranges = Object.fromEntries([...container.querySelectorAll('[data-param]')].map(el => [el.dataset.param, el]));
  const numbers = Object.fromEntries([...container.querySelectorAll('[data-number]')].map(el => [el.dataset.number, el]));
  const sample = find('[data-sample]');
  const chart = find('[data-chart]');
  const frequencyPanel = renderFrequencyPanel(find('[data-frequency-root]'));
  let options = { ...DEFAULTS };
  let result;
  let comparison;
  let selectedTime = 5;

  function drawChart() {
    const { points, events } = result;
    const selected = points[+sample.value];
    const compare = find('[data-compare]').checked;
    const x = t => 65 + t / events.end * 810;
    const extent = values => {
      const low = Math.min(0, ...values), high = Math.max(0.1, ...values);
      const padding = Math.max(0.08, (high - low) * 0.13);
      return [low - padding, high + padding];
    };
    const responseExtent = extent([...points.map(p => p.y), ...points.map(p => p.feedback), options.target ?? 0.6, ...(compare ? comparison.points.map(p => p.y) : [])]);
    const commandExtent = extent([...points.map(p => p.ui), options.limit, -options.limit]);
    const y = (value, extent, top, bottom) => bottom - (value - extent[0]) / (extent[1] - extent[0]) * (bottom - top);
    const responseY = v => y(v, responseExtent, 45, 235);
    const commandY = v => y(v, commandExtent, 320, 505);
    const path = (rows, key, fy, step = false) => rows.map((p, i) => i ? `${step ? 'H' + number(x(p.t), 2) + 'V' + number(fy(p[key]), 2) : 'L' + number(x(p.t), 2) + ',' + number(fy(p[key]), 2)}` : `M${number(x(p.t), 2)},${number(fy(p[key]), 2)}`).join(' ');
    const panel = (scale, fy, top, bottom, title) => {
      const grid = Array.from({ length: 5 }, (_, i) => scale[0] + (scale[1] - scale[0]) * i / 4).map(v => `<line x1="65" x2="875" y1="${fy(v)}" y2="${fy(v)}" class="cl-grid"/><text x="54" y="${fy(v) + 4}" text-anchor="end">${number(v, 2)}</text>`).join('');
      const ticks = [0, 2, 4, 6, events.end].map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${bottom}" class="cl-grid"/><text x="${x(t)}" y="${bottom + 20}" text-anchor="middle">${number(t, t === events.end && t % 1 ? 2 : 0)}</text>`).join('');
      return `<text x="65" y="${top - 22}" class="cl-panel-title">${title}</text><rect x="${x(events.loadOn)}" y="${top}" width="${x(events.loadOff) - x(events.loadOn)}" height="${bottom - top}" class="cl-load-zone"/>${grid}${ticks}`;
    };
    const eventLines = [['step', '目標階躍'], ['loadOn', '加載'], ['loadOff', '卸載']].map(([key, label]) => `<line x1="${x(events[key])}" x2="${x(events[key])}" y1="45" y2="505" class="cl-event"/><text x="${x(events[key]) + 5}" y="282">${label}</text>`).join('');
    const bars = (flag, top, css) => points.filter(p => p[flag] && p.dt > 0).map(p => `<rect x="${x(p.t)}" y="${top}" width="${Math.max(0.5, x(p.t + p.dt) - x(p.t))}" height="4" class="${css}"/>`).join('');
    chart.innerHTML = `<title id="${id}-title">PI 閉迴路階躍、負載與飽和恢復</title><desc id="${id}-desc">上圖顯示目標及回授，下圖顯示控制輸出與積分。${number(events.step)} 秒目標升至 0.6，${number(events.loadOn)} 秒加載 ${number(options.load)}，${number(events.loadOff)} 秒卸載。階躍超調量 ${number(result.metrics.overshootPercent, 1)}%。</desc>
      ${panel(responseExtent, responseY, 45, 235, '01 / 目標、實體輸出與量測  r, y, m')}${panel(commandExtent, commandY, 320, 505, '02 / 命令、延遲致動與積分  u, ua, Ui')}${eventLines}
      ${bars('saturated', 37, 'cl-saturation')}${bars('frozen', 312, 'cl-freeze')}
      <path d="${path(points, 'reference', responseY, true)}" class="cl-trace cl-reference"/>
      ${[-options.limit, options.limit].map(v => `<line x1="65" x2="875" y1="${commandY(v)}" y2="${commandY(v)}" class="cl-reference"/>`).join('')}
      ${compare ? `<path d="${path(comparison.points, 'y', responseY)}" class="cl-trace cl-comparison"/><path d="${path(comparison.points, 'out', commandY, true)}" class="cl-trace cl-comparison"/>` : ''}
      <path d="${path(points, 'y', responseY)}" class="cl-trace cl-response"/><path d="${path(points, 'ui', commandY, true)}" class="cl-trace cl-integral"/><path d="${path(points, 'out', commandY, true)}" class="cl-trace cl-response"/>
      ${options.filterEnabled ? `<path d="${path(points, 'feedback', responseY)}" class="cl-trace cl-measured-trace"/>` : ''}
      ${options.delaySamples > 0 ? `<path d="${path(points, 'appliedOut', commandY, true)}" class="cl-trace cl-measured-trace"/>` : ''}
      <line x1="${x(selected.t)}" x2="${x(selected.t)}" y1="45" y2="505" class="cl-selected"/><circle cx="${x(selected.t)}" cy="${responseY(selected.y)}" r="4" class="cl-selected-dot"/><circle cx="${x(selected.t)}" cy="${commandY(selected.out)}" r="4" class="cl-selected-dot"/>
      <text x="875" y="545" text-anchor="end">時間 t（s）</text>`;
    find('[data-sample-label]').value = `n = ${selected.n} · t = ${number(selected.t)} s`;
    const previousClipped = selected.previousOut !== selected.previousPre;
    find('[data-status]').innerHTML = `<dl class="cl-values">${[['Ref', selected.reference], ['實體 y', selected.y], ['Fdb = m', selected.feedback], ['Err', selected.error], ['Up', selected.up], ['Ui', selected.ui], ['OutPreSat', selected.pre], ['Out = u', selected.out], ['延遲致動 ua', selected.appliedOut], ['負載 d', selected.load]].map(([label, value]) => `<div><dt>${label}</dt><dd>${number(value)}</dd></div>`).join('')}</dl><p>Err = Ref − m。上一拍 Out = <b>${number(selected.previousOut)}</b>，OutPreSat = <b>${number(selected.previousPre)}</b>（${previousClipped ? '不相等' : '相等'}）→ 本拍積分<strong>${selected.frozen ? '凍結' : '更新'}</strong>${options.mode === 'unconditional' ? '（對照模式忽略上一拍限幅）' : ''}；本拍命令<strong>${selected.saturated ? '已限幅' : '未限幅'}</strong>。${selected.dt === 0 ? '最後觀察點不再推進被控體。' : `被控體本拍使用 ${options.delaySamples} 拍前的限幅命令 ua；新增延遲不回填 PI 的飽和判斷。`} 顯示值取三位，判定使用完整精度。</p>`;
  }

  function syncDynamicsControls(announce = false) {
    const maxCutoff = Math.floor((0.45 / options.ts + 1e-10) * 10) / 10;
    ranges.cutoffHz.max = numbers.cutoffHz.max = maxCutoff;
    const clamped = options.cutoffHz > maxCutoff;
    if (clamped) options.cutoffHz = maxCutoff;
    ranges.cutoffHz.value = numbers.cutoffHz.value = options.cutoffHz;
    find('[data-filter-enabled]').checked = options.filterEnabled;
    ranges.cutoffHz.disabled = numbers.cutoffHz.disabled = !options.filterEnabled;
    find('[data-parameter-group="cutoffHz"]').classList.toggle('cl-disabled-control', !options.filterEnabled);
    const adjustment = find('[data-cutoff-adjustment]');
    adjustment.hidden = !(announce && clamped);
    if (!adjustment.hidden) adjustment.textContent = `Ts 改變後，fc 已調整至 ${number(maxCutoff, 1)} Hz，以保持 fc ≤ 0.45 / Ts。`;
  }

  function calculate() {
    result = simulateClosedLoop(options);
    comparison = simulateClosedLoop({ ...options, mode: options.mode === 'firmware' ? 'unconditional' : 'firmware' });
    sample.max = result.points.length - 1;
    sample.value = Math.min(result.points.length - 1, Math.round(selectedTime / options.ts));
    selectedTime = result.points[+sample.value].t;
    const { metrics: m, events } = result;
    find('[data-dynamics-note]').textContent = `額外延遲 ${options.delaySamples} 拍 = ${number(options.delaySamples * options.ts)} s。${options.filterEnabled ? `低通 fc = ${number(options.cutoffHz, 1)} Hz；係數 c = ${number(result.options.filter.c, 5)}、p = ${number(result.options.filter.p, 5)}。` : '低通旁路：m = y。'} fc 上限為 0.45 / Ts（Nyquist 的 90%）。`;
    find('[data-dynamics-legend]').hidden = !options.filterEnabled && options.delaySamples === 0;
    const metricCard = (label, value, hint) => `<div><span>${label}</span><strong>${value}</strong><small>${hint}</small></div>`;
    find('[data-metrics]').innerHTML = metricCard('階躍超調量', `${number(m.overshootPercent, 1)} %`, '加載前峰值相對 0.6') + metricCard('階躍整定時間', duration(m.settlingTime), '階躍後進入 ±2% 帶') + metricCard('累計飽和時間', `${number(m.saturationDuration)} s`, '全觀察窗內輸出被截斷') + metricCard('卸載後回復時間', duration(m.recoveryTime), '卸載後回到 ±2% 帶');
    find('[data-equivalent]').innerHTML = options.ki === 0 ? 'Ki = 0：純 P 控制；Ti → ∞。' : `等效 Ti = Ts / Ki = <b>${number(options.ts / options.ki)} s</b><br>連續積分增益 Kp·Ki / Ts = <b>${number(options.kp * options.ki / options.ts)} s⁻¹</b>`;
    const required = 0.6 + options.load;
    // Compare displayed physical margins tolerantly; keep runPI's exact gate unchanged.
    const hasMargin = required < options.limit - 1e-10;
    const overloaded = required > options.limit + 1e-10;
    find('[data-feasibility]').innerHTML = `加載後維持 y = 0.6 需要 u = 0.6 + d = <b>${number(required, 2)}</b>。${overloaded ? '<strong>超出 Umax：此階段目標不可達，觀察卸載後恢復。</strong>' : !hasMargin ? '剛好等於 Umax，沒有向上的控制裕度。' : '低於 Umax，具有靜態控制裕度；動態仍取決於參數。'}`;
    find('[data-extra-metrics]').innerHTML = `<dl class="cl-more-values"><div><dt>10–90% 上升時間</dt><dd>${duration(m.riseTime)}</dd></div><div><dt>加載前峰值</dt><dd>${number(m.peak)}</dd></div><div><dt>卸載後首次解除限幅</dt><dd>${duration(m.saturationExit)}</dd></div><div><dt>末點誤差 Ref − y</dt><dd>${number(m.finalError)}</dd></div></dl><p>所有超調／整定／末點誤差均以實體 y 判定。階躍指標使用 [${number(events.step)}, ${number(events.loadOn)}) s；卸載回復使用 [${number(events.loadOff)}, ${number(events.end)}] s。整定判定為進入目標 ±0.012 後，到該觀察窗末端均未離開，且帶內尾段至少 0.25 s；太晚入帶時顯示「觀察時間不足」。「不適用」表示負載為零，或解除限幅指標在卸載前一拍未限幅；「觀察窗內未達成」不推論更長時間的結果。解除限幅與回授收斂是兩個不同事件。</p><p>對照模式：${options.mode === 'firmware' ? '無條件積分' : '原碼凍結'}，超調 ${number(comparison.metrics.overshootPercent, 1)}%，卸載回復 ${duration(comparison.metrics.recoveryTime)}。事件對齊至名義時間之後的第一個控制取樣；本次共 ${result.points.length} 個觀察點。</p>`;
    find('[data-compare-legend]').textContent = options.mode === 'firmware' ? '對照：無條件積分' : '對照：原碼凍結';
    find('[data-compare-legend]').hidden = !find('[data-compare]').checked;
    drawChart();
    frequencyPanel.update(options, result);
  }

  function setOptions(values, presetId = '') {
    options = { ...DEFAULTS, ...values };
    for (const [key] of specs) ranges[key].value = numbers[key].value = options[key];
    syncDynamicsControls();
    find('[data-mode]').value = options.mode;
    find('[data-parameter-error]').hidden = true;
    container.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === presetId)));
    find('[data-preset-note]').textContent = PRESETS.find(p => p.id === presetId)?.description || '每次調整即從零初始狀態重算完整實驗。';
    calculate();
  }
  function input(event) {
    const target = event.target;
    if (target === sample) { selectedTime = result.points[+sample.value].t; drawChart(); return; }
    if (target.matches('[data-compare]')) { find('[data-compare-legend]').hidden = !target.checked; drawChart(); return; }
    const key = target.dataset.param || target.dataset.number;
    if (key) {
      if (!target.validity.valid || target.value === '') { find('[data-parameter-error]').hidden = false; return; }
      options[key] = +target.value;
      ranges[key].value = numbers[key].value = target.value;
    } else if (target.matches('[data-mode]')) options.mode = target.value;
    else if (target.matches('[data-filter-enabled]')) options.filterEnabled = target.checked;
    else return;
    syncDynamicsControls(key === 'ts');
    find('[data-parameter-error]').hidden = Object.values(numbers).every(el => el.validity.valid && el.value !== '');
    container.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    find('[data-preset-note]').textContent = '自訂參數 · 每次調整均從零初始狀態重新計算。';
    calculate();
  }
  function click(event) {
    const button = event.target.closest('button');
    if (button?.hasAttribute('data-reset')) { selectedTime = 5; setOptions(DEFAULTS); }
    else if (button?.hasAttribute('data-bypass-dynamics')) setOptions({ ...options, delaySamples: 0, filterEnabled: false });
    else if (button?.dataset.preset) { selectedTime = 5; setOptions(PRESETS.find(p => p.id === button.dataset.preset).options, button.dataset.preset); }
    else if (button?.dataset.jump) { selectedTime = result.events[button.dataset.jump]; sample.value = Math.round(selectedTime / options.ts); drawChart(); }
    else if (button?.hasAttribute('data-guide')) find('[data-lab-guide]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (button?.hasAttribute('data-frequency-nav')) find('.frequency-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (button?.hasAttribute('data-return-controls')) find('.cl-controls').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (button?.hasAttribute('data-frequency-theory')) find('[data-frequency-guide]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (button?.hasAttribute('data-delay-theory')) find('[data-delay-guide]').scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (chart.contains(event.target)) {
      const bounds = chart.getBoundingClientRect();
      selectedTime = Math.max(0, Math.min(result.events.end, ((event.clientX - bounds.left) / bounds.width * 900 - 65) / 810 * result.events.end));
      sample.value = Math.round(selectedTime / options.ts); selectedTime = result.points[+sample.value].t; drawChart();
    }
  }
  container.addEventListener('input', input);
  container.addEventListener('click', click);
  setOptions(DEFAULTS);
  return () => { frequencyPanel.destroy(); container.removeEventListener('input', input); container.removeEventListener('click', click); };
}
