/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ["Frutiger", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
  safelist: [
    'bg-pink-400',
    'bg-yellow-400',
    'bg-purple-400',
    'print:bg-white',
    'print:text-black',
    'print:block',
    'print:hidden',
  ],
}