import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Création du board personnel pour Alice...\n');

  // Vérifier si Alice a déjà une membership
  const memberships = await prisma.membership.findMany({
    where: { userId: 'user_alice' },
    include: { team: { include: { nodes: { where: { parentId: null }, include: { board: true } } } } },
  });

  console.log(`Alice a ${memberships.length} membership(s):`);
  memberships.forEach((m) => {
    console.log(`  - Team: ${m.team.name} (isPersonal: ${m.team.isPersonal})`);
    console.log(`    Nodes: ${m.team.nodes.length}`);
    m.team.nodes.forEach((n) => {
      console.log(`      - ${n.title} → Board: ${n.board?.id || 'AUCUN'}`);
    });
  });

  // Trouver ou créer team personnelle
  const personalMembership = memberships.find((m) => m.team.isPersonal);
  
  if (!personalMembership) {
    console.log('\n✨ Alice n\'a pas de team personnelle, création...');
    const { randomUUID } = await import('crypto');
    
    const teamId = randomUUID();
    const team = await prisma.team.create({
      data: { id: teamId, name: 'Mon Espace', slug: null, isPersonal: true },
    });
    
    await prisma.membership.create({
      data: { teamId: team.id, userId: 'user_alice', status: 'ACTIVE' },
    });
    
    const rootId = randomUUID();
    const boardId = randomUUID();
    const rootNode = await prisma.node.create({
      data: {
        id: rootId,
        teamId: team.id,
        workspaceId: boardId,
        parentId: null,
        title: 'Projet Racine',
        description: null,
        path: '/' + rootId,
        depth: 0,
        position: 0,
        createdById: 'user_alice',
      },
    });
    
    const board = await prisma.board.create({
      data: {
        id: boardId,
        nodeId: rootNode.id,
        ownerUserId: 'user_alice',
        isPersonal: true,
      },
    });
    
    // Créer comportements
    const behaviorMap = new Map<string, string>();
    const defaults = [
      { key: 'BACKLOG', label: 'Backlog', color: '#6b7280' },
      { key: 'IN_PROGRESS', label: 'En cours', color: '#2563eb' },
      { key: 'BLOCKED', label: 'Bloque', color: '#f97316' },
      { key: 'DONE', label: 'Termine', color: '#16a34a' },
    ];

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
    
    console.log(`✅ Board personnel créé pour Alice:`);
    console.log(`   Team ID: ${team.id}`);
    console.log(`   Board ID: ${board.id}`);
    console.log(`   Node ID: ${rootNode.id}`);
  } else {
    console.log('\n✅ Alice a déjà une team personnelle!');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
