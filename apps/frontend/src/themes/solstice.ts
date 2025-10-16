import type { ThemeDefinition } from "./types";

const solstice: ThemeDefinition = {
  id: "solstice",
  tone: "light",
  nameKey: "settings.theme.names.solstice",
  descriptionKey: "settings.theme.descriptions.solstice",
  cssVars: {
    "--color-background": "247 241 232",
    "--color-surface": "255 250 242",
    "--color-card": "251 234 215",
    "--color-input": "255 241 224",
    "--color-border": "234 215 192",
    "--color-accent": "217 119 6",
    "--color-accent-strong": "180 83 9",
    "--color-foreground": "67 47 32",
    "--color-muted": "139 115 85",
  },
  preview: {
    background: "#f7f1e8",
    surface: "#fffaf2",
    card: "#fbead7",
    accent: "#d97706",
  },
};

export default solstice;
