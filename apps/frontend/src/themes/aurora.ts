import type { ThemeDefinition } from "./types";

const aurora: ThemeDefinition = {
  id: "aurora",
  tone: "light",
  nameKey: "settings.theme.names.aurora",
  descriptionKey: "settings.theme.descriptions.aurora",
  cssVars: {
    "--color-background": "#f5f7fb",
    "--color-surface": "#ffffff",
    "--color-card": "#eef2ff",
    "--color-elevated": "#f0f4fb",
    "--color-accent": "#2563eb",
    "--color-border-subtle": "#CAD3E6",
    "--color-border-strong": "#B0BCE0",
    "--color-accent-strong": "#1d4ed8",
    "--color-foreground": "#1f2937",
    "--color-muted": "#64748b",
    "--color-breadcrumb-label": "#1f2937",
    "--color-breadcrumb-shadow": "rgba(15, 23, 42, 0.22)",
    "--color-breadcrumb-glow": "rgba(37, 99, 235, 0.32)",
    "--color-task-label": "#64748b",
    "--color-task-heading": "#1f2937",
    "--color-task-tab": "#475569",
  },
  preview: {
    background: "#f5f7fb",
    surface: "#ffffff",
    card: "#eef2ff",
    accent: "#2563eb",
  },
};

export default aurora;
