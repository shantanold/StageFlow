/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // App background layers (matches prototype CSS vars)
        deep: "#0a0f1a",       // --bg-deep
        card: {
          DEFAULT: "#111827",  // --bg-card
          hover: "#1a2236",    // --bg-card-hover
        },
        surface: "#1e293b",    // --bg-surface
        "input-bg": "#0f172a", // --bg-input
      },
      fontFamily: {
        sans: ["DM Sans", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderColor: {
        DEFAULT: "rgba(148, 163, 184, 0.12)", // --border
        focus: "rgba(99, 179, 237, 0.4)",     // --border-focus
      },
    },
  },
  plugins: [],
};
