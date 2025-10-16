import type { ThemeDefinition } from "./types";

const solstice: ThemeDefinition = {
  id: "solstice",
  tone: "light",
  nameKey: "settings.theme.names.solstice",
  descriptionKey: "settings.theme.descriptions.solstice",
  cssVars: {
    "--color-background": "#f7f1e8",
    "--color-surface": "#fffaf2",
    "--color-card": "#fbead7",
    "--color-accent": "#d97706",
    "--color-accent-strong": "#b45309",
    "--color-foreground": "#432f20",
    "--color-muted": "#8b7355",
  },
  preview: {
    background: "#f7f1e8",
    surface: "#fffaf2",
    card: "#fbead7",
    accent: "#d97706",
  },
};

export default solstice;
