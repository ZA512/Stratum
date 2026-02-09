import { PrismaClient, MembershipStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { seedDemoData } from './seed';
import { buildPrismaClientOptions } from '../src/prisma/prisma.utils';

/**
 * Script de remise à zéro étendue:
 * 1. Purge toutes les données non critiques (boards personnels inconsistants).
 * 2. Lance le seed de démonstration.
 * 3. Pour chaque utilisateur existant (hors utilisateur démo), crée un espace personnel si absent.
 */
async function main() {
  const prisma = new PrismaClient(buildPrismaClientOptions());
  try {
    console.log('🚩 Reset personnel: démarrage');
    // Étape 1: (optionnel) Purge des boards orphelins personnels sans owner.
    // Nettoyage léger désactivé (champ ownerUserId non reconnu dans génération Prisma actuelle)

    // Étape 2: Seed démo (idempotent)
    await seedDemoData(prisma);

    // Étape 3: Créer espace personnel pour utilisateurs existants hors démo
    const users = await prisma.user.findMany({});
    for (const user of users) {
      if (user.email === 'alice@stratum.dev') continue; // utilisateur démo déjà géré par seed
      // Vérifier membership existant
      const activeMembership = await prisma.membership.findFirst({
        where: { userId: user.id, status: MembershipStatus.ACTIVE },
        include: { team: true },
        orderBy: { createdAt: 'asc' },
      });
      if (activeMembership) {
        continue; // déjà un espace personnel
      }
      // Créer team personnelle + board racine
      const personalTeam = await prisma.team.create({
        data: { name: 'Mon Espace', slug: null },
      });
      await prisma.membership.create({
        data: { teamId: personalTeam.id, userId: user.id, status: MembershipStatus.ACTIVE },
      });
      const boardId = randomUUID();
      const rootNode = await prisma.node.create({
        data: {
          teamId: personalTeam.id,
          workspaceId: boardId,
          parentId: null,
          title: 'Projet Racine',
          description: null,
          path: '/' + personalTeam.id,
          depth: 0,
          position: 0,
          createdById: user.id,
        },
      });
      const board = await prisma.board.create({
        data: { id: boardId, nodeId: rootNode.id },
      });
      // Créer comportements et colonnes standards
      const defaults = [
        { key: 'BACKLOG', label: 'Backlog', color: '#6b7280' },
        { key: 'IN_PROGRESS', label: 'En cours', color: '#2563eb' },
        { key: 'BLOCKED', label: 'Bloque', color: '#f97316' },
        { key: 'DONE', label: 'Termine', color: '#16a34a' },
      ];
      const behaviorMap = new Map<string, string>();
      const fetchedBehaviors = await prisma.columnBehavior.findMany({
        where: { key: { in: defaults.map((def) => def.key as any) } },
        orderBy: { createdAt: 'asc' },
      });
      for (const fb of fetchedBehaviors) {
        behaviorMap.set(fb.key, fb.id);
      }
      for (const def of defaults) {
        if (behaviorMap.has(def.key)) continue;
        const created = await prisma.columnBehavior.create({
          data: {
            key: def.key as any,
            label: def.label,
            color: def.color,
          },
        });
        behaviorMap.set(def.key, created.id);
      }
      const columns = [
        { key: 'BACKLOG', name: 'Backlog', position: 0, wipLimit: null },
        { key: 'IN_PROGRESS', name: 'En cours', position: 1, wipLimit: 5 },
        { key: 'BLOCKED', name: 'Bloque', position: 2, wipLimit: null },
        { key: 'DONE', name: 'Termine', position: 3, wipLimit: null },
      ];
      for (const col of columns) {
        const behaviorId = behaviorMap.get(col.key);
        if (!behaviorId) continue;
        await prisma.column.create({
          data: {
            boardId: board.id,
            name: col.name,
            position: col.position,
            wipLimit: col.wipLimit,
            behaviorId,
          },
        });
      }
      await prisma.node.update({
        where: { id: rootNode.id },
        data: { statusMetadata: { boardId: board.id } as any },
      });
      console.log('✅ Espace personnel créé pour', user.email, '-> board', board.id);
    }
    console.log('🎉 Reset personnel terminé');
  } catch (e) {
    console.error('❌ Reset personnel échoué', e);
    process.exitCode = 1;
  } finally {
    // eslint-disable-next-line no-console
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}