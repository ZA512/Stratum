import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== RECHERCHE DES TÂCHES ===\n');

  // Compter toutes les tâches (y compris archivées)
  const totalTasks = await prisma.node.count();
  const activeTasks = await prisma.node.count({ where: { archivedAt: null } });
  const archivedTasks = await prisma.node.count({ where: { archivedAt: { not: null } } });

  console.log(`📊 TOTAL: ${totalTasks} tâches`);
  console.log(`   Active: ${activeTasks}`);
  console.log(`   Archivées: ${archivedTasks}\n`);

  // Lister toutes les tâches actives
  const tasks = await prisma.node.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      title: true,
      shortId: true,
      columnId: true,
      parentId: true,
      createdById: true,
      column: {
        select: {
          name: true,
          board: {
            select: {
              id: true,
              ownerUserId: true,
              isPersonal: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const users = await prisma.user.findMany({
    select: { id: true, email: true },
  });

  console.log('📝 TÂCHES ACTIVES:');
  if (tasks.length === 0) {
    console.log('  Aucune tâche active trouvée!\n');
  } else {
    tasks.forEach((task) => {
      const creator = users.find((u) => u.id === task.createdById);
      const boardOwner = users.find((u) => u.id === task.column?.board.ownerUserId);
      console.log(`\n  [${task.shortId}] ${task.title}`);
      console.log(`    ID: ${task.id}`);
      console.log(`    Créée par: ${creator?.email}`);
      console.log(`    Colonne: ${task.column?.name || 'AUCUNE'} [${task.columnId || 'NULL'}]`);
      console.log(`    Board: ${boardOwner?.email || 'AUCUN'} (personal: ${task.column?.board.isPersonal})`);
      console.log(`    Parent: ${task.parentId || 'AUCUN'}`);
    });
  }

  // Vérifier les tâches sans columnId
  const orphanTasks = await prisma.node.count({
    where: {
      archivedAt: null,
      columnId: null,
    },
  });
  console.log(`\n⚠️ Tâches orphelines (sans columnId): ${orphanTasks}`);

  // Vérifier les invitations
  const invitations = await prisma.nodeShareInvitation.findMany({
    select: {
      id: true,
      status: true,
      inviteeEmail: true,
      inviterId: true,
      inviteeUserId: true,
      nodeId: true,
    },
  });

  console.log(`\n📨 INVITATIONS: ${invitations.length}`);
  for (const inv of invitations) {
    const node = await prisma.node.findUnique({
      where: { id: inv.nodeId },
      select: { title: true, shortId: true, columnId: true },
    });
    const inviter = users.find((u) => u.id === inv.inviterId);
    const invitee = users.find((u) => u.id === inv.inviteeUserId);
    console.log(`  - [${node?.shortId}] ${node?.title}`);
    console.log(`    De: ${inviter?.email} → À: ${invitee?.email || inv.inviteeEmail}`);
    console.log(`    Status: ${inv.status}`);
    console.log(`    ColumnId de la tâche: ${node?.columnId || 'NULL'}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
