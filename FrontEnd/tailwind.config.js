/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#DAA520',
          hover: '#c4911a',
        },
        bg: {
          primary: '#131317',
          secondary: '#1B1B1F',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#A1A1AA',
        },
        border: {
          DEFAULT: '#3F3F46',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
