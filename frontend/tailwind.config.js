/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // ── Luxury palette ────────────────────────────────────────────────────
        navy: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#1e1b4b",
          900: "#0f0e2a",
          950: "#080716",
        },
        gold: {
          50:  "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#f5c842",  // champagne accent
          500: "#d4a843",  // warm gold — primary accent
          600: "#b8860b",  // dark goldenrod
          700: "#92400e",
          800: "#78350f",
          900: "#451a03",
        },
        surface: {
          DEFAULT: "#12112a",  // card background
          hover:   "#1a1935",
          border:  "#2a2750",
        },
      },
      fontFamily: {
        serif: ["Cormorant Garamond", "Playfair Display", "Georgia", "serif"],
        sans:  ["DM Sans", "Outfit", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "luxury-gradient": "linear-gradient(135deg, #0f0e2a 0%, #1a183d 50%, #0d1b2a 100%)",
        "gold-gradient":   "linear-gradient(135deg, #d4a843 0%, #f5c842 50%, #d4a843 100%)",
        "card-glass":      "linear-gradient(135deg, rgba(26,25,53,0.8) 0%, rgba(18,17,42,0.9) 100%)",
      },
      boxShadow: {
        "luxury": "0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(212,168,67,0.15)",
        "gold":   "0 0 20px rgba(212,168,67,0.3)",
        "card":   "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      animation: {
        "fade-in":    "fadeIn 0.4s ease-out",
        "slide-up":   "slideUp 0.3s ease-out",
        "pulse-gold": "pulseGold 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGold: {
          "0%, 100%": { boxShadow: "0 0 8px rgba(212,168,67,0.4)" },
          "50%":       { boxShadow: "0 0 24px rgba(212,168,67,0.8)" },
        },
      },
    },
  },
  plugins: [],
};
