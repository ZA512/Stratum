export type ThemeTone = "light" | "dark";

export type ThemeCssVariable =
  | "--color-background"
  | "--color-surface"
  | "--color-card"
  | "--color-elevated"
  | "--color-surface-soft"
  | "--color-surface-raised"
  | "--color-input"
  | "--color-border"
  | "--color-accent"
  | "--color-accent-strong"
  | "--color-accent-soft"
  | "--color-accent-foreground"
  | "--color-foreground"
  | "--color-foreground-subtle"
  | "--color-foreground-faint"
  | "--color-muted"
  | "--color-border-subtle"
  | "--color-border-strong"
  | "--color-overlay"
  | "--color-shadow"
  | "--color-theme-ring"
  | "--color-page-gradient-start"
  | "--color-page-gradient-end"
  | "--color-page-gradient-spot"
  | "--color-scrollbar"
  | "--color-scrollbar-hover"
  | "--color-success"
  | "--color-success-soft"
  | "--color-warning"
  | "--color-warning-soft"
  | "--color-danger"
  | "--color-danger-soft"
  | "--color-info"
  | "--color-info-soft"
  | "--color-breadcrumb-label"
  | "--color-breadcrumb-shadow"
  | "--color-breadcrumb-glow"
  | "--color-task-label"
  | "--color-task-heading"
  | "--color-task-tab";

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
