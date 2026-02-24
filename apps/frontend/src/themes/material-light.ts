import type { ThemeDefinition } from "./types";

const materialLight: ThemeDefinition = {
  id: "material-light",
  tone: "light",
  nameKey: "settings.theme.names.materialLight",
  descriptionKey: "settings.theme.descriptions.materialLight",
  cssVars: {
    "--color-background": "#f6f7f9",
    "--color-surface": "#ffffff",
    "--color-card": "#e7eef8",
    "--color-elevated": "#f0f4fa",
    "--color-accent": "#0b7285",
    "--color-border-subtle": "#C8D4E8",
    "--color-border-strong": "#A8BAD4",
    "--color-accent-strong": "#0a6170",
    "--color-foreground": "#1f2933",
    "--color-muted": "#52606d",
    "--color-breadcrumb-label": "#1f2933",
    "--color-breadcrumb-shadow": "rgba(15, 23, 42, 0.18)",
    "--color-breadcrumb-glow": "rgba(11, 114, 133, 0.32)",
    "--color-task-label": "#52606d",
    "--color-task-heading": "#1f2933",
    "--color-task-tab": "#334155",
  },
  preview: {
    background: "#f6f7f9",
    surface: "#ffffff",
    card: "#e7eef8",
    accent: "#0b7285",
  },
};

export default materialLight;
