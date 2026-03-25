/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App/**/*.html", "./App/**/*.js"],
  theme: {
    extend: {
      colors: {
        'bg-primary':        '#0d1117',
        'bg-secondary':      '#161b22',
        'bg-tertiary':       '#21262d',
        'bg-elevated':       '#1c2128',
        'bg-hover':          '#30363d',
        'accent-primary':    '#00d4aa',
        'accent-secondary':  '#7c3aed',
        'text-primary':      '#f0f6fc',
        'text-secondary':    '#8b949e',
        'text-muted':        '#6e7681',
        'border-color':      '#30363d',
        'border-subtle':     '#21262d',
        'color-success':     '#3fb950',
        'color-danger':      '#f85149',
        'color-warning':     '#d29922',
        'color-info':        '#58a6ff',
      },
      borderRadius: {
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'monospace'],
      },
      transitionDuration: {
        'fast': '150ms',
        'base': '250ms',
        'slow': '350ms',
      },
    },
  },
  plugins: [],
}
