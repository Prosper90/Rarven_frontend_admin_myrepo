import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        raven: {
          black:         '#000000',
          's1':          '#0a0a0a',
          's2':          '#111111',
          's3':          '#1a1a1a',
          'warm':        '#130b06',
          'warm-border': '#2a1409',
          primary:       '#ff500b',
          'primary-dim': '#cc4009',
          'primary-dark':'#1a0800',
          text:          '#f0f0f0',
          muted:         '#888888',
          faint:         '#444444',
          border:        '#1f1f1f',
        },
      },
      boxShadow: {
        'glow-sm':  '0 0 12px rgba(255, 80, 11, 0.20)',
        'glow':     '0 0 24px rgba(255, 80, 11, 0.25)',
        'glow-lg':  '0 0 48px rgba(255, 80, 11, 0.30)',
      },
      backgroundImage: {
        'card-warm': 'linear-gradient(135deg, #111111 0%, #1a0a04 100%)',
        'card-hot':  'linear-gradient(135deg, #1a0800 0%, #2a1000 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
