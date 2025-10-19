import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== DIAGNOSTIC BOARDS PERSONNELS ===\n');

  // Récupérer tous les utilisateurs
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      displayName: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log('👥 UTILISATEURS:');
  users.forEach((u) => {
    console.log(`  - ${u.email} (${u.displayName}) [${u.id}]`);
  });

  // Récupérer tous les boards personnels
  const boards = await prisma.board.findMany({
    where: { isPersonal: true },
    include: {
      node: {
        select: { id: true, title: true },
      },
      columns: {
        select: { id: true, name: true },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log('\n📋 BOARDS PERSONNELS:');
  boards.forEach((b) => {
    const owner = users.find((u) => u.id === b.ownerUserId);
    console.log(`  Board: ${b.node.title}`);
    console.log(`    ID: ${b.id}`);
    console.log(`    Node ID: ${b.nodeId}`);
    console.log(`    Owner: ${owner?.email} [${b.ownerUserId}]`);
    console.log(`    Columns: ${b.columns.length}`);
    b.columns.forEach((col) => {
      console.log(`      - ${col.name} [${col.id}]`);
    });
  });

  // Compter les tâches par board
  console.log('\n📝 TÂCHES PAR BOARD:');
  for (const board of boards) {
    const columnIds = board.columns.map((c) => c.id);
    const taskCount = await prisma.node.count({
      where: {
        columnId: { in: columnIds },
        archivedAt: null,
      },
    });
    const owner = users.find((u) => u.id === board.ownerUserId);
    console.log(`  ${owner?.email}: ${taskCount} tâches`);

    // Lister les premières tâches
    if (taskCount > 0) {
      const tasks = await prisma.node.findMany({
        where: {
          columnId: { in: columnIds },
          archivedAt: null,
        },
        select: {
          id: true,
          title: true,
          shortId: true,
          createdById: true,
        },
        take: 10,
      });
      tasks.forEach((task) => {
        const creator = users.find((u) => u.id === task.createdById);
        console.log(`    - [${task.shortId}] ${task.title} (créée par ${creator?.email})`);
      });
    }
  }

  // Vérifier les SharedNodePlacement
  console.log('\n🔗 SHARED NODE PLACEMENTS:');
  for (const user of users) {
    const placements = await prisma.sharedNodePlacement.findMany({
      where: { userId: user.id },
      include: {
        node: { select: { title: true, shortId: true } },
        column: { select: { name: true, board: { select: { ownerUserId: true } } } },
      },
    });
    console.log(`  ${user.email}: ${placements.length} placements`);
    placements.forEach((p) => {
      const boardOwner = users.find((u) => u.id === p.column.board.ownerUserId);
      console.log(`    - [${p.node.shortId}] ${p.node.title} sur board de ${boardOwner?.email}`);
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
