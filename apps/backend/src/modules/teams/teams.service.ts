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
    // Vérifier si l'utilisateur a déjà une team active
    const existingMembership = await this.prisma.membership.findFirst({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: {
        team: {
          include: {
            memberships: {
              where: { status: MembershipStatus.ACTIVE },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existingMembership) {
      // Retrouver le node racine complexe si disponible (parent null & type COMPLEX)
      const rootComplex = await this.prisma.node.findFirst({
        where: { teamId: existingMembership.teamId, parentId: null },
        select: { id: true, board: { select: { id: true } } },
        orderBy: { createdAt: 'asc' },
      });
      const teamDto: TeamDto = {
        id: existingMembership.team.id,
        name: existingMembership.team.name,
        slug: existingMembership.team.slug,
        membersCount: existingMembership.team.memberships.length,
        createdAt: existingMembership.team.createdAt.toISOString(),
      };
      if (rootComplex?.board?.id) {
        // Réparation opportuniste : si la team est personnelle mais le board
        // ne reflète pas ownerUserId ou isPersonal correctement (ex: migration
        // ancienne ou bug de création), on synchronise.
        try {
          const existingBoard = await this.prisma.board.findUnique({
            where: { id: rootComplex.board.id },
            select: { id: true, ownerUserId: true, isPersonal: true },
          });
          if (existingBoard) {
            // Utiliser BoardUncheckedUpdateInput pour modifier directement les scalars (ownerUserId, isPersonal)
            const repairData: Prisma.BoardUncheckedUpdateInput = {};
            let needsRepair = false;
            if (
              existingMembership.team.isPersonal &&
              !existingBoard.isPersonal
            ) {
              repairData.isPersonal = true;
              needsRepair = true;
            }
            if (
              existingMembership.team.isPersonal &&
              existingBoard.ownerUserId !== existingMembership.userId
            ) {
              repairData.ownerUserId = existingMembership.userId;
              needsRepair = true;
            }
            // Cas inverse : team non-personnelle mais board marqué personnel par erreur
            if (
              !existingMembership.team.isPersonal &&
              existingBoard.isPersonal
            ) {
              repairData.isPersonal = false;
              // Ne pas toucher ownerUserId (peut être utile historiquement) mais on pourrait le nuller si nécessaire.
              needsRepair = true;
            }
            if (needsRepair) {
              await this.prisma.board.update({
                where: { id: existingBoard.id },
                data: repairData,
              });
            }
          }
        } catch (err) {
          // Log silencieux (on évite d'empêcher le bootstrap si la réparation échoue)

          console.warn('[teams.bootstrapForUser] repair skipped', err);
        }
        return {
          team: teamDto,
          rootNodeId: rootComplex.id,
          boardId: rootComplex.board.id,
        };
      }
      // Pas de node complexe racine: continuer la création minimale (rare)
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
