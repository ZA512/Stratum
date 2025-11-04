const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const node = await prisma.node.findFirst({
      where: { shortId: 17, archivedAt: null },
      select: { 
        id: true, 
        shortId: true, 
        title: true, 
        teamId: true, 
        columnId: true, 
        metadata: true,
        column: {
          select: {
            id: true,
            name: true,
            boardId: true,
            board: {
              select: {
                id: true,
                node: {
                  select: {
                    title: true
                  }
                }
              }
            }
          }
        }
      }
    });
    console.log('Task 17:', JSON.stringify(node, null, 2));
    
    if (node) {
      const invitations = await prisma.nodeShareInvitation.findMany({
        where: { nodeId: node.id },
        orderBy: { createdAt: 'desc' }
      });
      console.log('\nInvitations for task 17:', JSON.stringify(invitations, null, 2));
      
      // Check test@test.fr user
      const testUser = await prisma.user.findUnique({
        where: { email: 'test@test.fr' },
        select: { id: true, email: true }
      });
      console.log('\nTest user:', testUser);
      
      // Check if test user is in the same team
      const testUserTeam = await prisma.teamMembership.findFirst({
        where: { 
          userId: testUser.id,
          teamId: node.teamId 
        }
      });
      console.log('\nTest user in same team:', !!testUserTeam);
      
      // Check test user's board
      const testUserBoard = await prisma.board.findUnique({
        where: {
          id: node.column?.boardId
        },
        select: { id: true, nodeId: true, node: { select: { title: true } } }
      });
      console.log('\nBoard with this column:', testUserBoard);
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

check();
