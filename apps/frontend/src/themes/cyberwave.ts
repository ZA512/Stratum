import type { ThemeDefinition } from "./types";

const cyberwave: ThemeDefinition = {
  id: "cyberwave",
  tone: "dark",
  nameKey: "settings.theme.names.cyberwave",
  descriptionKey: "settings.theme.descriptions.cyberwave",
  cssVars: {
    "--color-background": "5 1 15",
    "--color-surface": "11 2 32",
    "--color-card": "22 6 58",
    "--color-input": "27 12 76",
    "--color-border": "45 20 113",
    "--color-accent": "247 37 133",
    "--color-accent-strong": "255 77 190",
    "--color-foreground": "244 243 255",
    "--color-muted": "157 140 255",
  },
  preview: {
    background: "#05010f",
    surface: "#0b0220",
    card: "#16063a",
    accent: "#f72585",
  },
};

export default cyberwave;
