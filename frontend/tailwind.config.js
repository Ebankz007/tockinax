/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // TOCKINAX brand system — premium dark fintech (Binance-adjacent).
        // Gold scale keeps the legacy `brand-*` classes working (remapped to gold).
        brand: {
          50: '#FEF9E7',
          100: '#FCF0C3',
          200: '#F9E08A',
          300: '#F6CF4D',
          400: '#F3C11F',
          500: '#F0B90B',
          600: '#D9A50A',
          700: '#B88908',
          800: '#7A5C03',
          900: '#4A3802',
        },
        ink: '#0B0E11', // page background
        coal: '#12161B', // raised band (footer, nav)
        surface: '#181A20', // card background
        surface2: '#22262E', // inset / hover
        edge: '#2B313A', // explicit card border
        gold: '#F0B90B', // primary CTA / accent
        goldhover: '#FCD535', // CTA hover
        golddeep: '#C99406',
        success: '#0ECB81',
        danger: '#F6465D',
        mist: '#848E9C', // secondary text
        bright: '#EAECEF', // primary text
        line: '#E5E7EB', // borders (used at low opacity on dark)
      },
      fontFamily: {
        // One family for both display and body — Plus Jakarta Sans.
        display: ['var(--font-body)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        gold: '0 8px 24px -8px rgba(240, 185, 11, 0.45)',
      },
    },
  },
  plugins: [],
};
