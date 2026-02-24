import type { ThemeDefinition } from "./types";

const obsidianFlux: ThemeDefinition = {
  id: "obsidian-flux",
  tone: "dark",
  nameKey: "settings.theme.names.obsidianFlux",
  descriptionKey: "settings.theme.descriptions.obsidianFlux",
  cssVars: {
    "--color-background": "#0B0F14",
    "--color-surface": "#121B26",
    "--color-card": "#182538",
    "--color-elevated": "#1F3047",
    "--color-accent": "#00D4FF",
    "--color-accent-strong": "#00ADCC",
    "--color-foreground": "#EAF2FF",
    "--color-muted": "#A6B6CC",
    "--color-border-subtle": "#223249",
    "--color-border-strong": "#2D4260",
    "--color-breadcrumb-label": "#EAF2FF",
    "--color-breadcrumb-shadow": "rgba(11, 15, 20, 0.75)",
    "--color-breadcrumb-glow": "rgba(0, 212, 255, 0.40)",
    "--color-task-label": "#A6B6CC",
    "--color-task-heading": "#D5E5F8",
    "--color-task-tab": "#B8CBE8",
  },
  preview: {
    background: "#0B0F14",
    surface: "#121B26",
    card: "#182538",
    accent: "#00D4FF",
  },
};

export default obsidianFlux;
