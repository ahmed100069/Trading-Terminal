/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#132238",
        sand: "#f4ebda",
        mist: "#edf7f0",
        leaf: "#0f8a71",
        ruby: "#dc2626",
        clay: "#8f5333",
        night: "#0b1524",
        crimson: "#ef4444",
        sage: "#f0fdf4",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
      },
      boxShadow: {
        soft: "0 24px 60px rgba(10, 21, 36, 0.12)",
      },
      borderRadius: {
        xl2: "1.5rem",
      },
    },
  },
  plugins: [],
};
