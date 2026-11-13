const revision = '5262007b56d420c74ac892692ea4d3969a3e3992';
const repository = `https://github.com/linwuyen/ASR5K_Old/blob/${revision}/ASR5K_28377/TRACE_ASR5000_F28377S/`;
const src = (path, start, end, label) => `<a class="source-link" href="${repository}${path}#L${start}-L${end}" target="_blank" rel="noopener noreferrer">${label || path.split('/').pop()} · L${start}–${end} ↗</a>`;

export const controlLessons = [
  {
    id: 'control-loop', number: '03', title: '沿著回授走一圈',
    summary: '從 ADC 校正、電流重建到 RMS 回授，辨認這份韌體真正閉合的補償路徑。',
    duration: '22 分鐘', category: '控制演算法', tags: ['CLA', '回授', 'CV / CC / CP'],
    body: `
      <h2 id="loop-map">先找回授量，再談控制器</h2>
      <p>閱讀電源韌體時，看到 PID 名稱很容易直接聯想到每個 PWM 週期都運算的高速內環。本專案的主要 CV、CC、CP 補償具有不同的排程：主迴圈等待 <code>Meas_Period</code> 到期，先呼叫 <code>Measurement_Calc_Process()</code>，接著才執行 <code>Compensate_Calc_Process()</code>。因此這條路徑使用的是量測統計值與補償偏移；不能僅憑函式名稱，把它描述成已知頻寬的瞬時電流內環。${src('Source/main.c', 325, 350)}</p>
      <div class="equation">ADC 原始碼 → 正負段校正 → V_FB、I_FB → 統計量 → CV / CC / CP → WAVE / VREF 補償 → DAC 指令</div>
      <p>這條鏈的每一支箭頭都可能帶有不同更新週期。CLA 在 <code>Exec_Switch == 0</code> 時計算回授，另一相處理量測狀態機；CPU 的補償又由主迴圈條件觸發。理解控制延遲時，應分別計算樣本取得、統計窗口、主迴圈排程與致動更新，而非只取一個 Timer 頻率當成全部的取樣率。${src('Source/CLA_Task.cla', 172, 211)} ${src('Source/CLA_Task.cla', 444, 488)}</p>

      <h2 id="feedback-calibration">電流回授不是直接縮放 ADC</h2>
      <p>電壓先把 ADC CHA 加上 offset，再依修正值的正負選擇不同斜率。CHB 以同樣方式產生 <code>I_shunt</code>。注意原碼是「加 offset」；校正值本身可以為負，不能在移植時憑直覺改成減法。以下方程式只是將原碼整理為數學符號，沒有額外加入硬體假設。${src('Source/CLA_Task.cla', 177, 203)}</p>
      <div class="equation">qᵥ = ADC_CHA + oᵥ； v[n] = qᵥ · (qᵥ ≥ 0 ? gᵥ⁺ : gᵥ⁻)<br>qᵢ = ADC_CHB + oᵢ； i_shunt[n] = qᵢ · (qᵢ ≥ 0 ? gᵢ⁺ : gᵢ⁻)</div>
      <p>接著，程式以本次電壓減去前次電壓，估算兩個需要扣除的電流分量：一個與電壓成正比，另一個與電壓變化量成正比。從電路理論可將它們理解成電阻、電容支路的模型補償；這是對公式的解讀，不代表已從原始碼證實實際元件值或電路精度。${src('Source/CLA_Task.cla', 188, 211)}</p>
      <div class="equation">i_R[n] = v[n] · inv_Rs<br>i_C[n] = (v[n] − v[n−1]) · Cs_mpy_360000<br>i_FB[n] = i_shunt[n] − i_R[n] − i_C[n]</div>
      <h3>係數名稱不能替代時間基準</h3>
      <p>若把電容項寫成理論式 <code>C·Δv/Ts</code>，那麼 <code>Cs_mpy_360000</code> 的量綱應對應 C/Ts。然而實作從校正資料載入此數值，並非每次依目前排程重算。名稱裡的 360000 不是實測頻率的證據。移植排程或修改 CLA 觸發速率時，應連同這個係數的來源一起核對，否則即使電壓讀值正確，重建電流仍可能出現與 dv/dt 相關的誤差。${src('Source/Event_Module.c', 4896, 4910)}</p>

      <h2 id="rms-feedback">從瞬時值變成控制器看見的量</h2>
      <p>量測模組由平方和與樣本數計算總 RMS，由總和計算平均值，再用兩者分離 AC 分量。AC 電壓補償使用 <code>AC_V_rms_display_shadow</code>，DC 補償使用 <code>V_avg_display_shadow</code>。這說明同一組 ADC 資料可形成兩個不同的控制目標：調整交流幅度，以及校正直流偏移。${src('Source/Meas_Module.c', 83, 116)} ${src('Source/Output_Control_Module.c', 879, 924)}</p>
      <div class="equation">V̄ = Σv / N； V_rms = √(Σv² / N)<br>V_ac,rms = √(V_rms² − V̄²)</div>
      <p><strong>工程檢查：</strong>這段 AC RMS 計算沒有在平方根前明寫 <code>max(0, …)</code>，除法也直接使用樣本數。數學上變異量非負，但浮點消去誤差與尚未建立有效窗口，是值得設計邊界測試的情境。加入有效樣本檢查或數值保護屬於改善建議，不是本版已有的行為。</p>

      <h2 id="mode-selection">CV、CC、CP 是互斥模式選擇</h2>
      <p>在 <code>OUTPUT_STATE</code>，模式切換先檢查電流限制，再檢查功率限制；CC 條件成立後會立刻 <code>break</code>。原碼中的功率局部變數雖叫 <code>s_va</code>，實際來源卻是 <code>P_display.all</code>，不是被註解掉的視在功率欄位。這是比註解更有決定性的證據。${src('Source/Output_Control_Module.c', 71, 159)}</p>
      <div class="table-wrap"><table><thead><tr><th>模式</th><th>回授與目標</th><th>主要補償去向</th></tr></thead><tbody><tr><td>CV</td><td>DC 平均值、AC RMS；由輸出模式再選路徑</td><td>WAVE 偏移或 VREF offset 0</td></tr><tr><td>CC</td><td>Irms 與電流上限</td><td>VREF offset 3</td></tr><tr><td>CP</td><td>P_display 與功率上限</td><td>VREF offset 3</td></tr></tbody></table></div>
      <p>CC 與 CP 並非每回合和 CV 一起相加的三個平行控制器。它們離開限制模式時，會依輸出、誤差與連續計數條件回到 CV，並重設電壓補償狀態。電流與功率兩者共用 offset 3，也符合此互斥路徑。${src('Source/Output_Control_Module.c', 166, 269)} ${src('Source/Output_Control_Module.c', 296, 409)}</p>
      <p>CLA 最後先加總 VREF 基值與四個補償偏移，再夾在設定的高低界限內；WAVE 另有 0～65535 的限制。控制器自身輸出夾制與 DAC 最終夾制是兩個位置，不能假設 PI 已知道下游總和發生飽和。${src('Source/CLA_Task.cla', 52, 92)}</p>
      <details><summary>閱讀練習：為什麼改 Kp 前，應先追 VREF offset？</summary><p>請追蹤 CC 的 <code>Out</code> 到 offset 3，再追 CLA 的四個 offset 加總與最終夾制。如果最後 DAC 已到下限，即使某個 PI 的 <code>Out</code> 尚未達自己的 <code>OutMin</code>，整體致動器仍已飽和。要判斷真正的積分累積問題，需要同時觀察控制器輸出與最終 DAC 指令，而不是只看 Err。</p></details>
    `
  },
  {
    id: 'discrete-control', number: '04', title: '拆解 PI、積分與飽和',
    summary: '把 runPI 翻成差分方程，推演上一拍飽和判斷，並找出初始化語義的陷阱。',
    duration: '24 分鐘', category: '控制演算法', tags: ['PI', '離散時間', 'Anti-windup'],
    body: `
      <h2 id="actual-pi">檔名是 PID，主要包裝函式呼叫 PI</h2>
      <p><code>PIDREG3</code> 保留微分、飽和誤差與回算增益等欄位，但 ACV、DCV、CC、CP 的包裝函式呼叫的是 <code>runPI()</code>。閱讀時應沿呼叫點判斷實際演算法，不能因結構包含 Kd 就宣稱此路徑具有微分作用。另一個 <code>runPID()</code> 定義確實存在；「存在」與「被這條路徑執行」是兩件事。${src('Source/PID_Control_Module.c', 103, 129)} ${src('Include/PID_Control_Module.h', 140, 182)}</p>
      <div class="equation">e[n] = r[n] − y[n]； P[n] = Kp · e[n]<br>I[n] = I[n−1] + Ki · P[n]，僅當上一回合沒有輸出飽和<br>u*[n] = P[n] + I[n]； u[n] = clamp(u*[n], u_min, u_max)</div>
      <p>此處 Ki 乘的是比例項 P，而非直接乘誤差 e。因此若使用常見平行式 <code>I += Ki_parallel·Ts·e</code> 對照，本版每次呼叫的積分係數相當於 <code>Kp·Ki</code>。標頭註記 Ki=T/Ti，但函式本身沒有時間參數，也沒有每次乘上實際 elapsed time。重新調整排程週期時，不能假定積分作用自動保持原來的每秒強度。${src('Include/PID_Control_Module.h', 142, 166)}</p>
      <pre><code>// 原碼節錄：積分項使用 Up
p-&gt;Ui = p-&gt;Ui + ( p-&gt;Ki * p-&gt;Up );
p-&gt;OutPreSat = p-&gt;Up + p-&gt;Ui;</code></pre>

      <h2 id="last-saturation">凍結依據是上一回合，不是本回合</h2>
      <p><code>Out != OutPreSat</code> 的比較發生在新一輪 <code>OutPreSat</code> 被計算之前，所以它讀到的是上一回合夾制結果。進入飽和的那一拍仍可能積分；下一拍才凍結。這種策略能限制持續同方向累積，但只要上一回合飽和就停止，不會因本次誤差已反向就立即允許積分退回。這是對執行順序的直接推導，不是硬體響應的量測結論。${src('Include/PID_Control_Module.h', 155, 177)}</p>
      <h3>用四拍手算看清楚狀態</h3>
      <p>以下是教學輸入，不是電源模型。令 Kp=2、Ki=0.25、上下限 ±5，初始 I、Out、OutPreSat 都為 0。只輸入誤差序列，觀察控制器內部狀態：</p>
      <div class="table-wrap"><table><thead><tr><th>拍數</th><th>e</th><th>是否積分</th><th>I</th><th>u*</th><th>u</th></tr></thead><tbody><tr><td>1</td><td>3</td><td>是</td><td>1.5</td><td>7.5</td><td>5</td></tr><tr><td>2</td><td>3</td><td>否</td><td>1.5</td><td>7.5</td><td>5</td></tr><tr><td>3</td><td>−1</td><td>否</td><td>1.5</td><td>−0.5</td><td>−0.5</td></tr><tr><td>4</td><td>−1</td><td>是</td><td>1.0</td><td>−1.0</td><td>−1.0</td></tr></tbody></table></div>
      <p>第三拍比例項讓未夾制輸出重新進入範圍，第四拍才恢復積分。若 I 曾經累積很大，小幅反向誤差未必能讓 u* 回到範圍，凍結也可能延續。方向判斷的條件積分、追蹤致動器輸出的回算，都可作為比較方案，但本版 <code>runPI</code> 沒有實作這些機制。</p>

      <h2 id="parameters-and-reset">比調參更先決的問題：reset 會清掉什麼？</h2>
      <p>啟動時的初始化寫入 ACV Kp=10、Ki=1，CC Kp=200、Ki=1，CP Kp=2、Ki=0.1；CC、CP 的輸出範圍都是 −65535 到 +100。這些是<strong>初始化設定</strong>，不是任何時刻都保證仍存在的增益。${src('Source/PID_Control_Module.c', 19, 70)}</p>
      <p>關鍵在 <code>INITIAL_PIDREG3(src)</code>：它做整個結構指派，右側是只列出狀態欄位的 compound literal。依 C 初始化語義，未列出的 Kp、Ki、OutMax、OutMin 等也被設成零，並不保留舊值。CC 狀態進入 <code>CC_NO_COMPENSATE</code> 時就呼叫這個巨集；AC/DC 補償初始化也有同類呼叫。這是本 commit 的實際程式語義，足以推導那些路徑 reset 後的增益與限制會被清零，不能只展示開機參數而略過它。${src('Include/PID_Control_Module.h', 43, 56)} ${src('Source/Output_Control_Module.c', 310, 338)} ${src('Source/Output_Control_Module.c', 930, 960)}</p>
      <p>另一個值得停下來查的地方是 <code>CP_NO_COMPENSATE</code>：它清的是 <code>CC_Control_loop</code>，下一狀態卻執行 <code>CP_Control_loop</code>。這可以由原碼直接確認；是否是複製修改遺漏、當時刻意安排，仍需要設計歷史或作者說明。教材不把可疑程式自動改寫成理想行為。${src('Source/Output_Control_Module.c', 375, 409)}</p>
      <h3>改善方向與驗證邊界</h3>
      <ul><li>將「設定增益與上下限」和「清除動態狀態」分成不同函式，讓呼叫意圖可被檢查。</li><li>用有意義的 reset 測試驗證增益保留、I 清零、輸出歷史同步，而非只重跑函式。</li><li>為 CP 再次進入模式設計情境，觀察是否沿用舊的積分狀態；變更前先確認預期切換行為。</li></ul>
      <p>上述是工程建議，本教學沒有修改韌體，也沒有宣稱已驗證實機控制失效或改善效果。</p>

      <h2 id="pi-timebase">離散控制的時間軸必須來自呼叫頻率</h2>
      <p>主迴圈依量測週期呼叫補償，且使用大於門檻的條件。<code>Calc_Meas_Period_Process</code> 在一般頻率範圍使用 <code>CPU_TIMER0_FREQ / freqset</code>，高頻分支卻仍保留 1802 計數的常數。以目前 120 kHz Timer 定義換算，1802 計數約為 15.02 ms，不能直接採信旁邊殘留的 5 ms 註解；真正呼叫間隔還包含主迴圈輪轉延遲。${src('Source/main.c', 552, 576)} ${src('Include/CPU_Timer_Module.h', 21, 27)} ${src('Source/main.c', 332, 342)}</p>
      <details><summary>閱讀練習：把 Ki 除以三，就一定修好了嗎？</summary><p>不一定。先確認是哪一條迴路、實際呼叫週期是否穩定、reset 後係數是否存在，再考慮固定連續時間積分強度的換算。若迴路週期從 T 變成 3T，且其他條件相同，要保留相同每秒積分作用，依 Ki=T/Ti 的定義反而應乘以三。更根本的設計是讓時間基準成為明確參數，而不是從舊註解猜測。</p></details>
    `
  },
  {
    id: 'filters', number: '05', title: '濾波器的係數與時間軸',
    summary: '從一階差分式推回極點，對照 inline 呼叫點，辨認取樣率與平均窗口的隱藏假設。',
    duration: '21 分鐘', category: '控制演算法', tags: ['IIR', '低通濾波', '取樣率'],
    body: `
      <h2 id="filter-recurrence">先寫出實際遞迴式</h2>
      <p><code>Digital_Filter_Module</code> 定義兩個外部輸入濾波器：<code>EXT_AD_LPF</code> 的截止頻率設定為 1000 Hz，<code>EXT_AD_DC_FILTER_LPF</code> 設定為 1 Hz。初始化實際呼叫一階 LPF 初始化，先清除輸入與輸出歷史，再計算 C1、D1。雖然結構也有 damping_ratio，一階係數不使用它。${src('Source/Digital_Filter_Module.c', 24, 60)}</p>
      <div class="equation">a = 2π f_c / f_s,design<br>C1 = a / (a + 2)； D1 = (2 − a) / (2 + a)<br>y[n] = C1·(x[n] + x[n−1]) + D1·y[n−1]</div>
      <p>程式先利用舊的 <code>y_n</code> 計算新結果，再更新 <code>x_n_1</code>；如果重構時先覆寫歷史，濾波器就變成另一個系統。從訊號處理理論解讀，這對應一階類比低通以雙線性轉換得到的形式，且此處沒有額外做截止頻率預扭曲。這一段理論是從係數式推導，原始碼提供的是數值遞迴。${src('Source/Digital_Filter_Module.c', 83, 88)}</p>
      <div class="equation">H(z) = C1·(1 + z⁻¹) / (1 − D1·z⁻¹)<br>H(1) = 2C1 / (1 − D1) = 1； 極點 z = D1</div>
      <p>單位直流增益表示穩態常值輸入會通過；低通並不會自行移除 DC。若想去除偏移，需要用原始訊號減去慢速低通結果。原碼在外部 AC 模式保存慢速低通估計的 DC level，這個用途和快速低通用於過零判斷並不相同。${src('Source/CPU_Timer_Module.c', 8700, 8727)}</p>

      <h2 id="actual-filter-path">函式定義之外，還要找 inline 實作</h2>
      <p>搜尋通用的 <code>Digital_One_Order_LPF_Cal</code> 呼叫，容易得到錯誤印象，以為濾波器沒有運作。CPU Timer 的 <code>EXT_Period_Meas_Process</code> 直接展開相同遞迴式，同時更新 1 Hz 和 1 kHz 兩個狀態；ADD 模式另有 DC level 計算。這是熟悉 C 的工程師閱讀大型韌體時常見的盲點：演算法可能被手動內聯，不能只用函式名稱建立呼叫圖。${src('Source/CPU_Timer_Module.c', 8700, 8727)} ${src('Source/CPU_Timer_Module.c', 8818, 8837)}</p>
      <pre><code>// 原碼節錄：更新歷史必須在求出新 y 之後
point-&gt;x_n_1 = point-&gt;x_n;</code></pre>
      <p>外部週期偵測會比較快濾波輸出與慢濾波 DC 值，在高低狀態之間切換；上升穿越累積十次後，以累積計數乘 0.1 得到平均週期。再以 <code>EXTAD_SAMPLE_FREQ / period</code> 換算頻率。因此同一個取樣率假設同時影響截止頻率與外部頻率讀值。${src('Source/CPU_Timer_Module.c', 8734, 8804)} ${src('Source/Output_Control_Module.c', 1925, 1942)}</p>

      <h2 id="sample-rate-mismatch">係數設計頻率與呼叫頻率要分開寫</h2>
      <p>標頭中 <code>EXTAD_SAMPLE_FREQ</code> 是 120120.12 Hz，而 Timer0 設定採用 120000 Hz。更重要的是，AC_EXT / ACDC_EXT 分支以 <code>Exec_Switch</code> 分成 0、1、2 三相，濾波與週期量測只在第三相呼叫。若維持此模式且中斷沒有遺失，從原碼排程推得此函式的名義更新率為 120000/3 = 40000 Hz。這是靜態分析的推導，仍須執行期時間戳或 GPIO 量測確認。${src('Include/CPU_Timer_Module.h', 21, 57)} ${src('Source/CPU_Timer_Module.c', 422, 477)}</p>
      <div class="equation">f_c,actual = (f_s,actual / π) · atan(π f_c,design / f_s,design)<br>當 f_c ≪ f_s： f_c,actual ≈ f_c,design · f_s,actual / f_s,design</div>
      <p>以 1000 Hz、120120.12 Hz 的設計係數，卻每秒更新 40000 次，理論上的 −3 dB 點約為 333 Hz，而非 1000 Hz。這個例子用來說明時間尺度，不等於已量測到該電源的頻率響應。若網站互動實驗允許切換「係數設計取樣率」與「實際更新率」，就能直接看到同一組係數在物理時間軸上的快慢變化。</p>

      <h2 id="second-order-and-averaging">不要把二階定義與五點平均混在一起</h2>
      <p>模組另外提供二階 LPF 係數與遞迴式，分母包含 damping_ratio，輸入權重為 1、2、1。它可作為閱讀 biquad 的教材，但本版初始化選用的是一階，前述 CPU Timer 實際路徑也是一階；不能因二階函式出現在檔案，就宣稱系統正在使用二階低通。${src('Source/Digital_Filter_Module.c', 97, 142)}</p>
      <div class="equation">y[n] = C1·(x[n] + 2x[n−1] + x[n−2]) − D1·y[n−1] − E1·y[n−2]</div>
      <h3>平均窗口的發布拍也屬於演算法</h3>
      <p>CLA 的另一段平均則是獨立機制：計數小於 5 時累加；計數到 5 的下一次呼叫，只把既有總和乘 0.2 並清零，當次樣本沒有加入。因此它是「五個樣本的分組平均、每六次執行發布一次」，不是每拍滑動的五點平均。峰值比較使用這個平均後的 shadow2，讀者應留意它與原始瞬時峰值保留走的是不同訊號。${src('Source/CLA_Task.cla', 217, 252)} ${src('Source/CLA_Task.cla', 290, 295)}</p>
      <div class="table-wrap"><table><thead><tr><th>機制</th><th>狀態記憶</th><th>閱讀重點</th></tr></thead><tbody><tr><td>一階 IIR</td><td>前次輸入、前次輸出</td><td>極點與每秒更新次數</td></tr><tr><td>二階 IIR 定義</td><td>兩次輸入、兩次輸出</td><td>係數符號與有無實際呼叫</td></tr><tr><td>CLA 五樣本分組平均</td><td>總和、計數器、發布值</td><td>發布拍未納入當次樣本</td></tr></tbody></table></div>
      <details><summary>閱讀練習：六個連續輸入 1、2、3、4、5、100，會發布多少？</summary><p>若初始 Avg_Counter=0、sum=0，前五次累加成 15；第六次進入發布分支，得到 15×0.2=3。輸入 100 沒有加入這一組，也不會留給下一組。這個練習不是主張應修改演算法，而是要求測試依照實際分支順序建立預期值。</p></details>
    `
  },
  {
    id: 'waveforms', number: '06', title: '從 DDS 相位到 DAC 指令',
    summary: '追蹤相位累加、4096 點波表、線性內插、波形單位與最終輸出合成。',
    duration: '22 分鐘', category: '控制演算法', tags: ['DDS', '波表', 'DAC'],
    body: `
      <h2 id="phase-accumulator">頻率是一個相位增量</h2>
      <p>內部 DC、AC、ACDC 模式的 Timer0 ISR 會先執行 <code>dds.all += FreqStep</code>，再進入波形輸出狀態處理。32 位元無號累加器自然回繞，讓相位持續循環。頻率設定事件把頻率乘上 <code>_1HZ</code> 並轉為 Uint32，產生 shadow 增量，再由狀態流程載入。${src('Source/CPU_Timer_Module.c', 167, 178)} ${src('Source/Event_Module.c', 1121, 1128)} ${src('Source/CPU_Timer_Module.c', 1387, 1419)}</p>
      <div class="equation">φ[n+1] = (φ[n] + Δφ) mod 2³²<br>理想 DDS：f_out = f_update · Δφ / 2³²</div>
      <p>要精確描述本版，還有一個細節：名稱為 <code>TWO_POW_32</code> 的巨集實際值是 <code>0xFFFFFFFF</code>，也就是 2³²−1；<code>_1HZ</code> 用它除以 120000。再加上轉型截斷與目標浮點表示，命令頻率到實際相位增量存在量化。理想公式可用來理解原理，但若要做逐位元相容的模擬，必須採用目標編譯器的型別與轉換語義。${src('Include/Global_VariableDefs.h', 327, 338)}</p>
      <h3>CLA 的相位來源也要看條件編譯</h3>
      <p><code>DEVELOP_SV77</code> 在這份來源中沒有啟用，因此 CLA 採用 CPU 傳入的 <code>dds.all</code>，而不是走自行加 FreqStep 的分支。不能把註解中的 CLA DDS 自行計算當成現行架構。CPU 每次 ISR 尾端確實更新共享的相位與輸出設定。${src('Source/CLA_Task.cla', 18, 25)} ${src('Source/CLA_Task.cla', 160, 165)} ${src('Source/CPU_Timer_Module.c', 917, 924)}</p>

      <h2 id="table-interpolation">4096 點表，加上八位小數內插</h2>
      <p>DDS union 把 32 位相位拆成低 12 位 dec2、中間 8 位 dec1、高 12 位 addr。內部模式使用 addr 當 4096 點表索引，下一點以 <code>(addr+1)&amp;0x0FFF</code> 回繞。線性內插只取 dec1，dec2 沒有出現在這段內插計算中。${src('Include/Global_VariableDefs.h', 523, 532)} ${src('Source/CPU_Timer_Module.c', 979, 1001)}</p>
      <div class="equation">k = addr； k₁ = (k + 1) mod 4096<br>α = dec1 · 0.003921569 ≈ dec1 / 255<br>w = table[k] + (table[k₁] − table[k]) · α</div>
      <p>常見的八位元分數會除以 256，但本版係數約為 1/255。因此 dec1=255 時，α 接近 1，而不是 255/256。不要把教科書預設寫回原碼；這正是對照固定點配置與實際運算的訓練。內插讓表點間的輸出較連續，但它不能消除所有量化誤差，也不能單靠軟體式子證明硬體的諧波規格。</p>
      <pre><code>// 原碼節錄：波表尾端會接回第 0 點
wave_addr_1 = ((Uint16)sGB.dds.addr + 1) &amp; 0x0FFF;</code></pre>

      <h2 id="table-shapes">波形資料、峰均比與有效路徑</h2>
      <p>正弦表以 <code>32767·sin(2πi/4096)</code> 轉為 int16；三角波則分成上升、下降、再上升的線性段。產生函式也填入峰均比：正弦約 √2，三角約 √3，方波為 1。這些常數對應理想對稱波形的峰值與總 RMS 比值，實際離散資料仍會有量化與端點差異。${src('Source/Wave_Generate_Module.c', 159, 208)} ${src('Source/Wave_Generate_Module.c', 279, 317)}</p>
      <div class="table-wrap"><table><thead><tr><th>波形</th><th>理想 CF = peak / RMS</th><th>本版值得追的地方</th></tr></thead><tbody><tr><td>正弦</td><td>√2</td><td>4096 點查表與內插</td></tr><tr><td>三角</td><td>√3</td><td>線性分段、Peak-to-Peak 單位</td></tr><tr><td>雙極方波</td><td>1（總 RMS）</td><td>INT 路徑直接比較 duty，不用表內插</td></tr></tbody></table></div>
      <p>啟動流程可見三角、正弦 SDRAM 表的產生呼叫，而方波產生呼叫在該處被註解。這不代表方波不能輸出：INT 模式對方波直接比較 addr 與 duty，當 <code>addr &lt;= duty</code> 時輸出 +32767，否則輸出 −32767。表格產生器使用 <code>i &lt; duty</code>，兩者邊界並不一樣；測試 duty=0 或 4095 時，必須先指定是哪一條路徑。${src('Source/Main_State_Module.c', 279, 285)} ${src('Source/CPU_Timer_Module.c', 990, 1015)} ${src('Source/Wave_Generate_Module.c', 234, 257)}</p>
      <p>單位切換也不是一律將 RMS 乘二。<code>Reload_Wave_CF_set_Event</code> 在 Peak-to-Peak 選項下，把 ARB 與三角的換算係數改為 0.5，正弦與方波保留原有 CF。應將介面單位、儲存設定值與轉換分支一起讀，避免用一條通式取代產品既有語義。${src('Source/Event_Module.c', 3587, 3625)}</p>

      <h2 id="dac-composition">波表值還不是 DAC 輸出</h2>
      <p>輸出 ON 狀態先做 <code>WAVE_goal = wave_value·scale + offset</code>；ISR 再加上補償偏移，交給 slew-rate 處理，最後將 WAVE_set、VREF_set 傳給 CLA。這把使用者的波形目標、狀態切換的漸變，以及閉迴路補償分成不同的運算階段。${src('Source/CPU_Timer_Module.c', 1230, 1238)} ${src('Source/CPU_Timer_Module.c', 265, 271)} ${src('Source/CPU_Timer_Module.c', 917, 924)}</p>
      <p>CLA 在一般波形分支中定義 <code>offset = 65535 − VREF</code>，將 WAVE 與 VREF 合成輸出字；當 runtime flag 不為零時，會改用 Manual 值。下式是正常分支的整數運算輪廓，實際運算包含 Uint32 轉型、右移及 Uint16 截取。分析極值時必須保留這些型別，不能把它直接當成不限範圍的實數乘法。${src('Include/C28_Cla_Common.h', 160, 163)} ${src('Source/CLA_Task.cla', 100, 120)}</p>
      <div class="equation">o = 65535 − VREF<br>DAC_word = Uint16((Uint32(WAVE) · Uint32(VREF − o)) ≫ 16) + o</div>
      <p>CV 補償也會依波形與輸出模式選路徑：AC_INT、AC_SYNC、AC_VCA 的所示分支，只對正弦或三角呼叫 ACDCV 補償；這不是任意波形都套用同一個 RMS 迴路的證據。輸出模式、波形種類與控制模式，是三個需要交叉閱讀的維度。${src('Source/Output_Control_Module.c', 423, 520)}</p>
      <details><summary>閱讀練習：相位 addr=4095、dec1=255 時，下一個表點是哪裡？</summary><p>下一點是索引 0；α 約等於 1，所以內插結果接近 table[0]。接著累加器回繞，addr 會回到開頭。請再比較方波路徑：它根本不經過此內插，而是直接做 duty 比較。若要設計波形連續性測試，應分別驗證平滑波表的接縫與方波的預期跳變。</p></details>
    `
  }
];
