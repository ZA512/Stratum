import type { ThemeDefinition } from "./types";

const velvet: ThemeDefinition = {
  id: "velvet",
  tone: "dark",
  nameKey: "settings.theme.names.velvet",
  descriptionKey: "settings.theme.descriptions.velvet",
  cssVars: {
    "--color-background": "#161128",
    "--color-surface": "#1f1733",
    "--color-card": "#2a1f46",
    "--color-elevated": "#261C40",
    "--color-accent": "#a855f7",
    "--color-border-subtle": "#352960",
    "--color-border-strong": "#44357A",
    "--color-accent-strong": "#7c3aed",
    "--color-foreground": "#f5f2ff",
    "--color-muted": "#b8a1d9",
    "--color-breadcrumb-label": "#f5f2ff",
    "--color-breadcrumb-shadow": "rgba(28, 15, 48, 0.78)",
    "--color-breadcrumb-glow": "rgba(168, 85, 247, 0.46)",
    "--color-task-label": "#b8a1d9",
    "--color-task-heading": "#f5f2ff",
    "--color-task-tab": "#d9c7f9",
  },
  preview: {
    background: "#161128",
    surface: "#1f1733",
    card: "#2a1f46",
    accent: "#a855f7",
  },
};

export default velvet;
