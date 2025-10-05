import { Prisma } from '@prisma/client';

export const DASHBOARD_PREFERENCE_KEYS = [
  'fieldCoverageThreshold',
  'fieldCoverageLowSampleThreshold',
  'fieldCoverageLowSampleTaskCount',
  'minSample',
  'upcomingDueDays',
  'staleInProgressDays',
  'blockedAgingHighlightDays',
  'forecastMinThroughputPoints',
  'agingWipMin',
] as const;

export type DashboardPreferenceKey = (typeof DASHBOARD_PREFERENCE_KEYS)[number];

export type DashboardPreferences = Record<DashboardPreferenceKey, number>;

export interface UserSettingsWithDefaults {
  userId: string;
  preferences: DashboardPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  fieldCoverageThreshold: 0.4,
  fieldCoverageLowSampleThreshold: 0.3,
  fieldCoverageLowSampleTaskCount: 25,
  minSample: 5,
  upcomingDueDays: 3,
  staleInProgressDays: 3,
  blockedAgingHighlightDays: 2,
  forecastMinThroughputPoints: 4,
  agingWipMin: 3,
};

export function toPreferenceRecord(
  value: Prisma.JsonValue | null | undefined,
): Partial<DashboardPreferences> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const input = value as Record<string, unknown>;
  const result: Partial<DashboardPreferences> = {};

  for (const key of DASHBOARD_PREFERENCE_KEYS) {
    const maybeNumber = input[key];
    if (typeof maybeNumber === 'number' && Number.isFinite(maybeNumber)) {
      result[key] = maybeNumber;
    }
  }

  return result;
}

export function sanitizePartialPreferences(
  partial: Partial<DashboardPreferences>,
): Partial<DashboardPreferences> {
  const result: Partial<DashboardPreferences> = {};

  for (const key of DASHBOARD_PREFERENCE_KEYS) {
    const value = partial[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
    }
  }

  return result;
}
