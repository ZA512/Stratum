export function parseDateString(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function formatRelativeTime(date: Date): { relative: string; absolute: string } {
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const absolute = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const divisions: Array<{ threshold: number; unit: Intl.RelativeTimeFormatUnit; divisor: number }> = [
    { threshold: 60, unit: "second", divisor: 1 },
    { threshold: 3600, unit: "minute", divisor: 60 },
    { threshold: 86400, unit: "hour", divisor: 3600 },
    { threshold: 604800, unit: "day", divisor: 86400 },
    { threshold: 2629800, unit: "week", divisor: 604800 },
    { threshold: 31557600, unit: "month", divisor: 2629800 },
    { threshold: Infinity, unit: "year", divisor: 31557600 },
  ];

  const diffSeconds = diffMs / 1000;
  const absDiffSeconds = Math.abs(diffSeconds);

  for (const division of divisions) {
    if (absDiffSeconds < division.threshold) {
      const value = diffSeconds / division.divisor;
      return { relative: formatter.format(Math.round(value), division.unit), absolute };
    }
  }

  return { relative: formatter.format(0, "second"), absolute };
}
