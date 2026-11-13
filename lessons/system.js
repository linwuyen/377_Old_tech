const sourceBase = 'https://github.com/linwuyen/ASR5K_Old/blob/5262007b56d420c74ac892692ea4d3969a3e3992/ASR5K_28377/TRACE_ASR5000_F28377S/';
const src = (path, from, to, label) => `<a class="source-link" href="${sourceBase}${path}#L${from}-L${to}" target="_blank" rel="noopener noreferrer">${label || path.split('/').pop()} · L${from}–${to} ↗</a>`;

export const systemLessons = [
  {
    id: 'architecture', number: '01', title: '先讀執行架構，再讀控制方程式',
    summary: '從啟動、CPU 中斷、CLA 與前景排程，建立能對照程式碼的控制系統地圖。',
    duration: '18 分鐘', category: '執行架構', tags: ['C28x', 'CLA', '資料流', '狀態機'],
    body: `
<h2 id="architecture-map">把函式放回它的執行環境</h2>
<p>閱讀這份韌體的第一個問題是：「誰在什麼時間，用哪一版資料，改變哪一個輸出？」一個名稱帶有 PID 的函式，不足以說明整個閉迴路。這個版本把輸出波形、ADC 資料搬移、量測統計、低速補償與機器程序分散在 C28x Timer0 ISR、CLA Task1 和主迴圈。先建立這三個執行環境，才能判斷控制器的取樣時間、資料延遲及狀態切換。</p>
<div class="callout"><strong>本課閱讀基準</strong><p>所有連結固定在 commit <code>5262007b56d420c74ac892692ea4d3969a3e3992</code>。以下描述的是原始碼與專案設定推得的行為；硬體實際執行時間、類比功率級響應及閉迴路穩定度，仍需要建置與量測證據。</p></div>
<div class="table-wrap"><table><thead><tr><th>執行環境</th><th>入口與責任</th><th>輸入／輸出</th></tr></thead><tbody>
<tr><td>C28x Timer0 ISR</td><td>依輸出模式推進 DDS、波形狀態及 slew rate</td><td>設定值與模式 → WAVE、VREF、DDS 共享欄位</td></tr>
<tr><td>CLA Task1</td><td>DAC 限幅、SPIA 收發、V/I 校正、保護判斷、週期量測累加</td><td>CPU 命令與 ADS8353 原始值 → DAC 資料與量測摘要</td></tr>
<tr><td>C28x 前景主迴圈</td><td>通訊、量測換算、CV/CC/CP 補償、機器狀態與事件</td><td>量測摘要、使用者設定 → 補償量與程序狀態</td></tr>
</tbody></table></div>
<p>Timer0 中斷先呼叫 <code>runMcBSPslave()</code>，再根據 <code>OUTPUT_MODE_FLAG_Shadow</code> 選擇路徑；INT 模式內推進 DDS，執行輸出狀態與原始資料採樣。離開模式分支後，才把 WAVE、VREF、FreqStep、DDS 寫入 CPU→CLA 結構。因此資料流圖上的箭頭代表生產者與消費者關係，不保證同一次 Timer0 事件中 CLA 一定讀到這次 ISR 剛算完的所有欄位。${src('Source/CPU_Timer_Module.c',153,178)} ${src('Source/CPU_Timer_Module.c',917,934)}</p>

<h2 id="architecture-startup">啟動是一串相依關係</h2>
<p><code>main()</code> 先初始化系統時鐘、GPIO、PIE 與全域資料，再設定模型與校正預設值，以及各控制模組。硬體初始化包含 CPU timer、軟體計時基準、EMIF、eCAP、ePWM、DSP ADC、DAC，接著設定 CLA 記憶體、向量與共享變數，最後才開啟 CPU 全域中斷。閱讀啟動流程時應追蹤「可用」的定義：外設時鐘已開、記憶體已配置、係數已載入、通訊初始化完成，是四件不同的事。${src('Source/main.c',88,153)} ${src('Source/main.c',162,205)}</p>
<h3>CLA 並非一般的背景函式</h3>
<p>專案定義了 <code>_FLASH</code> 與 <code>CPU1</code>。CLA 程式從 Flash 複製到 RAM，LS4/LS5 配為 CLA 程式記憶體，LS0/LS1 配為資料；CPU→CLA 與 CLA→CPU 結構分別放在訊息 RAM。這些配置必須連同 linker command 一起讀，否則只看 C 宣告會漏掉處理器可存取範圍與開機複製條件。${src('.cproject',55,58)} ${src('Source/CLA_Module.c',15,22)} ${src('Source/CLA_Module.c',204,247)} ${src('28377S_FLASH_lnk.cmd',149,181)}</p>
<p>只有 Task1 向量與 MIER bit 0 啟用，觸發來源設為 TINT0。雖然程式有 Task2～Task8 的名稱及 CLA 完成中斷函式，這不代表八個工作都有執行；CPU 的 <code>M_INT11</code> 啟用敘述也被註解。因此架構圖應畫一個由 Timer0 觸發的 CLA Task1，不應把空白或未啟用的函式當成有效的排程層。${src('Source/CLA_Module.c',265,305)}</p>

<h2 id="architecture-io">確認真正的量測與致動路徑</h2>
<p>主要 V/I 回授來自 CLA 讀取 SPIA 的三個接收字，其中兩字存到 <code>sC28CLA.ADS8353_CHA/CHB</code>；接著送出三個字，包含合併後的波形 DAC 值與輸出旗標。CPU 內建 ADCA 雖有 16-bit differential 初始化與軟體觸發函式，但在這個快照的應用來源中，未找到那兩個轉換／取值函式的呼叫。不能因為檔名叫 DSP_ADC，就把它畫成主電壓電流回授。${src('Source/CLA_Task.cla',98,154)} ${src('Source/DSP_ADC_16bit_Module.c',16,41)} ${src('Source/DSP_ADC_16bit_Module.c',63,108)}</p>
<p>同樣地，這份 ePWM 初始化把 ePWM5 用於風扇、ePWM7/8 用於 CLK0/CLK180、ePWM4 用於時間量測。它不是「PID 算完就更新功率橋 PWM duty」的直接證據。從目前來源能完整追到的是：前景補償與 CPU 波形命令 → CLA 限幅與資料合併 → SPI DAC 輸出；DAC 之後的類比控制鏈需要電路資料才能補齊。${src('Source/EPWM_Module.c',16,57)} ${src('Source/CLA_Task.cla',51,118)}</p>

<h2 id="architecture-state">三種狀態，三種時間尺度</h2>
<p><code>sFsm.Machine_state</code> 管理 POWER_UP、SELF_TEST、READY、OUTPUT 與 ERROR；<code>sTimer.cpu_timer0_state</code> 管理較細的輸出啟停、相位與斜率程序；CLA 的 <code>u32ClaMeasFsm</code> 管理累加、發布、清除及等待下一量測週期。這些狀態並非可以任意合併的一個 enum。上層「允許輸出」不等於下層已到穩態，而量測狀態可能仍在收集前一段波形。追問題時，應把三組狀態與時間戳一起記錄。${src('Source/Main_State_Module.c',92,207)} ${src('Source/CPU_Timer_Module.c',207,255)} ${src('Source/CLA_Task.cla',488,579)}</p>
<details><summary>練習：一次電流限制，會經過哪些執行環境？</summary><p>從 <code>Measurement_Calc_Process()</code> 的 Irms 換算開始，追到前景的 <code>Compensate_Calc_Process()</code>、CC 控制器更新 <code>VREF_Compensate_Offset_3</code>，再追到 CLA 將四個 offset 加進 VREF 並限幅。請在每一條箭頭旁標出「誰寫、誰讀、更新條件」。答案不應是一條每 8.33 µs 更新的 PID 鏈：補償受前景量測排程及 OUTPUT_STATE 限制。${src('Source/main.c',332,350)} ${src('Source/Output_Control_Module.c',66,71)} ${src('Source/Output_Control_Module.c',296,344)} ${src('Source/CLA_Task.cla',66,92)}</p></details>
`
  },
  {
    id: 'timing', number: '02', title: '用觸發源重建取樣時間',
    summary: '拆開 Timer0、CLA 分時工作與前景更新，找出 120 kHz 設定下仍殘留的時間常數。',
    duration: '18 分鐘', category: '執行架構', tags: ['120 kHz', '排程', '取樣時間', '延遲'],
    body: `
<h2 id="timing-clock">先相信設定，再檢查註解</h2>
<p><code>CPU_FREQ=200</code> MHz、<code>CPU_TIMER0_FREQ=120000.0f</code>，<code>CPU0_PERIOD=1000000/CPU_TIMER0_FREQ</code>，所以設定上的 Timer0 週期為 8.333333 µs。再往下一層，<code>ConfigCpuTimer()</code> 把 MHz × µs 轉成整數，設定 PRD 為該整數減一；以 200 MHz 計算，1666 個 CPU clock 對應 8.330 µs，頻率約 120.048 kHz。本文以「名目 120 kHz」描述排程，精確時序仍應確認實際 clock、PRD 與量測結果。${src('Include/CPU_Timer_Module.h',18,37)} ${src('Source/CPU_Timer_Module.c',116,128)} ${src('F2837xS_comm_Source/F2837xS_CpuTimers.c',139,159)}</p>
<div class="equation"><code>T₀,nominal = 1 / 120000 ≈ 8.333 µs<br>PRD + 1 = trunc(200 × 8.333333) = 1666<br>T₀,register = 1666 / 200 MHz = 8.330 µs</code></div>
<div class="callout"><strong>不要把舊註解直接當成取樣時間</strong><p>程式仍有「360 kHz」、「180 kHz」、「2.775 µs」及「5 ms」等註解。它們必須由目前的觸發來源、分時狀態與實際常數重新推導。本課指出的是可重現的原始碼差異，不把差異直接等同於已觀察到的硬體故障。</p></div>

<h2 id="timing-rates">同一個 Task 裡，工作頻率也不同</h2>
<p>Timer0 同時是 CPU ISR 與 CLA Task1 的觸發來源。CLA 先做 WAVE/VREF 限幅及 SPI 收發，再由 <code>Exec_Switch</code> 交替執行兩半：0 分支換算 V/I、更新峰值及短路檢查；1 分支做 4CF 判斷與量測狀態機。若每次觸發都有完成、串流已啟用且沒有遺失事件，兩半各約 60 kHz。CPU 的 INT 模式則用 0→1→2→0 三段輪替，只有其中一段執行 <code>Error_OFF_Process()</code>，因此它的名目檢查頻率約 40 kHz。${src('Source/CLA_Module.c',297,305)} ${src('Source/CLA_Task.cla',172,210)} ${src('Source/CLA_Task.cla',417,488)} ${src('Source/CLA_Task.cla',736,742)} ${src('Source/CPU_Timer_Module.c',184,263)}</p>
<div class="table-wrap"><table><thead><tr><th>工作</th><th>來源／分頻</th><th>目前來源推得的節奏</th></tr></thead><tbody>
<tr><td>CPU Timer0 波形與 CLA Task1</td><td>Timer0</td><td>名目 120 kHz，約 8.33 µs</td></tr>
<tr><td>CLA V/I 換算、短路檢查</td><td>Task1 每兩次一次</td><td>名目 60 kHz，約 16.67 µs</td></tr>
<tr><td>INT 模式 Error_OFF</td><td>Timer0 每三次一次</td><td>名目 40 kHz，約 25 µs</td></tr>
<tr><td>Timer2</td><td>CPU2_PERIOD=1000 µs</td><td>1 ms 中斷計數，沒有控制計算</td></tr>
<tr><td>主迴圈錯誤掃描／機器程序</td><td>Timer0 計數門檻＋輪詢</td><td>約 1 ms／10 ms，再加前景等待</td></tr>
</tbody></table></div>
<h3>Timer1 提供另一套前景時間基準</h3>
<p>Timer1 的傳統 ISR 初始化被註解，但它並沒有閒置。<code>initSoftwareTimer()</code> 將 Timer1 設為自由運轉、關閉中斷，提供前景 <code>pollTimeTask()</code> 的時基；其 1 ms 任務推進 SPI ADC/DAC 初始化，10 ms 任務掃描 SPI 動作，ASAP 任務處理佇列。這與 Timer0 計數門檻的兩組主迴圈狀態排程並存，分析前景延遲時必須一起納入。${src('driverlib/bf_cputimer.h',13,13)} ${src('driverlib/bf_cputimer.h',152,160)} ${src('driverlib/timetask.c',51,91)} ${src('driverlib/timetask.h',48,75)}</p>

<h2 id="timing-measurement">量測時間窗與補償呼叫間距是兩件事</h2>
<p>CLA 根據 DDS 位址是否變化進行量測累加，遇到位址回捲才切換到發布狀態。下一個狀態複製總和，再下一個狀態發布樣本數並清零，之後等待另一個週期邊界才重新累加。這是一個帶有發布與等待階段的資料生產流程，不是主迴圈每次呼叫量測函式時都重新抓一整段 ADC 資料。${src('Source/CLA_Task.cla',492,596)}</p>
<p>前景則用 <code>Calc_Meas_Period_Process()</code> 計算門檻，通過後依序呼叫量測換算與 CV/CC/CP 補償。對 1≤f&lt;200 Hz 的分支，門檻為 120000/f 個 Timer0 計數；例如 60 Hz 為 2000 個計數，約一個輸出週期。可是 f≥200 Hz 使用固定 1802，f&lt;1 Hz 使用固定 6006，這些舊常數未跟著新 Timer0 頻率縮放。${src('Source/main.c',332,350)} ${src('Source/main.c',548,576)}</p>
<div class="table-wrap"><table><thead><tr><th>Calc_Meas_Period 分支</th><th>門檻</th><th>以名目 120 kHz 換算</th></tr></thead><tbody>
<tr><td>1≤f&lt;200 Hz</td><td>120000/f</td><td>約 1/f 秒，例如 60 Hz 為 16.67 ms</td></tr>
<tr><td>f≥200 Hz</td><td>1802</td><td>約 15.02 ms，原註解寫 5 ms</td></tr>
<tr><td>f&lt;1 Hz</td><td>6006</td><td>約 50.05 ms，原註解對應約 16.67 ms</td></tr>
</tbody></table></div>
<p>上述數字是門檻換算，並非精確的回呼週期：比較式用 <code>&gt;</code>，主迴圈又輪替三個排程狀態，其他函式可能先占用前景時間。更細地說，CPU 讀到的量測摘要也可能比呼叫當下早一個發布週期。若直接把 Timer0 的 8.33 µs 填入低速 PID 的離散化公式，就會混淆載波命令更新、量測生成與補償更新三個不同的時間尺度。${src('Include/Global_VariableDefs.h',22,25)} ${src('Source/main.c',243,366)}</p>

<h2 id="timing-audit">從時間常數反查控制假設</h2>
<p>4CF 計數常數是 600，但遞減發生於 CLA 的另一半分支，名目延遲因此約為 600/60000=10 ms；條件恢復正常會重新載入計數。電流重建也保留 <code>I_Cs=ΔV×Cs_mpy_360000</code>，校正流程確實將該欄位寫成 Cs×360000。這兩處都值得建立「物理時間／實際更新頻率／係數單位」對照表，再決定是否修改，不能只改名稱或只改 Timer0 常數。${src('Include/CLA_Module.h',27,35)} ${src('Source/CLA_Task.cla',457,479)} ${src('Source/CLA_Task.cla',188,210)} ${src('Source/Calibration_Module.c',2137,2140)}</p>
<details><summary>練習：把頻率改成 100 kHz，只改一個 define 夠嗎？</summary><p>至少重新推導 DDS step、slew rate、CLA 的兩段排程、600 次保護計數、1802/6006 門檻、峰值延遲、Cs 導數係數及通訊時間預算。再區分「以 CPU_TIMER0_FREQ 計算」與「寫死舊頻率」兩類。不必先修改韌體；先產出依賴清單，標示每項由公式自動縮放、需要手動重算，或需要硬體實測才能確定。</p></details>
`
  },
  {
    id: 'protection', number: '07', title: '保護不是一個 if：從偵測追到關閉',
    summary: '追蹤 CLA 鎖存、CPU 快速退場、前景錯誤程序與復歸握手，辨認真正生效的保護。',
    duration: '18 分鐘', category: '執行架構', tags: ['OCP', '狀態機', '故障處理', '復歸'],
    body: `
<h2 id="protection-chain">把保護拆成四個可驗證的動作</h2>
<p>對電源韌體而言，看到門檻比較只代表「可能偵測到故障」。完整保護還包含鎖存、命令退場、功率路徑關閉以及復歸條件。這份程式把工作分給 CLA、Timer0 ISR 與約 1 ms／10 ms 的前景程序。因此評估反應時間時，不能只引用 <code>SHORT_ERROR_TIME</code> 名稱，或把一個檢查分支的週期當成整機停止時間。</p>
<div class="table-wrap"><table><thead><tr><th>層次</th><th>目前程式行為</th><th>要追的資料</th></tr></thead><tbody>
<tr><td>快速判斷</td><td>CLA 校正電流、短路與 4CF 判斷</td><td>Short_OCP、_4CF_OCP 與故障快照</td></tr>
<tr><td>命令退場</td><td>Timer0 Error_OFF 切換輸出關閉狀態</td><td>WAVE_goal、slew_rate_state</td></tr>
<tr><td>機器錯誤程序</td><td>前景錯誤旗標、DAC 重設、relay 與功率級順序</td><td>Machine_state、OUTPUT_FLAGS、error_start_time</td></tr>
<tr><td>復歸握手</td><td>CPU 提出 Clear，CLA 清旗標，CPU 撤回 Clear</td><td>Short_OCP_Clear、_4CF_OCP_Clear</td></tr>
</tbody></table></div>

<h2 id="protection-fast">CLA 鎖存的是什麼？</h2>
<p>短路檢查要求未鎖存、沒有啟用 bypass、<code>|V_FB|&lt;10</code>，且外部 ADC 電流原始碼大於 62258 或小於 3276。也就是同時使用校正後的電壓與 ADC 原始電流邊界，而非單純比較 <code>|I_FB|</code>。命中後鎖存 Short_OCP，保存 I_FB、V_FB、WAVE 與 VREF 快照。理解這個差異很重要：校正係數或 ADC offset 改變時，原始碼門檻與安培門檻並不會自動以相同方式移動。${src('Include/CLA_Module.h',27,35)} ${src('Source/CLA_Task.cla',417,440)}</p>
<p>4CF 路徑則比較校正後的 <code>|I_FB|</code> 與 <code>_4CF_OCP_level</code>，超標就遞減計數，未超過門檻則重新載入 600。這是「連續條件維持」的邏輯，不是把一段時間內所有過流樣本加總。因為它位於 CLA 兩段交替中的一段，在名目 120 kHz Task1 觸發下，600 次判斷約為 10 ms；原始碼的「5 ms」註解不能直接當成目前延遲。第一次觸發前的計數初值也應另行確認，不能只檢查穩態重載情境。${src('Source/CLA_Task.cla',451,479)} ${src('Source/CLA_Module.c',154,155)}</p>
<div class="callout"><strong>故障旗標不等於 DAC 已停止</strong><p>Task1 的 SPI 傳送位於短路與 4CF 判斷之前；保護旗標是在後半段才更新。這份程式的軟體關閉鏈仍會跨到 CPU ISR 與機器狀態流程。是否另有獨立類比保護，必須看硬體，不能由旗標名稱推定。</p>${src('Source/CLA_Task.cla',125,154)} ${src('Source/CLA_Task.cla',417,479)}</div>

<h2 id="protection-shutdown">快速退場與完整關閉各負責什麼</h2>
<p>在機器尚未進入 <code>ERROR_STATE</code> 時，<code>Error_OFF_Process()</code> 若發現任何 CPU 錯誤旗標或 CLA 保護旗標，就把輸出程序切到 <code>CPU_TIMER0_OUTPUT_OFF_STATE0</code>、WAVE 目標設為零點碼，並選擇斜率處理。在 INT 模式，這段檢查是三段排程中的一段，約每 25 µs 才檢查一次。它保證的是發起退場程序；最後 WAVE_set 如何變化仍要沿關閉狀態與 <code>Calc_SlewRate_Process()</code> 追蹤。${src('Source/CPU_Timer_Module.c',184,200)} ${src('Source/CPU_Timer_Module.c',263,271)} ${src('Source/CPU_Timer_Module.c',8322,8343)}</p>
<p>前景的 <code>Power_Ready_Error_Scan()</code> 把 CLA 旗標映射成整機錯誤碼，例如 4CF 轉成 I_RMS_OCP_SW、短路轉成 SHORT_SW，並轉入 ERROR_HANDLE_STATE0。之後 Main_Process 的 Error_Handle0 清除輸出命令、重設 DAC 相關變數，關閉 DCAC_ENA 與 AC_OCPA；Error_Handle1 依時間與 relay enable 設定處理繼電器；嚴重硬體錯誤再進 Error_Handle2，延後關閉 PFC、DCDC 與 AC_ON。這是一條有意識的時序鏈，測試應觀察每一段，而非只確認最後 enum 值。${src('Source/Protect_Module.c',389,430)} ${src('Source/Main_State_Module.c',1063,1157)}</p>

<h2 id="protection-selected">限制模式與編譯分支會改變保護意義</h2>
<h3>同一個電流限制開關，也會改變跳脫條件</h3>
<p>峰值 OCP 只有在 <code>I_peak_limit_Enable==0</code> 時檢查，門檻資料來自量測峰值。Irms limiter 關閉時，超過使用者限制採零等待門檻；啟用時，改用最大限制與 250 ms 等待。這顯示「主動限流」與「故障跳脫」共用部分量測，但不是同一個機制。測試至少要涵蓋 limiter 開／關、正／負峰值、bypass 及門檻附近抖動。${src('Source/Protect_Module.c',275,385)}</p>
<p>目前 <code>DEVELOP_SV52</code> 實際被定義，在兩個機型分支都會把 DC_OVP 輸入旗標強制寫為 1，繞過真實輸入讀取；相對地，整體 <code>BYPASS_SCAN_ERROR_FOR_POWER_READY</code> 定義被註解。這份快照因此不能概括成「全部保護均停用」，也不能寫成「所有硬體保護皆正常生效」。工程上需要逐項列出有效分支及訊號極性。${src('Include/C28_Cla_Common.h',33,36)} ${src('Include/C28_Cla_Common.h',62,67)} ${src('Source/Event_Module.c',4034,4046)} ${src('Source/Event_Module.c',4083,4092)}</p>

<h2 id="protection-reset">復歸是跨處理器協定</h2>
<p>一般錯誤復歸會清 CPU 錯誤碼，設定兩個 CLA Clear 命令；CLA 在對應判斷分支清除鎖存旗標，CPU 的 ready 處理看到旗標已為零後再撤回 Clear。嚴重 PFC／DC bus／AC fail 類錯誤走重新上電程序。故障仍存在時，清除後是否再次鎖存、Clear 停留時間多長，以及重新進 READY 後是否殘留過期量測，都應是狀態測試的驗收條件。${src('Source/Main_State_Module.c',1230,1276)} ${src('Source/Main_State_Module.c',1320,1337)} ${src('Source/Main_State_Module.c',908,921)} ${src('Source/CLA_Task.cla',438,440)} ${src('Source/CLA_Task.cla',477,479)}</p>
<details><summary>練習：為短路保護畫一條時間軸</summary><p>標出 ADC 樣本取得、CLA 0 分支判斷、Short_OCP 鎖存、CPU Error_OFF 看見旗標、WAVE 退場、前景轉入錯誤程序、relay 動作七個事件。分別記錄最早與最晚延遲來源，包含 SPI 資料年齡、兩段／三段排程相位與前景等待。只有具備每段量測或可靠上界後，才能給整體停機時間；單靠這些原始碼不能宣稱已通過短路硬體驗證。</p></details>
`
  },
  {
    id: 'verification', number: '08', title: '把理解轉成可重現的驗證',
    summary: '固定建置基準、檢查數值與共享資料，再以分層測試驗證控制行為及實際時間預算。',
    duration: '18 分鐘', category: '驗證實務', tags: ['建置基準', '數值邊界', '時序量測', '測試設計'],
    body: `
<h2 id="verification-baseline">第一份產物是可追溯的建置基準</h2>
<p>控制器的正確性依賴編譯分支、數值型別、呼叫週期與狀態。因此驗證的起點應是一份可以重現的清單：commit、選定專案、編譯器版本、define、linker command、校正資料與測試情境。這份專案的 .cproject 指定 TMS320F28377S、C28xx CPU1、TI 22.6.0.LTS、COFF ABI、FPU32、CLA1、最佳化等級 4 與 relaxed floating point，並定義 _FLASH、CPU1。這是原始碼中的配置證據，並不代表本教材已成功執行該工具鏈。${src('.cproject',20,44)} ${src('.cproject',55,66)}</p>
<p>再保存有效巨集清單。以本版為例，TEST_WAVEOUT 選 NORMAL_WAVEOUT；DEVELOP_SV41、48、51、52、54、76 有定義，而總體補償與 ready 保護 bypass 被註解。名稱像「DEVELOP」不表示不會進正式 binary；必須看預處理結果及呼叫點。尤其 SV52 改變 DC_OVP 輸入，SV41 將多機快速平衡補償 offset 清零，這些差異會直接改變測試預期。${src('Include/C28_Cla_Common.h',33,73)} ${src('Include/C28_Cla_Common.h',108,163)} ${src('Source/CPU_Timer_Module.c',9468,9474)}</p>
<div class="callout"><strong>目前證據範圍</strong><p>本教材完成的是固定版本的原始碼分析及網站內容檢查。以下是韌體驗證方法與待檢查項目，並非已執行的硬體測試結果，也不宣稱控制器已通過實機驗證。</p></div>

<h2 id="verification-numerics">先做低成本、能抓真問題的數值測試</h2>
<p>把純運算與外設讀寫分開，是建立測試入口的第一步。以量測為例，CLA 累加 Σv、Σv²、Σi、Σi²、Σvi，CPU 再用樣本數 N 換算 RMS、平均值及 AC RMS。測試資料可以精確合成：純 DC 應有 RMS=|DC|、AC RMS=0；整週期正弦加 DC 應滿足 RMS²=DC²+A²/2。這能同時檢查 offset、樣本數與取樣窗，不需要先接上功率級。${src('Source/CLA_Task.cla',512,530)} ${src('Source/Meas_Module.c',83,116)}</p>
<div class="equation"><code>Vavg = Σv / N<br>Vrms = √(Σv² / N)<br>Vac,rms = √(Vrms² − Vavg²)<br>v(t)=Vdc+A·sin(ωt) ⇒ Vrms²=Vdc²+A²/2</code></div>
<p>原始 <code>Measurement_Calc_Process()</code> 直接除以 Total_Sample_Points，也直接對 RMS²−AVG² 開根號。在該函式入口沒有看到 N=0 或微小負根號參數的防護。這不是立即斷定實機必然出錯，而是建立有價值的測試：開機尚未產生第一包摘要、切換頻率、校正狀態切換、零輸出與浮點捨入。預期應明確定義為保留前次有效值、回報資料無效或採另一個策略，再決定程式修正。${src('Source/Meas_Module.c',69,116)} ${src('Source/Meas_Module.c',154,179)}</p>
<div class="table-wrap"><table><thead><tr><th>測試輸入</th><th>要證明的性質</th><th>可觀測輸出</th></tr></thead><tbody>
<tr><td>DC、正弦＋DC、正負校正分段</td><td>單位與量測公式一致</td><td>V/I、RMS、平均值、功率</td></tr>
<tr><td>N=0、近零 AC、極限 DAC 命令</td><td>邊界不產生未定義控制量</td><td>有效旗標、NaN/Inf、限幅結果</td></tr>
<tr><td>門檻上下交替、連續超標</td><td>保護計數正確重載與鎖存</td><td>4CF count、Short_OCP、錯誤碼</td></tr>
<tr><td>切換模式、輸出關閉、故障復歸</td><td>控制狀態與積分量重設一致</td><td>狀態序列、offset、WAVE/VREF</td></tr>
</tbody></table></div>

<h2 id="verification-snapshot">volatile 不等於一整包資料一致</h2>
<h3>把數值正確與資料版本一致分開驗證</h3>
<p>CPU 與 CLA 以共享結構交換資料，CPU ISR 連續寫 WAVE、VREF、FreqStep、DDS；CLA 發布量測總和的狀態，和發布 Total_Sample_Points 的狀態又分開。CPU 前景直接讀取這些欄位。即使單一欄位的讀寫符合平台規則，也不能因此推定總和與 N 必定來自同一個量測窗。應以時間交錯測試檢查可能的跨窗組合，必要時再設計序號、完整快照或雙緩衝協定。${src('Source/CLA_Module.c',15,22)} ${src('Source/CPU_Timer_Module.c',920,924)} ${src('Source/CLA_Task.cla',537,579)} ${src('Source/Meas_Module.c',83,107)}</p>
<p>另一個具體情境是 SPI 串流尚未就緒：Task1 先做 DAC 命令計算，若 <code>enPollADCpushADC==0</code> 就返回；RX FIFO 字數不為三時會修改該旗標。測試應涵蓋未初始化、正常三字、缺字與重新啟用，並確認回授是否仍是上一包、保護與量測狀態是否有進展。單看心跳遞增不足以證明 ADC 資料持續更新，因為心跳位於 early return 之前。${src('Source/CLA_Task.cla',47,48)} ${src('Source/CLA_Task.cla',121,135)} ${src('driverlib/spi_dacadc.h',160,175)}</p>

<h2 id="verification-timing">最後用量測關閉時間預算</h2>
<p>靜態推導給出的是預算，不是 WCET 證明。C28x Timer0 路徑需在下一個 8.33 µs 事件之前完成必要工作，CLA Task1 也要以相同觸發預算檢查各分支。多處已有 DEVELOP_SV01 時間量測鉤子，讀取 ePWM4 計數並保留最大值，但相關 define 預設被註解。若開啟量測，要把儀測本身的成本、計數器回捲、最佳化差異及最壞模式都列入結果。${src('Source/CPU_Timer_Module.c',160,163)} ${src('Source/CPU_Timer_Module.c',937,948)} ${src('Source/CLA_Task.cla',747,755)} ${src('Include/C28_Cla_Common.h',27,29)}</p>
<p>建議依序完成三層證據：先在主機端重播數值與狀態測試，再以目標工具鏈檢查 map、ABI、RAM/Flash 配置及反組譯，最後用低能量、可控輸入的目標硬體量測 SPI、ISR、CLA 與輸出事件。前兩層能找出單位、分支與連結問題；閉迴路動態及真正的故障反應時間仍由最後一層提供。每次改變 Timer0 頻率或量測排程，都要重新審查 1802/6006、600 次保護及 Cs×360000 等時間相依常數。${src('28377S_FLASH_lnk.cmd',149,181)} ${src('Source/main.c',552,576)} ${src('Include/CLA_Module.h',35,35)} ${src('Source/Calibration_Module.c',2137,2140)}</p>
<details><summary>結業練習：寫出一張可以交給同事執行的驗證卡</summary><p>挑選「60 Hz AC 輸出時啟用 Irms 限制」：固定 commit、define、校正版本與負載模型；列出刺激波形、取樣時間及預期狀態轉換；記錄量測窗序號、Irms、CC error/output、VREF offset、限幅旗標與最後 SPI DAC 字。通過條件應包含穩態誤差、輸出上界、資料一致性及時間預算。若尚未具備實機結果，結論就寫「來源分析與模擬條件通過，硬體結果待補」，讓下一位工程師能準確接續。</p></details>
`
  }
];


