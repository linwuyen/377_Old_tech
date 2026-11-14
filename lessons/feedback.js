import { src, math, diagram, codeBlock } from './shared.js';

export const feedbackLesson = {
  id: 'control-loop', number: '03', title: '沿著回授走一圈',
  summary: '逐段追 ADC 校正、電流重建、統計窗口與 CV／CC／CP，推導每條訊號的單位與延遲。',
  duration: '40 分鐘', category: '控制演算法', tags: ['CLA', '量測重建', 'RMS', 'CV / CC / CP'],
  body: `
    <h2 id="loop-map">01｜先把真正閉合的路徑畫出來</h2>
    <p>本章沿「輸出命令 → 實際電壓電流 → 量測 → 補償 → 輸出命令」閱讀。<strong>原碼事實：</strong>DDS 與波表產生基礎波形，CPU 將 WAVE 補償加入目標並執行 slew rate，CLA 合成 DAC 字；ADC 回來後才形成量測統計，主迴圈選擇 CV、CC 或 CP 更新補償。這是疊加於基礎命令的回授路徑。功率級、感測電路與類比內環未由這幾個檔案完整描述，圖中的硬體區塊因此保留為未知模型。${src('Source/CPU_Timer_Module.c', 1230, 1238)} ${src('Source/CPU_Timer_Module.c', 265, 271)} ${src('Source/CLA_Task.cla', 105, 135)}</p>
    ${diagram('feedback', '三種時間尺度：DDS／DAC 命令、CLA 量測與主迴圈補償。CV、CC、CP 每回合只選一種模式更新；先前保存的補償偏移仍可能一起作用。')}
    <p>由 <code>main.c</code> 開始：時間條件成立才更新時間戳，接著 L339 呼叫 <code>Measurement_Calc_Process()</code>，L342 呼叫 <code>Compensate_Calc_Process()</code>。因此一個 PI 呼叫並不等於一個 ADC 樣本，也沒有理由把這條補償稱為每個 PWM 週期執行的電流內環。</p>
    ${codeBlock('Source/main.c', 332, 334, String.raw`                if ( Calc_Elapsed_Time( sTimer.Cpu_Timer0_Time_Stamp_04, CpuTimer0.InterruptCount ) > (Uint32)Meas_Module.Meas_Period )
                {
                    sTimer.Cpu_Timer0_Time_Stamp_04 = CpuTimer0.InterruptCount;`, '入口：主迴圈的時間門檻')}
    <p>${src('Source/main.c', 332, 342, '接著閱讀量測與補償的呼叫順序')}</p>

    <h2 id="feedback-calibration">02｜ADC 的零點與兩段斜率</h2>
    <p>到 <code>CLA_Task.cla</code>，<code>Exec_Switch == 0</code> 才更新 V_FB。先加 offset，再以修正後的正負選斜率；斜率不是依原始 ADC 的符號選擇。offset 若以 ADC count 儲存，gain 的單位就是 V/count。下式是原碼的數學整理：</p>
    ${math(String.raw`q_v[n]=a_v[n]+o_v,\qquad v[n]=\begin{cases}g_v^+q_v[n],&q_v[n]\ge0\\g_v^-q_v[n],&q_v[n]<0\end{cases}`)}
    ${codeBlock('Source/CLA_Task.cla', 177, 189, String.raw`        float_buf1 = (float)sC28CLA.ADS8353_CHA + CPU_to_CLA_Variables.ADC_to_V_FB_Offset;

        if ( float_buf1 >= 0 )
        {
            CLA_to_CPU_Variables.V_FB_shadow = float_buf1 * CPU_to_CLA_Variables.ADC_to_V_FB_Scale_P;
        }
        else
        {
            CLA_to_CPU_Variables.V_FB_shadow = float_buf1 * CPU_to_CLA_Variables.ADC_to_V_FB_Scale_N;
        }

        float_buf1 = CLA_to_CPU_Variables.V_FB_shadow - CLA_to_CPU_Variables.V_FB; //for I_Cs
        CLA_to_CPU_Variables.V_FB = CLA_to_CPU_Variables.V_FB_shadow;`, '先校正，再保存電壓差')}
    <p><strong>先分清原始碼與中心化數值。</strong><code>sC28CLA.ADS8353_CHA</code> 是 Uint16，原始碼範圍為 0～65535；L177 先轉 float 再加 offset，得到的 q 才可能為負。不可把負電壓直接寫成負的 ADC 原始碼。${src('Include/CLA_Module.h', 340, 344)}</p>
    <p><strong>手算例，數值為教學假設：</strong>令 offset=−32768 count、正段斜率 0.100 V/count、負段 0.101 V/count。ADC=33768 時 q=1000，得到 100 V；ADC=31768 時 q=−1000，得到 −101 V；ADC=32763 時 q=−5，走負段得到 −0.505 V。三個 ADC 原始碼皆非負；正負斜率由中心化後的 q 決定。兩段在 q=0 都得到零，但斜率可不同。L188 必須先算新舊差，L189 才覆寫歷史，交換順序會讓電容補償恆為零。</p>
    <p>CHB 同樣先加電流 offset，再選正負斜率，得到的是 <code>I_shunt</code>；這仍不是最終負載電流。${src('Source/CLA_Task.cla', 195, 203)}</p>
    <p>若要理解校正參數如何抵銷誤差，可先用單一線段推導：兩個標準點滿足 y₁=g(a₁+o)、y₂=g(a₂+o)，相減消去 offset，求得斜率，再代回求零點。這是線性校正的教學推導，不宣稱校正模組的每個狀態都直接使用此式。兩段斜率共用零點時，還應檢查正負兩側的殘差，而非只確認正滿刻度吻合。</p>
    ${math(String.raw`g=\frac{y_2-y_1}{a_2-a_1},\qquad o=\frac{y_1}{g}-a_1`)}

    <h2 id="current-reconstruction">03｜從 KCL 推導負載電流重建</h2>
    <p><strong>理論解讀：</strong>若感測電流包含負載與並聯 R、C 支路，KCL 為「shunt 電流＝負載電流＋電阻電流＋電容電流」。令相鄰兩次 V_FB 更新相隔 T<sub>v</sub>，後向差分得到：</p>
    ${math(String.raw`i_{sh}=i_L+\frac{v}{R_s}+C_s\frac{dv}{dt}\quad\Longrightarrow\quad \hat i_L[n]=i_{sh}[n]-\frac{v[n]}{R_s}-\frac{C_s}{T_v}\bigl(v[n]-v[n-1]\bigr)`)}
    ${codeBlock('Source/CLA_Task.cla', 208, 211, String.raw`        CLA_to_CPU_Variables.I_Rs = CLA_to_CPU_Variables.V_FB * CPU_to_CLA_Variables.inv_Rs;
        CLA_to_CPU_Variables.I_Cs = float_buf1 * CPU_to_CLA_Variables.Cs_mpy_360000;
        CLA_to_CPU_Variables.I_FB_shadow = CLA_to_CPU_Variables.I_shunt - CLA_to_CPU_Variables.I_Rs - CLA_to_CPU_Variables.I_Cs;
        CLA_to_CPU_Variables.I_FB = CLA_to_CPU_Variables.I_FB_shadow;`, '三個電流分量必須具有相同單位')}
    ${diagram('measurement', '電流重建先扣除模型支路，再與電壓一起累加 Σv、Σi、Σv²、Σi²、Σvi 與 N。統計量會進入不同補償路徑。')}
    <p>由量綱核對，<code>inv_Rs</code> 為 A/V，電容差分係數也須為 A/V。差分的傳遞函數為 <code>1−z⁻¹</code>：常值消失，高頻變動被放大，因此 ADC 雜訊、電壓校正的斜率接縫及取樣抖動都可能進入重建電流。這是運算式的推論；實際 R、C、類比濾波及兩通道延遲仍需電路與量測確認。</p>

    <h2 id="coefficient-timebase">04｜360000 是係數乘數，不是當前取樣率</h2>
    <p>不只欄位命名，校正流程確實把估出的 Cs 乘 360000 後儲存；高檔位也有同樣處理。載入時直接傳給 CLA，沒有依本次排程重算。${src('Source/Calibration_Module.c', 2587, 2592)} ${src('Source/Event_Module.c', 4896, 4910)}</p>
    ${codeBlock('Source/Calibration_Module.c', 2133, 2138, String.raw`            Zs = sCali.sProcess.Vrms_Value[LOW_RANGE][1] / ( sCali.sProcess.Irms_no_Scale_Value[LOW_RANGE][1] * scale );
            Xc = ( Rs * Zs ) / ( Rs - Zs );
            Cs = 1 / ( 2.0 * M_PI * CALIBRATION_FREQ_FSET_MID * 0.01 * Xc );

            sGB.regCaliData.Cs_mpy_360000.all = Cs * 360000.0;
            CPU_to_CLA_Variables.Cs_mpy_360000 = sGB.regCaliData.Cs_mpy_360000.all;`, '校正值本身也包含模型與時間尺度假設')}
    <p>Task1 設定為 TINT0 觸發；Timer0 定義 120 kHz。若每次任務均完整執行，兩相輪流的 V_FB 更新名義上為 60 kHz，T<sub>v</sub>≈16.67 μs。SPI 輪詢提前返回、任務超時或實際觸發差異都可能打破此條件。${src('Source/CLA_Module.c', 297, 298)} ${src('Include/CPU_Timer_Module.h', 21, 27)} ${src('Source/CLA_Task.cla', 121, 132)} ${src('Source/CLA_Task.cla', 736, 742)}</p>
    ${math(String.raw`k_C^{ideal}=C_s f_v,\qquad \frac{k_C^{stored}}{k_C^{ideal}}=\frac{360000}{60000}=6\quad\text{（條件式比較）}`)}
    <p>例如假設 Cs=1 μF、Δv=1 V，60 kHz 的物理差分項是 0.06 A，而 Cs×360000 給 0.36 A；再令 v=100 V、R=1 kΩ、i<sub>sh</sub>=1.2 A，兩種結果分別為 1.04 A、0.74 A。這指出應稽核的尺度，<strong>不能直接宣告實機誤差六倍</strong>：Cs 的估算法、已存校正值、單位與有效呼叫率都尚須核對。先追溯參數再調增益。</p>

    <h2 id="measurement-window">05｜統計窗口由 DDS 狀態機控制</h2>
    <p>接著走 <code>Exec_Switch == 1</code> 的量測狀態機。01 狀態先判斷 DDS addr 回繞；若只是 addr 改變，才累加樣本。相同 addr 的任務不計入 N，回繞分支當拍也不累加。因此 N 是「被接受的樣本數」，不能直接用 60 kHz／輸出頻率代替。${src('Source/CLA_Task.cla', 488, 535)}</p>
    ${codeBlock('Source/CLA_Task.cla', 526, 530, String.raw`                    double_buf1 = (double)CLA_to_CPU_Variables.V_FB * (double)CLA_to_CPU_Variables.I_FB;
                    CLA_to_CPU_Variables.P_sum_shadow = CLA_to_CPU_Variables.P_sum_shadow + double_buf1;


                    CLA_to_CPU_Variables.Sampling_index++;`, '同一份 V_FB、I_FB 配對後才累積功率與計數')}
    <p>回繞後進 02 發布總和；下次量測相位進 03，清總和並發布 N；04 再等待 DDS 回繞才回到 01。正常路徑包含等待區段，並非每個波形週期都連續累積且發布。校正旗標還會導向 05～07。讀者應畫出狀態時間線，將「樣本時間」「窗口結束」「CPU 讀取」分開標記。${src('Source/CLA_Task.cla', 537, 608)}</p>
    <p>還有一項隱藏假設：除以 N 是對「被接受的樣本」等權平均。若接受樣本的間距不等，這不必然等於對物理時間平均；嚴格的時間平均要按各樣本代表的持續時間加權。當 DDS 位址改變是篩選條件時，應量出實際取樣分布，特別檢查低頻重複位址、相位跳動及漏執行，不宜直接套用均勻取樣的頻率響應。</p>
    ${math(String.raw`\langle v^2\rangle_{time}\approx\frac{\sum v[n]^2\Delta t_n}{\sum\Delta t_n}\quad\text{；只有等時間權重時才化成 }\frac{\sum v[n]^2}{N}`)}

    <h2 id="rms-power">06｜由平方和推到 AC RMS 與實功率</h2>
    <p>令平均值 μ<sub>v</sub>=Σv/N，寫成 v[n]=μ<sub>v</sub>+ṽ[n]。因 Σṽ=0，平方展開的交叉項消失，得到總 RMS 的平方＝DC 平均值的平方＋AC RMS 的平方。這裡除以 N，是整個窗口的均方值，不是統計估計常用的 N−1。</p>
    ${math(String.raw`\mu_v=\frac1N\sum_{n=0}^{N-1}v[n],\quad V_{rms}^{2}=\frac1N\sum v[n]^2=\mu_v^2+\frac1N\sum\tilde v[n]^2,\quad V_{ac,rms}=\sqrt{V_{rms}^2-\mu_v^2}`)}
    ${codeBlock('Source/Meas_Module.c', 114, 116, String.raw`    total_rms = sGB.POWER_DISPLAY_VARIABLES.V_rms_display_shadow;
    total_avg = sGB.POWER_DISPLAY_VARIABLES.V_avg_display_shadow;
    sGB.POWER_DISPLAY_VARIABLES.AC_V_rms_display_shadow = (float)sqrt( total_rms * total_rms - total_avg * total_avg );`, '總 RMS 與平均值在前面的 L87–107 計算')}
    <p><strong>四點手算：</strong>v=[12, 10, 8, 10] V，總和 40、平方和 408，故 μ=10 V、總 RMS=√102≈10.0995 V、AC RMS=√2≈1.4142 V。若 i=[2, 1, 0, 1] A，Σvi=44，P=11 W；μ<sub>v</sub>μ<sub>i</sub>=10 W，少掉的 1 W 就是兩者 AC 分量的共變異量。</p>
    ${math(String.raw`P=\frac1N\sum v[n]i[n]=\mu_v\mu_i+\frac1N\sum\tilde v[n]\tilde i[n],\qquad S=V_{rms}I_{rms}`)}
    <p>所以平均電壓乘平均電流不是一般實功率，RMS 相乘也不是一般實功率。本版 P 由 Σvi/N 算出。若兩通道相對延遲，乘積就不再代表同一時刻；這對相位差大的負載尤其重要。${src('Source/Meas_Module.c', 223, 225)}</p>
    <p>數值邊界也要讀：原碼直接除 N，AC 平方根前未夾成非負。啟動時 N=0，或大 DC 上的小 AC 遭浮點消去誤差，都是應驗證的情境；<code>max(0, …)</code> 與有效窗口旗標是改善建議，本版並未在此實作。${src('Source/Meas_Module.c', 83, 116)}</p>

    <h2 id="feedback-delay">07｜窗口延遲與補償週期是兩回事</h2>
    <p>理論上，等間隔 N 點矩形平均的資料時間中心落在窗口中點，對緩慢變化訊號約有 (N−1)T<sub>s</sub>/2 的延遲；此處還有 DDS 條件取樣、等待發布與 CPU 排程，不能直接套成完整閉迴路模型。可先用下式建立延遲預算，再以時間戳驗證各項：</p>
    ${math(String.raw`T_{age}\approx T_{window}/2+T_{publish}+T_{CPU\ wait}+T_{actuator}\qquad\phi_{delay}(f)=-2\pi fT_{age}`)}
    <p>主迴圈對 1≤f&lt;200 Hz 使用 120000/f 計數；高頻分支卻固定 1802，約 15.02 ms，f&lt;1 Hz 固定 6006，約 50.05 ms。旁邊 360 kHz 時代的註解不能當目前時基；嚴格「大於」與主迴圈輪轉也增加等待。提高 Kp 不會消除量測年齡，設計頻寬前先量出完整延遲。${src('Source/main.c', 552, 576)}</p>
    <p>例如只考慮一個理想 50 Hz 整週期窗口，其長度為 20 ms，資料中心約落後結束點 10 ms；對 10 Hz 的緩慢變化，這一項延遲就相當於約 −36°。實際系統還要加發布、等待與致動延遲，因此這個數字只是建立直覺的算例，不是本機相位裕度。量測新鮮度不足時，讀值即使很平滑，也未必適合直接加快補償。</p>

    <h2 id="mode-selection">08｜CV、CC、CP 各讀哪個量？</h2>
    <p><code>OUTPUT_STATE</code> 下由 <code>Power_Control_Mode</code> 的 switch 互斥選擇。CV 先檢查電流，再檢查功率；命中後改狀態並 break，本回合不繼續執行 CV 補償，也不立即執行新模式的 PI。CC／CP 回到 CV 另有輸出、誤差及穩定計數條件。${src('Source/Output_Control_Module.c', 71, 159)} ${src('Source/Output_Control_Module.c', 166, 269)}</p>
    <p><strong>互斥的是本回合的更新，不是所有偏移的作用。</strong>CV 轉入 CC／CP 時沒有在該分支清除 CV 的 offset；CC／CP 初始化只將 VREF offset 3 清零，後續再更新它。CLA 始終把 offset 0～3 相加，因此已保存的 CV offset 0 可以與新的限流／限功率 offset 3 同時作用。例如原先 offset 0=+200、之後 offset 3=−500，其他偏移為零時，VREF 基值加上的合計仍是 −300。這是狀態保存與加總的算例，不保證本版重設後的 PI 會實際產生這些數值。${src('Source/Output_Control_Module.c', 103, 143)} ${src('Source/Output_Control_Module.c', 313, 344)} ${src('Source/Output_Control_Module.c', 378, 409)} ${src('Source/CLA_Task.cla', 66, 70)}</p>
    <div class="table-wrap"><table><thead><tr><th>路徑</th><th>實際回授</th><th>補償去向／條件</th></tr></thead><tbody><tr><td>CV 的 DC 部分</td><td>V_avg_display_shadow</td><td>低電壓 WAVE；高電壓 VREF；ACDC 路徑的 WAVE 有負號</td></tr><tr><td>CV 的 AC 部分</td><td>AC_V_rms_display_shadow</td><td>VREF offset 0；指定模式只接受正弦、三角</td></tr><tr><td>CC</td><td>I_rms_display_shadow</td><td>VREF offset 3</td></tr><tr><td>CP</td><td>P_display.all</td><td>VREF offset 3；已經過顯示發布流程</td></tr></tbody></table></div>
    ${codeBlock('Source/Output_Control_Module.c', 302, 304, String.raw`    sPID.CC_Control_loop.Ref = (float)sGB.sProtectSetting.I_rms_limit_level_shadow * 0.0001;

    sPID.CC_Control_loop.Fdb = sGB.POWER_DISPLAY_VARIABLES.I_rms_display_shadow;`, 'CC 目標由整數設定換成量測單位')}
    <p>CV 還有自己的子狀態：ACDC 先校正 DC、判穩，再開始 AC；並非一開始就同時跑兩個補償。${src('Source/Output_Control_Module.c', 428, 520)} ${src('Source/Output_Control_Module.c', 879, 924)} ${src('Source/Output_Control_Module.c', 983, 1125)}</p>
    <p>CP 的區域變數雖叫 <code>s_va</code>，來源與 Fdb 都是 P。<code>P_display.all</code> 先經分組平均發布，啟動預設組數為 1，設定改大後才增加這一層等待；啟用 DC 空載顯示修飾時甚至可被清零。因此「顯示」欄位在此也是控制輸入，移植時不能只憑名稱拆走。${src('Source/Output_Control_Module.c', 125, 129)} ${src('Source/Output_Control_Module.c', 364, 370)} ${src('Source/Meas_Module.c', 34, 35)} ${src('Source/Meas_Module.c', 321, 346)} ${src('Source/Meas_Module.c', 448, 450)} ${src('Source/Meas_Module.c', 513, 525)}</p>
    <p>這些是路徑的事實，不保證 PI 增益始終有效；初始化巨集會整個結構重設，CP 初始化還指向 CC 結構，下一章會逐行驗證其語義。${src('Include/PID_Control_Module.h', 43, 56)} ${src('Source/Output_Control_Module.c', 375, 409)}</p>

    <h2 id="downstream-clamps">09｜追到 DAC，才知道致動器是否飽和</h2>
    <p>WAVE 補償由 CPU 加入基礎命令，ACDC 的 DC 補償明確寫成負的 PI Out；電壓增減方向要沿整條致動路徑判斷。VREF 則由 CLA 加總基值與四個 offset，再限制於高低界限；WAVE 另限制於 0～65535。${src('Source/Output_Control_Module.c', 1106, 1125)} ${src('Source/CPU_Timer_Module.c', 269, 271)} ${src('Source/CLA_Task.cla', 52, 92)}</p>
    ${codeBlock('Source/CLA_Task.cla', 66, 70, String.raw`    CLA_to_CPU_Variables.VREF_set_shadow2 = (float)CPU_to_CLA_Variables.VREF_set
                                                 + CPU_to_CLA_Variables.VREF_Compensate_Offset_0
                                                 + CPU_to_CLA_Variables.VREF_Compensate_Offset_1
                                                 + CPU_to_CLA_Variables.VREF_Compensate_Offset_2
                                                 + CPU_to_CLA_Variables.VREF_Compensate_Offset_3;`, '控制器輸出之後，仍有其他加總項與最終夾制')}
    ${math(String.raw`u_{VREF}=\operatorname{clamp}\!\left(u_{base}+\sum_{j=0}^{3}\Delta u_j,u_L,u_H\right)`)}
    <p>例如 base=50000、其他 offset=12000、本控制器 Out=5000，上限 65535；本地 Out 即使沒有碰限，總和 67000 已被下游夾住。<code>runPI</code> 的凍結條件只比較自己的 Out 與 OutPreSat，並沒有在此接收最終 DAC 殘差。局部 anti-windup 不等於整個致動鏈的 anti-windup。${src('Include/PID_Control_Module.h', 155, 177)}</p>
    <p>最後 DAC 合成還含整數轉型、乘法、位移；runtime flag 可選 Manual。若模式繞過正常合成，即使上游補償值仍更新，也不能假設它改變實際輸出。${src('Source/CLA_Task.cla', 100, 120)}</p>

    <h2 id="consistency-exercises">10｜把假設變成可驗證的閱讀練習</h2>
    <p>這份程式跨 CPU／CLA 共享多個欄位。02 寫總和、03 才寫 N，CPU 又分次讀取；<code>volatile</code> 本身不保證一組欄位來自同一窗口。此路徑未顯示序號快照協定，但是否實際撞到更新邊界，仍需中斷時序與目標存取語義確認。可記錄窗口序號、N、總和、PI 執行時間與最終 DAC 字，檢查資料是否同代、是否重複使用舊窗口。</p>
    <details><summary>練習一：分子先更新，分母晚一拍會怎樣？</summary><p>假設舊窗口 N=100，新窗口 N=120 且每個 v=10 V。若 CPU 讀到新平方和 12000 卻用舊 N=100，會得到 √120≈10.954 V，並非 10 V。這是特意構造的競態例子，不是已發現的實機紀錄。設計快照或雙緩衝時，還要讓 Σv、Σv²、Σvi 同代。</p></details>
    <details><summary>練習二：輸出頻率變高，PI 一定執行得更快？</summary><p>不一定。先算主迴圈的 Meas_Period，再畫 DDS 量測狀態，最後區分「PI 被呼叫」和「Fdb 更新」。200 Hz 以上的 1802 常數不再隨頻率下降；同一窗口被多次使用時，控制器仍可能累積積分。</p></details>
    <details><summary>練習三：調小量測噪聲後，先看哪幾條波形？</summary><p>同步觀察 ADC 原始值、校正後 V_FB、Δv、I_shunt、I_Rs、I_Cs、I_FB，再看 RMS／P 與最終 DAC。若 Δv 項主導誤差，先驗證時間尺度、通道對齊與校正；若 DAC 已夾制，先解讀致動限制。這樣才能把感測、估測、排程與控制器問題分開定位。</p></details>
  `
};
