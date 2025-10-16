import type { ThemeDefinition } from "./types";

const midnight: ThemeDefinition = {
  id: "midnight",
  tone: "dark",
  nameKey: "settings.theme.names.midnight",
  descriptionKey: "settings.theme.descriptions.midnight",
  cssVars: {
    "--color-background": "#0f172a",
    "--color-surface": "#111827",
    "--color-card": "#1f2937",
    "--color-accent": "#22d3ee",
    "--color-accent-strong": "#06b6d4",
    "--color-foreground": "#f8fafc",
    "--color-muted": "#94a3b8",
  },
  preview: {
    background: "#0f172a",
    surface: "#111827",
    card: "#1f2937",
    accent: "#22d3ee",
  },
};

export default midnight;
