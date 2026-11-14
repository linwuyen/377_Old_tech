import { math, src } from './lessons/shared.js';

let guideCount = 0;

/** Frequency-domain teaching notes for the same sampled first-order lab model. */
export function renderFrequencyGuide() {
  const id = `frequency-guide-${++guideCount}`;
  return `
  <section class="lab-frequency-theory" aria-labelledby="${id}-heading">
    <h2 id="${id}-heading">06｜從逐拍遞迴，走到離散 Bode 圖</h2>
    <p>頻域圖使用與時間模擬相同的 Kp、Ki、Ts 與 τ=0.25 s，但取<strong>未限幅、每拍都允許積分</strong>的線性模型。分析的是工作點附近的小擾動；負載與限幅值不改變這個線性傳遞函數。若工作點本來就需要超出限幅的輸出，例如 0.6+d&gt;Umax，便不能把此圖解讀成該過載工作點的局部響應。</p>
    <p>由零初始條件下的 <code>Ui[n]=Ui[n−1]+Ki·Kp·e[n]</code> 與被控體更新式，可寫出開迴路 L，以及參考到回授的閉迴路 H。這裡的 Ki 仍是原碼的每拍係數；它先乘比例項 Up，再加進 Ui。${src('Include/PID_Control_Module.h', 153, 166)}</p>
    ${math(String.raw`\begin{gathered}a=e^{-T_s/\tau},\quad b=1-a,\quad G_p(z)=\frac{b}{z-a},\quad G_c(z)=K_p\frac{(1+K_i)z-1}{z-1},\\L(z)=G_c(z)G_p(z),\qquad H(z)=\frac{L(z)}{1+L(z)}\end{gathered}`)}
    <p>離散頻率響應沿 z 平面的單位圓計算；橫軸採 Hz，不能直接把 f 代進連續模型的 s。正頻率只畫到 Nyquist，對數軸不包含 f=0，直流增益另外用極限求出。</p>
    ${math(String.raw`z=e^{j\theta},\qquad \theta=2\pi fT_s,\qquad 0<f\le f_N=\frac{1}{2T_s}`)}
    ${math(String.raw`L_{\mathrm{dB}}(f)=20\log_{10}|L(e^{j\theta})|,\qquad \phi_L(f)=\arg L(e^{j\theta})`)}
    <p>幅值圖同時看 L 與 H：L 用來找迴路交越與相位裕度，H 用來看追蹤頻寬及共振峰。相位以連續分支解讀，不把 ±180° 顯示折返誤認成實際突變。若閉迴路失穩，代入單位圓仍可能算出代數上的 H；它不代表可達的穩態正弦響應。</p>

    <h2 id="${id}-margins">07｜交越頻率、相位裕度與頻寬，各回答不同問題</h2>
    <p><strong>增益交越頻率 fc</strong> 是開迴路幅值通過 0 dB 的位置；相位裕度 PM 是在這個位置，距離 −180° 還有多少相位。讀值必須來自同一個交越點，不能拿閉迴路的頻寬頻率代替。這符合 <a href="https://www.mathworks.com/help/control/ref/dynamicsystem.margin.html" target="_blank" rel="noopener noreferrer">MathWorks margin 的相位裕度定義 ↗</a>。</p>
    ${math(String.raw`|L(e^{j2\pi f_cT_s})|=1,\qquad \mathrm{PM}=180^\circ+\phi_L(f_c)`)}
    <p>沒有交越點，應先分清「整段低於 0 dB」與「到 Nyquist 仍高於 0 dB」，不能一律說成相位裕度無限大。直流邊界與 Nyquist 邊界也須單獨辨認。此實驗的正增益一階 PI 模型有其特定結構；穩定性仍以閉迴路極點判定，不把單一 PM 數字當成任意系統的完整穩定證明。</p>
    <p><strong>閉迴路頻寬 fBW</strong> 採相對直流增益的首次向下半功率交越：|H| 降至 |H(1)|/√2。一般工具常稱相對直流 −3 dB 頻寬；本實驗使用精確半功率值，約 −3.0103 dB，和 −3.0000 dB 有微小差別。可參照 <a href="https://www.mathworks.com/help/ident/ref/dynamicsystem.bandwidth.html" target="_blank" rel="noopener noreferrer">MathWorks bandwidth 的相對直流、首次下降定義 ↗</a>。</p>
    ${math(String.raw`|H(e^{j2\pi f_{\mathrm{BW}}T_s})|=\frac{|H(1)|}{\sqrt2},\qquad 20\log_{10}\!\frac{|H|}{|H(1)|}=-3.0103\ldots\ \mathrm{dB}`)}
    <p>只在穩定且直流追蹤增益非零的情況下報告這個頻寬。閉迴路失穩或臨界時不套用穩態頻寬；Kp=0 時沒有參考響應；若直到 Nyquist 都未下降到門檻，也不能臆測更高頻的交越。一般而言頻寬增加可加快小訊號追蹤，但超調還受極點、零點及飽和影響，不能只由頻寬推定。</p>

    <h2 id="${id}-poles">08｜特徵式與單位圓：穩定性可以直接算</h2>
    <p>將 1+L(z)=0 展開，得到下面的二階特徵式。它也可由狀態 [y[n], Ui[n−1]] 的更新矩陣求得；原碼先更新 Ui 再計算 OutPreSat，正是係數含有 (1+Ki) 的原因。</p>
    ${math(String.raw`D(z)=z^2+c_1z+c_0,\qquad c_1=-1-a+bK_p(1+K_i),\qquad c_0=a-bK_p`)}
    <p>離散系統的衰減取決於 z 的模長，而非只看實部是否為負。全部有效閉迴路模態在單位圓內才漸近衰減；單位圓上的根表示臨界邊界，重根還可能產生隨拍數增長的項；圓外根則表示線性失穩。</p>
    ${math(String.raw`z_{1,2}=\frac{-c_1\pm\sqrt{c_1^2-4c_0}}{2},\qquad \rho=\max_k|z_k|,\qquad \rho<1\ \Longrightarrow\ \text{asymptotic decay}`)}
    <p>對實係數二階首一多項式，Jury 條件可寫成以下三個嚴格不等式。代入本實驗係數後，可把單位圓判定直接連到增益與取樣週期：</p>
    ${math(String.raw`1+c_1+c_0>0,\qquad 1-c_1+c_0>0,\qquad 1-c_0>0`)}
    ${math(String.raw`\begin{aligned}1+c_1+c_0&=bK_pK_i,\\1-c_1+c_0&=2(1+a)-bK_p(2+K_i),\\1-c_0&=b(1+K_p).\end{aligned}`)}
    <p>在 Kp&gt;0、Ki&gt;0、Ts&gt;0 下，0&lt;a&lt;1，第一與第三式自動成立，因此穩定範圍只剩下第二式。達到等號時有根穿過 z=−1，對應取樣正負交替的 Nyquist 模態；Ki=0 或 Kp=0 的消去情形則需另外處理。</p>
    ${math(String.raw`0<K_p<\frac{2(1+a)}{(1-a)(2+K_i)}\qquad(K_i>0)`)}
    <p>例如 Ts=0.1 s、Ki=0.4 時，臨界 Kp≈4.2221。選「線性失穩」的 Kp=6，兩根約為 0.7192 與 −1.8182；負根已在單位圓外。時間模擬中的輸出仍會被 ±Umax 截住，可能呈現有界振盪；這不等於未限幅線性迴路穩定。</p>

    <h2 id="${id}-time">09｜把極點位置，對回階躍響應</h2>
    <p>正實根通常帶來同方向衰減；負實根的模態逐拍換號；共軛複數根帶來衰減振盪。根越接近單位圓，模態每拍衰減越慢。對 0&lt;|z|&lt;1 的穩定模態，可換算其包絡時間常數與振盪頻率：</p>
    ${math(String.raw`\tau_{\mathrm{mode}}=-\frac{T_s}{\ln|z|},\qquad f_{\mathrm{mode}}=\frac{|\arg z|}{2\pi T_s}`)}
    <p>這是單一模態的描述；實際階躍是各模態與零點、輸入權重的合成。不能直接把最慢極點的時間常數當成整定時間，也不能把一對複數根套入連續二階超調公式後，當成含飽和波形的精確答案。</p>
    <p><strong>Ki=0 的例外：</strong>在初始 Ui=0 的參考響應中，控制器化簡為純 P，z=1 的共同因子應消去，留下以下一階閉迴路。雖然參考輸入不激發這個消去的積分模態，原碼 Ui 欄位仍保留其初始值；非零初始 Ui 是持續偏置，不能把整個內部狀態說成會歸零。</p>
    ${math(String.raw`K_i=0:\quad H(z)=\frac{bK_p}{z-a+bK_p},\qquad z_P=a-bK_p,\qquad H(1)=\frac{K_p}{1+K_p}`)}
    <p><strong>Kp=0 的例外：</strong>Up=0，因此 Ui 不再累積。在本實驗零初始狀態下，參考到輸出的 H=0，不能報告追蹤頻寬或相位裕度。被控體仍有 a 的衰減模態，而保存 Ui 的內部狀態仍有中性模態；「沒有參考響應」不等於「沒有任何動態」。</p>

    <h2 id="${id}-experiments">10｜用三個實驗，連起頻域與時域</h2>
    <p>Ts 指的是這個 PI 的呼叫週期。改變 Ts 時，本介面保持 Ki 的每拍數值，所以同時改變 Nyquist 頻率、零階保持，以及每秒的積分強度。若要固定連續等效 Ti，必須自行按比例改 Ki。${src('Include/PID_Control_Module.h', 142, 145)}</p>
    ${math(String.raw`T_i=\frac{T_s}{K_i},\qquad K_{i,\mathrm{parallel}}=\frac{K_pK_i}{T_s},\qquad K_i'=K_i\frac{T_s'}{T_s}\quad(\text{fixed }T_i)`)}
    <ol>
      <li><strong>從「平順追蹤」到「積分偏強」：</strong>先比較預設，再固定 Kp 與 Ts、只增加 Ki。觀察開迴路交越、相位裕度、極點是否變成共軛根，以及加載前的超調；同時確認時間圖是否已限幅，避免把非線性差異全歸因於 PM。</li>
      <li><strong>逐步接近失穩邊界：</strong>固定 Ts=0.1 s、Ki=0.4，讓 Kp 從 4 增至 6。看負實根如何通過 −1，再對照「線性失穩」情境的階躍。未限幅模型的發散與有限輸出模型的振盪，是兩種不同的觀察。</li>
      <li><strong>保持頻域參數、只改負載與限幅：</strong>從可補償負載改到過載，Bode 與極點應維持不變，但積分凍結、超調與卸載恢復會改變。頻域圖回答線性小訊號問題；恢復能力要回到原碼的限幅與積分閘門。${src('Include/PID_Control_Module.h', 157, 177)}</li>
    </ol>
    <p>所有結論都針對這個一階教學模型。真實 ASR5000 還有量測窗口、多速率排程、DAC、外部功率級與延遲；本圖沒有辨識或驗證那些動態。</p>
  </section>`;
}
