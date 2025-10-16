import type { ThemeDefinition } from "./types";

const midnight: ThemeDefinition = {
  id: "midnight",
  tone: "dark",
  nameKey: "settings.theme.names.midnight",
  descriptionKey: "settings.theme.descriptions.midnight",
  cssVars: {
    "--color-background": "15 23 42",
    "--color-surface": "17 24 39",
    "--color-card": "31 41 55",
    "--color-input": "24 35 56",
    "--color-border": "37 50 74",
    "--color-accent": "34 211 238",
    "--color-accent-strong": "6 182 212",
    "--color-foreground": "248 250 252",
    "--color-muted": "148 163 184",
  },
  preview: {
    background: "#0f172a",
    surface: "#111827",
    card: "#1f2937",
    accent: "#22d3ee",
  },
};

export default midnight;
