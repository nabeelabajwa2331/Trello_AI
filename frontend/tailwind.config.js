/** Crewboard "Paper & Pencil" palette. Colours are named by role; values live in src/index.css. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        column: token('column'),
        ink: token('ink'),
        muted: token('muted'),
        line: token('line'),
        accent: token('accent'),
        'accent-soft': token('accent-soft'),
        'on-accent': token('on-accent'),
        focus: token('focus'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        chart: token('chart'),
        soon: { DEFAULT: token('soon-bg'), fg: token('soon-fg') },
        over: { DEFAULT: token('over-bg'), fg: token('over-fg') },
        done: { DEFAULT: token('done-bg'), fg: token('done-fg') },
      },
      fontFamily: {
        display: ['Archivo', '"Arial Narrow"', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Consolas', 'monospace'],
        hand: ['Caveat', '"Segoe Print"', 'cursive'],
      },
      borderRadius: {
        card: '8px',
        col: '10px',
        modal: '12px',
      },
      boxShadow: {
        card: '0 1px 0 rgb(var(--line))',
        pop: '0 12px 32px -12px rgb(42 41 38 / 0.35)',
        hard: '4px 4px 0 rgb(var(--ink))',
        hover: '0 4px 14px -6px rgb(42 41 38 / 0.35)',
        lift: '0 18px 30px -10px rgb(42 41 38 / 0.45)',
      },
      /* Card motion only: drag tilt/lift and the highlight after a teammate's change. */
      keyframes: {
        flash: { '0%': { backgroundColor: 'rgb(var(--accent-soft))' }, '100%': {} },
      },
      animation: {
        flash: 'flash 1.2s ease-out',
      },
    },
  },
  plugins: [],
};
