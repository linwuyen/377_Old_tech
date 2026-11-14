import { codeBlock, math, src } from './lessons/shared.js';

let guideCount = 0;

/** Source-grounded teaching notes for the deliberately simplified closed loop. */
export function renderLabGuide() {
  const id = `closed-loop-guide-${++guideCount}`;
  return `
  <section class="lab-theory" aria-labelledby="${id}-heading">
    <h2 id="${id}-heading">01｜把回授接回來：這個模型代表什麼</h2>
    <p>本實驗以正規化的一階系統作為被控體，狀態 y 是量測回授，u 是限幅後的致動命令，d 是抵消致動能力的負載擾動。所有振幅都無量綱；只有時間以秒表示。時間常數固定為 τ=0.25 s、直流增益為 1，<strong>這些是教學假設，沒有從 ASR5000 功率級辨識而來</strong>。控制器則依 <code>runPI</code> 的狀態更新順序運算。</p>
    <figure class="control-diagram">
      <div class="diagram-toolbar"><span>CLOSED LOOP / 簡化被控體與韌體 PI</span></div>
      <div class="diagram-scroll" tabindex="0" aria-label="閉迴路方塊圖，可水平捲動">
        <svg class="control-svg" viewBox="0 0 1000 280" role="img" aria-labelledby="${id}-diagram-title ${id}-diagram-desc" xmlns="http://www.w3.org/2000/svg">
          <title id="${id}-diagram-title">具有負載擾動與輸出限幅的離散 PI 閉迴路</title>
          <desc id="${id}-diagram-desc">參考 r 減回授 y 得到誤差，經韌體 PI 得到未限幅輸出，再經限幅得到 u。負載 d 從 u 扣除，送入一階被控體。被控體下一拍的輸出回授到誤差加總點。積分閘門使用上一拍的限幅結果。</desc>
          <g fill="none" stroke="#537363" stroke-width="2">
            <path d="M25 115H111 M155 115H205 M375 115H415 M535 115H580 M624 115H670 M900 115H965"/>
            <path d="M939 115V235H133V137 M602 38V93"/>
            <circle cx="133" cy="115" r="22" fill="#fff"/><circle cx="602" cy="115" r="22" fill="#fff"/>
            <rect x="205" y="77" width="170" height="76" rx="8" fill="#edf4ed"/>
            <rect x="415" y="77" width="120" height="76" rx="8" fill="#fff5e8"/>
            <rect x="670" y="77" width="230" height="76" rx="8" fill="#edf4ed"/>
          </g>
          <g fill="#537363">
            <path d="M111 115l-8-4v8z M205 115l-8-4v8z M415 115l-8-4v8z M580 115l-8-4v8z M670 115l-8-4v8z M965 115l-8-4v8z M133 137l-4 8h8z M602 93l-4-8h8z"/>
            <circle cx="939" cy="115" r="4"/>
          </g>
          <g fill="#274f42" font-family="system-ui, sans-serif" font-size="15" text-anchor="middle">
            <text x="57" y="99">r[n]</text><text x="179" y="99">e[n]</text>
            <text x="290" y="106" font-weight="600">runPI / P + I</text>
            <text x="290" y="131" font-size="13">依前一拍限幅結果凍結 I</text>
            <text x="395" y="99">u*</text><text x="475" y="108" font-weight="600">輸出限幅</text><text x="475" y="132">±L</text>
            <text x="555" y="99">u[n]</text><text x="644" y="99" font-size="13">u−d</text>
            <text x="785" y="106" font-weight="600">一階被控體 · 精確 ZOH</text>
            <text x="785" y="131" font-size="13">y[n+1] = a·y[n] + (1−a)(u[n]−d[n])</text>
            <text x="946" y="99">y[n+1]</text>
            <text x="602" y="27">負載 d[n]</text><text x="497" y="258">下一拍讀取 y，再計算新的誤差</text>
            <text x="124" y="120">+</text><text x="135" y="133">−</text>
            <text x="592" y="121">+</text><text x="604" y="109">−</text>
          </g>
          <text x="290" y="184" text-anchor="middle" fill="#7a6240" font-size="13" font-family="system-ui, sans-serif">u* 與 u 的上一拍記錄保存在 PI 內部</text>
        </svg>
      </div>
      <figcaption>從 y[n] 算出當拍 u[n]，保持一個 Ts，再得到 y[n+1]。圖中的一拍是控制器呼叫週期，沒有另加計算延遲、ADC 濾波或 DAC 動態。</figcaption>
    </figure>
    ${math(String.raw`\tau\frac{dy}{dt}+y=u-d,\qquad \tau=0.25\ \mathrm{s}`)}
    <p>參考在 0.5 s 從 0 階躍到 0.6，3 s 加載、5 s 卸載，觀察至不晚於 8 s 的最後一個取樣點；事件都在第一個不早於指定時間的控制拍發生，畫面顯示實際拍點。初始 y、Ui、Out、OutPreSat 均為 0。穩態若要維持 y=r，必須有 u=r+d；因此 <strong>0.6+d&gt;L 時，負載期間的目標超過本模型的可用輸出</strong>，加大增益不能補出缺少的致動範圍。</p>

    <h2 id="${id}-sampling">02｜精確離散化，並分清 Ki 與每秒積分作用</h2>
    <p>假設 u 與 d 在一個 Ts 內保持固定，將微分方程積分，可得下式。它是該一階模型在零階保持條件下的精確更新，避免把前向 Euler 的數值誤差誤看成控制器振盪：</p>
    ${math(String.raw`a=e^{-T_s/\tau},\qquad y[n+1]=a\,y[n]+(1-a)\big(u[n]-d[n]\big)`)}
    <p>但精確被控體更新不會消除取樣控制的影響。未飽和、固定參數且每拍積分時，先用被控體模型與 PI 遞迴式得到兩個傳遞函數，再由負回授的 1+GcGp=0 求閉迴路特徵式：</p>
    ${math(String.raw`G_p(z)=\frac{1-a}{z-a},\qquad G_c(z)=K_p\frac{(1+K_i)z-1}{z-1}`)}
    ${math(String.raw`(z-a)(z-1)+(1-a)K_p\big((1+K_i)z-1\big)=0`)}
    ${math(String.raw`z^2+\big[-1-a+(1-a)K_p(1+K_i)\big]z+a-(1-a)K_p=0`)}
    <p>在線性條件下，可用根是否位於單位圓內分析這個模型；Ki=0 等消去情形須先化簡。飽和時積分閘門改變，不能只靠這個二次式解釋全部波形。模型也未包含原機的量測窗口、多速率排程與下游限幅。</p>
    ${math(String.raw`K_i=\frac{T_s}{T_i},\qquad T_i=\frac{T_s}{K_i},\qquad K_{i,\mathrm{parallel}}=\frac{K_pK_i}{T_s}`)}
    <p><strong>拖動 Ts 時，本實驗保留畫面上的 Ki 數值。</strong> 例如 Kp=1.2、Ki=0.04、Ts=10 ms，等效 Ti=0.25 s、平行式積分增益為 4.8 s⁻¹；改成 Ts=20 ms，兩者變成 0.5 s 與 2.4 s⁻¹。若要維持 Ti，需手動把 Ki 同比例增加。Ki=0 時沒有積分作用。這裡的 Ts 指該 PI 的呼叫間隔，不能直接拿 Timer0 或 CLA 的取樣頻率代入。${src('Include/PID_Control_Module.h', 142, 145)} ${src('Source/main.c', 332, 342)}</p>

    <h2 id="${id}-code">03｜沿著一拍游標，對照原始 C 的執行順序</h2>
    <p><strong>A．讀回授、算比例。</strong> 圖中的 y 是該拍開始時的回授；先計算誤差 e=r−y，再得到 Up。新的 u 要到接下來的保持區間才影響被控體，不能把 y[n+1] 拿回來計算同一拍 e[n]。</p>
    ${codeBlock('Include/PID_Control_Module.h', 149, 149, String.raw`    p->Err = p->Ref - p->Fdb;`, 'A1｜圖中的 e：參考減去本拍回授')}
    ${codeBlock('Include/PID_Control_Module.h', 153, 153, String.raw`    p->Up = p->Kp * p->Err;`, 'A2｜圖中的 P：Up = Kp × e')}
    <p><strong>B．先檢查舊輸出，再更新 Ui。</strong> 此時 Out 與 OutPreSat 尚未被本拍覆寫。因此游標若顯示「積分凍結」，應核對的是上一拍的兩個值。即使本拍誤差反向，凍結依然生效；第一次跨入飽和的當拍卻可能已經累積。</p>
    ${codeBlock('Include/PID_Control_Module.h', 157, 162, String.raw`    if(p->Out != p->OutPreSat) {
        p->Ui = p->Ui;
    }
    else {
        p->Ui = p->Ui + ( p->Ki * p->Up );
    }`, 'B｜圖中的 I：允許更新時加 Ki × Up，而非 Ki × e')}
    <p><strong>C．形成 u*、限幅成 u。</strong> u* 是 P 與 I 的總和，u 才是真正送入教學被控體的命令。游標中的 OutPreSat 與 Out 不相等表示當拍限幅，圖表上緣以紅色標示；「凍結」則是前一拍限幅的結果，兩者應相差一個判斷時點。</p>
    ${codeBlock('Include/PID_Control_Module.h', 166, 166, String.raw`    p->OutPreSat = p->Up + p->Ui;`, 'C1｜未限幅輸出 u*')}
    ${codeBlock('Include/PID_Control_Module.h', 169, 177, String.raw`    if (p->OutPreSat > p->OutMax) {
        p->Out = p->OutMax;
    }
    else if (p->OutPreSat < p->OutMin)  {
        p->Out = p->OutMin;
    }
    else {
        p->Out = p->OutPreSat;
    }`, 'C2｜限幅後輸出 u；剛好等於界限不算被截斷')}
    <p>「無條件積分」選項只移除 B 的凍結條件，其餘模型與參數相同，用來隔離 windup 的效果；<strong>它是對照演算法，不是原韌體模式</strong>。本實驗使用 JavaScript 雙精度，原碼為 float32；也沒有重演韌體的模式切換、整結構 reset 或最終 DAC 再限幅，因此不是位元精確或整機模擬。</p>

    <h2 id="${id}-metrics">04｜先定義量測窗口，再解讀超調與恢復</h2>
    <p>階躍指標只取「參考跳變後、加載前」的取樣點，讓負載擾動不混入階躍超調。相對 0→0.6 的階躍幅度，超調定義如下；只計正向超出，沒有超過目標就是 0%，不代表已追上目標：</p>
    ${math(String.raw`M_p=100\%\times\frac{\max\big(0,\max y[n]-0.6\big)}{0.6}`)}
    <p>10–90% 上升時間取 y 首次達到 0.06 與 0.54 的拍點差；未達門檻時顯示未達成。2% 帶為 0.6±0.012，整定時間取最後一次出帶之後，持續留在帶內直到該觀察窗口結束的首拍，且須至少觀察到 0.25 s 的帶內尾段。若最後才剛入帶，會標示觀察時間不足。這是有限時間、離散取樣的判定，沒有插值，也不是對未來永不出帶的保證。</p>
    <div class="table-wrap"><table><thead><tr><th>讀值</th><th>回答的問題</th><th>不可混為一談</th></tr></thead><tbody>
      <tr><td>累計限幅時間</td><td>u*≠u 的保持區間總共有多長？</td><td>不是積分凍結時間；端點後未模擬的時間不列入。</td></tr>
      <tr><td>卸載後首次解除限幅</td><td>卸載前仍限幅時，多久後首次 u*=u？</td><td>首次解除不代表之後不再限幅，也不代表 y 已恢復。</td></tr>
      <tr><td>卸載後回到 2% 帶</td><td>卸載後多久才持續回到目標附近？</td><td>僅在剩餘觀察窗口內成立；未恢復須顯示未達成。</td></tr>
    </tbody></table></div>
    <p>每個時間指標都受 Ts 解析度限制。沒有發生對應事件時應讀作「不適用」，在 8 s 內尚未完成則是「未達成」，兩者都不能當成 0 s。末端誤差是最後一個取樣點的 r−y，不能單憑一點便稱為穩態誤差。</p>

    <h2 id="${id}-experiments">05｜三組有判斷依據的實驗</h2>
    <ol>
      <li><strong>把積分推快：</strong>可先切換「平順追蹤」與「積分偏強」預設，再自行保持 Kp 與 Ts、只增加 Ki。先比較加載前的上升與超調，再查看 u* 是否撞到界限；一旦限幅，變化已不只是線性極點移動。用游標找出第一次限幅與下一拍積分凍結。</li>
      <li><strong>比較重載後的恢復：</strong>使用「負載超出能力」，或令 d 大於 L−0.6，讓目標在加載期間不可達。保持所有參數，切換韌體凍結與無條件積分，比較 5 s 前 Ui 的累積、卸載後首次解限幅、以及回到 2% 帶所需時間。凍結可以限制累積，但不保證所有參數下都迅速恢復。</li>
      <li><strong>拆開週期與係數：</strong>先只把 Ts 加倍，再把 Ki 也加倍。第一次同時減慢每秒積分作用與改變取樣保持；第二次恢復等效 Ti，但取樣保持仍變了，波形不必完全重合。使用事件的實際拍點讀取時間，避免把對齊差誤認為控制效能。</li>
    </ol>
    <p><a href="#/discrete-control">延伸閱讀：離散 PI 的完整推導、reset 與下游限制 →</a></p>
  </section>`;
}
