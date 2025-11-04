import type { ThemeDefinition } from "./types";

const nordDark: ThemeDefinition = {
  id: "nord-dark",
  tone: "dark",
  nameKey: "settings.theme.names.nordDark",
  descriptionKey: "settings.theme.descriptions.nordDark",
  cssVars: {
    "--color-background": "#2e3440",
    "--color-surface": "#3b4252",
    "--color-card": "#434c5e",
    "--color-accent": "#88c0d0",
    "--color-accent-strong": "#81a1c1",
    "--color-foreground": "#eceff4",
    "--color-muted": "#cbd5e1",
    "--color-breadcrumb-label": "#eceff4",
    "--color-breadcrumb-shadow": "rgba(46, 52, 64, 0.55)",
    "--color-breadcrumb-glow": "rgba(136, 192, 208, 0.4)",
    "--color-task-label": "#d8dee9",
    "--color-task-heading": "#eceff4",
    "--color-task-tab": "#e5e9f0",
  },
  preview: {
    background: "#2e3440",
    surface: "#3b4252",
    card: "#434c5e",
    accent: "#88c0d0",
  },
};

export default nordDark;
