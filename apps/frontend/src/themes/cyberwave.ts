import type { ThemeDefinition } from "./types";

const cyberwave: ThemeDefinition = {
  id: "cyberwave",
  tone: "dark",
  nameKey: "settings.theme.names.cyberwave",
  descriptionKey: "settings.theme.descriptions.cyberwave",
  cssVars: {
    "--color-background": "#05010f",
    "--color-surface": "#0b0220",
    "--color-card": "#16063a",
    "--color-accent": "#f72585",
    "--color-accent-strong": "#ff4dbe",
    "--color-foreground": "#f4f3ff",
    "--color-muted": "#9d8cff",
  },
  preview: {
    background: "#05010f",
    surface: "#0b0220",
    card: "#16063a",
    accent: "#f72585",
  },
};

export default cyberwave;
