import { src, math, diagram, codeBlock } from './shared.js';

export const piLesson = {
  id: 'discrete-control', number: '04',
  title: '從連續 PI 推到每一行 C',
  summary: '推導離散 PI 的極零點，逐拍追蹤積分凍結，並把更新週期、reset 與致動器限制接回原始碼。',
  duration: '48 分鐘', category: '控制演算法',
  tags: ['PI 推導', 'z 轉換', '飽和與狀態'],
  body: `
    <h2 id="pi-implementation">01｜先決定我們正在分析哪個控制器</h2>
    <p>本課的對象是 <code>runPI()</code>，不是依檔名猜出的完整 PID。ACV、兩組 DCV、CC、CP 的包裝函式都呼叫它；結構裡雖有 <code>Kd</code>、<code>Kc</code>、<code>SatErr</code>，這條路徑沒有計算微分，也沒有使用飽和誤差做回算。另一個 <code>runPID()</code> 確實存在，但不能把它的方程式套到本課的呼叫點。${src('Source/PID_Control_Module.c', 103, 129)} ${src('Include/PID_Control_Module.h', 88, 182)}</p>
    ${codeBlock('Source/PID_Control_Module.c', 117, 125, String.raw`void CC_Control_Loop_Calc(void)
{
    runPI(&sPID.CC_Control_loop);
}

void CP_Control_Loop_Calc(void)
{
    runPI(&sPID.CP_Control_loop);
}`, '入口原碼：不同物件，共用同一個 runPI')}
    <p>把一次 <code>runPI</code> 呼叫記為第 n 拍。<code>Ref</code> 對應目標 r、<code>Fdb</code> 對應回授 y、<code>Up</code> 是比例項 P、<code>Ui</code> 是積分狀態 I、<code>OutPreSat</code> 是未夾制輸出 u*、<code>Out</code> 是夾制後輸出 u。這裡的一拍是「該物件實際被呼叫一次」，不是 ADC 或 Timer 中斷天然就等於一拍。${src('Include/PID_Control_Module.h', 23, 39)} ${src('Source/main.c', 332, 342)}</p>
    ${diagram('pi', 'runPI 的資料流與狀態回授。積分閘門讀上一回合的 u 與 u*；圖中的一拍延遲代表一次該 PI 的實際呼叫。')}
    <p>讀圖時先走實線：誤差乘 Kp，分成比例直通與積分支路，兩者相加後才限幅。再讀狀態線：積分器保留 I，限幅器的兩側保留上一拍數值，供下一拍決定要不要累加。下文先移除限幅影響推導線性式，再把這個狀態條件放回來；兩者適用範圍不同。</p>

    <h2 id="pi-continuous">02｜從連續 PI 到這份程式的 Ki</h2>
    <p>用標準型連續 PI 作為推導起點。Ti 是積分時間常數，Kp 是比例增益；以下方程式是數學模型，不代表已辨識電源的被控體。</p>
    ${math(String.raw`e(t)=r(t)-y(t),\qquad u(t)=K_p e(t)+I(t),\qquad \frac{dI}{dt}=\frac{K_p}{T_i}e(t)`)}
    <p>將積分狀態在相鄰兩次呼叫之間的變化寫成定積分。若固定更新週期為 T，並用區間右端、也就是本次誤差 e[n] 近似整段面積，就得到後向矩形法：</p>
    ${math(String.raw`I[n]-I[n-1]=\frac{K_p}{T_i}\int_{(n-1)T}^{nT}e(t)\,dt\ \approx\ \frac{K_pT}{T_i}e[n]`)}
    ${math(String.raw`K_i\equiv\frac{T}{T_i},\qquad P[n]=K_pe[n],\qquad I[n]=I[n-1]+K_iP[n]`)}
    <p>最後一式正好對應原碼的 <code>Ui += Ki * Up</code>；標頭也寫 <code>Ki = T/Ti</code>。因此這個 <strong>Ki 是每次呼叫的無因次積分比例</strong>，不是可以不經換算就搬來的平行式連續積分增益。公式成立還需本拍允許積分；實際閘門稍後加入。${src('Include/PID_Control_Module.h', 142, 161)}</p>
    <div class="table-wrap"><table><thead><tr><th>寫法</th><th>積分更新</th><th>與本版的關係</th></tr></thead><tbody>
      <tr><td>本版標準型</td><td>I += Ki × Kp × e</td><td>Ki = T/Ti</td></tr>
      <tr><td>連續平行式再離散化</td><td>I += Ki,parallel × T × e</td><td>Ki,parallel = Kp/Ti</td></tr>
      <tr><td>已含週期的平行係數</td><td>I += ki,step × e</td><td>ki,step = Kp × Ki</td></tr>
    </tbody></table></div>
    <p>例如教學設定 Kp=2、Ti=0.4 s、T=0.01 s，這份程式應填 Ki=0.025；每拍積分增量是 0.05e。若維持 Ki 不變卻把 Kp 加倍，比例項與每拍積分增量會一起加倍。若只想改比例作用而保留相同的平行積分增益，便需同步調整 Ki。這是係數定義的結果，不是對本機的調參建議。</p>

    <h2 id="pi-z-transform">03｜逐步做 z 轉換：極點與零點從哪裡來</h2>
    <p><strong>本節限定：沒有飽和、每次都積分、固定 T、Kp 與 Ki 不變，且用零初始狀態定義傳遞函數。</strong> 在這些條件下，將積分遞迴式做 z 轉換，延遲一拍的狀態會乘上 z 的負一次方：</p>
    ${math(String.raw`I(z)=z^{-1}I(z)+K_pK_iE(z)\quad\Longrightarrow\quad\frac{I(z)}{E(z)}=\frac{K_pK_i}{1-z^{-1}}`)}
    <p>因為 u=P+I，再把比例支路相加，就能得到從誤差到控制器輸出的傳遞函數：</p>
    ${math(String.raw`G_c(z)=\frac{U(z)}{E(z)}=K_p+\frac{K_pK_i}{1-z^{-1}}=K_p\frac{(1+K_i)-z^{-1}}{1-z^{-1}}=K_p\frac{(1+K_i)z-1}{z-1}`)}
    <p>在一般 Kp≠0、Ki&gt;0 情況，積分極點位於 z=1，零點位於 1/(1+Ki)，落在 0 與 1 之間。極點在單位圓上表示這個獨立積分器會對固定非零誤差持續累積；它不是整個閉迴路不穩定的證明。若 Ki=0，分子分母可消去，控制器只剩比例項，不能仍說它保有有效積分極點。</p>
    ${math(String.raw`z_p=1,\qquad z_0=\frac{1}{1+K_i}=\frac{1}{1+T/T_i}`)}
    <p>也可從連續式 Gc(s)=Kp(1+1/(Ti s))，代入後向矩形對應的 s≈(1−z⁻¹)/T，得到完全相同結果。另一個可交叉檢查的形式是輸出增量式：</p>
    ${math(String.raw`u[n]-u[n-1]=K_p\big((1+K_i)e[n]-e[n-1]\big)`)}
    <p>增量式只是在上述線性條件下的等價式；它不是本版含凍結與限幅時可直接替換的程式。即使算出控制器零點，也還缺被控體、量測窗口、運算延遲與更新保持等資訊，不能據此宣稱實機的相位裕度、增益裕度或穩定時間。</p>

    <h2 id="pi-line-by-line">04｜依執行順序，把每段 C 對回方程式</h2>
    <h3>步驟 A：先覆寫本次誤差與比例項</h3>
    ${codeBlock('Include/PID_Control_Module.h', 149, 149, String.raw`    p->Err = p->Ref - p->Fdb;`, '原碼：誤差定義')}
    ${codeBlock('Include/PID_Control_Module.h', 153, 153, String.raw`    p->Up = p->Kp * p->Err;`, '原碼：本次比例項')}
    <p>這兩行完成後，Err 與 Up 已經是第 n 拍，Ui、Out、OutPreSat 卻仍保存第 n−1 拍。<code>p</code> 指向實際控制器物件，函式是在原地修改狀態，不是回傳一個沒有記憶的純函式。</p>
    <h3>步驟 B：用舊的輸出記錄決定是否更新積分</h3>
    ${codeBlock('Include/PID_Control_Module.h', 157, 162, String.raw`    if(p->Out != p->OutPreSat) {
        p->Ui = p->Ui;
    }
    else {
        p->Ui = p->Ui + ( p->Ki * p->Up );
    }`, '原碼：上一回合飽和時保持 Ui')}
    <p><code>Ui = Ui</code> 明確表示保持原狀。else 分支使用本次 Up，所以允許積分時是加 KpKi e[n]。最容易讀錯之處是比較的時間：本次 OutPreSat 尚未計算，因此這裡沒有檢查「本次加完積分後會不會超限」。</p>
    <h3>步驟 C：先組合，再夾制</h3>
    ${codeBlock('Include/PID_Control_Module.h', 166, 166, String.raw`    p->OutPreSat = p->Up + p->Ui;`, '原碼：形成本次未夾制輸出')}
    ${codeBlock('Include/PID_Control_Module.h', 169, 177, String.raw`    if (p->OutPreSat > p->OutMax) {
        p->Out = p->OutMax;
    }
    else if (p->OutPreSat < p->OutMin)  {
        p->Out = p->OutMin;
    }
    else {
        p->Out = p->OutPreSat;
    }`, '原碼：超過上下限才夾制')}
    <p>比較運算是嚴格大於與小於。因此 u* 剛好等於界限時，走最後一支，Out 與 OutPreSat 相等，下次仍允許積分。沒有夾制時，Out 直接取自 OutPreSat；此處的相等判斷用途是辨認前次是否走限幅分支，而不是對兩個獨立量測值做近似比較。</p>
    <h3>步驟 D：保存 Up1，但本 PI 沒有使用它</h3>
    ${codeBlock('Include/PID_Control_Module.h', 181, 181, String.raw`    p->Up1 = p->Up;`, '原碼：保存比例項歷史')}
    <p>最後一行不會產生微分。必須有後續讀取 Up−Up1 的運算才會形成差分；那個式子在 <code>runPID</code> 裡，本函式沒有。同樣，PI 不更新 SatErr，也沒有 Kc 回算項，不能因結構保留欄位就補上不存在的防飽和功能。${src('Include/PID_Control_Module.h', 110, 137)}</p>

    <h2 id="pi-nonlinear">05｜完整差分式：把上一拍的閘門放回來</h2>
    <p>為了避免「上一回合未飽和」只停留在口語，定義積分許可量 γ。它以第 n−1 拍的兩個輸出記錄為輸入，而不是本次誤差的正負：</p>
    ${math(String.raw`\gamma[n]=\begin{cases}1,&u[n-1]=u^*[n-1]\\0,&u[n-1]\ne u^*[n-1]\end{cases}`)}
    ${math(String.raw`\begin{aligned}e[n]&=r[n]-y[n]\\P[n]&=K_pe[n]\\I[n]&=I[n-1]+\gamma[n]K_iP[n]\\u^*[n]&=P[n]+I[n]\\u[n]&=\min\big(u_{\max},\max(u_{\min},u^*[n])\big)\end{aligned}`)}
    <p>這是依原碼順序整理的狀態方程；最後的 min/max 寫法假定上下限設定有效。它有兩項直接後果：首次跨進飽和的那一拍仍可能累積；而上一拍一旦飽和，本拍就連反向誤差也不積分。只有本拍的比例項與既有 I 讓 u* 回到範圍內，下一拍才重新打開閘門。${src('Include/PID_Control_Module.h', 157, 177)}</p>
    <p>因此不能用單一線性 Gc(z) 描述含這個閘門的全部過程，也不能把它稱為「只禁止越積越飽和、允許往回積分」的方向式條件積分。方向判斷或回算可以作為改善方案，但須另訂行為、驗證切換與限幅邊界；本課不把建議寫成既有實作。</p>

    <h2 id="pi-numerical">06｜兩個逐拍例子：恢復積分與卡住飽和</h2>
    <p><strong>例 A：一拍後恢復。</strong> 這是人工誤差序列，沒有電源被控體。設定 Kp=2、Ki=0.25、限制 ±5，初始 I=Out=OutPreSat=0。每列的「前次相等」在本次計算開始前判讀。</p>
    <div class="table-wrap"><table><thead><tr><th>n</th><th>e[n]</th><th>前次相等？</th><th>P[n]</th><th>I[n]</th><th>u*[n]</th><th>u[n]</th></tr></thead><tbody>
      <tr><td>1</td><td>3</td><td>是，積分</td><td>6</td><td>1.5</td><td>7.5</td><td>5</td></tr>
      <tr><td>2</td><td>3</td><td>否，凍結</td><td>6</td><td>1.5</td><td>7.5</td><td>5</td></tr>
      <tr><td>3</td><td>−1</td><td>否，凍結</td><td>−2</td><td>1.5</td><td>−0.5</td><td>−0.5</td></tr>
      <tr><td>4</td><td>−1</td><td>是，積分</td><td>−2</td><td>1.0</td><td>−1.0</td><td>−1.0</td></tr>
    </tbody></table></div>
    <p>第 3 拍能離開限幅，是 P 變成 −2 的效果；I 仍為 1.5。直到第 4 拍，積分才減少。若把第 3 拍 I 寫成 1.0，就等於不小心把原碼換成允許反向積分的另一種演算法。</p>
    <p><strong>例 B：小幅反向誤差仍無法解凍。</strong> 改用 Kp=2、Ki=1、限制仍為 ±5，從同樣的全零狀態開始，先給 e=3，再一直給 e=−0.25：</p>
    <div class="table-wrap"><table><thead><tr><th>n</th><th>e[n]</th><th>積分更新</th><th>I[n]</th><th>u*[n]</th><th>u[n]</th></tr></thead><tbody>
      <tr><td>1</td><td>3</td><td>0 + 1×6</td><td>6</td><td>12</td><td>5</td></tr>
      <tr><td>2</td><td>−0.25</td><td>凍結</td><td>6</td><td>5.5</td><td>5</td></tr>
      <tr><td>3 及之後</td><td>−0.25</td><td>仍凍結</td><td>6</td><td>5.5</td><td>5</td></tr>
    </tbody></table></div>
    <p>在這個固定輸入序列中，沒有其他狀態變動就會一直停在上限：既有 I=6 超過上限，小幅負 P 仍不足以讓 u* 進入範圍。若某拍給 e=−0.5，u*=5 恰好等於上限，當拍仍凍結，但下一拍即可積分。這是演算法可重現的數值情境，並非聲稱實際負載會產生同樣誤差軌跡。</p>

    <h2 id="pi-cadence">07｜T 要從呼叫路徑取得，不能直接填 Timer 週期</h2>
    <p>主迴圈先用經過的 Timer 計數判斷是否超過 Meas_Period，更新時間戳後依序計算量測與補償。它不是在每個 Timer 中斷直接執行這些 PI；補償內部還要經過模式與狀態選擇。${src('Source/main.c', 325, 342)} ${src('Source/Output_Control_Module.c', 310, 348)}</p>
    <p>Timer0 定義為 120000 Hz。一般頻率分支用 CPU_TIMER0_FREQ/freqset 設定門檻；freqset≥200 時卻用固定 1802，freqset&lt;1 時用 6006。按目前定義，兩者分別約 15.017 ms 與 50.05 ms，不是舊註解所寫的 5 ms 與 16.667 ms。這些是門檻換算；比較條件是「&gt;」，且主迴圈需輪轉回來，實際間隔還包括量化與排程延遲。${src('Include/CPU_Timer_Module.h', 21, 27)} ${src('Source/main.c', 552, 576)}</p>
    <p>若 Ki 固定，常值誤差下每秒累積量約為 KpKi e/Tactual。上節的 Kp=2、Ki=0.025，原設計每 10 ms 呼叫一次時，積分斜率為 5e/s；改成每 30 ms 一次卻不改係數，約剩 1.667e/s。要維持同一 Ti，週期變三倍應將 Ki 乘三，而非除三。</p>
    ${math(String.raw`\left.\frac{\Delta I}{\Delta t}\right|_{\text{fixed error}}\approx\frac{K_pK_i}{T_{\rm actual}}e,\qquad K_{i,\rm new}=K_{i,\rm old}\frac{T_{\rm new}}{T_{\rm old}}`)}
    <p>這個比例換算假設連續設計目標不變且更新規律。若模式停用、延遲狀態或排程造成不規則間隔，應先記錄同一 PI 連續兩次執行時間，不能把「距離上次已過很久」無條件全部補成一次積分。現有 runPI 沒有 elapsed-time 參數；是否採變動步長以及停用期間如何處理，都是需要明確定義的新設計。</p>

    <h2 id="pi-reset">08｜reset 不是只清積分：整個結構被重新賦值</h2>
    <p>開機初始化給 ACV 與兩組 DCV 的 Kp=10、Ki=1，CC 為 Kp=200、Ki=1，CP 為 Kp=2、Ki=0.1。CC、CP 的限制都是 −65535 到 +100。這些只是該初始化函式寫入的值，不能直接假設模式運轉時仍保有同一組參數。${src('Source/PID_Control_Module.c', 19, 70)} ${src('Source/main.c', 147, 147)}</p>
    ${codeBlock('Include/PID_Control_Module.h', 43, 56, String.raw`#define DEFAULT_PIDREG3  (PIDREG3) { \
                .Err = 0, \
                .Fdb = 0, \
                .Out = 0, \
                .OutPreSat = 0, \
                .Ref = 0, \
                .SatErr = 0, \
                .Ud = 0, \
                .Ui = 0, \
                .Up = 0, \
                .Up1 = 0, \
             }

