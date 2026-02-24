import type { ThemeDefinition } from "./types";

const vulcanEmber: ThemeDefinition = {
  id: "vulcan-ember",
  tone: "dark",
  nameKey: "settings.theme.names.vulcanEmber",
  descriptionKey: "settings.theme.descriptions.vulcanEmber",
  cssVars: {
    "--color-background": "#101010",
    "--color-surface": "#1A1A1A",
    "--color-card": "#26211C",
    "--color-elevated": "#2F2822",
    "--color-accent": "#FF7A00",
    "--color-accent-strong": "#CC6200",
    "--color-foreground": "#F5F1E8",
    "--color-muted": "#C2B6A6",
    "--color-border-subtle": "#3A332C",
    "--color-border-strong": "#4B4036",
    "--color-breadcrumb-label": "#F5F1E8",
    "--color-breadcrumb-shadow": "rgba(16, 16, 16, 0.75)",
    "--color-breadcrumb-glow": "rgba(255, 122, 0, 0.40)",
    "--color-task-label": "#C2B6A6",
    "--color-task-heading": "#EBE2D5",
    "--color-task-tab": "#D4C8B4",
  },
  preview: {
    background: "#101010",
    surface: "#1A1A1A",
    card: "#26211C",
    accent: "#FF7A00",
  },
};

export default vulcanEmber;
