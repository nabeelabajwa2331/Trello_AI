export type TemplateId = 'blank' | 'class' | 'hackathon';

export const TEMPLATES: Record<TemplateId, { title: string; isDone?: boolean; cards: string[] }[]> = {
  blank: [
    { title: 'To do', cards: [] },
    { title: 'Doing', cards: [] },
    { title: 'Done', isDone: true, cards: [] },
  ],
  class: [
    { title: 'To do', cards: ['Read the assignment brief together', 'Split the work and assign owners'] },
    { title: 'Doing', cards: [] },
    { title: 'Review', cards: [] },
    { title: 'Done', isDone: true, cards: [] },
  ],
  hackathon: [
    { title: 'Ideas', cards: ['Brainstorm 3 problem statements'] },
    { title: 'Building', cards: [] },
    { title: 'Demo prep', cards: ['Record a 2-minute demo video'] },
    { title: 'Done', isDone: true, cards: [] },
  ],
};

export const COVERS = ['#2A2926', '#F4C430', '#8A8378', '#5E7D57', '#A8574A', '#4F6C86', '#C9B99A'];
