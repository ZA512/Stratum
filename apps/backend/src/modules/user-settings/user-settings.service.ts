import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  DashboardPreferences,
  sanitizePartialPreferences,
  toPreferenceRecord,
  UserSettingsWithDefaults,
} from './user-settings.types';

type RawUserSettingsRecord = {
  userId: string;
  preferences: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UserSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrDefault(userId: string): Promise<UserSettingsWithDefaults> {
    const existing = (await this.prisma.userSettings.findUnique({
      where: { userId },
    })) as RawUserSettingsRecord | null;

    if (!existing) {
      const created = (await this.prisma.userSettings.create({
        data: {
          userId,
          preferences: DEFAULT_DASHBOARD_PREFERENCES,
        },
      })) as RawUserSettingsRecord;

      return {
        ...created,
        preferences: { ...DEFAULT_DASHBOARD_PREFERENCES },
      };
    }

    return {
      ...existing,
      preferences: this.mergeWithDefaults(existing.preferences),
    };
  }

  async updatePartial(
    userId: string,
    partial: Partial<DashboardPreferences>,
  ): Promise<UserSettingsWithDefaults> {
    const sanitized = sanitizePartialPreferences(partial);
    const existing = (await this.prisma.userSettings.findUnique({
      where: { userId },
    })) as RawUserSettingsRecord | null;

    const merged = {
      ...DEFAULT_DASHBOARD_PREFERENCES,
      ...toPreferenceRecord(existing?.preferences),
      ...sanitized,
    };

    const record = (
      existing
        ? await this.prisma.userSettings.update({
            where: { userId },
            data: { preferences: merged },
          })
        : await this.prisma.userSettings.create({
            data: {
              userId,
              preferences: merged,
            },
          })
    ) as RawUserSettingsRecord;

    return {
      ...record,
      preferences: merged,
    };
  }

  private mergeWithDefaults(
    preferences: Parameters<typeof toPreferenceRecord>[0],
  ): DashboardPreferences {
    return {
      ...DEFAULT_DASHBOARD_PREFERENCES,
      ...toPreferenceRecord(preferences),
    };
  }
}
