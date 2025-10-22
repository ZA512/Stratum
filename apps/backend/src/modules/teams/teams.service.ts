import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, Prisma, ColumnBehaviorKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TeamDto } from './dto/team.dto';
import { randomUUID } from 'crypto';
import { TeamMemberDto } from './dto/team-member.dto';

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

  async listMembers(teamId: string): Promise<TeamMemberDto[]> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Equipe introuvable');
    }

    return team.memberships
      .map((membership) => membership.user)
      .filter(
        (
          user,
        ): user is {
          id: string;
          displayName: string;
          email: string;
          avatarUrl: string | null;
        } => Boolean(user),
      )
      .map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
      }));
  }

  async bootstrapForUser(
    userId: string,
  ): Promise<{ team: TeamDto; rootNodeId: string; boardId: string }> {
    // SÉCURITÉ CRITIQUE: récupérer uniquement une team personnelle appartenant réellement à l'utilisateur
    const personalMemberships = await this.prisma.membership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        team: { isPersonal: true },
      },
      include: {
        team: {
          include: {
            memberships: {
              where: { status: MembershipStatus.ACTIVE },
              select: { id: true, userId: true },
            },
            nodes: {
              where: { parentId: null },
              select: {
                id: true,
                board: {
                  select: {
                    id: true,
                    ownerUserId: true,
                    isPersonal: true,
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const membership of personalMemberships) {
      const rootNode = membership.team.nodes.find(
        (node) => node.board && node.board.isPersonal,
      );
      if (!rootNode?.board) {
        continue;
      }

      const boardRecord = await this.prisma.board.findUnique({
        where: { id: rootNode.board.id },
        select: { id: true, ownerUserId: true, isPersonal: true },
      });
      if (!boardRecord?.isPersonal) {
        continue;
      }

      if (boardRecord.ownerUserId && boardRecord.ownerUserId !== userId) {
        // Board personnel d'un autre utilisateur: ignorer pour éviter un hijack
        continue;
      }

      const otherActiveMembers = membership.team.memberships.filter(
        (entry) => entry.userId !== userId,
      );
      if (!boardRecord.ownerUserId && otherActiveMembers.length > 0) {
        // Board non assigné mais partagé: ne pas se l'approprier automatiquement
        continue;
      }

      const teamDto: TeamDto = {
        id: membership.team.id,
        name: membership.team.name,
        slug: membership.team.slug,
        membersCount: membership.team.memberships.length,
        createdAt: membership.team.createdAt.toISOString(),
      };

      try {
        const repairData: Prisma.BoardUncheckedUpdateInput = {};
        let needsRepair = false;

        if (!boardRecord.isPersonal) {
          repairData.isPersonal = true;
          needsRepair = true;
        }

        if (
          boardRecord.ownerUserId === null &&
          otherActiveMembers.length === 0
        ) {
          repairData.ownerUserId = userId;
          needsRepair = true;
        }

        if (needsRepair) {
          await this.prisma.board.update({
            where: { id: boardRecord.id },
            data: repairData,
          });
        }
      } catch (err) {
        console.warn(
          '[teams.bootstrapForUser] personal board repair skipped',
          err,
        );
      }

      return {
        team: teamDto,
        rootNodeId: rootNode.id,
        boardId: boardRecord.id,
      };
    }

    // Création idempotente d'un espace de départ
    const result = await this.prisma.$transaction(async (tx) => {
      const teamId = randomUUID();
      const team = await tx.team.create({
        data: { id: teamId, name: 'Mon Espace', slug: null, isPersonal: true },
      });
      await tx.membership.create({
        data: { teamId: team.id, userId, status: MembershipStatus.ACTIVE },
      });

      // Créer node racine SIMPLE puis promouvoir en COMPLEX pour générer board + colonnes
      const rootId = randomUUID();
      const rootNode = await tx.node.create({
        data: {
          id: rootId,
          teamId: team.id,
          parentId: null,
          title: 'Projet Racine',
          description: null,
          path: '/' + rootId,
          depth: 0,
          position: 0,
          createdById: userId,
        },
      });
      // Promote: réutiliser logique de NodesService? (ici ré-implémentée légère)
      let board = await tx.board.findUnique({ where: { nodeId: rootNode.id } });
      if (!board) {
        board = await tx.board.create({
          data: {
            nodeId: rootNode.id,
            ownerUserId: userId,
            isPersonal: true,
          },
        });
        // Comportements + colonnes par défaut
        const behaviors = await tx.columnBehavior.findMany({
          where: { teamId: team.id },
        });
        const have = new Set(behaviors.map((b) => b.key));
        const defaults: {
          key: ColumnBehaviorKey;
          label: string;
          color: string | null;
        }[] = [
          {
            key: ColumnBehaviorKey.BACKLOG,
            label: 'Backlog',
            color: '#6b7280',
          },
          {
            key: ColumnBehaviorKey.IN_PROGRESS,
            label: 'En cours',
            color: '#2563eb',
          },
          { key: ColumnBehaviorKey.BLOCKED, label: 'Bloque', color: '#f97316' },
          { key: ColumnBehaviorKey.DONE, label: 'Termine', color: '#16a34a' },
        ];
        for (const def of defaults) {
          if (!have.has(def.key)) {
            await tx.columnBehavior.create({
              data: {
                teamId: team.id,
                key: def.key,
                label: def.label,
                color: def.color,
              },
            });
          }
        }
        const createdBehaviors = await tx.columnBehavior.findMany({
          where: { teamId: team.id },
        });
        const map = new Map(createdBehaviors.map((b) => [b.key, b.id]));
        const cols: {
          key: ColumnBehaviorKey;
          name: string;
          position: number;
          wipLimit: number | null;
        }[] = [
          {
            key: ColumnBehaviorKey.BACKLOG,
            name: 'Backlog',
            position: 0,
            wipLimit: null,
          },
          {
            key: ColumnBehaviorKey.IN_PROGRESS,
            name: 'En cours',
            position: 1,
            wipLimit: 5,
          },
          {
            key: ColumnBehaviorKey.BLOCKED,
            name: 'Bloque',
            position: 2,
            wipLimit: null,
          },
          {
            key: ColumnBehaviorKey.DONE,
            name: 'Termine',
            position: 3,
            wipLimit: null,
          },
        ];
        for (const col of cols) {
          const behaviorId = map.get(col.key);
          if (!behaviorId) continue;
          await tx.column.create({
            data: {
              boardId: board.id,
              name: col.name,
              position: col.position,
              wipLimit: col.wipLimit,
              behaviorId,
            },
          });
        }
      }
      await tx.node.update({
        where: { id: rootNode.id },
        data: { statusMetadata: { boardId: board.id } },
      });

      return { team, rootNodeId: rootNode.id, boardId: board.id };
    });

    const teamDto: TeamDto = {
      id: result.team.id,
      name: result.team.name,
      slug: result.team.slug,
      membersCount: 1,
      createdAt: result.team.createdAt.toISOString(),
    };
    return {
      team: teamDto,
      rootNodeId: result.rootNodeId,
      boardId: result.boardId,
    };
  }
}
