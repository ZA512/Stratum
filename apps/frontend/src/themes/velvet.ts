import type { ThemeDefinition } from "./types";

const velvet: ThemeDefinition = {
  id: "velvet",
  tone: "dark",
  nameKey: "settings.theme.names.velvet",
  descriptionKey: "settings.theme.descriptions.velvet",
  cssVars: {
    "--color-background": "#161128",
    "--color-surface": "#1f1733",
    "--color-card": "#2a1f46",
    "--color-accent": "#a855f7",
    "--color-accent-strong": "#7c3aed",
    "--color-foreground": "#f5f2ff",
    "--color-muted": "#b8a1d9",
  },
  preview: {
    background: "#161128",
    surface: "#1f1733",
    card: "#2a1f46",
    accent: "#a855f7",
  },
};

export default velvet;
