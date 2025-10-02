import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, Prisma, User } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRaciTeamDto, RaciTeamRoles } from './dto/raci-team.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

  private parsePreferences(
    value: Prisma.JsonValue | null,
  ): Record<string, any> {
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
