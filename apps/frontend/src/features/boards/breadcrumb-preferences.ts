export type BreadcrumbVariant = "fractal" | "stacked" | "inline";

export const DEFAULT_BREADCRUMB_VARIANT: BreadcrumbVariant = "fractal";

const BREADCRUMB_VARIANT_STORAGE_KEY = "stratum:breadcrumb-variant";

function isBreadcrumbVariant(value: string | null): value is BreadcrumbVariant {
  return value === "fractal" || value === "stacked" || value === "inline";
}

export function readStoredBreadcrumbVariant(): BreadcrumbVariant {
  if (typeof window === "undefined") {
    return DEFAULT_BREADCRUMB_VARIANT;
  }

  try {
    const stored = window.localStorage.getItem(BREADCRUMB_VARIANT_STORAGE_KEY);
    if (isBreadcrumbVariant(stored)) {
      return stored;
    }
  } catch {
    return DEFAULT_BREADCRUMB_VARIANT;
  }

  return DEFAULT_BREADCRUMB_VARIANT;
}

export function persistBreadcrumbVariant(value: BreadcrumbVariant) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(BREADCRUMB_VARIANT_STORAGE_KEY, value);
  } catch {
    // ignore storage errors
  }
}
