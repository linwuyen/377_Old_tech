import { src, math, diagram, codeBlock } from './shared.js';

export const filterLesson = {
  id: 'filters', number: '05', title: '把低通係數還原成時間系統',
  summary: '從連續低通推導雙線性轉換，逐行核對一階 IIR、40 kHz 執行節奏與五取六發的平均窗口。',
  duration: '36 分鐘', category: '控制演算法', tags: ['雙線性轉換', 'IIR', '取樣與延遲'],
  body: `
    <h2 id="filter-contract">01｜先定義輸入、狀態與兩種取樣率</h2>
    <p>這篇把一個熟悉的 C 遞迴式，還原成可檢查頻率、增益與延遲的離散系統。原碼有兩個外部 ADC 濾波物件：<code>EXT_AD_LPF</code> 設定 1000 Hz，<code>EXT_AD_DC_FILTER_LPF</code> 設定 1 Hz；兩者都呼叫一階初始化。前者供外部過零偵測，後者估計慢變 DC 基準。結構裡雖填入 <code>damping_ratio=0.707</code>，一階係數並未讀取此欄位。${src('Source/Digital_Filter_Module.c', 24, 60)} ${src('Source/CPU_Timer_Module.c', 8700, 8727)}</p>
    <p>以下用 <em>x[n]</em> 表示「本次進入濾波函式時可見的 ADC 值」，<em>y[n]</em> 表示更新後輸出。設計係數採用的取樣頻率記為 ${math(String.raw`f_{s,d}`, false)}，實際每秒更新次數記為 ${math(String.raw`f_{s,u}`, false)}。只有兩者一致時，係數的 Hz 標籤才能直接當成實際時間尺度。方塊圖中的延遲是<strong>一次濾波更新</strong>，不是一次任意 CPU 指令，也未必是一次 Timer 中斷。</p>
    ${diagram('filter', '一階 IIR 的正號回授實現：兩個 z⁻¹ 各保存一次濾波更新的歷史。')}

    <h2 id="filter-bilinear">02｜從連續低通一步步得到 C1、D1</h2>
    <p><strong>理論推導。</strong>取單位直流增益的一階類比低通，假設截止角頻率與設計週期皆為正。角頻率單位是 rad/s，截止頻率單位是 Hz，兩者相差 ${math(String.raw`2\pi`, false)}。這個連續模型用來解釋程式係數，不代表已辨識電源的功率級傳遞函數。</p>
    ${math(String.raw`H_c(s)=\frac{\omega_c}{s+\omega_c},\qquad \omega_c=2\pi f_{c,d},\qquad T_d=\frac{1}{f_{s,d}}`)}
    <p>雙線性轉換以梯形積分對應的代換，把 s 平面的運算換成 z 平面的延遲。先代入，再同乘 ${math(String.raw`T_d(1+z^{-1})`, false)}，最後將分母常數正規化為 1：</p>
    ${math(String.raw`\begin{aligned}s&\leftarrow\frac{2}{T_d}\frac{1-z^{-1}}{1+z^{-1}},\qquad a=\omega_cT_d\\ H(z)&=\frac{a(1+z^{-1})}{2(1-z^{-1})+a(1+z^{-1})}\\ &=\frac{a(1+z^{-1})}{(2+a)+(a-2)z^{-1}}\\ &=\frac{C_1(1+z^{-1})}{1-D_1z^{-1}},\qquad C_1=\frac{a}{2+a},\quad D_1=\frac{2-a}{2+a}.\end{aligned}`)}
    <p>此處刻意把分母寫成 ${math(String.raw`1-D_1z^{-1}`, false)}。因此移到時域後，舊輸出前面是<strong>加 D1</strong>；若把通用 biquad 慣用的分母係數直接填入本結構，又保留加號，便會多翻一次符號。</p>
    ${math(String.raw`Y(z)-D_1z^{-1}Y(z)=C_1X(z)+C_1z^{-1}X(z)\quad\Longrightarrow\quad y[n]=C_1\{x[n]+x[n-1]\}+D_1y[n-1]`)}

    <h2 id="filter-pole">03｜由 H(z) 檢查 DC、極點與暫態</h2>
    <p><strong>理論檢查。</strong>令 z=1 得到直流增益；令 z=−1 得到 Nyquist 點；令分母為零得到極點。對有限的正 a，極點必定位於單位圓內，這只證明此理想線性濾波器的 BIBO 穩定，不能延伸成整台電源閉迴路具有多少穩定裕度。</p>
    ${math(String.raw`H(1)=\frac{2C_1}{1-D_1}=1,\qquad H(-1)=0,\qquad p=D_1=\frac{2-a}{2+a},\qquad a>0\Rightarrow |p|<1`)}
    <p>單位 DC 增益表示常值會通過；「低通」本身不會移除 offset。慢速低通可以估計 DC，再由其他路徑減去該基準。當 0&lt;a&lt;2 時，D1 為正，常值輸入的暫態尾端按 ${math(String.raw`D_1^n`, false)} 衰減；當 a&gt;2 時，D1 雖為負但仍穩定，尾端會交替正負。不可把「穩定」與「每拍單調接近」當成同一件事。</p>
    <p>若以零歷史啟動、第一拍開始輸入常數 1，第一拍只有當前輸入，故 y[0]=C1，而不是 2C1。其後可解得下式；時間常數寫法只適用於 0&lt;D1&lt;1。實際浮點運算還有係數量化，尤其 1 Hz 分支的 D1 很靠近 1，精確代數中的 DC 增益等式不應冒充逐位元運算結果。</p>
    ${math(String.raw`y[n]=1-(1-C_1)D_1^n\quad(n\ge0),\qquad \tau_{\mathrm{tail}}=-\frac{1}{f_{s,u}\ln D_1}\quad(0<D_1<1)`)}

    <h2 id="filter-code">04｜逐行讀初始化與狀態覆寫順序</h2>
    ${codeBlock('Source/Digital_Filter_Module.c', 50, 62, String.raw`void Init_Digital_One_Order_LPF(Digital_Filter_Module* point)
{
    float temp ;

    temp = ( point->Cut_Off_Freq * 2 * M_PI) / EXTAD_SAMPLE_FREQ;

    point->x_n = 0;
    point->y_n = 0;
    point->x_n_1 = 0;
    point->C1 = temp / ( temp + 2 );
    point->D1 = ( 2 - temp ) / ( 2 + temp );

}`, '初始化：temp 就是無因次 a')}
    <p>L54 以截止頻率除以設計取樣頻率，建立 a；L56–58 同時清除輸入、前次輸入及前次輸出；L59–60 正是上一節推導的 C1、D1。它沒有使用 <code>tan()</code> 預扭曲，也沒有在每次執行時根據 elapsed time 重算係數。重設狀態後，濾波器會重新經歷啟動暫態。</p>
    ${codeBlock('Source/Digital_Filter_Module.c', 83, 88, String.raw`void Digital_One_Order_LPF_Loop(Digital_Filter_Module* point)
{
    point->y_n = ( point->C1 * ( point->x_n + point->x_n_1 ) ) + ( point->D1 * point->y_n ); //31 cycles
    point->x_n_1 = point->x_n;

}`, '運算：先讀舊狀態，再保存本次輸入')}
    <p>L85 賦值右側的 <code>y_n</code> 仍是 y[n−1]，右側完整求值後才覆寫成 y[n]；L86 才把 x[n] 保存為下一回合的 x[n−1]。若先執行 L86，輸入和就變成 2x[n]，零點與頻率響應也隨之改變。外層 <code>Digital_One_Order_LPF_Cal()</code> 只負責先寫 x_n、呼叫這段運算、再回傳 y_n。${src('Source/Digital_Filter_Module.c', 69, 76)}</p>

    <h2 id="filter-clock">05｜三相排程把更新率改成 40 kHz</h2>
    <p><strong>原碼事實。</strong><code>CPU_TIMER0_FREQ</code> 為 120000 Hz，<code>EXTAD_SAMPLE_FREQ</code> 卻為 120120.12 Hz。AC_EXT／ACDC_EXT 模式的 <code>Exec_Switch</code> 依序走 0→1→2→0：第一相觸發 ADC，第二相處理外部 I/O，第三相呼叫濾波與週期量測。因此在模式穩定、每次中斷皆正常執行的假設下，濾波名義更新率是 120000/3=40000 Hz，每次更新間隔 25 µs。這是靜態排程推論，執行期抖動仍應以時間戳或 GPIO 驗證。${src('Include/CPU_Timer_Module.h', 21, 27)} ${src('Include/CPU_Timer_Module.h', 53, 58)} ${src('Source/CPU_Timer_Module.c', 422, 477)}</p>
    <div class="table-wrap"><table><thead><tr><th>Timer 相位</th><th>動作</th><th>對樣本年齡的影響</th></tr></thead><tbody><tr><td>Exec_Switch=0</td><td>觸發 ADC，切到 1</td><td>開始取得新轉換</td></tr><tr><td>Exec_Switch=1</td><td>外部 I/O 與條件處理，切到 2</td><td>尚未更新濾波器</td></tr><tr><td>第三相</td><td>先濾波，再讀 ADCRESULT0，切回 0</td><td>濾波使用上次存入的 EXT_AD_IN</td></tr></tbody></table></div>
    <p>最後一列尤其容易忽略：L464 的 <code>EXT_Period_Meas_Process()</code> 在 L470–471 的 ADC 讀取之前。因此 x[n] 並不是同一相剛讀到的新結果；新結果要等下次進入才被濾波。這帶來額外的資料管線年齡。計算從實際採樣瞬間到輸出可見的延遲時，還需包含轉換與排程位置，不能只報 IIR 的時間常數。${src('Source/CPU_Timer_Module.c', 462, 476)}</p>

    <h2 id="filter-warping">06｜1000 Hz 係數為何得到約 333 Hz？</h2>
    <p><strong>理論推導。</strong>在單位圓令 ${math(String.raw`z=e^{j\Omega}`, false)}，其中 Ω 的單位是 rad/update。雙線性轉換得到非線性頻率映射。數位角頻率與實際 Hz 的關係由實際更新率決定，類比模型的尺度則仍由設計週期決定：</p>
    ${math(String.raw`s=j\frac{2}{T_d}\tan\frac{\Omega}{2},\qquad \Omega=\frac{2\pi f}{f_{s,u}},\qquad |H(e^{j\Omega})|=\frac{1}{\sqrt{1+\left[\frac{2}{a}\tan(\Omega/2)\right]^2}}`)}
    <p>令振幅為 DC 的 ${math(String.raw`1/\sqrt2`, false)}，便得到 −3 dB 點。若希望指定的數位截止頻率完全吻合，通常會先以 tangent 預扭曲；本版直接使用 ${math(String.raw`2\pi f_{c,d}`, false)}，因此有下列 arctangent 映射：</p>
    ${math(String.raw`f_{-3\mathrm{dB}}=\frac{f_{s,u}}{\pi}\tan^{-1}\!\left(\frac{\pi f_{c,d}}{f_{s,d}}\right)\approx f_{c,d}\frac{f_{s,u}}{f_{s,d}}\quad(f_{c,d}\ll f_{s,d})`)}
    <div class="table-wrap"><table><thead><tr><th>代入項</th><th>1000 Hz 分支的理論值</th></tr></thead><tbody><tr><td>設計／實際頻率</td><td>120120.12 Hz／40000 Hz</td></tr><tr><td>a、C1、D1</td><td>0.0523075177、0.0254871735、0.9490256530</td></tr><tr><td>實際 −3 dB 點</td><td>332.9241 Hz</td></tr><tr><td>暫態尾端時間常數</td><td>約 0.477834 ms</td></tr><tr><td>1 Hz 慢分支的 −3 dB 點</td><td>約 0.333000 Hz</td></tr></tbody></table></div>
    <p>數值以雙精度公式計算，用來說明係數與時間軸的關係；不是 TI 目標浮點重播，也不是硬體頻率掃描。低頻群延遲還可由相位對 Ω 微分得到 ${math(String.raw`\tau_g(0)=1/a`, false)} 個更新，這裡約 19.1177 拍、0.477943 ms。群延遲與暫態時間常數非常接近但定義不同；兩者都還沒有包含上一節的 ADC 管線與後續發布延遲。</p>

    <h2 id="filter-runtime">07｜真正執行的是 Timer 裡的展開版本</h2>
    <p>只搜尋通用 LPF 函式的呼叫者，會漏掉實際運行路徑。<code>EXT_Period_Meas_Process()</code> 先更新慢低通，再更新快低通，兩段都把差分式直接展開在 Timer 檔案內。以下就是快低通的四個連續來源行：</p>
    ${codeBlock('Source/CPU_Timer_Module.c', 8724, 8727, String.raw`    EXT_AD_LPF.x_n = (float) sGB.EXT_INPUT_VARIABLES.EXT_AD_IN;
    EXT_AD_LPF.y_n = EXT_AD_LPF.C1 * (EXT_AD_LPF.x_n + EXT_AD_LPF.x_n_1)
            + EXT_AD_LPF.D1 * EXT_AD_LPF.y_n;
    EXT_AD_LPF.x_n_1 = EXT_AD_LPF.x_n;`, '執行點：先載輸入，再更新輸出，最後更新歷史')}
    <p>第一行做 ADC 整數到 float 的轉換；第二、三行使用舊 y_n；第四行把本次輸入保存為下一拍的歷史輸入。慢分支採相同順序，之後把輸出轉成 Uint16 發布；AC_EXT 模式才另外把它存為 DC level。ADD 模式則有自己的 <code>ADD_Calc_DC_Level_Process()</code>，不能將本節 AC_EXT 的三相時間表直接套到所有模式。${src('Source/CPU_Timer_Module.c', 8706, 8719)} ${src('Source/CPU_Timer_Module.c', 8818, 8837)}</p>
    <p>過零狀態機以轉成 Uint16 的快低通輸出，與慢低通的整數輸出比較：低態遇到 ≥ 轉高，高態遇到 ≤ 轉低。每次函式執行，週期計數先加 1；累積十次上升穿越時，把計數乘 0.1 作為平均週期，再由其他模組以 <code>EXTAD_SAMPLE_FREQ / period</code> 求 Hz。這代表同一個時間基準落差也會進入外部頻率換算。啟動第一個窗口的相位、量化相等時的切換與未明寫遲滯，應另外驗證，不能因「平均十次」就假定消除了所有抖動。${src('Source/CPU_Timer_Module.c', 8734, 8804)} ${src('Source/Output_Control_Module.c', 1925, 1942)}</p>

    <h2 id="filter-second-order">08｜二階定義可推導，但不能當成已使用</h2>
    <p>模組另提供二階低通。若從 ${math(String.raw`H_c(s)=\omega_c^2/(s^2+2\zeta\omega_cs+\omega_c^2)`, false)} 做相同代換，令 ${math(String.raw`q=a^2+4\zeta a+4`, false)}，可以得到以下係數與遞迴。這次 D1、E1 是分母本身的係數，運算式前面是<strong>減號</strong>，與一階物件的 D1 慣例不同。${src('Source/Digital_Filter_Module.c', 97, 114)} ${src('Source/Digital_Filter_Module.c', 135, 142)}</p>
    ${math(String.raw`C_1=\frac{a^2}{q},\quad D_1=\frac{2a^2-8}{q},\quad E_1=\frac{a^2-4\zeta a+4}{q},\qquad H_2(z)=\frac{C_1(1+2z^{-1}+z^{-2})}{1+D_1z^{-1}+E_1z^{-2}}`)}
    ${math(String.raw`y[n]=C_1\{x[n]+2x[n-1]+x[n-2]\}-D_1y[n-1]-E_1y[n-2]`)}
    <p>兩組歷史在新 y 算完後依序後移，才不會讀到被覆寫的值。但本課外部輸入路徑初始化用的是一階，Timer 裡也明確只有一階遞迴；二階函式的存在，不能作為系統正使用二階濾波的證據。${src('Source/Digital_Filter_Module.c', 24, 28)} ${src('Source/CPU_Timer_Module.c', 8724, 8727)}</p>

    <h2 id="filter-average">09｜五個樣本，六次進入才發布一次</h2>
    <p>CLA 的回授平均是另一種機制。計數器在 0～4 時累加五次；下次進入時已到 5，就只發布、清總和、清計數，該次的新樣本不進入任何一組。這不是每拍移除最舊值、加入新值的滑動平均。${src('Source/CLA_Task.cla', 217, 235)}</p>
    ${codeBlock('Source/CLA_Task.cla', 222, 235, String.raw`            CLA_to_CPU_Variables.V_FB_shadow2 = CLA_to_CPU_Variables.V_FB_sum * 0.2;
            CLA_to_CPU_Variables.V_FB_sum = 0;
            CLA_to_CPU_Variables.I_FB_shadow2 = CLA_to_CPU_Variables.I_FB_sum * 0.2;
            CLA_to_CPU_Variables.I_FB_sum = 0;

            CLA_to_CPU_Variables.Avg_Counter = 0;
        }
        else
        {
            CLA_to_CPU_Variables.I_FB_sum = CLA_to_CPU_Variables.I_FB_sum + CLA_to_CPU_Variables.I_FB;
            CLA_to_CPU_Variables.V_FB_sum = CLA_to_CPU_Variables.V_FB_sum + CLA_to_CPU_Variables.V_FB;

            CLA_to_CPU_Variables.Avg_Counter ++;
        }`, '發布分支與累加分支互斥')}
    <p>假設從 counter=0 開始，把每次進入這段分支編成 n=0,1,2,…，則第 m 組如下。發布值在兩次發布之間維持不變；平均後的 shadow2 又用於所示正負峰值比較，所以這條峰值路徑會受到分組窗口影響。${src('Source/CLA_Task.cla', 240, 252)}</p>
    ${math(String.raw`b[m]=\frac15\sum_{r=0}^{4}x[6m+r],\qquad \text{publish at }n=6m+5,\qquad x[6m+5]\text{ is skipped}`)}
    <p>若六次輸入為 1、2、3、4、5、100，發布值是 3；100 不會留給下一組。設此分支的進入間隔為 ${math(String.raw`T_a`, false)}，被平均的五點中心在 6m+2，發布在 6m+5，因此發布當下已比中心晚 3Ta，之後持有又增加資料年齡。作為比較，真正每拍滑動的五點 FIR 為 ${math(String.raw`H_5(z)=\frac15\sum_{k=0}^4z^{-k}`, false)}，對稱係數的群延遲是 2Ta；不能拿這個單一延遲直接代表原碼的分組、跳樣與持有流程。</p>
    <p>Ta 還不是任意 CLA Task 的週期：這段位於 <code>Exec_Switch==0</code>，完成後切到 1，另一相執行不同工作。應沿實際分支回到同一段的間隔定義 Ta。這個例子把濾波分析的核心說清楚：係數告訴你如何加權，排程告訴你資料何時被使用；兩者缺一，就無法把「幾拍」可靠地換成「幾秒」。${src('Source/CLA_Task.cla', 172, 178)} ${src('Source/CLA_Task.cla', 444, 451)}</p>
    <details><summary>閱讀練習：把濾波呼叫率加倍，但不改係數，會發生什麼？</summary><p>在理想固定更新率下，H(z)、每拍極點與每拍群延遲都不變；實際 Hz 截止頻率加倍，以秒計的時間常數與群延遲減半。若 ADC 取得頻率沒有一起改變，還可能重複使用同一樣本，此時不能把它當成單純提高均勻採樣率。請分別確認 ADC 更新、濾波更新、平均發布三個節奏。</p></details>
  `
};
