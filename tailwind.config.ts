import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--bg))',
        foreground: 'hsl(var(--fg))',
        'foreground-muted': 'hsl(var(--fg-muted))',
        accent: 'hsl(var(--accent))',
        card: 'hsl(var(--card-bg))',
        'card-border': 'hsl(var(--card-border))',
      },
    },
  },
  plugins: [],
}

export default config

