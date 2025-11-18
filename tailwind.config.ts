import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        dayglo: {
          pink: "#FF00FF",
          lime: "#CCFF00",
          cyan: "#00FFFF",
          yellow: "#FFEA00",
          orange: "#FF5500",
          void: "#050505",
        },
        paper: "#FFFDF5",
      },
      boxShadow: {
        hard: "4px 4px 0px 0px #050505",
        "hard-sm": "2px 2px 0px 0px #050505",
        "hard-lg": "8px 8px 0px 0px #050505",
      },
    },
  },
  plugins: [],
} satisfies Config;
