import { analyzeFrequency, linearStepResponse } from './frequency.js';

const fmt = (value, digits = 3) => {
  if (!Number.isFinite(value)) return '未定義';
  if (value === 0) return '0';
  return Math.abs(value) < 0.001 || Math.abs(value) >= 10000 ? value.toExponential(2) : Number(value.toFixed(digits)).toString();
};
const stateText = { stable: '穩定', marginal: '單位圓邊界', unstable: '不穩定', indeterminate: '數值判定未確認' };
const metricText = {
  'zero-loop': '零迴路增益', 'below-unity': '全頻帶低於 0 dB',
  'above-unity-to-nyquist': '至 Nyquist 仍高於 0 dB', 'not-before-nyquist': 'Nyquist 內未降至門檻',
  unstable: '不穩定，不定義', marginal: '邊界狀態，不定義', indeterminate: '數值判定未確認'
};
const metricValue = (metric, unit) => metric.value === null ? metricText[metric.status] || '未定義' : `${fmt(metric.value)} ${unit}`;
const path = (rows, key, x, y, xKey = 'f') => {
  let active = false;
  return rows.map(point => {
    if (!Number.isFinite(point[key])) { active = false; return ''; }
    const command = active ? 'L' : 'M'; active = true;
    return `${command}${x(point[xKey]).toFixed(2)},${y(point[key]).toFixed(2)}`;
  }).join(' ');
};
let count = 0;

