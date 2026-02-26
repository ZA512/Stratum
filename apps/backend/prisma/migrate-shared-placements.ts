/**
 * Script de migration des tâches partagées existantes vers SharedNodePlacement
 * 
 * Ce script :
 * 1. Trouve toutes les tâches avec des collaborateurs (metadata.share.collaborators)
 * 2. Crée un SharedNodePlacement pour chaque collaborateur si absent
 * 3. Place la tâche dans la première colonne du board personnel de chaque collaborateur
 */

import { PrismaClient } from '@prisma/client';
import { buildPrismaClientOptions } from '../src/prisma/prisma.utils';

const prisma = new PrismaClient(buildPrismaClientOptions());

interface Collaborator {
  userId: string;
  addedById: string;
  addedAt: string;
}

interface ShareMetadata {
  collaborators?: Collaborator[];
}

async function getUserPersonalBoard(userId: string) {
  // Trouver le board personnel de l'utilisateur
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      team: {
        isPersonal: true,
      },
    },
    include: {
      team: {
        include: {
          nodes: {
            where: {
              parentId: null,
            },
            include: {
              board: {
                include: {
                  columns: {
                    orderBy: {
                      position: 'asc',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!membership?.team?.nodes?.[0]?.board) {
    throw new Error(`No personal board found for user ${userId}`);
  }

  return membership.team.nodes[0].board;
}

async function getNextPosition(columnId: string): Promise<number> {
  const maxPosition = await prisma.sharedNodePlacement.findFirst({
    where: { columnId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  return maxPosition ? maxPosition.position + 1000 : 0;
}

async function main() {

  // Trouver toutes les tâches avec des collaborateurs
  const sharedNodes = await prisma.node.findMany({
    where: {
      archivedAt: null,
      metadata: {
        path: ['share', 'collaborators'],
        not: [],
      },
    },
    select: {
      id: true,
      title: true,
      teamId: true,
      columnId: true,
      metadata: true,
      createdById: true,
    },
  });


  let totalPlacements = 0;
  let skipped = 0;
  let errors = 0;

  for (const node of sharedNodes) {
    const metadata = (node.metadata as any) || {};
    const share: ShareMetadata = metadata.share || {};
    const collaborators = share.collaborators || [];

    if (collaborators.length === 0) {
      skipped++;
      continue;
    }


    // Ajouter aussi le créateur si pas déjà dans les collaborateurs
    const allUserIds = new Set<string>();
    collaborators.forEach((c: Collaborator) => allUserIds.add(c.userId));
    if (node.createdById) {
      allUserIds.add(node.createdById);
    }

    for (const userId of allUserIds) {
      try {
        // Vérifier si placement existe déjà
        const existing = await prisma.sharedNodePlacement.findUnique({
          where: {
            nodeId_userId: {
              nodeId: node.id,
              userId,
            },
          },
        });

        if (existing) {
          continue;
        }

        // Récupérer le board personnel de l'utilisateur
        let personalBoard;
        try {
          personalBoard = await getUserPersonalBoard(userId);
        } catch (err) {
          skipped++;
          continue;
        }

        if (!personalBoard.columns || personalBoard.columns.length === 0) {
          skipped++;
          continue;
        }

        // Placer dans la première colonne (généralement Backlog)
        const firstColumn = personalBoard.columns[0];
        const position = await getNextPosition(firstColumn.id);

        await prisma.sharedNodePlacement.create({
          data: {
            nodeId: node.id,
            userId,
            columnId: firstColumn.id,
            position,
          },
        });

        totalPlacements++;
      } catch (err) {
        errors++;
      }
    }

  }

}

main()
  .catch((e) => {
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
