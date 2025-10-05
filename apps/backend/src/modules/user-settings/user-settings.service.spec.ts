import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { UserSettingsService } from './user-settings.service';
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  DashboardPreferences,
} from './user-settings.types';

type StoredRecord = {
  userId: string;
  preferences: DashboardPreferences;
  createdAt: Date;
  updatedAt: Date;
};

function createMockPrisma() {
  const records = new Map<string, StoredRecord>();

  return {
    userSettings: {
      findUnique: jest.fn(async ({ where }: any) => records.get(where.userId) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const record: StoredRecord = {
          userId: data.userId,
          preferences: data.preferences,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        records.set(record.userId, record);
        return record;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const existing = records.get(where.userId);
        if (!existing) {
          throw new Error('Record not found');
        }
        const updated: StoredRecord = {
          ...existing,
          ...data,
          preferences: data.preferences ?? existing.preferences,
          updatedAt: new Date(),
        };
        records.set(where.userId, updated);
        return updated;
      }),
    },
  } as unknown as PrismaService & { records: Map<string, StoredRecord> };
}

describe('UserSettingsService', () => {
  let service: UserSettingsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(UserSettingsService);
  });

  it('creates default settings when none exist', async () => {
    const result = await service.getOrDefault('user-1');

    expect(prisma.userSettings.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', preferences: DEFAULT_DASHBOARD_PREFERENCES },
    });
    expect(result.preferences).toEqual(DEFAULT_DASHBOARD_PREFERENCES);
  });

  it('merges partial updates with defaults and existing values', async () => {
    await service.updatePartial('user-2', { minSample: 12 });

    const updated = await service.updatePartial('user-2', {
      fieldCoverageThreshold: 0.55,
      upcomingDueDays: 5,
      // @ts-expect-error: extraneous keys should be ignored
      ignoredKey: 42,
    });

    expect(updated.preferences).toEqual({
      ...DEFAULT_DASHBOARD_PREFERENCES,
      minSample: 12,
      fieldCoverageThreshold: 0.55,
      upcomingDueDays: 5,
    });
  });
});
