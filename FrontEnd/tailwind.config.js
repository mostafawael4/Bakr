/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          page: '#EDEBE6',
          surface: '#FFFFFF',
          heading: '#2A2520',
          nav: '#7A7268',
          caption: '#C8C4BC',
          border: '#D8D4CC',
          interactive: '#3A342C',
          'interactive-hover': '#2A2520',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
