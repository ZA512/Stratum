import type { Config } from "tailwindcss";

const themeColors = {
  background: "rgb(var(--color-background) / <alpha-value>)",
  surface: "rgb(var(--color-surface) / <alpha-value>)",
  card: "rgb(var(--color-card) / <alpha-value>)",
  elevated: "rgb(var(--color-elevated) / <alpha-value>)",
  input: "rgb(var(--color-input) / <alpha-value>)",
  border: "rgb(var(--color-border) / <alpha-value>)",
  accent: "rgb(var(--color-accent) / <alpha-value>)",
  accentStrong: "rgb(var(--color-accent-strong) / <alpha-value>)",
  foreground: "rgb(var(--color-foreground) / <alpha-value>)",
  muted: "rgb(var(--color-muted) / <alpha-value>)",
};

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#3B82F6",
          hover: "#2563EB",
        },
        ...themeColors,
      },
      borderColor: {
        DEFAULT: themeColors.border,
        border: themeColors.border,
        subtle: "rgb(var(--color-border-subtle) / <alpha-value>)",
        strong: "rgb(var(--color-border-strong) / <alpha-value>)",
      },
      ringColor: {
        accent: themeColors.accent,
        accentStrong: themeColors.accentStrong,
      },
    },
  },
  plugins: [],
};

export default config;
