import { math, src, codeBlock } from './lessons/shared.js';

let guideCount = 0;

/** Explain the optional delay/filter as explicit teaching assumptions, not identified hardware. */
export function renderDelayGuide() {
  const id = `delay-guide-${++guideCount}`;
  return `
  <section class="lab-delay-theory" aria-labelledby="${id}-heading">
    <h2 id="${id}-heading">11｜把命令、實際致動與量測值分開</h2>
    <p>新增的 D 是<strong>限幅之後、進入被控體之前</strong>的額外整數拍延遲。原始輸出 y 先經量測低通得到 m，控制器以 e=r−m 計算命令 u；被控體實際收到的是延遲後的 v（介面標示為 ua，程式欄位 appliedOut）。關閉濾波時 m=y，D=0 時 v=u，因此能回到前面使用的基準模型。</p>
    <figure class="control-diagram">
      <div class="diagram-toolbar"><span>EXTENDED LOOP / 額外致動延遲與量測低通</span></div>
      <div class="diagram-scroll" tabindex="0" aria-label="延遲與量測濾波方塊圖，可水平捲動">
        <svg class="control-svg" viewBox="0 0 1160 325" role="img" aria-labelledby="${id}-diagram-title ${id}-diagram-desc" xmlns="http://www.w3.org/2000/svg">
          <title id="${id}-diagram-title">量測低通回授與命令延遲的 PI 閉迴路</title>
          <desc id="${id}-diagram-desc">r 減量測值 m 得到誤差。PI 與限幅產生命令 u，經 D 拍延遲成為 v，減去負載 d 後送入被控體。原始輸出 y 經低通 F 回到加總點，濾波輸出 m 與原始 y 分別觀察。</desc>
          <g fill="none" stroke="#537363" stroke-width="2">
            <path d="M24 112H106 M150 112H184 M340 112H376 M488 112H533 M661 112H711 M755 112H800 M998 112H1120"/>
            <path d="M1057 112V243H755 M530 243H128V134 M733 36V90"/>
            <circle cx="128" cy="112" r="22" fill="#fff"/><circle cx="733" cy="112" r="22" fill="#fff"/>
            <rect x="184" y="74" width="156" height="76" rx="7" fill="#edf4ed"/>
            <rect x="376" y="74" width="112" height="76" rx="7" fill="#fff5e8"/>
            <rect x="533" y="74" width="128" height="76" rx="7" fill="#fff5e8"/>
            <rect x="800" y="74" width="198" height="76" rx="7" fill="#edf4ed"/>
            <rect x="530" y="207" width="225" height="72" rx="7" fill="#ecf1f8"/>
          </g>
          <g fill="#537363">
            <path d="M106 112l-8-4v8z M184 112l-8-4v8z M376 112l-8-4v8z M533 112l-8-4v8z M711 112l-8-4v8z M800 112l-8-4v8z M1120 112l-8-4v8z M755 243l8-4v8z M128 134l-4 8h8z M733 90l-4-8h8z"/>
            <circle cx="1057" cy="112" r="4"/>
          </g>
          <g fill="#274f42" font-family="system-ui, sans-serif" font-size="15" text-anchor="middle">
            <text x="59" y="96">r</text><text x="165" y="96">e</text><text x="119" y="117">+</text><text x="130" y="131">−</text>
            <text x="262" y="104" font-weight="600">PI / Gc(z)</text><text x="262" y="130" font-size="13">上一拍限幅閘門</text>
            <text x="358" y="96">u*</text><text x="432" y="105" font-weight="600">限幅 ±L</text><text x="432" y="130" font-size="13">OutPreSat → Out</text>
            <text x="511" y="96">u[n]</text><text x="597" y="104" font-weight="600">延遲 z⁻ᴰ</text><text x="597" y="130" font-size="13">零初始佇列</text>
            <text x="687" y="96">v[n]</text><text x="724" y="118">+</text><text x="735" y="106">−</text><text x="733" y="25">負載 d</text>
            <text x="776" y="96" font-size="13">v−d</text><text x="899" y="104" font-weight="600">一階被控體 Gp(z)</text><text x="899" y="130" font-size="13">精確 ZOH · τ=0.25 s</text>
            <text x="1083" y="96">原始 y</text><text x="643" y="236" font-weight="600">量測低通 F(z)</text><text x="643" y="260" font-size="13">當拍 y 與歷史狀態 → m</text>
            <text x="333" y="229">m[n] = Fdb</text><text x="924" y="229">原始 y[n]</text>
          </g>
          <text x="580" y="311" text-anchor="middle" fill="#6b7d71" font-family="system-ui, sans-serif" font-size="13">線性頻域分析移除限幅與積分凍結；時域模擬保留兩者。</text>
        </svg>
      </div>
      <figcaption>D 只代表本實驗添加的命令管線。圖中的 y 是被控體輸出，m 才是送入 PI 的量測值；兩者不可混用。</figcaption>
    </figure>
    ${math(String.raw`v[n]=u[n-D],\qquad e[n]=r[n]-m[n],\qquad y[n+1]=a\,y[n]+b\big(v[n]-d[n]\big)`)}
    <p>每拍先讀 y、更新 m、計算 PI 並限幅，再取出延遲佇列的命令，最後推進 y。D=1 時，新命令等下一拍才到被控體；初始佇列皆為 0。PI 的凍結判斷仍比較<strong>上一拍命令 Out 與 OutPreSat</strong>，不會改去比較延遲後的 v。這正對應原碼的本地限幅判斷，而不是新增致動器回授式 anti-windup。${src('Include/PID_Control_Module.h', 157, 177)}</p>
    ${math(String.raw`T_d=DT_s,\qquad G_d(z)=z^{-D},\qquad |G_d(e^{j\theta})|=1,\qquad \phi_d(f)=-360^\circ fDT_s`)}
    <p>純延遲只改相位，不改開迴路幅值，所以固定其他參數時，增加 D 不會移動增益交越頻率，但會增加該處的相位落後。被控體原本的 y[n]→y[n+1] 已包含一次取樣保持更新，D 是在此之外增加的拍數，不能再把那一拍重複算入。</p>

    <h2 id="${id}-filter">12｜截止頻率如何變成每拍低通係數</h2>
    <p>本實驗使用一階雙線性低通，並先做頻率預扭曲，讓介面的截止頻率 fc（以下記為 fLP，與增益交越 fgc 區分）是數位模型實際的半功率截止頻率。先將連續低通的角頻率設定為 Ωp，再做雙線性代換：</p>
    ${math(String.raw`F_c(s)=\frac{\Omega_p}{s+\Omega_p},\qquad \Omega_p=\frac{2}{T_s}\tan(\pi f_{\mathrm{LP}}T_s),\qquad s\leftarrow\frac{2}{T_s}\frac{z-1}{z+1}`)}
    ${math(String.raw`k=\tan(\pi f_{\mathrm{LP}}T_s),\qquad c=\frac{k}{1+k},\qquad p=\frac{1-k}{1+k},\qquad F(z)=\frac{c(z+1)}{z-p}`)}
    ${math(String.raw`m[n]=p\,m[n-1]+c\big(y[n]+y[n-1]\big),\qquad F(1)=1,\qquad F(-1)=0`)}
    <p>運算使用當拍 y 與上一拍 y、m；不能把上一拍輸入提早覆寫，也不能先更新被控體再拿 y[n+1] 計算同一拍控制。濾波器啟用時，m 是 PI 的 Fdb；指標中的輸出超調與整定仍以原始 y 計算，避免把經濾波的小波動誤認成實際輸出也小。</p>
    ${math(String.raw`\left|F\!\left(e^{j2\pi f_{\mathrm{LP}}T_s}\right)\right|=\frac{1}{\sqrt2},\qquad \arg F\!\left(e^{j2\pi f_{\mathrm{LP}}T_s}\right)=-45^\circ`)}
    <p>設定範圍保留與 Nyquist 的距離，最高為 0.45/Ts。改變 Ts 時重新計算 c、p；若 Hz 截止頻率不變，濾波目標仍是同一個實際 Hz，但每拍係數會不同。這與 PI 保持每拍 Ki、延遲保持 D 拍是三種不同約定。低通能衰減高頻量測成分，也加入相位落後；本實驗沒有注入雜訊，因此平滑的 m 曲線本身不是雜訊抑制成效的量測。</p>

    <h2 id="${id}-transfer">13｜加入量測濾波後，H 不能再直接寫成 L/(1+L)</h2>
    <p>先把 PI、額外延遲與被控體合成前向路徑 A；量測低通放在回授支路。因 y=A(r−Fy)，整理後可分別得到原始輸出與量測輸出的閉迴路傳遞函數：</p>
    ${math(String.raw`A(z)=G_c(z)z^{-D}G_p(z),\qquad L(z)=A(z)F(z),\qquad H_y(z)=\frac{A(z)}{1+A(z)F(z)},\qquad H_m(z)=\frac{A(z)F(z)}{1+A(z)F(z)}`)}
    <p><strong>Bode 的閉迴路曲線與頻寬對照原始輸出 Hy，階躍也對照 y。</strong> L/(1+L) 是 Hm；只有低通旁路 F=1 時，它才與 Hy 相同。相位裕度從開迴路 L 的增益交越讀取，而不是從 Hy 的半功率點讀取。本頁以 180° 加上該處的<strong>連續展開相位</strong>，表示累積相位餘量；長延遲時結果可能小於 −180°，不會把它包回另一個相位分支。其數值不能和採不同相位分支的工具直接混比，穩定性仍由全部動態極點判定。</p>
    <p>對 Kp&gt;0、Ki&gt;0，濾波啟用時，把 1+L=0 同乘分母可得下面的特徵式。其階數一般為 D+3，分別包含被控體、積分、量測濾波及 D 個延遲狀態：</p>
    ${math(String.raw`z^D(z-a)(z-1)(z-p)+bK_pc\big((1+K_i)z-1\big)(z+1)=0`)}
    <p>旁路低通時，直接以 F=1 移除濾波分母與分子；若 Ki=0，先把 PI 化成純 P，去除不由零狀態參考輸入激發的 z=1 因子。得到以下兩個常用特例：</p>
    ${math(String.raw`\begin{aligned}F=1:\quad &z^D(z-a)(z-1)+bK_p\big((1+K_i)z-1\big)=0,\\K_i=0,\ F\ne1:\quad &z^D(z-a)(z-p)+bK_pc(z+1)=0.\end{aligned}`)}
    <p>前面二階特徵式與簡化的 Jury 增益界線，只適用於 <strong>D=0 且低通旁路</strong>。加入任一新動態後，需檢查新的全部動態極點，不能只把原本兩根平移。Kp=0 時參考響應仍為零；延遲佇列、被控體及濾波器的自然狀態與保存的中性 Ui，則應和零狀態追蹤傳遞函數分開看。</p>

    <h2 id="${id}-source">14｜原碼的係數、歷史與發布順序，能證明什麼</h2>
    <p><strong>一階遞迴結構有原碼依據；預扭曲是本實驗的選擇。</strong> 韌體初始化直接使用 temp=2π·Cut_Off_Freq/EXTAD_SAMPLE_FREQ，並沒有 tan 預扭曲：</p>
    ${codeBlock('Source/Digital_Filter_Module.c', 54, 60, String.raw`    temp = ( point->Cut_Off_Freq * 2 * M_PI) / EXTAD_SAMPLE_FREQ;

    point->x_n = 0;
    point->y_n = 0;
    point->x_n_1 = 0;
    point->C1 = temp / ( temp + 2 );
    point->D1 = ( 2 - temp ) / ( 2 + temp );`, '原碼係數：直接使用類比截止頻率尺度，並清除歷史')}
    <p>令 k原碼=temp/2，就能看出 C1=k原碼/(1+k原碼)、D1=(1−k原碼)/(1+k原碼)，與本實驗的 c、p 形式相同；差別在 k原碼=πfc/fs,d，本實驗則用 tan(πfLP·Ts)。當設計頻率與實際呼叫率不同，Hz 標籤還會再受更新率影響，詳見濾波章節。</p>
    ${codeBlock('Source/Digital_Filter_Module.c', 85, 86, String.raw`    point->y_n = ( point->C1 * ( point->x_n + point->x_n_1 ) ) + ( point->D1 * point->y_n ); //31 cycles
    point->x_n_1 = point->x_n;`, '先用舊 y_n、x_n_1 計算，再保存本次輸入')}
    <p>這兩行的右側先完成求值，所以 y_n 在右側代表上次輸出。實際外部輸入路徑也在 <code>EXT_Period_Meas_Process()</code> 內展開相同式子。這些 LPF 用於外部過零／慢變 DC 處理，<strong>不能據此宣稱它們就是 CV／CC 補償 PI 前的量測低通</strong>。本頁把相同結構放入教學回授路徑，用來隔離濾波對控制的影響。${src('Source/CPU_Timer_Module.c', 8706, 8727)}</p>
    <p><strong>樣本年齡則要看執行順序。</strong> 在 AC_EXT／ACDC_EXT 的第三相中，程式先呼叫外部週期量測，再把 ADCRESULT0 更新到 EXT_AD_IN：</p>
    ${codeBlock('Source/CPU_Timer_Module.c', 464, 464, String.raw`            EXT_Period_Meas_Process();`, '先使用當時可見的 EXT_AD_IN')}
    ${codeBlock('Source/CPU_Timer_Module.c', 470, 471, String.raw`            DSP_ADC_16bit_Module_Variables.Channel1 = AdcaResultRegs.ADCRESULT0;
            sGB.EXT_INPUT_VARIABLES.EXT_AD_IN = DSP_ADC_16bit_Module_Variables.Channel1;`, '稍後才發布新 ADC 結果，供下次處理使用')}
    <p>這段證明資料可能帶著管線年齡，卻不是「所有控制路徑都固定延遲 D 拍」的證明。此模式三相交替；CLA 的五次累加、下一次發布與跳過該次樣本，又是另一種窗口與保持機制。模式、呼叫頻率與資料發布位置都要一起量測，不能把所有延遲壓成同一個 Timer 拍數。${src('Source/CPU_Timer_Module.c', 422, 477)} ${src('Source/CLA_Task.cla', 217, 235)}</p>

    <h2 id="${id}-experiments">15｜三組實驗，拆開相位落後的來源</h2>
    <ol>
      <li><strong>只增加額外延遲：</strong>比較「平順追蹤」與「延遲 8 拍」，或旁路低通、固定 Kp、Ki、Ts，讓 D 從 0 往上增加。開迴路幅值與交越頻率應保持相同，相位則增加 −360fDTs 的落後。對照極點移動、線性階躍振盪，以及限幅模擬是否開始和線性結果分離。</li>
      <li><strong>只降低量測截止頻率：</strong>比較「平順追蹤」與「量測低通 1 Hz」，再固定 D 與控制器、逐步降低 fLP。同時查看原始 y 與量測 m；m 較慢不代表 y 的超調一定較小。低通同時移動交越與增加相位落後，PM 的變化要重新計算，不能只從「截止更低」推定。</li>
      <li><strong>改 Ts 時先寫下保持什麼：</strong>固定 D 拍會改變延遲秒數，固定 Ki 會改變每秒積分強度，固定 fLP 的 Hz 值則會重算低通係數。如果要保持 Ti，需同步調整 Ki；如果要保持延遲秒數，需調整 D，而整數拍可能無法精確吻合。一次只改一項約定，再比較圖形。</li>
    </ol>
    <p>新增的 D 與 fLP 是可檢驗的教學假設，尚未由 ASR5000 的資料路徑實測辨識。頻域圖描述未飽和線性動態；過載、積分凍結與恢復仍需回到時域逐拍狀態判讀。</p>
  </section>`;
}
