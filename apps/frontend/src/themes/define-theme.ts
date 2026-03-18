import type { ThemeCssVariable, ThemeDefinition } from "./types";

type CoreThemeVars = Pick<
  Record<ThemeCssVariable, string>,
  | "--color-background"
  | "--color-surface"
  | "--color-card"
  | "--color-elevated"
  | "--color-accent"
  | "--color-accent-strong"
  | "--color-foreground"
  | "--color-muted"
  | "--color-border-subtle"
  | "--color-border-strong"
  | "--color-breadcrumb-label"
  | "--color-breadcrumb-shadow"
  | "--color-breadcrumb-glow"
  | "--color-task-label"
  | "--color-task-heading"
  | "--color-task-tab"
>;

type ThemeSeed = Omit<ThemeDefinition, "cssVars"> & {
  cssVars: CoreThemeVars & Partial<Record<ThemeCssVariable, string>>;
};

type Rgb = { r: number; g: number; b: number };

function normalizeHex(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("#")) return null;
  const value = trimmed.slice(1);
  if (value.length === 3) {
    return value
      .split("")
      .map((char) => char + char)
      .join("");
  }
  if (value.length === 6) {
    return value;
  }
  return null;
}

function hexToRgb(input: string): Rgb | null {
  const value = normalizeHex(input);
  if (!value) return null;
  const numeric = Number.parseInt(value, 16);
  if (Number.isNaN(numeric)) return null;
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

function channelToHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

function rgbToHex(rgb: Rgb): string {
  return `#${channelToHex(rgb.r)}${channelToHex(rgb.g)}${channelToHex(rgb.b)}`;
}

function mixColors(primary: string, secondary: string, secondaryWeight: number): string {
  const left = hexToRgb(primary);
  const right = hexToRgb(secondary);
  if (!left || !right) {
    return primary;
  }
  const ratio = Math.max(0, Math.min(1, secondaryWeight));
  const inverse = 1 - ratio;
  return rgbToHex({
    r: left.r * inverse + right.r * ratio,
    g: left.g * inverse + right.g * ratio,
    b: left.b * inverse + right.b * ratio,
  });
}

function withAlpha(color: string, alpha: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const normalized = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalized})`;
}

function relativeLuminance(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function pickContrast(color: string): string {
  return relativeLuminance(color) > 0.46 ? "#0f172a" : "#f8fafc";
}

export function defineTheme(seed: ThemeSeed): ThemeDefinition {
  const { cssVars, tone } = seed;
  const accent = cssVars["--color-accent"];
  const accentStrong = cssVars["--color-accent-strong"];
  const background = cssVars["--color-background"];
  const surface = cssVars["--color-surface"];
  const card = cssVars["--color-card"];
  const elevated = cssVars["--color-elevated"];
  const foreground = cssVars["--color-foreground"];
  const muted = cssVars["--color-muted"];
  const success = tone === "dark" ? "#34d399" : "#15803d";
  const warning = tone === "dark" ? "#fbbf24" : "#b45309";
  const danger = tone === "dark" ? "#fb7185" : "#b91c1c";
  const info = accentStrong;

  return {
    ...seed,
    cssVars: {
      ...cssVars,
      "--color-surface-soft":
        cssVars["--color-surface-soft"] ??
        mixColors(surface, accent, tone === "dark" ? 0.1 : 0.06),
      "--color-surface-raised":
        cssVars["--color-surface-raised"] ??
        mixColors(elevated, accentStrong, tone === "dark" ? 0.08 : 0.05),
      "--color-input":
        cssVars["--color-input"] ??
        mixColors(surface, elevated, tone === "dark" ? 0.62 : 0.3),
      "--color-border":
        cssVars["--color-border"] ??
        mixColors(cssVars["--color-border-subtle"], cssVars["--color-border-strong"], 0.45),
      "--color-accent-soft":
        cssVars["--color-accent-soft"] ?? withAlpha(accent, tone === "dark" ? 0.18 : 0.14),
      "--color-accent-foreground":
        cssVars["--color-accent-foreground"] ?? pickContrast(accent),
      "--color-foreground-subtle":
        cssVars["--color-foreground-subtle"] ?? mixColors(foreground, muted, 0.58),
      "--color-foreground-faint":
        cssVars["--color-foreground-faint"] ?? mixColors(muted, background, tone === "dark" ? 0.22 : 0.08),
      "--color-overlay":
        cssVars["--color-overlay"] ??
        (tone === "dark" ? "rgba(2, 6, 23, 0.66)" : "rgba(148, 163, 184, 0.24)"),
      "--color-shadow":
        cssVars["--color-shadow"] ??
        (tone === "dark" ? "rgba(2, 6, 23, 0.4)" : "rgba(15, 23, 42, 0.12)"),
      "--color-theme-ring":
        cssVars["--color-theme-ring"] ?? withAlpha(accent, tone === "dark" ? 0.34 : 0.28),
      "--color-page-gradient-start":
        cssVars["--color-page-gradient-start"] ??
        mixColors(background, accent, tone === "dark" ? 0.07 : 0.035),
      "--color-page-gradient-end":
        cssVars["--color-page-gradient-end"] ??
        mixColors(surface, background, tone === "dark" ? 0.28 : 0.12),
      "--color-page-gradient-spot":
        cssVars["--color-page-gradient-spot"] ?? withAlpha(accent, tone === "dark" ? 0.18 : 0.12),
      "--color-scrollbar":
        cssVars["--color-scrollbar"] ?? withAlpha(accent, tone === "dark" ? 0.34 : 0.24),
      "--color-scrollbar-hover":
        cssVars["--color-scrollbar-hover"] ?? withAlpha(accentStrong, tone === "dark" ? 0.52 : 0.36),
      "--color-success": cssVars["--color-success"] ?? success,
      "--color-success-soft":
        cssVars["--color-success-soft"] ?? withAlpha(success, tone === "dark" ? 0.18 : 0.12),
      "--color-warning": cssVars["--color-warning"] ?? warning,
      "--color-warning-soft":
        cssVars["--color-warning-soft"] ?? withAlpha(warning, tone === "dark" ? 0.18 : 0.12),
      "--color-danger": cssVars["--color-danger"] ?? danger,
      "--color-danger-soft":
        cssVars["--color-danger-soft"] ?? withAlpha(danger, tone === "dark" ? 0.2 : 0.12),
      "--color-info": cssVars["--color-info"] ?? info,
      "--color-info-soft":
        cssVars["--color-info-soft"] ?? withAlpha(info, tone === "dark" ? 0.18 : 0.12),
    },
  };
}