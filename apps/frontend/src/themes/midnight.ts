import type { ThemeDefinition } from "./types";

const midnight: ThemeDefinition = {
  id: "midnight",
  tone: "dark",
  nameKey: "settings.theme.names.midnight",
  descriptionKey: "settings.theme.descriptions.midnight",
  cssVars: {
    "--color-background": "#0f172a",
    "--color-surface": "#111827",
    "--color-card": "#1f2937",
    "--color-elevated": "#18202F",
    "--color-accent": "#22d3ee",
    "--color-border-subtle": "#292F3D",
    "--color-border-strong": "#353B47",
    "--color-accent-strong": "#06b6d4",
    "--color-foreground": "#f8fafc",
    "--color-muted": "#94a3b8",
    "--color-breadcrumb-label": "#f8fafc",
    "--color-breadcrumb-shadow": "rgba(8, 14, 26, 0.75)",
    "--color-breadcrumb-glow": "rgba(56, 189, 248, 0.5)",
    "--color-task-label": "#94a3b8",
    "--color-task-heading": "#e2e8f0",
    "--color-task-tab": "#cbd5f5",
  },
  preview: {
    background: "#0f172a",
    surface: "#111827",
    card: "#1f2937",
    accent: "#22d3ee",
  },
};

export default midnight;
