import type { ThemeDefinition } from "./types";

const aurora: ThemeDefinition = {
  id: "aurora",
  tone: "light",
  nameKey: "settings.theme.names.aurora",
  descriptionKey: "settings.theme.descriptions.aurora",
  cssVars: {
    "--color-background": "245 247 251",
    "--color-surface": "255 255 255",
    "--color-card": "238 242 255",
    "--color-input": "247 248 255",
    "--color-border": "215 223 254",
    "--color-accent": "37 99 235",
    "--color-accent-strong": "29 78 216",
    "--color-foreground": "31 41 55",
    "--color-muted": "100 116 139",
  },
  preview: {
    background: "#f5f7fb",
    surface: "#ffffff",
    card: "#eef2ff",
    accent: "#2563eb",
  },
};

export default aurora;
