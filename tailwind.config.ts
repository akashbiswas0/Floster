import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/ui-react/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg:        '#070a0f',
        panel:     '#0c1018',
        surface:   '#111720',
        'surface-hover': '#161e2a',
        'border-default': 'rgba(255,255,255,0.06)',
        'border-bright':  'rgba(255,255,255,0.12)',
        accent:    '#00d4ff',
        purple:    '#7c6aff',
        success:   '#00e5a0',
        warning:   '#ffb547',
        danger:    '#ff4e6a',
        'text-primary':   '#e8edf5',
        'text-secondary': '#8a97aa',
        'text-muted':     '#4a5568',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        ui:   ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
