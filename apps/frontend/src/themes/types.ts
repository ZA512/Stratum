export type ThemeTone = "light" | "dark";

export type ThemeCssVariable =
  | "--color-background"
  | "--color-surface"
  | "--color-card"
  | "--color-accent"
  | "--color-accent-strong"
  | "--color-foreground"
  | "--color-muted";

export interface ThemePreview {
  background: string;
  surface: string;
  card: string;
  accent: string;
}

export interface ThemeDefinition {
  id: string;
  tone: ThemeTone;
  /** i18n key returning the display name */
  nameKey: string;
  /** i18n key returning the short description */
  descriptionKey: string;
  cssVars: Record<ThemeCssVariable, string>;
  preview: ThemePreview;
}
