/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // TOCKINAX brand system — premium dark fintech
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
        ink: '#0B0E11', // Deep Black backgrounds
        coal: '#12161B', // raised dark panel
        surface: '#1F2329', // Dark Gray surfaces
        surface2: '#2B3139', // hover / inset surfaces
        gold: '#F0B90B', // TOCKINAX Yellow — primary CTA / accents
        goldhover: '#FCD535', // Gold hover — primary CTA hover state
        success: '#0ECB81', // Success green — success / completed states
        golddeep: '#C99406',
        mist: '#6D7B8D', // Slate secondary text
        line: '#E5E7EB', // Light — borders (used at low opacity on dark)
      },
      fontFamily: {
        display: ['var(--font-display)', 'Montserrat', 'Sora', 'sans-serif'],
        sans: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
