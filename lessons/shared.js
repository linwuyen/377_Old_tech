import katex from '../vendor/katex/katex.js';
import { diagramSVG, diagramInfo } from './diagrams.js';

export const revision='5262007b56d420c74ac892692ea4d3969a3e3992';
export const repository=`https://github.com/linwuyen/ASR5K_Old/blob/${revision}/ASR5K_28377/TRACE_ASR5000_F28377S/`;
export const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const src=(path,start,end,label)=>`<a class="source-link" href="${repository}${path}#L${start}-L${end}" target="_blank" rel="noopener noreferrer">${escapeHTML(label||path.split('/').pop())} · L${start}–${end} ↗</a>`;
export const sourceExcerpts=[];
export const equations=[];
export function math(latex,display=true){
  equations.push({latex,display});
  const rendered=katex.renderToString(latex,{displayMode:display,throwOnError:true,trust:false,strict:'error',output:'htmlAndMathml'});
  return display?`<div class="derived-equation" tabindex="0" aria-label="數學公式，可水平捲動">${rendered}</div>`:`<span class="inline-equation">${rendered}</span>`;
}
export function codeBlock(path,start,end,code,label='原碼節錄'){
  sourceExcerpts.push({path,start,end,code,label});
  const lines=code.replace(/\r\n/g,'\n').split('\n');
  return `<figure class="source-code"><figcaption><span>${escapeHTML(label)}</span>${src(path,start,end)}</figcaption><pre><code>${lines.map((line,i)=>`<span class="source-line" data-line="${start+i}">${escapeHTML(line)}</span>`).join('\n')}</code></pre></figure>`;
}
let figureCount=0;
export function diagram(name,caption){
  if(!diagramInfo[name])throw new Error(`Unknown diagram: ${name}`);
  const uid=`diagram-${name}-${++figureCount}`;
  return `<figure class="control-diagram" data-diagram="${name}"><div class="diagram-toolbar"><span>CONTROL MAP / ${escapeHTML(diagramInfo[name].title)}</span><button class="diagram-open" type="button" aria-label="放大${escapeHTML(diagramInfo[name].title)}方塊圖">放大檢視 ↗</button></div><div class="diagram-scroll" tabindex="0" aria-label="${escapeHTML(diagramInfo[name].title)}方塊圖，可水平捲動">${diagramSVG(name,uid)}</div><figcaption>${escapeHTML(caption||diagramInfo[name].description)}</figcaption></figure>`;
}
