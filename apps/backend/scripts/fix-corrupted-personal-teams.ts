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

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Recherche des teams personnelles corrompues...\n');

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

  console.log(`📊 Trouvé ${personalTeams.length} team(s) personnelle(s)\n`);

  const corruptedTeams = personalTeams.filter(t => t.memberships.length > 1);

  if (corruptedTeams.length === 0) {
    console.log('✅ Aucune team personnelle corrompue détectée !\n');
    return;
  }

  console.log(`🚨 ${corruptedTeams.length} team(s) personnelle(s) corrompue(s) détectée(s) !\n`);

  for (const team of corruptedTeams) {
    console.log(`❌ Team: ${team.name} (${team.id})`);
    console.log(`   Membres (${team.memberships.length}):`, team.memberships.map(m => m.user.email).join(', '));
    console.log(`   Node(s) racine: ${team.nodes.length}`);
    
    if (team.nodes.length > 0) {
      const rootNode = team.nodes[0];
      console.log(`   Board owner: ${rootNode.board?.ownerUserId ?? 'NULL'}`);
    }
    console.log('');
  }

  if (!process.argv.includes('--fix')) {
    console.log('\n💡 Pour réparer ces teams corrompues, exécutez:');
    console.log('   npx tsx scripts/fix-corrupted-personal-teams.ts --fix\n');
    console.log('⚠️  ATTENTION: Cette opération va créer de nouvelles teams pour chaque utilisateur');
    console.log('   et migrer les données appropriées. Assurez-vous d\'avoir une sauvegarde !\n');
    return;
  }

  console.log('🔧 Début de la réparation...\n');

  for (const corruptedTeam of corruptedTeams) {
    console.log(`\n🔨 Réparation de la team "${corruptedTeam.name}" (${corruptedTeam.id})...\n`);

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

    console.log(`   👤 Propriétaire légitime identifié: ${originalOwner.user.email}`);

    // Pour chaque autre membre, créer sa propre team personnelle
    const intruders = corruptedTeam.memberships.filter(m => m.userId !== originalOwner.userId);

    for (const intruder of intruders) {
      console.log(`   🚚 Migration de ${intruder.user.email} vers une nouvelle team...`);

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
        const rootNode = await prisma.node.create({
          data: {
            id: rootId,
            teamId: newTeam.id,
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
            nodeId: rootNode.id,
            ownerUserId: intruder.userId,
            isPersonal: true,
          },
        });

        // Créer les colonnes par défaut
        const behaviors = await prisma.columnBehavior.findMany({
          where: { teamId: newTeam.id },
        });

        if (behaviors.length === 0) {
          // Créer les behaviors si pas encore créés pour cette team
          const behaviorData = [
            { key: 'BACKLOG' as const, label: 'Backlog', position: 0 },
            { key: 'IN_PROGRESS' as const, label: 'En cours', position: 1 },
            { key: 'BLOCKED' as const, label: 'Bloqué', position: 2 },
            { key: 'DONE' as const, label: 'Terminé', position: 3 },
          ];

          for (const bData of behaviorData) {
            const behavior = await prisma.columnBehavior.create({
              data: {
                teamId: newTeam.id,
                key: bData.key,
                label: bData.label,
              },
            });

            await prisma.column.create({
              data: {
                boardId: board.id,
                behaviorId: behavior.id,
                name: bData.label,
                position: bData.position,
              },
            });
          }
        }

        // Supprimer l'ancienne membership de l'intrus
        await prisma.membership.delete({
          where: { id: intruder.id },
        });

        console.log(`   ✅ ${intruder.user.email} migré vers sa propre team (${newTeam.id})`);
      } catch (error) {
        console.error(`   ❌ Erreur lors de la migration de ${intruder.user.email}:`, error);
      }
    }

    console.log(`   ✅ Team "${corruptedTeam.name}" réparée ! Propriétaire: ${originalOwner.user.email}\n`);
  }

  console.log('\n✅ Réparation terminée !');
}

main()
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