#define INITIAL_PIDREG3(src) src = DEFAULT_PIDREG3`, '原碼：巨集做完整的結構指派')}
    <p>右側是新的 PIDREG3 聚合初始化值。C 的聚合初始化會將沒有列出的欄位也初始化為零；左側又是整個結構指派。因此 Kp、Ki、OutMax、OutMin 並不保留，和 Ui 一樣被清零。這和逐一寫 <code>Ui=0</code>、<code>Out=0</code> 完全不同。</p>
    <p>CC 函式先載入 Ref 與 Fdb，但進入 CC_NO_COMPENSATE 時隨即呼叫這個巨集，再切到 CC_PID_COMPENSATE。下一回合會重新載入 Ref/Fdb，卻沒有在這個切換路徑重設增益與界限；對有限的普通輸入，清零後的 PI 自然算不出原先期待的補償。AC/DC 補償初始化也有同類整結構重置。這是本 commit 可由程式語義指出的問題；是否對應特定實機現象仍需執行證據。${src('Source/Output_Control_Module.c', 302, 344)} ${src('Source/Output_Control_Module.c', 930, 960)}</p>
    <p>CP 路徑另有獨立疑點：<code>CP_NO_COMPENSATE</code> 寫的是 <code>INITIAL_PIDREG3(sPID.CC_Control_loop)</code>，下一狀態卻執行 CP_Control_loop。可直接確認的是「清到 CC、未在此處清 CP」，不能擅自假設作者原意，也不能把 CP 的舊積分當成已重置。${src('Source/Output_Control_Module.c', 375, 409)}</p>
    <p>合理的修正設計應把「設定參數」與「重設狀態」分成兩個有明確用途的操作，再決定模式切換要歸零、保留，或追蹤目前輸出以減少跳變。只保留增益還不夠：I、u、u* 必須一起考慮，否則殘留的不相等輸出歷史，可能讓新模式第一拍意外凍結。這裡提出的是驗證方向，本教材沒有修改韌體。</p>

    <h2 id="pi-actuator-limit">09｜PI 限幅和最終 DAC 限幅是不同位置</h2>
    <p>CC、CP 的 Out 送到 VREF_Compensate_Offset_3。CLA 再把 VREF 基值與 offset 0～3 加總，依 VREF 高低界限夾制成最後的 VREF 指令。換言之，控制器內部的 u 沒超限，仍不保證下游加總有足夠可用範圍。${src('Source/Output_Control_Module.c', 338, 344)} ${src('Source/Output_Control_Module.c', 403, 409)} ${src('Source/CLA_Task.cla', 66, 92)}</p>
    ${math(String.raw`v_{\rm raw}=v_{\rm base}+\sum_{j=0}^{3}o_j,\qquad v_{\rm cmd}=\operatorname{clip}(v_{\rm raw},v_{\rm low},v_{\rm high})`)}
    <p>用純教學數字看差異：假設某 PI 的範圍是 ±100，當拍 u*=u=50；基值與其他偏移的總和已是 980，而最終上限是 1000。相加得到 1030，DAC 指令只能是 1000，但這個 PI 的 Out 與 OutPreSat 仍相等，下一拍會允許積分。runPI 沒有讀取 CLA 的最終夾制結果，因此不能把本地凍結機制當成整個致動器的防積分飽和保證。${src('Include/PID_Control_Module.h', 140, 182)}</p>
    <p>檢查這類問題時，需一起記錄誤差、I、u*、u、VREF 基值、其他偏移與最終指令。若只看到 Out 沒碰界限，就判定「沒有飽和」，很容易把下游限制造成的補償不足誤認為 Kp 太小。</p>

    <h2 id="pi-exercises">10｜動手驗證：用可核對的狀態取代直覺</h2>
    <p>先在離線模型或受控測試環境驗證演算法，再談硬體調參。下列練習各自有明確的輸入、觀察量與判定條件；它們測的是程式語義，不是電源閉迴路性能。</p>
    <ol>
      <li><strong>線性推導核對：</strong>固定 Kp=2、Ki=0.25、放寬上下限，從 I=0 輸入 e=[1,1,0]。逐拍結果應為 I=[0.5,1,1]、u=[2.5,3,1]。再用增量式獨立算一次；結果不同時，先查是否把 Ki 直接乘 e。</li>
      <li><strong>時序核對：</strong>重播例 A，逐拍同時保存「進入函式前」與「離開函式後」的 Out/OutPreSat。第 3 拍應解限幅但不改 I，第 4 拍才減少 I。</li>
      <li><strong>陷住條件核對：</strong>重播例 B，接著插入 e=−0.5，下一拍再給 −0.25。插入當拍 I=6、u=5；再下一拍允許積分，I=5.5、u=5。這可區分嚴格越界與剛好碰界限。</li>
      <li><strong>reset 契約核對：</strong>先填入非零增益、非零 I 與明確上下限，再執行 INITIAL_PIDREG3。對照本版語義，所有欄位都應為零；另測 CP_NO_COMPENSATE，分別查看 CC 與 CP 物件，確認清除目標。</li>
      <li><strong>真實時間核對：</strong>對單一 PI 記錄連續呼叫時間、模式與狀態，畫間隔分布；同時記錄本地限幅與最終 VREF 限幅。只有先確認係數仍存在、更新週期與受限位置，才有條件把離散係數解讀為每秒的控制作用。</li>
    </ol>
    <details><summary>延伸題：這份程式能直接證明零穩態誤差嗎？</summary><p>不能。積分作用在理想穩定閉迴路、可達到的目標、持續有效更新等條件下，才可能消除某些類型的穩態誤差。本版還有積分閘門、模式切換、reset 與下游限幅。請先寫出需要的條件，再指出哪一項由原碼支持、哪一項需要被控體模型或實測；不要把控制器含積分器直接等同於整台電源必然無誤差。</p></details>
  `
};
