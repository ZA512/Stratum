import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSharedPlacements() {
  // IDs from logs
  const bobUserId = 'cmgvk8vdh0004jbyg52esxgm2';
  const aliceBoardId = 'cmgw8xdpv0006jbx8zipchhnp';
  const aliceUserId = 'cmgw8xdpa0002jbx8birv65xe';

  console.log('=== Diagnostic SharedNodePlacement ===\n');

  // 1. Vérifier l'utilisateur Bob
  const bob = await prisma.user.findUnique({
    where: { id: bobUserId },
    select: { id: true, displayName: true, email: true },
  });
  console.log('👤 Bob:', bob);

  // 2. Vérifier l'utilisateur Alice
  const alice = await prisma.user.findUnique({
    where: { id: aliceUserId },
    select: { id: true, displayName: true, email: true },
  });
  console.log('👤 Alice:', alice);

  // 3. Vérifier le board d'Alice
  const aliceBoard = await prisma.board.findUnique({
    where: { id: aliceBoardId },
    select: {
      id: true,
      isPersonal: true,
      ownerUserId: true,
      node: { select: { id: true, title: true } },
      columns: { select: { id: true, name: true } },
    },
  });
  console.log('\n📋 Board d\'Alice:', aliceBoard);

  // 4. Vérifier les placements de Bob sur le board d'Alice
  if (aliceBoard) {
    const columnIds = aliceBoard.columns.map(c => c.id);
    const bobPlacements = await prisma.sharedNodePlacement.findMany({
      where: {
        userId: bobUserId,
        columnId: { in: columnIds },
      },
      include: {
        node: { select: { id: true, title: true } },
        column: { select: { id: true, name: true } },
      },
    });
    console.log('\n🔗 Placements de Bob sur le board d\'Alice:', bobPlacements.length);
    bobPlacements.forEach(p => {
      console.log(`  - Tâche: ${p.node.title} (${p.nodeId})`);
      console.log(`    Colonne: ${p.column.name} (${p.columnId})`);
    });
  }

  // 5. Vérifier le board personnel de Bob
  const bobMembership = await prisma.membership.findFirst({
    where: {
      userId: bobUserId,
      status: 'ACTIVE',
      team: { isPersonal: true },
    },
    include: {
      team: {
        include: {
          nodes: {
            where: { parentId: null },
            include: {
              board: {
                include: {
                  columns: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (bobMembership?.team?.nodes?.[0]?.board) {
    const bobBoard = bobMembership.team.nodes[0].board;
    console.log('\n📋 Board personnel de Bob:', {
      id: bobBoard.id,
      isPersonal: bobBoard.isPersonal,
      ownerUserId: bobBoard.ownerUserId,
      columnsCount: bobBoard.columns.length,
    });

    // Placements sur le board de Bob
    const bobOwnPlacements = await prisma.sharedNodePlacement.findMany({
      where: {
        userId: bobUserId,
        columnId: { in: bobBoard.columns.map(c => c.id) },
      },
      include: {
        node: { select: { id: true, title: true } },
      },
    });
    console.log('\n🔗 Placements de Bob sur SON propre board:', bobOwnPlacements.length);
    bobOwnPlacements.forEach(p => {
      console.log(`  - Tâche: ${p.node.title} (${p.nodeId})`);
    });
  } else {
    console.log('\n❌ Bob n\'a pas de board personnel !');
  }

  // 6. Vérifier les invitations de Bob
  const bobInvitations = await prisma.nodeShareInvitation.findMany({
    where: {
      OR: [
        { inviteeUserId: bobUserId },
        { inviteeEmail: bob?.email },
      ],
    },
    include: {
      node: { select: { id: true, title: true } },
      inviter: { select: { displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log('\n📨 Invitations de Bob:', bobInvitations.length);
  bobInvitations.forEach(inv => {
    console.log(`  - ${inv.node.title} par ${inv.inviter.displayName}`);
    console.log(`    Status: ${inv.status}, Date: ${inv.createdAt}`);
  });

  await prisma.$disconnect();
}

checkSharedPlacements().catch(console.error);
