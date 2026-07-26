/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          indigo: "#6366F1",
          violet: "#818CF8",
          cyan: "#22D3EE",
        },
      },
      fontFamily: {
        sans: ["PingFang SC", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
