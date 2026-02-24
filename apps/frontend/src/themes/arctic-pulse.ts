import type { ThemeDefinition } from "./types";

const arcticPulse: ThemeDefinition = {
  id: "arctic-pulse",
  tone: "light",
  nameKey: "settings.theme.names.arcticPulse",
  descriptionKey: "settings.theme.descriptions.arcticPulse",
  cssVars: {
    "--color-background": "#F3F7FF",
    "--color-surface": "#FFFFFF",
    "--color-card": "#E7F0FF",
    "--color-elevated": "#DDE9FA",
    "--color-accent": "#0066FF",
    "--color-accent-strong": "#0050CC",
    "--color-foreground": "#0A1A2F",
    "--color-muted": "#3F526B",
    "--color-border-subtle": "#B9C9E2",
    "--color-border-strong": "#93A9CC",
    "--color-breadcrumb-label": "#0A1A2F",
    "--color-breadcrumb-shadow": "rgba(10, 26, 47, 0.20)",
    "--color-breadcrumb-glow": "rgba(0, 102, 255, 0.35)",
    "--color-task-label": "#3F526B",
    "--color-task-heading": "#0A1A2F",
    "--color-task-tab": "#1E3550",
  },
  preview: {
    background: "#F3F7FF",
    surface: "#FFFFFF",
    card: "#E7F0FF",
    accent: "#0066FF",
  },
};

export default arcticPulse;
