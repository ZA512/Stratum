import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TeamDto } from './dto/team.dto';

const TEAM_DEFAULT_ORDER: Prisma.TeamOrderByWithRelationInput = {
  createdAt: 'desc',
};

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTeams(): Promise<TeamDto[]> {
    const teams = await this.prisma.team.findMany({
      orderBy: TEAM_DEFAULT_ORDER,
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          select: { id: true },
        },
      },
    });

    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      slug: team.slug,
      membersCount: team.memberships.length,
      createdAt: team.createdAt.toISOString(),
    }));
  }

  async getTeam(id: string): Promise<TeamDto> {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          select: { id: true },
        },
      },
    });

    if (!team) {
      throw new NotFoundException();
    }

    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      membersCount: team.memberships.length,
      createdAt: team.createdAt.toISOString(),
    };
  }
}
