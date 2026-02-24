import type { ThemeDefinition } from "./types";

const solarForge: ThemeDefinition = {
  id: "solar-forge",
  tone: "light",
  nameKey: "settings.theme.names.solarForge",
  descriptionKey: "settings.theme.descriptions.solarForge",
  cssVars: {
    "--color-background": "#FFF6E9",
    "--color-surface": "#FFFFFF",
    "--color-card": "#FDE7CC",
    "--color-elevated": "#F7D9B0",
    "--color-accent": "#FF5A1F",
    "--color-accent-strong": "#CC4818",
    "--color-foreground": "#2A1F14",
    "--color-muted": "#5A4632",
    "--color-border-subtle": "#D8B88E",
    "--color-border-strong": "#B9966A",
    "--color-breadcrumb-label": "#2A1F14",
    "--color-breadcrumb-shadow": "rgba(42, 31, 20, 0.22)",
    "--color-breadcrumb-glow": "rgba(255, 90, 31, 0.35)",
    "--color-task-label": "#5A4632",
    "--color-task-heading": "#2A1F14",
    "--color-task-tab": "#4A3828",
  },
  preview: {
    background: "#FFF6E9",
    surface: "#FFFFFF",
    card: "#FDE7CC",
    accent: "#FF5A1F",
  },
};

export default solarForge;
