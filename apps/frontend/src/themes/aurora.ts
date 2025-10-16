import type { ThemeDefinition } from "./types";

const aurora: ThemeDefinition = {
  id: "aurora",
  tone: "light",
  nameKey: "settings.theme.names.aurora",
  descriptionKey: "settings.theme.descriptions.aurora",
  cssVars: {
    "--color-background": "#f5f7fb",
    "--color-surface": "#ffffff",
    "--color-card": "#eef2ff",
    "--color-accent": "#2563eb",
    "--color-accent-strong": "#1d4ed8",
    "--color-foreground": "#1f2937",
    "--color-muted": "#64748b",
  },
  preview: {
    background: "#f5f7fb",
    surface: "#ffffff",
    card: "#eef2ff",
    accent: "#2563eb",
  },
};

export default aurora;
