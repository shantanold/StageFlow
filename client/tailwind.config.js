/** @type {import('tailwindcss').Config} */
// Direction B2 tokens. Keep in sync with the CSS variables in src/index.css
// (pages mostly style through those) and the iOS app's Theme.swift.
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#701EB8",       // app icon purple: buttons, links, active nav, focus
        plum: "#5E2391",        // header band
        ink: {
          DEFAULT: "#24123A",   // primary text, filter chip (selected), tab bar
          secondary: "#6B5A80", // secondary text on light surfaces
        },
        "on-band": "#DCC8F2",   // secondary text on the plum band
        lilac: "#F6F0FC",       // pale brand tint: tiles, thumbnails, soft buttons
        mist: "#FAF8FC",        // page ground under the sheet
        hairline: "#EBE3F3",    // card borders, row dividers
        field: "#DDD2EA",       // text field borders
        status: {
          green: "#27985A",
          teal: "#1490A8",
          orange: "#D98A12",
          red: "#D63B2E",
          gray: "#8A8199",
        },
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", "Figtree", "system-ui", "sans-serif"],
        sans: ["Figtree", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        sheet: "28px",
        card: "20px",
        field: "14px",
        button: "16px",
      },
      borderColor: {
        DEFAULT: "#EBE3F3",
      },
    },
  },
  plugins: [],
};