/** Draw only from the same options/results used by the time-domain lab. */
export function renderFrequencyPanel(container) {
  const id = `frequency-${++count}`;
  container.innerHTML = `<section class="frequency-panel" aria-labelledby="${id}-heading">
    <div class="fq-heading"><div><span class="cl-badge">FREQUENCY / z-PLANE</span><h2 id="${id}-heading">同一組參數，換個角度觀察。</h2></div><button type="button" class="cl-text-button" data-return-controls>回到參數 ↑</button></div>
    <p class="fq-scope">採未限幅、每拍積分模型，與時域共用 Kp、Ki、Ts、延遲 D 及量測低通 F。A = Gc·z⁻ᴰ·Gp，開迴路 L = A·F；實體與量測輸出分開計算。</p>
    <div class="cl-metrics fq-metrics" data-frequency-metrics></div>
    <p class="fq-verdict" data-frequency-verdict role="status"></p>
    <div class="fq-legend"><span class="fq-loop-key">開迴路 L = AF</span><span class="fq-closed-key">實體 Hy = A/(1+L)</span><span class="fq-measured-key" data-measured-legend>量測 Hm = L/(1+L)</span><span class="fq-marker-key">交越 / 半功率門檻</span></div>
    <figure class="cl-figure"><div class="fq-bode-scroll" tabindex="0" aria-label="Bode 圖，可水平捲動"><svg data-bode viewBox="0 0 900 510" role="img" aria-labelledby="${id}-bode-title ${id}-bode-desc"></svg></div><figcaption data-bode-caption></figcaption></figure>
    <div class="fq-cursor"><label for="${id}-cursor">頻率游標 <output data-frequency-label for="${id}-cursor"></output></label><input id="${id}-cursor" type="range" min="0" max="600" step="1" value="300" data-frequency-cursor><div class="cl-jumps"><button type="button" data-frequency-jump="gainCrossover">跳至增益交越</button><button type="button" data-frequency-jump="bandwidth">跳至閉迴路頻寬</button></div><p data-frequency-readout aria-live="polite"></p></div>
    <div class="fq-paired">
      <figure class="cl-figure"><h3>閉迴路極點 · z 平面</h3><svg data-poles viewBox="0 0 360 335" role="img" aria-labelledby="${id}-pole-title ${id}-pole-desc"></svg><figcaption>×：動態極點；虛線：單位圓。○：零狀態傳遞函數消去的保留積分狀態。</figcaption></figure>
      <figure class="cl-figure"><h3>對照加載前的階躍</h3><svg data-linear-step viewBox="0 0 420 335" role="img" aria-labelledby="${id}-step-title ${id}-step-desc"></svg><figcaption data-linear-caption></figcaption></figure>
    </div>
    <div class="fq-pole-details" data-pole-details></div>
    <p class="fq-solver-note" data-solver-note></p>
    <button type="button" class="cl-text-button" data-delay-theory>延遲、低通與原碼對照 ↓</button>
    <button type="button" class="cl-text-button" data-frequency-theory>推導 L、H、頻寬與 Jury 穩定條件 ↓</button>
  </section>`;
  const find = selector => container.querySelector(selector);
  const cursor = find('[data-frequency-cursor]');
  const bode = find('[data-bode]');
  let analysis;
  let lastFrequency;

  function drawBode() {
    const { points, fMin, fMax, nyquist, metrics } = analysis;
    const selected = points[+cursor.value];
    const x = f => 68 + Math.log(f / fMin) / Math.log(fMax / fMin) * 800;
    const measuredEnabled = analysis.options.filterEnabled;
    const values = points.flatMap(p => [p.openDb, p.closedDb, ...(measuredEnabled ? [p.measuredDb] : [])]).filter(Number.isFinite);
    const dbMin = Math.floor(Math.min(-20, ...values) / 10) * 10;
    const dbMax = Math.ceil(Math.max(10, ...values) / 10) * 10;
    const phases = points.flatMap(p => [p.openPhase, p.closedPhase, ...(measuredEnabled ? [p.measuredPhase] : [])]).filter(Number.isFinite);
    const phaseMin = Math.floor(Math.min(-180, ...phases) / 45) * 45;
    const phaseMax = Math.ceil(Math.max(0, ...phases) / 45) * 45;
    const dbY = value => 208 - (value - dbMin) / (dbMax - dbMin) * 161;
    const phaseY = value => 437 - (value - phaseMin) / (phaseMax - phaseMin) * 156;
    const ticks = [fMin];
    for (let exponent = Math.ceil(Math.log10(fMin)); exponent <= Math.floor(Math.log10(fMax)); exponent++) {
      const f = 10 ** exponent;
      if (Math.log(f / ticks.at(-1)) > 0.25 && Math.log(fMax / f) > 0.25) ticks.push(f);
    }
    ticks.push(fMax);
    const grid = (min, max, y, top, bottom) => Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4).map(v => `<line x1="68" x2="868" y1="${y(v)}" y2="${y(v)}" class="cl-grid"/><text x="56" y="${y(v) + 4}" text-anchor="end">${fmt(v, 1)}</text>`).join('') + ticks.map(f => `<line x1="${x(f)}" x2="${x(f)}" y1="${top}" y2="${bottom}" class="cl-grid"/><text x="${x(f)}" y="${bottom + 23}" text-anchor="middle">${fmt(f)}</text>`).join('');
    const crossover = metrics.gainCrossover.value;
    const bandwidth = metrics.bandwidth.value;
    const inRange = f => f !== null && f >= fMin && f <= fMax;
    const marker = (f, css) => inRange(f) ? `<line x1="${x(f)}" x2="${x(f)}" y1="47" y2="437" class="fq-event ${css}"/>` : '';
    const dcThreshold = metrics.dcGain > 0 ? 20 * Math.log10(metrics.dcGain) - 10 * Math.log10(2) : null;
    const phaseAtCrossover = metrics.phaseMargin.value === null ? null : metrics.phaseMargin.value - 180;
    bode.innerHTML = `<title id="${id}-bode-title">含控制延遲與量測低通的離散 Bode 圖</title><desc id="${id}-bode-desc">橫軸對數頻率 Hz，最高 Nyquist ${fmt(nyquist)} Hz。上圖幅值，下圖連續相位。綠色為 L，橙色為實體 Hy，啟用低通時藍色為量測 Hm。相位裕度 ${metricValue(metrics.phaseMargin, '度')}；實體輸出半功率頻寬 ${metricValue(metrics.bandwidth, 'Hz')}。</desc>
      <text x="68" y="24" class="fq-panel-title">幅值（dB）</text><text x="68" y="260" class="fq-panel-title">相位（°）</text>
      ${grid(dbMin, dbMax, dbY, 47, 208)}${grid(phaseMin, phaseMax, phaseY, 281, 437)}
      <line x1="68" x2="868" y1="${dbY(0)}" y2="${dbY(0)}" class="fq-reference"/><line x1="68" x2="868" y1="${phaseY(-180)}" y2="${phaseY(-180)}" class="fq-reference"/>
      ${dcThreshold !== null && dcThreshold >= dbMin ? `<line x1="68" x2="868" y1="${dbY(dcThreshold)}" y2="${dbY(dcThreshold)}" class="fq-half-power"/>` : ''}
      ${marker(crossover, 'fq-crossover')}${marker(bandwidth, 'fq-bandwidth')}
      <path d="${path(points, 'openDb', x, dbY)}" class="cl-trace fq-loop"/><path d="${path(points, 'closedDb', x, dbY)}" class="cl-trace fq-closed"/>
      <path d="${path(points, 'openPhase', x, phaseY)}" class="cl-trace fq-loop"/><path d="${path(points, 'closedPhase', x, phaseY)}" class="cl-trace fq-closed"/>
      ${measuredEnabled ? `<path d="${path(points, 'measuredDb', x, dbY)}" class="cl-trace fq-measured"/><path d="${path(points, 'measuredPhase', x, phaseY)}" class="cl-trace fq-measured"/>` : ''}
      ${inRange(crossover) && phaseAtCrossover !== null ? `<line x1="${x(crossover)}" x2="${x(crossover)}" y1="${phaseY(-180)}" y2="${phaseY(phaseAtCrossover)}" class="fq-margin"/><circle cx="${x(crossover)}" cy="${dbY(0)}" r="4" class="cl-selected-dot"/>` : ''}
      ${inRange(bandwidth) && dcThreshold !== null ? `<circle cx="${x(bandwidth)}" cy="${dbY(dcThreshold)}" r="4" class="fq-bandwidth-dot"/>` : ''}
      <line x1="${x(selected.f)}" x2="${x(selected.f)}" y1="47" y2="437" class="cl-selected"/>
      <text x="868" y="492" text-anchor="end">頻率 f（Hz，對數軸）· fN = ${fmt(nyquist)} Hz</text>`;
    find('[data-frequency-label]').value = `${fmt(selected.f)} Hz`;
    const polarText = (db, phase) => `${db === null ? '零幅值或未定義' : fmt(db, 2) + ' dB'} / ${phase === null ? '相位未定義' : fmt(phase, 2) + '°'}`;
    find('[data-frequency-readout]').textContent = `L：${polarText(selected.openDb, selected.openPhase)}；Hy：${polarText(selected.closedDb, selected.closedPhase)}。${measuredEnabled ? `Hm：${polarText(selected.measuredDb, selected.measuredPhase)}；量測 F：${polarText(selected.filterDb, selected.filterPhase)}。` : ''}`;
  }

  function drawPoles() {
    const { poles, hiddenPoles, stability } = analysis;
    const bound = Math.max(1.25, Math.ceil(Math.max(0, ...poles.map(p => Math.max(Math.abs(p.re), Math.abs(p.im)))) * 1.15 * 4) / 4);
    const scale = 125 / bound, x = re => 180 + re * scale, y = im => 160 - im * scale;
    find('[data-poles]').innerHTML = `<title id="${id}-pole-title">閉迴路極點與單位圓</title><desc id="${id}-pole-desc">${stateText[stability.status]}。動態極點最大半徑 ${fmt(stability.maxRadius, 6)}。單位圓內為衰減模態，圓外為成長模態。</desc>
      <circle cx="180" cy="160" r="${scale}" class="fq-unit-circle"/>
      <line x1="33" x2="327" y1="160" y2="160" class="fq-reference"/><line x1="180" x2="180" y1="14" y2="306" class="fq-reference"/>
      ${[-1, 0, 1].map(v => `<text x="${x(v)}" y="178" text-anchor="middle">${v}</text>${v ? `<text x="169" y="${y(v) + 4}" text-anchor="end">${v}</text>` : ''}`).join('')}
      <text x="326" y="151" text-anchor="end">Re(z)</text><text x="190" y="22">Im(z)</text>
      ${hiddenPoles.map(p => `<circle cx="${x(p.re)}" cy="${y(p.im)}" r="7" class="fq-hidden-pole"/>`).join('')}
      ${poles.map((p, i) => `<path d="M${x(p.re) - 5} ${y(p.im) - 5}l10 10m0-10l-10 10" class="fq-pole ${p.radius > 1 + 1e-9 ? 'fq-pole-unstable' : ''}"/><text x="${x(p.re) + 10}" y="${y(p.im) + (i % 2 ? 18 : -10)}">p${i + 1}</text>`).join('')}
      <text x="180" y="325" text-anchor="middle">|z| = 1 · 座標等比例</text>`;
    find('[data-pole-details]').innerHTML = `<div class="fq-pole-list">${poles.map((p, i) => `<span>p${i + 1} = <b>${fmt(p.re, 5)} ${p.im < 0 ? '−' : '+'} j${fmt(Math.abs(p.im), 5)}</b><small>|p${i + 1}| = ${fmt(p.radius, 6)}</small></span>`).join('')}</div>${hiddenPoles.length ? '<p>○ z = 1：Ki = 0 或 Kp = 0 時，不可把消去前的積分極點當成追蹤不穩定；但保留 Ui 的內部中性狀態不會自行衰減。此處「穩定」描述列出的動態極點。</p>' : '<p>判定以未四捨五入的半徑為準；距單位圓 10⁻⁹ 內顯示邊界狀態。這是固定參數線性模型的判定。</p>'}`;
  }

  function drawStep(options, timeResult) {
    const { points, events } = timeResult;
    const actual = points.slice(events.stepIndex, events.loadOnIndex).map(p => ({ t: p.t - events.step, y: p.y / timeResult.options.target }));
    const end = actual.at(-1).t;
    const linear = linearStepResponse(options, { duration: end, maxAmplitude: 4 });
    const values = [...actual, ...linear.points].map(p => p.y);
    const low = Math.min(0, ...values) - 0.12, high = Math.max(1.1, ...values) + 0.12;
    const x = t => 48 + t / end * 350, y = value => 264 - (value - low) / (high - low) * 220;
    find('[data-linear-step]').innerHTML = `<title id="${id}-step-title">相同參數的線性與限幅階躍比較</title><desc id="${id}-step-desc">參考幅度正規化為 1。橙色為未限幅線性響應，綠色為目前積分方式的限幅模擬，只比較加載前。${linear.truncated ? '線性響應超出正負四倍參考，已停止繪製該線。' : ''}</desc>
      ${Array.from({ length: 4 }, (_, i) => low + (high - low) * i / 3).map(v => `<line x1="48" x2="398" y1="${y(v)}" y2="${y(v)}" class="cl-grid"/><text x="40" y="${y(v) + 4}" text-anchor="end">${fmt(v, 1)}</text>`).join('')}
      ${[0, end / 2, end].map(t => `<text x="${x(t)}" y="286" text-anchor="middle">${fmt(t, 2)}</text>`).join('')}
      <text x="48" y="22">y / 0.6</text><line x1="48" x2="398" y1="${y(1)}" y2="${y(1)}" class="fq-reference"/>
      <path d="${path(linear.points, 'y', x, y, 't')}" class="cl-trace fq-closed"/><path d="${path(actual, 'y', x, y, 't')}" class="cl-trace fq-loop"/>
      <text x="398" y="318" text-anchor="end">階躍後經過時間（s）</text>`;
    find('[data-linear-caption]').textContent = `橙：無限幅線性；綠：現有${options.mode === 'firmware' ? '原碼凍結' : '無條件積分'}限幅模擬。皆畫實體 y，零初始狀態、相同 Ts／D／低通設定。${linear.truncated ? `線性響應在 ${fmt(linear.stopTime)} s 超出 ±4 倍目標，後續不繪製；並非收斂或被限幅。` : '無飽和時兩條線應重合。'}`;
  }

  function update(options, timeResult) {
    analysis = analyzeFrequency(options);
    find('[data-measured-legend]').hidden = !options.filterEnabled;
    const { metrics, stability, points } = analysis;
    const solver = analysis.solver;
    find('[data-solver-note]').textContent = solver ? `特徵式階數 ${solver.degree}；${solver.converged ? '數值根已通過殘差與係數重建檢查' : '數值根未通過精度檢查'}。歸一化殘差 ${fmt(solver.residual)}，係數誤差 ${fmt(solver.coefficientError)}。` : '';
    cursor.max = points.length - 1;
    const desired = lastFrequency ?? metrics.gainCrossover.value ?? 1;
    cursor.value = points.reduce((best, p, index) => Math.abs(Math.log(p.f / Math.max(desired, analysis.fMin))) < Math.abs(Math.log(points[best].f / Math.max(desired, analysis.fMin))) ? index : best, 0);
    lastFrequency = points[+cursor.value].f;
    const card = (label, value, hint) => `<div><span>${label}</span><strong>${value}</strong><small>${hint}</small></div>`;
    find('[data-frequency-metrics]').innerHTML = card('實體閉迴路半功率頻寬', metricValue(metrics.bandwidth, 'Hz'), '相對直流增益 −3.01 dB') + card('相位裕度 PM', metricValue(metrics.phaseMargin, '°'), metrics.phaseMargin.status === 'dc-boundary' ? 'DC 邊界值，無正頻率交越' : metrics.phaseMargin.status === 'nyquist-boundary' ? 'Nyquist 邊界交越' : '180° + 連續相位（未折返）') + card('增益交越頻率 fgc', metricValue(metrics.gainCrossover, 'Hz'), '不等於閉迴路頻寬') + card('線性動態極點', stateText[stability.status], `最大半徑 ${fmt(stability.maxRadius, 6)}`);
    const verdict = find('[data-frequency-verdict]');
    verdict.dataset.stability = stability.status;
    verdict.textContent = stability.status === 'indeterminate' ? '數值求根尚未通過精度檢查，不宣稱穩定或報告頻寬；請調整參數後重新評估。' : options.kp === 0 ? 'Kp = 0：參考到輸出的傳遞函數為零，沒有追蹤頻寬或相位裕度。被控體自然極點仍可衰減；保留積分狀態為中性。' : stability.status === 'unstable' ? '有極點落在單位圓外：未限幅線性響應成長。限幅後的時域波形即使有界，也不能證明此線性迴路穩定。' : stability.status === 'marginal' ? '極點位於單位圓邊界附近：不宣稱漸近穩定，不提供通常的閉迴路頻寬。' : timeResult.metrics.saturationDuration > 0 ? '線性動態極點在單位圓內，但本次時域模擬曾限幅。請比較下方階躍差異；相位裕度不預測積分凍結或過載恢復。' : '線性動態極點在單位圓內。本次模擬未限幅，可直接比較頻域、極點與階躍形狀。';
    find('[data-bode-caption]').textContent = `開迴路交越以綠色虛線標示；實體輸出 Hy 的半功率點以橙色虛線標示。相位圖粗線為 PM 的角度差；延遲相位不折返，多圈相位時 PM 可小於 −180°，不能只依 PM 正負判斷高階穩定性。Nyquist = ${fmt(analysis.nyquist)} Hz；不延伸到取樣頻帶之外。${stability.status !== 'stable' ? '不穩定或邊界 H 的曲線僅為代數單位圓評估，不能視為可達的穩態正弦響應。' : ''}${options.kp === 0 ? '零幅值的 dB 為 −∞，相位未定義，故不繪製曲線。' : ''}`;
    for (const key of ['gainCrossover', 'bandwidth']) {
      const value = metrics[key].value;
      find(`[data-frequency-jump="${key}"]`).disabled = value === null || value < analysis.fMin || value > analysis.fMax;
    }
    drawBode(); drawPoles(); drawStep(options, timeResult);
  }
  function input(event) {
    if (event.target !== cursor) return;
    lastFrequency = analysis.points[+cursor.value].f; drawBode();
  }
  function click(event) {
    const key = event.target.closest('[data-frequency-jump]')?.dataset.frequencyJump;
    if (!key) return;
    const f = analysis.metrics[key].value;
    cursor.value = analysis.points.reduce((best, p, i) => Math.abs(p.f - f) < Math.abs(analysis.points[best].f - f) ? i : best, 0);
    lastFrequency = analysis.points[+cursor.value].f; drawBode();
  }
  container.addEventListener('input', input); container.addEventListener('click', click);
  return { update, destroy() { container.removeEventListener('input', input); container.removeEventListener('click', click); } };
}
