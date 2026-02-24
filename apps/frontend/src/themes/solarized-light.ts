import type { ThemeDefinition } from "./types";

const solarizedLight: ThemeDefinition = {
  id: "solarized-light",
  tone: "light",
  nameKey: "settings.theme.names.solarizedLight",
  descriptionKey: "settings.theme.descriptions.solarizedLight",
  cssVars: {
    "--color-background": "#fdf6e3",
    "--color-surface": "#fffdf6",
    "--color-card": "#eee8d5",
    "--color-elevated": "#FFF8EC",
    "--color-accent": "#268bd2",
    "--color-border-subtle": "#D5CDB8",
    "--color-border-strong": "#BAB09A",
    "--color-accent-strong": "#1f6fae",
    "--color-foreground": "#073642",
    "--color-muted": "#586e75",
    "--color-breadcrumb-label": "#073642",
    "--color-breadcrumb-shadow": "rgba(38, 139, 210, 0.24)",
    "--color-breadcrumb-glow": "rgba(181, 137, 0, 0.28)",
    "--color-task-label": "#657b83",
    "--color-task-heading": "#073642",
    "--color-task-tab": "#2e3d44",
  },
  preview: {
    background: "#fdf6e3",
    surface: "#fffdf6",
    card: "#eee8d5",
    accent: "#268bd2",
  },
};

export default solarizedLight;
