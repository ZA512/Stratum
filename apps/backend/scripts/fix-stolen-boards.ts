/**
 * Script de réparation d'urgence pour corriger les boards "volés"
 * 
 * PROBLÈME: La logique de "réparation opportuniste" dans bootstrapForUser()
 * modifiait le ownerUserId des boards personnels, causant le vol de boards.
 * 
 * SOLUTION: Ce script identifie et corrige les boards dont l'ownership
 * ne correspond pas à la membership de la team personnelle.
 */

import { PrismaClient } from '@prisma/client';
import { buildPrismaClientOptions } from '../src/prisma/prisma.utils';

const prisma = new PrismaClient(buildPrismaClientOptions());

interface RepairIssue {
  boardId: string;
  nodeId: string;
  teamId: string;
  teamName: string;
  currentOwnerId: string | null;
  correctOwnerId: string;
  correctOwnerEmail: string;
}

async function main() {

  // Récupérer tous les boards personnels avec leurs teams
  const boards = await prisma.board.findMany({
    where: {
      isPersonal: true,
    },
    include: {
      node: {
        include: {
          team: {
            include: {
              memberships: {
                where: { status: 'ACTIVE' },
                include: {
                  user: {
                    select: { id: true, email: true, displayName: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });


  const issues: RepairIssue[] = [];

  for (const board of boards) {
    const team = board.node.team;
    
    // Vérifier que c'est bien une team personnelle
    if (!team.isPersonal) {
      continue;
    }

    // Une team personnelle doit avoir exactement 1 membership active
    if (team.memberships.length !== 1) {
      continue;
    }

    const correctOwner = team.memberships[0];
    
    // Vérifier si le ownerUserId correspond
    if (board.ownerUserId !== correctOwner.userId) {
      issues.push({
        boardId: board.id,
        nodeId: board.nodeId,
        teamId: team.id,
        teamName: team.name,
        currentOwnerId: board.ownerUserId,
        correctOwnerId: correctOwner.userId,
        correctOwnerEmail: correctOwner.user.email,
      });

    }
  }

  if (issues.length === 0) {
    return;
  }


  // Si --fix est passé en argument, appliquer les corrections
  if (process.argv.includes('--fix')) {

    for (const issue of issues) {
      try {
        await prisma.board.update({
          where: { id: issue.boardId },
          data: { ownerUserId: issue.correctOwnerId },
        });

      } catch (error) {
      }
    }

  } else {
  }
}

main()
  .catch((error) => {
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
