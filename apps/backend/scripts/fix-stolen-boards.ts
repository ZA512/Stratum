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
  console.log('🔍 Analyse des boards personnels...\n');

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

  console.log(`📊 Trouvé ${boards.length} board(s) personnel(s)\n`);

  const issues: RepairIssue[] = [];

  for (const board of boards) {
    const team = board.node.team;
    
    // Vérifier que c'est bien une team personnelle
    if (!team.isPersonal) {
      console.warn(`⚠️  Board ${board.id} marqué personnel mais team ${team.id} n'est pas personnelle !`);
      continue;
    }

    // Une team personnelle doit avoir exactement 1 membership active
    if (team.memberships.length !== 1) {
      console.warn(`⚠️  Team personnelle ${team.id} (${team.name}) a ${team.memberships.length} memberships (attendu: 1)`);
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

      console.log(`❌ PROBLÈME DÉTECTÉ:`);
      console.log(`   Board: ${board.id}`);
      console.log(`   Team: ${team.name} (${team.id})`);
      console.log(`   Owner actuel: ${board.ownerUserId ?? 'NULL'}`);
      console.log(`   Owner correct: ${correctOwner.user.email} (${correctOwner.userId})`);
      console.log('');
    }
  }

  if (issues.length === 0) {
    console.log('✅ Aucun problème détecté ! Tous les boards personnels ont le bon propriétaire.\n');
    return;
  }

  console.log(`\n🚨 ${issues.length} board(s) avec ownership incorrect détecté(s) !\n`);
  console.log('Voulez-vous les réparer ? (Cette action va modifier la base de données)');
  console.log('Pour continuer, relancez ce script avec --fix\n');

  // Si --fix est passé en argument, appliquer les corrections
  if (process.argv.includes('--fix')) {
    console.log('🔧 Application des corrections...\n');

    for (const issue of issues) {
      try {
        await prisma.board.update({
          where: { id: issue.boardId },
          data: { ownerUserId: issue.correctOwnerId },
        });

        console.log(`✅ Board ${issue.boardId} réparé:`);
        console.log(`   Nouveau propriétaire: ${issue.correctOwnerEmail}`);
      } catch (error) {
        console.error(`❌ Erreur lors de la réparation du board ${issue.boardId}:`, error);
      }
    }

    console.log('\n✅ Réparation terminée !');
  } else {
    console.log('💡 Pour appliquer les corrections, exécutez:');
    console.log('   npx tsx scripts/fix-stolen-boards.ts --fix\n');
  }
}

main()
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
