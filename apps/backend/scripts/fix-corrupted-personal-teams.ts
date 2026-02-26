/**
 * Script de réparation pour les teams personnelles corrompues
 * 
 * PROBLÈME: Des teams marquées "personnelles" (isPersonal=true) ont plusieurs memberships.
 * Cela ne devrait JAMAIS arriver car une team personnelle = 1 seul utilisateur.
 * 
 * CAUSES POSSIBLES:
 * - Bug dans la logique d'invitation
 * - Manipulation manuelle de la base
 * - Race condition lors du bootstrap
 * 
 * SOLUTION:
 * 1. Identifier les teams personnelles avec >1 membership
 * 2. Pour chaque user dans cette team, créer SA PROPRE team personnelle
 * 3. Migrer les données appropriées
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { buildPrismaClientOptions } from '../src/prisma/prisma.utils';

const prisma = new PrismaClient(buildPrismaClientOptions());

async function main() {

  // Trouver toutes les teams personnelles
  const personalTeams = await prisma.team.findMany({
    where: {
      isPersonal: true,
    },
    include: {
      memberships: {
        where: { status: 'ACTIVE' },
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
      },
      nodes: {
        where: { parentId: null },
        include: {
          board: true,
        },
      },
    },
  });


  const corruptedTeams = personalTeams.filter(t => t.memberships.length > 1);

  if (corruptedTeams.length === 0) {
    return;
  }


  for (const team of corruptedTeams) {
    
    if (team.nodes.length > 0) {
      const rootNode = team.nodes[0];
    }
  }

  if (!process.argv.includes('--fix')) {
    return;
  }


  for (const corruptedTeam of corruptedTeams) {

    // Identifier le "vrai" propriétaire (celui qui correspond au board owner si disponible)
    const rootNode = corruptedTeam.nodes[0];
    const boardOwnerId = rootNode?.board?.ownerUserId;

    let originalOwner = corruptedTeam.memberships.find(m => m.userId === boardOwnerId);
    
    if (!originalOwner) {
      // Fallback: le premier membre (ordre créatedAt)
      originalOwner = corruptedTeam.memberships.sort((a, b) => 
        a.createdAt.getTime() - b.createdAt.getTime()
      )[0];
    }


    // Pour chaque autre membre, créer sa propre team personnelle
    const intruders = corruptedTeam.memberships.filter(m => m.userId !== originalOwner.userId);

    for (const intruder of intruders) {

      try {
        // Créer une nouvelle team personnelle pour l'intrus
        const newTeamId = randomUUID();
        const newTeam = await prisma.team.create({
          data: {
            id: newTeamId,
            name: 'Mon Espace',
            slug: null,
            isPersonal: true,
          },
        });

        // Créer la membership
        await prisma.membership.create({
          data: {
            teamId: newTeam.id,
            userId: intruder.userId,
            status: 'ACTIVE',
          },
        });

        // Créer le node racine et board
        const rootId = randomUUID();
        const boardId = randomUUID();
        const rootNode = await prisma.node.create({
          data: {
            id: rootId,
            teamId: newTeam.id,
            workspaceId: boardId,
            parentId: null,
            title: 'Projet Racine',
            description: null,
            path: '/' + rootId,
            depth: 0,
            position: 0,
            createdById: intruder.userId,
          },
        });

        // Créer le board
        const board = await prisma.board.create({
          data: {
            id: boardId,
            nodeId: rootNode.id,
            ownerUserId: intruder.userId,
            isPersonal: true,
          },
        });

        // Créer les colonnes par défaut
        const defaults = [
          { key: 'BACKLOG' as const, label: 'Backlog', position: 0 },
          { key: 'IN_PROGRESS' as const, label: 'En cours', position: 1 },
          { key: 'BLOCKED' as const, label: 'Bloqué', position: 2 },
          { key: 'DONE' as const, label: 'Terminé', position: 3 },
        ];

        const existingBehaviors = await prisma.columnBehavior.findMany({
          where: { key: { in: defaults.map((def) => def.key) } },
          orderBy: { createdAt: 'asc' },
        });
        const behaviorMap = new Map(existingBehaviors.map((b) => [b.key, b.id]));

        for (const def of defaults) {
          if (behaviorMap.has(def.key)) continue;
          const created = await prisma.columnBehavior.create({
            data: {
              key: def.key,
              label: def.label,
            },
          });
          behaviorMap.set(def.key, created.id);
        }

        for (const def of defaults) {
          const behaviorId = behaviorMap.get(def.key);
          if (!behaviorId) continue;
          await prisma.column.create({
            data: {
              boardId: board.id,
              behaviorId,
              name: def.label,
              position: def.position,
            },
          });
        }

        // Supprimer l'ancienne membership de l'intrus
        await prisma.membership.delete({
          where: { id: intruder.id },
        });

      } catch (error) {
      }
    }

  }

}

main()
  .catch((error) => {
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
