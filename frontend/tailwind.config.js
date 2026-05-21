/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#050508",
        panel: "#0d0d12",
        surface: "#1a1a22",
        mist: "#6b7280",
        cyan: { DEFAULT: "#22d3ee", dim: "#0891b2", glow: "#67e8f9" },
        purple: { DEFAULT: "#a855f7", dim: "#7c3aed" },
      },
      boxShadow: {
        "glow-cyan": "0 0 24px rgb(34 211 238 / 0.35)",
        "glow-card": "0 8px 32px rgb(34 211 238 / 0.12)",
        "inner-glow": "inset 0 1px 0 rgb(34 211 238 / 0.2)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)",
        "gradient-header": "linear-gradient(90deg, #22d3ee, #6366f1, #a855f7)",
        "gradient-panel":
          "linear-gradient(180deg, rgb(13 13 18 / 0.95) 0%, rgb(5 5 8 / 0.98) 100%)",
      },
      animation: {
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "spin-slow": "spin 8s linear infinite",
        flow: "flow 1.5s ease-in-out infinite",
        throb: "throb 1.2s ease-in-out infinite",
      },
      keyframes: {
        flow: {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "1" },
        },
        throb: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.6" },
          "50%": { transform: "scale(1.15)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
