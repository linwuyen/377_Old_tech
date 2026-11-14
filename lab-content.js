import { renderLabGuide } from './lab-guide.js';
import { renderFrequencyGuide } from './frequency-guide.js';
import { renderDelayGuide } from './delay-guide.js';

// Reuse one rendering for search and page navigation, keeping section IDs stable
// when the reader leaves the lab and returns through a search result.
export const labGuideParts = Object.freeze([
  { key: 'time', number: 'LAB · 01–05', title: 'PI 實驗室｜閉迴路、階躍與飽和恢復',
    summary: '一階被控體、ZOH、Ki/Ts、原碼積分閘門與時域指標。', html: renderLabGuide() },
  { key: 'frequency', number: 'LAB · 06–10', title: 'PI 實驗室｜Bode、相位裕度與極點',
    summary: '交越、半功率頻寬、Jury 穩定條件及頻域／階躍對照。', html: renderFrequencyGuide() },
  { key: 'delay', number: 'LAB · 11–15', title: 'PI 實驗室｜控制延遲與量測低通',
    summary: '延遲佇列、預扭曲、Hy/Hm、原碼發布順序與量測雜訊。', html: renderDelayGuide() },
]);
