import type { LabelId } from '../types';

/** Eight fixed label colours, muted to sit on beige paper, with dark-mode pairs. */
export const LABELS: Record<LabelId, { name: string; className: string; dot: string }> = {
  research: { name: 'Research', className: 'bg-[#DCE3EA] text-[#3D5A75] dark:bg-[#26313B] dark:text-[#A9C1D8]', dot: '#4F6C86' },
  design: { name: 'Design', className: 'bg-[#E6DDE8] text-[#6A4C73] dark:bg-[#352B38] dark:text-[#D2B9D9]', dot: '#7D6688' },
  bug: { name: 'Bug', className: 'bg-[#F0D9D4] text-[#9A3B2E] dark:bg-[#4A2622] dark:text-[#F0A89C]', dot: '#B8443A' },
  docs: { name: 'Docs', className: 'bg-[#DCE5D6] text-[#46663E] dark:bg-[#2A3A27] dark:text-[#A9CFA0]', dot: '#5E7D57' },
  urgent: { name: 'Urgent', className: 'bg-[#F7E3A8] text-[#6E5200] dark:bg-[#4A3E14] dark:text-[#F4D27A]', dot: '#F4C430' },
  backend: { name: 'Backend', className: 'bg-[#D9E4E2] text-[#3B6460] dark:bg-[#243634] dark:text-[#A3CCC6]', dot: '#4C7A75' },
  slides: { name: 'Slides', className: 'bg-[#EFDCCB] text-[#8A4F24] dark:bg-[#43301F] dark:text-[#E9B98F]', dot: '#A8642F' },
  misc: { name: 'Misc', className: 'bg-[#E2DFD8] text-[#55524B] dark:bg-[#33322E] dark:text-[#C9C4B8]', dot: '#8A8378' },
};

export const LABEL_IDS = Object.keys(LABELS) as LabelId[];
