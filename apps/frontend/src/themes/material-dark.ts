import type { ThemeDefinition } from "./types";

const materialDark: ThemeDefinition = {
  id: "material-dark",
  tone: "dark",
  nameKey: "settings.theme.names.materialDark",
  descriptionKey: "settings.theme.descriptions.materialDark",
  cssVars: {
    "--color-background": "#121212",
    "--color-surface": "#1e1e1e",
    "--color-card": "#242424",
    "--color-accent": "#bb86fc",
    "--color-accent-strong": "#9d65f3",
    "--color-foreground": "#f4f4f4",
    "--color-muted": "#a1a1aa",
    "--color-breadcrumb-label": "#f4f4f4",
    "--color-breadcrumb-shadow": "rgba(18, 18, 18, 0.55)",
    "--color-breadcrumb-glow": "rgba(187, 134, 252, 0.45)",
    "--color-task-label": "#a1a1aa",
    "--color-task-heading": "#f4f4f4",
    "--color-task-tab": "#e4e4e7",
  },
  preview: {
    background: "#121212",
    surface: "#1e1e1e",
    card: "#242424",
    accent: "#bb86fc",
  },
};

export default materialDark;
