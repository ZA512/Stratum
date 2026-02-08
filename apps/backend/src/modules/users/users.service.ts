import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipStatus, Prisma, User } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRaciTeamDto, RaciTeamRoles } from './dto/raci-team.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private static readonly AI_PROVIDERS = new Set([
    'heuristic',
    'openai',
    'anthropic',
    'mistral',
    'gemini',
    'ollama',
    'custom',
  ]);

  private sanitizeIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of ids) {
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
    }
    return result;
  }

  private parsePreferences(value: Prisma.JsonValue): Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return { ...(value as Record<string, any>) };
  }

  private normalizeRaciTeamRoles(input: unknown): RaciTeamRoles {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { R: [], A: [], C: [], I: [] };
    }
    const record = input as Record<string, unknown>;
    const fallback = (keys: string[]) => {
      for (const key of keys) {
        if (record[key] !== undefined) {
          return this.sanitizeIds(record[key]);
        }
      }
      return [];
    };
    return {
      R: fallback(['R', 'responsible', 'responsibleIds']),
      A: fallback(['A', 'accountable', 'accountableIds']),
      C: fallback(['C', 'consulted', 'consultedIds']),
      I: fallback(['I', 'informed', 'informedIds']),
    };
  }

  private normalizeRaciTeams(value: unknown): RaciTeamPreference[] {
    if (!Array.isArray(value)) return [];
    const teams: RaciTeamPreference[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : null;
      const name = typeof record.name === 'string' ? record.name : null;
      if (!id || !name) continue;
      const createdAt =
        typeof record.createdAt === 'string'
          ? record.createdAt
          : new Date().toISOString();
      const updatedAt =
        typeof record.updatedAt === 'string' ? record.updatedAt : createdAt;
      teams.push({
        id,
        name,
        raci: this.normalizeRaciTeamRoles(record.raci),
        createdAt,
        updatedAt,
      });
    }
    return teams;
  }

  private normalizeAiSettings(value: unknown): AiSettingsPreference {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        provider: 'heuristic',
        model: null,
        baseUrl: null,
        timeoutMs: null,
        apiKey: null,
        apiKeyPresent: false,
        updatedAt: null,
      };
    }
    const record = value as Record<string, unknown>;
    const provider =
      typeof record.provider === 'string'
        ? record.provider.trim().toLowerCase()
        : 'heuristic';
    const model = this.normalizeOptionalString(record.model);
    const baseUrl = this.normalizeOptionalString(record.baseUrl);
    const timeoutMs =
      typeof record.timeoutMs === 'number' && Number.isFinite(record.timeoutMs)
        ? Math.max(3_000, Math.min(120_000, Math.round(record.timeoutMs)))
        : null;
    const legacyApiKey = this.normalizeOptionalString(record.apiKey);
    const apiKeyEnc = this.normalizeOptionalString(record.apiKeyEnc);
    const apiKeyIv = this.normalizeOptionalString(record.apiKeyIv);
    const apiKeyTag = this.normalizeOptionalString(record.apiKeyTag);
    const apiKeyPresent = Boolean(legacyApiKey || apiKeyEnc);
    const apiKey = this.decryptApiKey({
      apiKey: legacyApiKey,
      apiKeyEnc,
      apiKeyIv,
      apiKeyTag,
    });
    const updatedAt =
      typeof record.updatedAt === 'string' ? record.updatedAt : null;

    return {
      provider: UsersService.AI_PROVIDERS.has(provider)
        ? provider
        : 'heuristic',
      model,
      baseUrl,
      timeoutMs,
      apiKey,
      apiKeyPresent,
      updatedAt,
    };
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private normalizeAiProvider(value: unknown): string {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!normalized) {
      throw new BadRequestException('Le provider IA est requis.');
    }
    if (!UsersService.AI_PROVIDERS.has(normalized)) {
      throw new BadRequestException('Provider IA invalide.');
    }
    return normalized;
  }

  private getAiEncryptionKey(): Buffer | null {
    const raw = this.normalizeOptionalString(
      this.config.get<string>('AI_SETTINGS_ENCRYPTION_KEY'),
    );
    if (!raw) return null;
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new BadRequestException(
        'AI_SETTINGS_ENCRYPTION_KEY invalide (base64 32 bytes requis).',
      );
    }
    return key;
  }

  private encryptApiKey(plain: string): {
    apiKeyEnc: string;
    apiKeyIv: string;
    apiKeyTag: string;
  } {
    const key = this.getAiEncryptionKey();
    if (!key) {
      throw new BadRequestException(
        'AI_SETTINGS_ENCRYPTION_KEY requis pour enregistrer une clé API.',
      );
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      apiKeyEnc: encrypted.toString('base64'),
      apiKeyIv: iv.toString('base64'),
      apiKeyTag: tag.toString('base64'),
    };
  }

  private decryptApiKey(input: {
    apiKey: string | null;
    apiKeyEnc: string | null;
    apiKeyIv: string | null;
    apiKeyTag: string | null;
  }): string | null {
    if (input.apiKey) return input.apiKey;
    if (!input.apiKeyEnc || !input.apiKeyIv || !input.apiKeyTag) return null;
    const key = this.getAiEncryptionKey();
    if (!key) return null;
    try {
      const iv = Buffer.from(input.apiKeyIv, 'base64');
      const encrypted = Buffer.from(input.apiKeyEnc, 'base64');
      const tag = Buffer.from(input.apiKeyTag, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }

  private normalizeAiBaseUrl(value: unknown): string | null {
    const trimmed = this.normalizeOptionalString(value);
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Protocol');
      }
      return parsed.toString().replace(/\/$/, '');
    } catch {
      throw new BadRequestException('Base URL IA invalide.');
    }
  }

  private buildPreferences(current: Record<string, any>): Prisma.JsonObject {
    return current as Prisma.JsonObject;
  }

  private async getUserPreferences(
    userId: string,
  ): Promise<{ prefs: Record<string, any>; teams: RaciTeamPreference[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    const prefs = this.parsePreferences(user.preferences);
    const teams = this.sortTeams(this.normalizeRaciTeams(prefs.raciTeams));
    return { prefs, teams };
  }

  private sortTeams(teams: RaciTeamPreference[]): RaciTeamPreference[] {
    return [...teams].sort((a, b) =>
      a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
    );
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUser(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  updatePassword(id: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  updateProfile(
    id: string,
    data: Partial<Pick<User, 'displayName' | 'locale' | 'avatarUrl' | 'bio'>>,
  ) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async getProfileWithTeams(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        locale: true,
        avatarUrl: true,
        bio: true,
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          select: {
            id: true,
            title: true,
            team: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      teams: user.memberships.map((membership) => ({
        membershipId: membership.id,
        title: membership.title,
        team: membership.team,
      })),
    };
  }

  async listRaciTeams(userId: string): Promise<RaciTeamPreference[]> {
    const { teams } = await this.getUserPreferences(userId);
    return this.sortTeams(teams);
  }

  async getAiSettings(userId: string): Promise<AiSettingsPreference> {
    const { prefs } = await this.getUserPreferences(userId);
    return this.normalizeAiSettings(prefs.aiSettings);
  }

  async updateAiSettings(
    userId: string,
    input: Partial<
      Pick<
        AiSettingsPreference,
        'provider' | 'model' | 'baseUrl' | 'timeoutMs' | 'apiKey'
      >
    >,
  ): Promise<AiSettingsPreference> {
    const { prefs } = await this.getUserPreferences(userId);
    const current = this.normalizeAiSettings(prefs.aiSettings);
    const next: AiSettingsPreference = { ...current };
    let updated = false;

    if (input.provider !== undefined) {
      next.provider = this.normalizeAiProvider(input.provider);
      updated = true;
    }

    if (input.model !== undefined) {
      next.model = this.normalizeOptionalString(input.model);
      updated = true;
    }

    if (input.baseUrl !== undefined) {
      next.baseUrl = this.normalizeAiBaseUrl(input.baseUrl);
      updated = true;
    }

    if (input.timeoutMs !== undefined) {
      if (input.timeoutMs === null) {
        next.timeoutMs = null;
      } else if (typeof input.timeoutMs === 'number') {
        if (!Number.isFinite(input.timeoutMs)) {
          throw new BadRequestException('Timeout IA invalide.');
        }
        next.timeoutMs = Math.max(
          3_000,
          Math.min(120_000, Math.round(input.timeoutMs)),
        );
      } else {
        throw new BadRequestException('Timeout IA invalide.');
      }
      updated = true;
    }

    if (input.apiKey !== undefined) {
      next.apiKey = this.normalizeOptionalString(input.apiKey);
      updated = true;
    }

    if (updated) {
      const nextRecord: Record<string, unknown> = {
        provider: next.provider,
        model: next.model,
        baseUrl: next.baseUrl,
        timeoutMs: next.timeoutMs,
      };

      if (next.apiKey) {
        const encrypted = this.encryptApiKey(next.apiKey);
        nextRecord.apiKeyEnc = encrypted.apiKeyEnc;
        nextRecord.apiKeyIv = encrypted.apiKeyIv;
        nextRecord.apiKeyTag = encrypted.apiKeyTag;
        next.apiKeyPresent = true;
      } else if (input.apiKey === null) {
        next.apiKeyPresent = false;
      } else if (current.apiKeyPresent && current.apiKey) {
        try {
          const encrypted = this.encryptApiKey(current.apiKey);
          nextRecord.apiKeyEnc = encrypted.apiKeyEnc;
          nextRecord.apiKeyIv = encrypted.apiKeyIv;
          nextRecord.apiKeyTag = encrypted.apiKeyTag;
          next.apiKeyPresent = true;
        } catch {
          next.apiKeyPresent = current.apiKeyPresent;
        }
      } else if (current.apiKeyPresent) {
        next.apiKeyPresent = true;
      }

      next.updatedAt = new Date().toISOString();
      nextRecord.updatedAt = next.updatedAt;
      prefs.aiSettings = nextRecord;
      await this.prisma.user.update({
        where: { id: userId },
        data: { preferences: this.buildPreferences(prefs) },
      });
    }

    return next;
  }

  async createRaciTeam(
    userId: string,
    dto: CreateRaciTeamDto,
  ): Promise<RaciTeamPreference> {
    const { prefs, teams } = await this.getUserPreferences(userId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Le nom de l'équipe RACI est requis");
    }
    const now = new Date().toISOString();
    const raci: RaciTeamRoles = {
      R: this.sanitizeIds(dto.raci?.R ?? []),
      A: this.sanitizeIds(dto.raci?.A ?? []),
      C: this.sanitizeIds(dto.raci?.C ?? []),
      I: this.sanitizeIds(dto.raci?.I ?? []),
    };
    const next: RaciTeamPreference = {
      id: randomUUID(),
      name,
      raci,
      createdAt: now,
      updatedAt: now,
    };
    const nextTeams = this.sortTeams([...teams, next]);
    prefs.raciTeams = nextTeams;
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences: this.buildPreferences(prefs) },
    });
    return next;
  }

  async renameRaciTeam(
    userId: string,
    teamId: string,
    name: string,
  ): Promise<RaciTeamPreference> {
    const { prefs, teams } = await this.getUserPreferences(userId);
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException("Le nom de l'équipe RACI est requis");
    }
    const index = teams.findIndex((team) => team.id === teamId);
    if (index === -1) {
      throw new NotFoundException('Équipe RACI introuvable');
    }
    const now = new Date().toISOString();
    const updated: RaciTeamPreference = {
      ...teams[index],
      name: trimmed,
      updatedAt: now,
    };
    const nextTeams = this.sortTeams([
      ...teams.slice(0, index),
      updated,
      ...teams.slice(index + 1),
    ]);
    prefs.raciTeams = nextTeams;
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences: this.buildPreferences(prefs) },
    });
    return updated;
  }

  async deleteRaciTeam(userId: string, teamId: string): Promise<void> {
    const { prefs, teams } = await this.getUserPreferences(userId);
    const nextTeams = teams.filter((team) => team.id !== teamId);
    if (nextTeams.length === teams.length) {
      throw new NotFoundException('Équipe RACI introuvable');
    }
    prefs.raciTeams = this.sortTeams(nextTeams);
    await this.prisma.user.update({
      where: { id: userId },
      data: { preferences: this.buildPreferences(prefs) },
    });
  }
}

export type RaciTeamPreference = {
  id: string;
  name: string;
  raci: RaciTeamRoles;
  createdAt: string;
  updatedAt: string;
};

export type AiSettingsPreference = {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  timeoutMs: number | null;
  apiKey: string | null;
  apiKeyPresent: boolean;
  updatedAt: string | null;
};
