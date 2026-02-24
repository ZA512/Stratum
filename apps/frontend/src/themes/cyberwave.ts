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
    "--color-elevated": "#12052E",
    "--color-accent": "#f72585",
    "--color-border-subtle": "#230955",
    "--color-border-strong": "#310F72",
    "--color-accent-strong": "#ff4dbe",
    "--color-foreground": "#f4f3ff",
    "--color-muted": "#9d8cff",
    "--color-breadcrumb-label": "#f4f3ff",
    "--color-breadcrumb-shadow": "rgba(9, 2, 32, 0.78)",
    "--color-breadcrumb-glow": "rgba(247, 37, 133, 0.46)",
    "--color-task-label": "#9d8cff",
    "--color-task-heading": "#f6f6ff",
    "--color-task-tab": "#cdc2ff",
  },
  preview: {
    background: "#05010f",
    surface: "#0b0220",
    card: "#16063a",
    accent: "#f72585",
  },
};

export default cyberwave;
