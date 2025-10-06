const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getNumberOrNull = (source: Record<string, unknown>, key: string): number | null => {
  const raw = source[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
};

const unwrapSection = (
  source: Record<string, unknown>,
  key: 'backlog' | 'done',
): Record<string, unknown> | null => {
  if (!(key in source)) {
    return null;
  }
  const candidate = source[key];
  return isRecord(candidate) ? candidate : null;
};

export type BacklogSettingsSnapshot = {
  reviewAfterDays: number | null;
  reviewEveryDays: number | null;
  archiveAfterDays: number | null;
};

export type DoneSettingsSnapshot = {
  archiveAfterDays: number | null;
};

export const readBacklogSettings = (
  value: unknown,
): BacklogSettingsSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }
  const section = unwrapSection(value, 'backlog') ?? value;
  return {
    reviewAfterDays: getNumberOrNull(section, 'reviewAfterDays'),
    reviewEveryDays: getNumberOrNull(section, 'reviewEveryDays'),
    archiveAfterDays: getNumberOrNull(section, 'archiveAfterDays'),
  };
};

export const readDoneSettings = (value: unknown): DoneSettingsSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }
  const section = unwrapSection(value, 'done') ?? value;
  return {
    archiveAfterDays: getNumberOrNull(section, 'archiveAfterDays'),
  };
};
