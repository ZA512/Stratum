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
    "--color-elevated": "#FFF3E5",
    "--color-accent": "#d97706",
    "--color-border-subtle": "#DCC8AB",
    "--color-border-strong": "#C4AC8C",
    "--color-accent-strong": "#b45309",
    "--color-foreground": "#432f20",
    "--color-muted": "#8b7355",
    "--color-breadcrumb-label": "#3b2718",
    "--color-breadcrumb-shadow": "rgba(67, 47, 32, 0.28)",
    "--color-breadcrumb-glow": "rgba(217, 119, 6, 0.32)",
    "--color-task-label": "#8b7355",
    "--color-task-heading": "#432f20",
    "--color-task-tab": "#6b4a2b",
  },
  preview: {
    background: "#f7f1e8",
    surface: "#fffaf2",
    card: "#fbead7",
    accent: "#d97706",
  },
};

export default solstice;
