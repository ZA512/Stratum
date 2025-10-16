import type { ThemeDefinition } from "./types";

const velvet: ThemeDefinition = {
  id: "velvet",
  tone: "dark",
  nameKey: "settings.theme.names.velvet",
  descriptionKey: "settings.theme.descriptions.velvet",
  cssVars: {
    "--color-background": "22 17 40",
    "--color-surface": "31 23 51",
    "--color-card": "42 31 70",
    "--color-input": "36 27 61",
    "--color-border": "59 45 105",
    "--color-accent": "168 85 247",
    "--color-accent-strong": "124 58 237",
    "--color-foreground": "245 242 255",
    "--color-muted": "184 161 217",
  },
  preview: {
    background: "#161128",
    surface: "#1f1733",
    card: "#2a1f46",
    accent: "#a855f7",
  },
};

export default velvet;
