/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          indigo: "#4F46E5",
          violet: "#6366F1",
          cyan: "#06B6D4",
        },
      },
      fontFamily: {
        sans: ["PingFang SC", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
