import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        group: {
          nogizaka: "#7b5ea7",
          sakurazaka: "#ff6bb5",
          hinatazaka: "#79d8ff",
          akb: "#ff91b8",
          ske: "#ff8f2b",
          nmb: "#ffd84a",
          hkt: "#ff4f4f",
          stu: "#233a7d"
        }
      },
      boxShadow: {
        glow: "0 10px 30px rgba(34, 88, 184, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
