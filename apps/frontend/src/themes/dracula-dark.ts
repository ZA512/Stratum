import type { ThemeDefinition } from "./types";

const draculaDark: ThemeDefinition = {
  id: "dracula-dark",
  tone: "dark",
  nameKey: "settings.theme.names.draculaDark",
  descriptionKey: "settings.theme.descriptions.draculaDark",
  cssVars: {
    "--color-background": "#282a36",
    "--color-surface": "#343746",
    "--color-card": "#3a3c4f",
    "--color-accent": "#bd93f9",
    "--color-accent-strong": "#ff79c6",
    "--color-foreground": "#f8f8f2",
    "--color-muted": "#b6b8d6",
    "--color-breadcrumb-label": "#f8f8f2",
    "--color-breadcrumb-shadow": "rgba(40, 42, 54, 0.6)",
    "--color-breadcrumb-glow": "rgba(189, 147, 249, 0.45)",
    "--color-task-label": "#babddc",
    "--color-task-heading": "#f8f8f2",
    "--color-task-tab": "#e0e1ff",
  },
  preview: {
    background: "#282a36",
    surface: "#343746",
    card: "#3a3c4f",
    accent: "#bd93f9",
  },
};

export default draculaDark;
