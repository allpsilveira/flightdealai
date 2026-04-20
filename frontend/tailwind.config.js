/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Brand orange ──────────────────────────────────────────────────────
        brand: {
          50:  "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f26419",  // primary
          600: "#ea580c",  // hover
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },
        // ── Warm sand (beige) — light mode surfaces ───────────────────────────
        sand: {
          50:  "#faf8f5",
          100: "#f5f0e8",
          200: "#ede5d8",
          300: "#e0d4c0",
          400: "#c9b99a",
        },
        // ── Champagne / gold — luxury accent ────────────────────────────────
        // Used pervasively as the brand-replacement accent. MUST be registered
        // here so tailwind compiles `text-champagne`, `bg-champagne/15`, etc.
        champagne: {
          DEFAULT: "#d4b483",
          50:  "#fbf6ec",
          100: "#f5ead2",
          200: "#ebd5a4",
          300: "#dfbe75",
          400: "#d4b483",
          500: "#c9a55f",
          600: "#a8854c",
          700: "#7e6238",
          800: "#544127",
          900: "#2c2113",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        "card-light": "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
        "card-dark":  "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
        "brand":      "0 4px 14px rgba(242,100,25,0.35)",
      },
      animation: {
        "fade-in":       "fadeIn 0.3s ease-out",
        "slide-up":      "slideUp 0.25s ease-out",
        "slide-right":   "slideRight 0.3s ease-out",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "pulse-brand":   "pulseBrand 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideRight: {
          "0%":   { opacity: "0", transform: "translateX(100%)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInLeft: {
          "0%":   { opacity: "0", transform: "translateX(-100%)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        pulseBrand: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(242,100,25,0.3)" },
          "50%":      { boxShadow: "0 0 0 6px rgba(242,100,25,0)" },
        },
      },
    },
  },
  plugins: [],
};
