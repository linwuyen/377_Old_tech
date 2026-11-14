const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const diagramInfo={
  feedback:{title:'多速率回授迴路',description:'CPU 產生波形基值，CLA 限幅及 SPI DAC 輸出；ADC 校正及量測統計交給前景選擇 CV、CC 或 CP 更新，已保存的偏移仍可能一起回到輸出路徑。外部硬體方塊僅示意邊界，未辨識其傳遞函數。'},
  measurement:{title:'電流重建的三條支路',description:'分段校正取得 V_FB 與 I_shunt，再減去電阻與電容模型電流。電容支路包含一次差分與 Cs_mpy_360000 係數。'},
  pi:{title:'PI 與上一拍飽和閘門',description:'誤差經 Kp 分流為比例與 Ki 積分支路，相加並限幅。上一拍的限幅前後輸出是否相等，決定本拍積分是否更新。'},
  filter:{title:'一階 IIR 的延遲狀態',description:'本拍及前拍輸入相加後乘 C1，再加上前拍輸出乘 D1，得到新輸出。兩個 z 負一次方分別代表一拍輸入與輸出記憶。'},
  dds:{title:'相位累加與波表內插',description:'頻率轉相位步進，32位累加器回繞，分出12位址與8位內插小數，查兩個表點後內插。方波另走 duty 比較路徑。'},
  dac:{title:'從波形目標到 DAC 碼',description:'WAVE 目標經補償與 SoftRamp，再受 CLA 限幅；VREF 基值與四個補償加總並限幅。兩者合成輸出字，或以 Manual 選路徑。'}
};
export function diagramSVG(name,uid=`svg-${name}`){
  const info=diagramInfo[name];if(!info)throw new Error(`Unknown diagram ${name}`);
  const ink='#304950',green='#397966',orange='#c76a43',muted='#7e9397';
  const text=(x,y,label,{size=17,fill=ink,anchor='middle',weight=400}={})=>`<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${fill}" font-weight="${weight}">${esc(label)}</text>`;
  const box=(x,y,w,h,title,sub='',kind='normal')=>`<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${kind==='state'?'#fcf0e8':kind==='external'?'#f8faf8':'#edf4ee'}" stroke="${kind==='state'?orange:kind==='external'?muted:'#9bb7a8'}" ${kind==='external'?'stroke-dasharray="6 4"':''}/>${text(x+w/2,y+h/2-(sub?5:-6),title,{size:17,weight:500})}${sub?text(x+w/2,y+h/2+20,sub,{size:13,fill:muted}):''}</g>`;
  const line=(points,{color=green,label='',lx,ly,dash=false,arrow=true}={})=>`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2" ${dash?'stroke-dasharray="6 4"':''} ${arrow?`marker-end="url(#${uid}-${color===orange?'orange':'green'})"`:''}/>${label?text(lx,ly,label,{size:14,fill:color}):''}`;
  const dot=(x,y)=>`<circle cx="${x}" cy="${y}" r="4" fill="${green}"/>`;
  const sum=(x,y)=>`<circle cx="${x}" cy="${y}" r="23" fill="#fff" stroke="${green}" stroke-width="2"/>${text(x,y+7,'Σ',{size:23})}`;
  let shape='',w=960,h=480;
  if(name==='feedback'){
    h=480;
    shape=text(20,32,'CPU 參考值與快速輸出路徑',{anchor:'start',size:14,fill:muted})+
      box(20,70,160,82,'使用者設定','目標 / 模式 / 頻率')+box(210,70,160,82,'DDS / 狀態機','WAVE、VREF 基值')+box(400,70,160,82,'疊加補償','WAVE / VREF 偏移')+box(590,70,160,82,'CLA → SPI DAC','加總、限幅、合成')+box(790,70,150,82,'外部功率級','硬體模型未辨識','external')+
      line([[180,111],[210,111]])+line([[370,111],[400,111]])+line([[560,111],[590,111]])+line([[750,111],[790,111]])+
      box(790,275,150,82,'ADS8353','外部取樣','external')+box(545,275,180,82,'CLA 校正 / 重建','V_FB、I_FB')+box(285,275,195,82,'量測窗口 / 統計','平均、RMS、有功功率')+box(20,275,200,82,'選擇 CV / CC / CP','每回合選一模式更新')+
      line([[865,152],[865,275]],{label:'輸出與感測',lx:795,ly:218})+line([[790,316],[725,316]])+line([[545,316],[480,316]])+line([[285,316],[220,316]],{label:'回授',lx:252,ly:301})+
      line([[100,152],[100,275]],{color:orange,dash:true,label:'參考 r',lx:135,ly:218})+
      line([[120,357],[120,416],[500,416],[500,152]],{color:orange,label:'保存的偏移仍參與 WAVE / VREF 加總',lx:340,ly:453})+
      text(545,248,'較慢的量測與前景補償路徑',{anchor:'start',size:14,fill:muted});
  }else if(name==='pi'){
    h=505;
    shape=text(26,166,'e[n]',{anchor:'start'})+box(100,121,125,78,'Kp','P[n] = Kp e[n]')+line([[70,160],[100,160]])+line([[225,160],[667,160]],{label:'比例直通 P[n]',lx:450,ly:143})+dot(255,160)+sum(690,160)+box(765,121,160,78,'clamp','OutMin ～ OutMax')+line([[713,160],[765,160]],{label:'u*',lx:738,ly:143})+line([[925,160],[953,160]],{label:'u[n]',lx:938,ly:110})+
      box(285,267,125,78,'Ki','Ki × P[n]')+box(455,260,200,92,'積分狀態 I[n]','g=1 累加；g=0 保持','state')+
      line([[255,160],[255,306],[285,306]])+line([[410,306],[455,306]])+line([[655,306],[690,306],[690,183]],{label:'I[n]',lx:727,ly:273})+
      box(740,399,185,76,'記住 u 與 u*','z⁻¹：一次 PI 呼叫','state')+box(455,399,200,76,'上一拍相等？','g[n] = 1 或 0','state')+
      line([[938,160],[938,437],[925,437]],{color:orange})+line([[736,160],[736,361],[830,361],[830,399]],{color:orange})+line([[740,437],[655,437]],{color:orange})+line([[555,399],[555,352]],{color:orange,label:'更新閘門 g[n]',lx:635,ly:383})+text(20,32,'含飽和時：帶狀態的非線性遞迴；不是單一線性傳遞函數',{anchor:'start',size:14,fill:muted});
  }else if(name==='measurement'){
    h=450;
    shape=box(20,65,160,80,'ADC CHA','電壓原始碼')+box(220,65,200,80,'offset ＋ 正負斜率','校正後 v[n]')+line([[180,105],[220,105]])+line([[420,105],[530,105]])+dot(465,105)+box(530,65,195,80,'× inv_Rs','i_R = v / R')+
      box(500,190,225,88,'本次減前次電壓','× Cs_mpy_360000','state')+line([[465,105],[465,234],[500,234]])+
      box(20,300,160,80,'ADC CHB','分流電流原始碼')+box(220,300,200,80,'offset ＋ 正負斜率','i_shunt[n]')+line([[180,340],[220,340]])+line([[420,340],[787,340]],{label:'＋ i_shunt',lx:530,ly:323})+sum(810,340)+line([[833,340],[932,340]],{label:'i_FB[n]',lx:891,ly:320})+
      line([[725,105],[810,105],[810,317]],{label:'− i_R',lx:853,ly:230})+line([[725,234],[760,234],[760,390],[810,390],[810,363]],{label:'− i_C',lx:705,ly:414})+
      text(20,32,'差分時間基準必須對應 V_FB 的實際更新率',{anchor:'start',size:14,fill:muted});
  }else if(name==='filter'){
    w=900;h=425;
    shape=text(35,106,'x[n]')+line([[65,100],[337,100]])+dot(140,100)+sum(360,100)+box(180,206,135,74,'z⁻¹','x[n−1]','state')+line([[140,100],[140,243],[180,243]])+line([[315,243],[360,243],[360,123]])+
      box(425,63,135,74,'× C1','前饋係數')+line([[383,100],[425,100]])+sum(650,100)+line([[560,100],[627,100]])+line([[673,100],[860,100]],{label:'y[n]',lx:834,ly:78})+dot(815,100)+
      box(660,275,135,74,'z⁻¹','y[n−1]','state')+box(460,275,135,74,'× D1','回授係數')+line([[815,100],[815,312],[795,312]])+line([[660,312],[595,312]])+line([[460,312],[400,312],[400,183],[650,183],[650,123]],{label:'＋ D1 y[n−1]',lx:515,ly:174})+
      text(335,153,'＋',{size:15})+text(20,32,'y[n] = C1 (x[n] + x[n−1]) + D1 y[n−1]',{anchor:'start',size:17})+text(20,395,'先用舊狀態求出新 y，再保存 x；一拍 = 此濾波器的一次實際執行。',{anchor:'start',size:14,fill:muted});
  }else if(name==='dds'){
    h=510;
    shape=box(20,65,145,80,'設定頻率','Hz')+box(205,65,170,80,'轉成 FreqStep','Uint32 截斷')+box(415,65,200,80,'32-bit 相位累加','mod 2³²')+box(665,65,270,80,'分割相位位元','addr 12 / dec1 8 / dec2 12')+
      line([[165,105],[205,105]])+line([[375,105],[415,105]])+line([[615,105],[665,105]])+
      box(340,255,230,84,'查兩個波表值','T[k]、T[(k+1) & 4095]')+box(625,255,255,84,'線性內插','T[k] + ΔT × α')+
      line([[710,145],[710,192],[455,192],[455,255]],{label:'addr → k',lx:555,ly:218})+line([[800,145],[800,255]],{label:'α = dec1 / 255',lx:860,ly:215})+line([[570,297],[625,297]])+line([[880,297],[935,297]],{label:'wave_value',lx:880,ly:370})+
      box(65,400,235,74,'方波 duty 比較','addr ≤ duty ? ＋32767 : −32767')+line([[685,145],[685,168],[40,168],[40,437],[65,437]],{color:orange,dash:true})+line([[300,437],[935,437],[935,297]],{color:orange,label:'方波支路：略過波表內插',lx:635,ly:461})+
      text(20,32,'相位解析度、波表位址與內插解析度是三個不同概念',{anchor:'start',size:14,fill:muted});
  }else if(name==='dac'){
    h=520;
    shape=box(20,60,160,78,'wave_value','有號波形值')+box(220,60,180,78,'× scale ＋ offset','WAVE_goal')+box(440,60,180,78,'疊加 WAVE 補償','goal 含模式相關偏移')+box(665,60,255,78,'SoftRamp → WAVE_set','差值相關步進；不是固定斜率')+
      line([[180,99],[220,99]])+line([[400,99],[440,99]])+line([[620,99],[665,99]])+
      box(665,215,255,78,'CLA WAVE clamp','0 ～ 65535')+line([[792,138],[792,215]])+
      box(20,215,180,78,'VREF 基值','＋ offset 0 / 1 / 2 / 3')+box(260,215,225,78,'CLA VREF clamp','VREF_set_limit_Low / High')+line([[200,254],[260,254]])+
      box(350,390,260,86,'正常分支整數合成','WAVE、VREF → DAC word')+line([[792,293],[792,355],[525,355],[525,390]])+line([[372,293],[372,390]])+line([[610,433],[935,433]],{label:'SPI DAC',lx:880,ly:414})+
      box(20,390,230,86,'Manual 選路徑','runtime flag ≠ 0 時覆蓋','state')+line([[250,433],[280,433],[280,493],[935,493],[935,433]],{color:orange,dash:true})+
      text(20,32,'PI 的自身限幅與 CLA 的最終限幅，是不同層級',{anchor:'start',size:14,fill:muted});
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${uid}-title ${uid}-desc" class="control-svg"><title id="${uid}-title">${esc(info.title)}</title><desc id="${uid}-desc">${esc(info.description)}</desc><defs><marker id="${uid}-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${green}"/></marker><marker id="${uid}-orange" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${orange}"/></marker></defs><g font-family="Noto Sans TC,system-ui,sans-serif">${shape}</g></svg>`;
}
