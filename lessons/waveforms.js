import { src, math, diagram, codeBlock } from './shared.js';

export const waveformLesson = {
  id: 'waveforms', number: '06', title: '從相位累加走到 DAC 整數字',
  summary: '推導 DDS 頻率、位元切片與線性內插，再把 RMS、峰值、輸出縮放及 unsigned 合成接成完整路徑。',
  duration: '38 分鐘', category: '控制演算法', tags: ['DDS', '內插與 RMS', 'DAC 整數運算'],
  body: `
    <h2 id="dds-phase">01｜DDS 累加的是相位，不是振幅</h2>
    <p>先沿內部 DC／AC／ACDC 模式閱讀：Timer0 ISR 先把 <code>FreqStep</code> 加進 <code>dds.all</code>，再呼叫 <code>INT_Mode_Output_State_Process()</code> 產生波形。因此本次查表使用的是加完增量後的相位。DDS 的核心是讓一個有限位寬計數器代表一整圈；振幅由後續查表與縮放決定。${src('Source/CPU_Timer_Module.c', 167, 178)}</p>
    ${codeBlock('Source/CPU_Timer_Module.c', 174, 178, String.raw`        sGB.dds.all = sGB.dds.all + sGB.FreqStep;

        measTimerLength(&timer0);
        INT_Mode_Output_State_Process();
        VI_RAW_Sampling_Process();`, '先累加，再以本拍相位查表')}
    <p><strong>理論推導。</strong>令 P 是無號 32-bit 相位字，M 是每次更新增加的整數。P 的單位是 phase counts，M 的單位是 counts/update；一整圈有 2³² counts。加法回繞讓相位保持循環，換成弧度與 Hz 可得：</p>
    ${math(String.raw`\begin{aligned}P[n+1]&=(P[n]+M)\bmod 2^{32},\\ \theta[n]&=2\pi\frac{P[n]}{2^{32}},\qquad \Delta\theta=2\pi\frac{M}{2^{32}},\\ f_{\mathrm{out}}&=f_u\frac{M}{2^{32}},\qquad \Delta f_{\mathrm{word}}=\frac{f_u}{2^{32}}.\end{aligned}`)}
    <p>對名義更新率 120000 Hz，M 相差 1 的頻率格點間隔約為 27.939677 µHz。這是理想相位字解析度；可輸入的命令格式、浮點運算、可用範圍與時鐘誤差，都可能讓產品的實際設定精度較粗。公式也不表示取樣後波形能無限制地保留高於 Nyquist 的頻率；此處只討論通常工作區間的相位累加。Timer 定義與 DDS 頻率巨集都指向名義 120 kHz。${src('Include/CPU_Timer_Module.h', 21, 27)} ${src('Include/Global_VariableDefs.h', 327, 338)}</p>
    ${diagram('dds', '命令頻率先變成相位增量；高 12 位取表位址，中 8 位做內插，低 12 位繼續累積。')}

    <h2 id="dds-frequency-word">02｜2³² 的週期，與 2³²−1 的命名差異</h2>
    ${codeBlock('Include/Global_VariableDefs.h', 327, 338, String.raw`#define DDS_Freq       120.0f

#define DDS_MutiFreq   1000.0f
#define DDS_HZ         (DDS_Freq * DDS_MutiFreq)
#define TWO_POW_32     0xFFFFFFFF


#define DC_FREQ_STEP  TWO_POW_32 * DDS_MutiFreq / DDS_HZ

#define DEG_STEP (TWO_POW_32 / DDS_Freq)

#define _1HZ (TWO_POW_32 / DDS_HZ)`, '巨集名稱與實際常數要分開讀')}
    <p><code>TWO_POW_32</code> 的實際整數值是 4294967295，也就是 2³²−1；無號 32-bit 累加的模數仍是 4294967296，不能跟著巨集改成 2³²−1。頻率事件以 <code>(Uint32)(freq_set * _1HZ)</code> 建立 shadow 增量，狀態機之後才載入 <code>FreqStep</code>。該狀態還更新波表、scale／offset 與 VREF，並重新載入相位，故「改頻率」不是單一賦值即時生效的同義詞。${src('Source/Event_Module.c', 1128, 1128)} ${src('Source/CPU_Timer_Module.c', 1387, 1419)}</p>
    <p>用理想實數乘法示範正頻率 60 Hz：巨集比率會得到 2147483.6475，若隨後向零截斷，M=2147483，帶回真實模數得到約 59.999981895 Hz。這個例子故意隔離「整數相位字量化」；實際 <code>_1HZ</code> 會涉及整數轉浮點與目標浮點運算，0xFFFFFFFF 在有限精度下甚至可能捨入成 2³²。因此這組數值不是宣稱目標二進位一定產生該字值，逐位元驗證必須沿 TI 編譯器型別與浮點格式重播。</p>
    <p>CLA 來源中的 <code>DEVELOP_SV77</code> 定義被註解，所示預設分支直接複製 CPU 傳入的 DDS；ISR 尾端也寫入該共享相位。除非建置選項另外定義此符號，不能把 CLA 裡的條件式獨立累加分支當作預設行為。${src('Source/CLA_Task.cla', 18, 25)} ${src('Source/CLA_Task.cla', 160, 165)} ${src('Source/CPU_Timer_Module.c', 920, 924)}</p>

    <h2 id="dds-bits">03｜12／8／12 位切片各自負責什麼？</h2>
    ${codeBlock('Include/Global_VariableDefs.h', 523, 532, String.raw`typedef union
{
    Uint32 all;

    struct
    {
        Uint32 dec2:12;
        Uint32 dec1:8;
        Uint32 addr:12;
    };`, 'DDSDATA 的相位與位元欄位')}
    <p>依本目標程式使用的位元配置，低 12 位是 dec2，中間 8 位是 dec1，高 12 位是 addr。addr 對應 4096 個表點；每一格占 2²⁰ 個相位 counts。C 的 bit-field 配置依編譯器／ABI 而定，移植到其他工具鏈時應核對布局，不能只把 union 複製過去就假定位序一致。${src('Include/Global_VariableDefs.h', 523, 543)}</p>
    ${math(String.raw`P=2^{20}k+2^{12}d+r,\qquad 0\le k<4096,\quad0\le d<256,\quad0\le r<4096`)}
    ${math(String.raw`k=\left\lfloor\frac{P}{2^{20}}\right\rfloor,\qquad \beta=\frac{P\bmod2^{20}}{2^{20}}=\frac{d}{256}+\frac{r}{2^{20}}`)}
    <p>上式 β 是完整相位字在表格內的理想小數位置；實際內插不直接使用 β。程式只取 dec1，dec2 沒有進入振幅運算，但低位仍保留在累加器裡，會透過進位影響未來的 dec1 與 addr。因此「低 12 位未內插」不等於「DDS 只剩 20 位頻率解析度」。這個區分對閱讀相位量化與振幅量化尤其重要。</p>

    <h2 id="dds-interpolation">04｜內插權重實際約為 dec1／255</h2>
    ${codeBlock('Source/CPU_Timer_Module.c', 981, 983, String.raw`    wave_addr              = (Uint16) sGB.dds.addr;
    wave_addr_1            = ((Uint16)sGB.dds.addr + 1) & 0x0FFF;
    sTimer.wave_c2_decimal = (float) sGB.dds.dec1 * 0.003921569;`, '取相鄰兩點並建立權重')}
    ${codeBlock('Source/CPU_Timer_Module.c', 995, 996, String.raw`        wave_c2   = (float) WAVE_DATA.local_ram[Memory_Module.wave_buffer_section][wave_addr];
        wave_c2_1 = (float) WAVE_DATA.local_ram[Memory_Module.wave_buffer_section][wave_addr_1];`, '整數表值轉成浮點值')}
    ${codeBlock('Source/CPU_Timer_Module.c', 1001, 1001, String.raw`        wave_value = wave_c2 + (wave_c2_1 - wave_c2) * sTimer.wave_c2_decimal;`, '依相位小數位置做線性內插')}
    <p>L981 決定位址 k；L982 先加一再遮罩，讓 k=4095 的下一點回到 0；L983 乘的常數接近 1/255，而不是常見固定點小數的 1/256。L995–996 取兩個有號波表值，L1001 才在兩點之間做加權。令表值為 q[k]，其數學輪廓是：</p>
    ${math(String.raw`k_1=(k+1)\bmod4096,\qquad \alpha=d\cdot0.003921569\approx\frac{d}{255},\qquad w=(1-\alpha)q[k]+\alpha q[k_1]`)}
    <p>用正弦表開頭作教學手算，令整數化後 q[0]=0、q[1]=50，並以 α=d/255 的近似計算。這些是波表碼值，不是伏特；實際最後幾位仍取決於目標 sinf 與浮點捨入。${src('Source/Wave_Generate_Module.c', 293, 300)}</p>
    <div class="table-wrap"><table><thead><tr><th>k、d、r</th><th>完整相位小數 β</th><th>實作近似 α</th><th>內插碼值 w</th></tr></thead><tbody><tr><td>0、0、0</td><td>0</td><td>0</td><td>0</td></tr><tr><td>0、128、0</td><td>0.5</td><td>128/255≈0.501961</td><td>約 25.0980</td></tr><tr><td>0、255、0</td><td>255/256≈0.996094</td><td>1</td><td>約 50</td></tr><tr><td>0、128、4095</td><td>約 0.503905</td><td>仍為 128/255</td><td>仍約 25.0980</td></tr></tbody></table></div>
    <p>這組例子同時看見兩件事：dec2 改變而 dec1 不變時，本拍內插結果不變；dec1=255 時則提早接近下一個表點。十進位常數本身只是 1/255 的近似，不能承諾 α 恰好等於 1。內插降低表點間跳動，但相位截斷、權重誤差、表值量化與 DAC 持有仍各自存在，單靠此式無法推得實機的 THD 或雜散規格。</p>

    <h2 id="dds-table-shapes">05｜正弦、三角與方波的執行路徑不同</h2>
    <p>正弦產生器對每個 i 計算 ${math(String.raw`\theta_i=2\pi i/4096`, false)}，再將 ${math(String.raw`32767\sin\theta_i`, false)} 轉成 int16 寫到 SDRAM。三角表則用三段整數直線，轉向位置約在四分之一圈與四分之三圈。這些碼值設定的是波形形狀，並未直接宣告負載端的伏特數。${src('Source/Wave_Generate_Module.c', 279, 312)} ${src('Source/Wave_Generate_Module.c', 159, 203)}</p>
    ${math(String.raw`q_{\triangle}[i]=\begin{cases}32i,&0\le i<1024,\\65535-32i,&1024\le i<3072,\\32i-131071,&3072\le i<4096.\end{cases}`)}
    <p>整數端點使離散三角表與理想連續三角波不完全相同，因此理想 CF 只作幅度換算的模型。初始化中，在 <code>BYPASS_GEN_WAVE_TO_SDRAM</code> 條件區塊可見三角與正弦的產生呼叫，方波產生呼叫則被註解；這並不表示 INT 模式不能產生方波。${src('Source/Main_State_Module.c', 282, 286)}</p>
    <p>INT 模式先判斷是否為方波：非方波才走查表內插；方波直接比較 addr 與設定 duty，<code>addr &lt;= duty</code> 輸出 +32767，否則 −32767。若 duty=d 且 d 在 0～4095，正值涵蓋 d+1 個位址區間；在相位均勻覆蓋的理想描述下，占空比例是 (d+1)/4096。實際離散相位可能跳過某些位址，有限樣本窗口比例還需按相位序列計數。${src('Source/CPU_Timer_Module.c', 990, 1015)}</p>
    <p>另一個方波表產生器用 <code>i &lt; duty_set</code> 填正值，正值表點數是 d，而非 d+1。因此 duty=0 時，INT 比較路徑仍有 addr=0 的正區間，產表路徑卻沒有正表點。測試邊界一定要先指定路徑，不能把兩份「方波」公式視作完全等價。${src('Source/Wave_Generate_Module.c', 234, 257)}</p>

    <h2 id="dds-rms">06｜由積分推得峰值、RMS 與 CF</h2>
    <p><strong>純理論，先固定定義。</strong>令理想週期波形的峰值幅度為 A&gt;0、週期為 T。總 RMS 包含 DC，AC RMS 則先扣除平均值；CF 定義為最大絕對值除以所採用的 RMS。對零平均、對稱的三種波形，兩種 RMS 相同：</p>
    ${math(String.raw`x_{\mathrm{rms}}=\sqrt{\frac1T\int_0^T x^2(t)\,dt},\qquad \mu=\frac1T\int_0^T x(t)\,dt,\qquad x_{\mathrm{ac,rms}}=\sqrt{x_{\mathrm{rms}}^2-\mu^2},\qquad \mathrm{CF}=\frac{A}{x_{\mathrm{rms}}}`)}
    ${math(String.raw`\begin{aligned}\text{sine:}\quad x_{\mathrm{rms}}^2&=\frac{A^2}{2\pi}\int_0^{2\pi}\sin^2\theta\,d\theta=\frac{A^2}{2},\\ \text{triangle:}\quad x_{\mathrm{rms}}^2&=\frac4T\int_0^{T/4}\left(\frac{4At}{T}\right)^2dt=\frac{A^2}{3},\\ \text{bipolar square:}\quad x_{\mathrm{rms}}^2&=pA^2+(1-p)(-A)^2=A^2.\end{aligned}`)}
    <div class="table-wrap"><table><thead><tr><th>理想波形</th><th>總 RMS</th><th>CF</th><th>給定零平均 RMS 時的 A</th></tr></thead><tbody><tr><td>正弦</td><td>A/√2</td><td>√2</td><td>√2 × RMS</td></tr><tr><td>對稱三角</td><td>A/√3</td><td>√3</td><td>√3 × RMS</td></tr><tr><td>50% 雙極方波</td><td>A</td><td>1</td><td>RMS</td></tr></tbody></table></div>
    <p>原碼為正弦、三角、方波分別填入 1.4142136、1.7320508、1，與上述理想 CF 相符。對非 50% 的 ±A 方波，總 RMS 仍為 A，但平均與 AC RMS 會改變：</p>
    ${math(String.raw`\mu=A(2p-1),\qquad x_{\mathrm{ac,rms}}=\sqrt{A^2-A^2(2p-1)^2}=2A\sqrt{p(1-p)}`)}
    <p>因此「方波 CF=1」只可直接描述以原波形峰值 A 除以總 RMS 的定義，不能據此宣稱任意 duty 的 AC RMS 都等於 A；扣掉 DC 後的波形峰值也會改變。${src('Source/Wave_Generate_Module.c', 203, 203)} ${src('Source/Wave_Generate_Module.c', 264, 264)} ${src('Source/Wave_Generate_Module.c', 312, 312)}</p>
    <p>理想對稱波形的峰對峰值為 2A，所以由 Vpp 求 A 應乘 0.5。產品實作卻要逐分支讀：RMS 選項複製各波形的 CF；Peak-to-Peak 選項只將 ARB 與三角的換算欄位設為 0.5，正弦與方波維持其 CF。欄位名稱仍叫 CF，但此時部分元素扮演「單位到峰值的換算係數」；不能把介面所有波形都概括成相同 Vpp 語義。${src('Source/Event_Module.c', 3587, 3625)}</p>

    <h2 id="dds-affine">07｜波表碼值先經過 affine 縮放</h2>
    <p>在所示設定事件中，程式先以設定值乘波形 CF 得到峰值尺度，再除以最大量程與設定單位倍率，產生負號的 <code>WAVE_scale_shadow</code>；DC 設定則進入 <code>WAVE_offset_shadow</code>。這裡的負號是來源中的碼值方向，不宜未看類比級就把它改成「輸出電壓反相」的硬體結論。<code>AD5543_HALF_VALUE</code> 在本版是 32767.0。${src('Source/Event_Module.c', 1361, 1388)} ${src('Include/Global_VariableDefs.h', 255, 255)}</p>
    ${math(String.raw`g=-\frac{\mathrm{ACV}_{\mathrm{set}}\,\mathrm{CF}}{V_{\max}\,10000},\qquad o=\operatorname{int32}\!\left[32767\left(1-\frac{\mathrm{DCV}_{\mathrm{set}}}{V_{\max}\,10000}\right)\right]`)}
    <p>上式整理的是所引設定分支；其他模式還可能套用頻率補償等流程。當 shadow 參數由狀態機載入後，ON 狀態才使用波形碼值 w 做 affine 運算：</p>
    ${codeBlock('Source/CPU_Timer_Module.c', 1236, 1238, String.raw`            scale  = sGB.OUTPUT_VARIABLES.WAVE_scale;
            offset = (float) sGB.OUTPUT_VARIABLES.WAVE_offset;
            sGB.OUTPUT_VARIABLES.WAVE_goal = (int32) (wave_value * scale + offset);`, '碼值先縮放、平移，再轉成 int32 目標')}
    ${math(String.raw`W_{\mathrm{goal}}[n]=\operatorname{int32}(g\,w[n]+o)`)}
    <p>L1236–1237 讀取目前已生效的參數；L1238 在乘加之後才轉成 int32。接著 ISR 把兩個 WAVE 補償偏移各自轉成 int32 再加入目標，得到 <code>WAVE_goal_shadow</code>，再呼叫 slew 處理；這些轉型位置也是數值行為的一部分。${src('Source/CPU_Timer_Module.c', 269, 271)} ${src('Source/CPU_Timer_Module.c', 1404, 1409)}</p>
    ${diagram('dac', 'CPU 產生波形目標並做 soft ramp；CLA 分別限制 WAVE、VREF，再合成輸出字。')}

    <h2 id="dds-slew">08｜Soft ramp 不是固定斜率限制器</h2>
    <p>名稱 <code>Calc_SlewRate_Process</code> 容易讓人預期每秒最多增加固定電壓，但所示 INT 路徑的演算法，是把「距離目標的剩餘差」乘一個係數 k，再保證非零小步進至少為 ±1 個碼值。只有 <code>WAVE_SLEWRATE_STATE</code> 進行此處理，<code>NO_SLEWRATE_STATE</code> 則直接複製目標。${src('Source/CPU_Timer_Module.c', 8424, 8456)}</p>
    ${codeBlock('Source/CPU_Timer_Module.c', 8437, 8448, String.raw`        step = ((float) sGB.OUTPUT_VARIABLES.WAVE_goal_shadow - (float) sGB.OUTPUT_VARIABLES.WAVE_set)* sGB.POWER_OUTPUT_SETTING_VARIABLES.V_SoftRamp_Step_set;

        if ((0 < step) && (step < 1.0))
        {
            step = 1.0;
        }
        else if ((-1.0 < step) && (step < 0))
        {
            step = -1.0;
        }

        sGB.OUTPUT_VARIABLES.WAVE_set = (int32) ((float) sGB.OUTPUT_VARIABLES.WAVE_set + step);`, '步進與剩餘誤差成比例，另有最小碼值步進')}
    <p>把目前值記為 W、補償後目標記為 G，則在不涉及最小步進與整數轉型的區間，${math(String.raw`W[n+1]=W[n]+k(G[n]-W[n])`, false)}。若目標固定且 0&lt;k&lt;1，誤差按 ${math(String.raw`(1-k)^n`, false)} 衰減；例如剩餘差 100、k=0.1，前幾步約為 10、9、8.1，而非每步都 10。這是帶條件的數學描述，沒有宣稱原碼已把所有 k 強制限制在該區間。</p>
    <p>若忽略最小步進，理論尾端時間常數為 ${math(String.raw`-T_u/\ln(1-k)`, false)}；改變更新率而 k 不變，每秒的爬升速度也會改變。實作最後再轉 int32，且 |step| 小於 1 的非零值被放大到 ±1，所以靠近目標時不是無限精度的指數漸近。CPU 在 ISR 尾端才把處理後 WAVE_set、VREF_set 與 DDS 一起寫入 CPU→CLA 共享變數。${src('Source/CPU_Timer_Module.c', 920, 924)}</p>

    <h2 id="dds-dac-word">09｜DAC 合成要保留型別與運算次序</h2>
    <p>CLA 先把 WAVE 限制在 0～65535；VREF 則先加上四個補償 offset，再按設定的高低界限限制並轉成 Uint16。正常編譯選項是 <code>TEST_WAVEOUT=NORMAL_WAVEOUT</code>，但執行期 <code>flag</code> 非零時仍會使用 Manual 值。下式僅描述 flag=0 的正常合成分支，不能代表手動輸出路徑。${src('Source/CLA_Task.cla', 52, 92)} ${src('Include/C28_Cla_Common.h', 161, 163)}</p>
    ${codeBlock('Source/CLA_Task.cla', 105, 108, String.raw`    uint16_t u16Offset = 0xFFFF - CLA_to_CPU_Variables.VREF_set_shadow;
    CLA_to_CPU_Variables.u16Offset = u16Offset;

    sC28CLA.u32MergeOut.word[0] = 0;`, '先由 VREF 建立 offset')}
    ${codeBlock('Source/CLA_Task.cla', 110, 118, String.raw` if(CPU_to_CLA_Variables.flag == 0){

    sC28CLA.u32MergeOut.word[1] = (uint16_t)(((uint32_t)CLA_to_CPU_Variables.WAVE_set_shadow
                                            * (uint32_t)(CLA_to_CPU_Variables.VREF_set_shadow - u16Offset))>>16)
                                            + u16Offset;

 }else{
     sC28CLA.u32MergeOut.word[1] = CPU_to_CLA_Variables.Manual;
 }`, '乘法、右移、截位、相加，或改走 Manual')}
    <p>逐步讀：L105 先算 O=65535−R；L112 將 WAVE 擴成 uint32_t；L113 在括號內先算 VREF−O，才轉 uint32_t，再做乘法與右移 16 位；結果先轉 uint16_t，最後才加 O 並寫到輸出 word。這不是把 WAVE 與 VREF 各自送一顆理想 DAC 的簡單模型，最終合成字會寫入 SPI TX buffer。${src('Source/CLA_Task.cla', 134, 135)}</p>
    <p><strong>帶範圍前提的實數近似。</strong>若 0≤W≤65535 且 32768≤R≤65535，則 B=R−O=2R−65535 為非負，W×B 也小於 2³²，這個區間可安全解釋為下式的整數截斷：</p>
    ${math(String.raw`O=65535-R,\qquad D=\left\lfloor\frac{W(2R-65535)}{65536}\right\rfloor+O\approx \frac{W}{65536}(2R-65535)+(65535-R)`)}
    <p>例如 R=65535 時，O=0，W=65535 得到 D=65534，因為右移對應除以 65536，並不是除以 65535。R=40000 時，O=25535，W=32768 則得到 floor(14465/2)+25535=32767。這些手算說明合成式的碼值中心與縮放，不是輸出伏特的校正公式。</p>
    <p>若 R&lt;32768，括號中的數學差為負，便不能直接使用上述 floor 模型。<code>Uint16</code> 的整數提升、C28／CLA 編譯模式的 int 寬度、轉成 uint32_t 的位置，以及 32-bit 無號乘法的模數行為都會影響結果：先在 16-bit unsigned 減法回繞，與先在較寬 signed 減法得到負值再轉 uint32_t，並非同一條數值路徑。此時應以目標型別與編譯器驗證，不能用 JavaScript 的一般浮點乘法冒充精確重播。輸出合成也只到 DAC 數位字為止；功率級的增益、負載響應與保護動作，仍須另外沿硬體與控制路徑分析。</p>
    <details><summary>閱讀練習：addr=4095、dec1=255 時，波形會接到哪裡？</summary><p>非方波的下一個位址是 (4095+1)&amp;0x0FFF=0；權重約為 1，內插結果接近 table[0]，再經 scale、offset、補償、soft ramp 與 CLA 合成。方波則直接走 duty 比較，沒有這個內插接縫。請再把 dec2 從 0 改成 4095：本拍內插值不變，但下一拍相位進位可能不同。</p></details>
  `
};
