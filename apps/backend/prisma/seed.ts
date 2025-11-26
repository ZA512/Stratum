import { ColumnBehaviorKey, MembershipStatus, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export const DEMO_IDS = {
  team: 'team_stratum',
  board: 'board_stratum_root',
  rootNode: 'node_stratum_root',
  user: 'user_alice',
  behaviors: {
    backlog: 'behav_backlog',
    inProgress: 'behav_in_progress',
    blocked: 'behav_blocked',
    done: 'behav_done',
  },
  columns: {
    backlog: 'column_backlog',
    inProgress: 'column_in_progress',
    blocked: 'column_blocked',
    done: 'column_done',
  },
  nodes: {
    backlog: 'node_spec_breadcrumb',
    inProgress: 'node_api_contracts',
    blocked: 'node_dependencies_audit',
    done: 'node_launch_announce',
  },
  assignment: 'assign_alice_api',
  membership: 'membership_alice_stratum',
} as const;

export const DEMO_PASSWORD = 'stratum';

async function upsertCoreEntities(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const team = await prisma.team.upsert({
    where: { id: DEMO_IDS.team },
    update: {
      name: 'Stratum Core',
      slug: null, // éviter conflit unique slug
      description: 'Core workspace for Stratum demos.'
    },
    create: {
      id: DEMO_IDS.team,
      name: 'Stratum Core',
      slug: null,
      description: 'Core workspace for Stratum demos.'
    }
  });

  const user = await prisma.user.upsert({
    where: { email: 'alice@stratum.dev' },
    update: {
      displayName: 'Alice Rivera',
      locale: 'en-US',
      passwordHash
    },
    create: {
      id: DEMO_IDS.user,
      email: 'alice@stratum.dev',
      displayName: 'Alice Rivera',
      locale: 'en-US',
      passwordHash
    }
  });

  await prisma.membership.upsert({
    where: { id: DEMO_IDS.membership },
    update: {
      status: MembershipStatus.ACTIVE,
      title: 'Product Owner',
      userId: user.id,
      teamId: team.id
    },
    create: {
      id: DEMO_IDS.membership,
      userId: user.id,
      teamId: team.id,
      status: MembershipStatus.ACTIVE,
      title: 'Product Owner'
    }
  });

  return { team, user };
}

async function upsertColumnBehaviors(prisma: PrismaClient) {
  const behaviors = [
    { id: DEMO_IDS.behaviors.backlog, key: ColumnBehaviorKey.BACKLOG, label: 'Backlog', color: '#6b7280' },
    { id: DEMO_IDS.behaviors.inProgress, key: ColumnBehaviorKey.IN_PROGRESS, label: 'In Progress', color: '#2563eb' },
    { id: DEMO_IDS.behaviors.blocked, key: ColumnBehaviorKey.BLOCKED, label: 'Blocked', color: '#f97316' },
    { id: DEMO_IDS.behaviors.done, key: ColumnBehaviorKey.DONE, label: 'Done', color: '#16a34a' }
  ];

  for (const b of behaviors) {
    await prisma.columnBehavior.upsert({
      where: { id: b.id },
      update: { key: b.key, label: b.label, color: b.color },
      create: { id: b.id, key: b.key, label: b.label, color: b.color }
    });
  }
}

async function createRootBoard(prisma: PrismaClient, userId: string) {
  const rootNode = await prisma.node.upsert({
    where: { id: DEMO_IDS.rootNode },
    update: {
      title: 'Master Kanban',
      description: 'Master project board showcasing the fractal kanban.',
      workspaceId: DEMO_IDS.board,
    },
    create: {
      id: DEMO_IDS.rootNode,
      teamId: DEMO_IDS.team,
      workspaceId: DEMO_IDS.board,
      title: 'Master Kanban',
      description: 'Master project board showcasing the fractal kanban.',
      path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}`,
      depth: 0,
      position: 0,
      createdById: userId
    }
  });

  await prisma.board.upsert({
    where: { id: DEMO_IDS.board },
    update: { nodeId: rootNode.id },
    create: { id: DEMO_IDS.board, nodeId: rootNode.id }
  });

  const columns = [
    { id: DEMO_IDS.columns.backlog, name: 'Backlog', position: 0, wipLimit: null, behaviorId: DEMO_IDS.behaviors.backlog },
    { id: DEMO_IDS.columns.inProgress, name: 'In progress', position: 1, wipLimit: 5, behaviorId: DEMO_IDS.behaviors.inProgress },
    { id: DEMO_IDS.columns.blocked, name: 'Blocked', position: 2, wipLimit: null, behaviorId: DEMO_IDS.behaviors.blocked },
    { id: DEMO_IDS.columns.done, name: 'Done', position: 3, wipLimit: null, behaviorId: DEMO_IDS.behaviors.done }
  ];

  for (const c of columns) {
    await prisma.column.upsert({
      where: { id: c.id },
      update: { name: c.name, position: c.position, wipLimit: c.wipLimit, behaviorId: c.behaviorId },
      create: { id: c.id, boardId: DEMO_IDS.board, name: c.name, position: c.position, wipLimit: c.wipLimit, behaviorId: c.behaviorId }
    });
  }

  return rootNode.id;
}

async function seedDemoNodes(prisma: PrismaClient, rootNodeId: string, userId: string) {
  const makeNode = async (id: string, columnId: string | null, title: string, position: number, extra: any = {}) => {
    await prisma.node.upsert({
      where: { id },
      update: {
        title,
        columnId: columnId ?? undefined,
        workspaceId: DEMO_IDS.board,
      },
      create: {
        id,
        teamId: DEMO_IDS.team,
        workspaceId: DEMO_IDS.board,
        parentId: rootNodeId,
        columnId: columnId ?? undefined,
        title,
        description: extra.description,
        path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${id}`,
        depth: 1,
        position,
        createdById: userId,
        statusMetadata: extra.statusMetadata ?? {},
        blockedReason: extra.blockedReason,
        blockedReminderEmails: extra.blockedReminderEmails ?? [],
        blockedReminderIntervalDays: extra.blockedReminderIntervalDays,
        blockedExpectedUnblockAt: extra.blockedExpectedUnblockAt,
        blockedSince: extra.blockedSince,
        isBlockResolved: extra.isBlockResolved ?? false
      }
    });
  };

  await makeNode(DEMO_IDS.nodes.backlog, DEMO_IDS.columns.backlog, 'Finaliser le design breadcrumb', 0, { description: 'Micro-interactions et accessibilité du breadcrumb fractal.' });
  await makeNode(DEMO_IDS.nodes.inProgress, DEMO_IDS.columns.inProgress, 'Stabiliser les contrats API', 1, { description: 'Valider schémas OpenAPI pour Teams/Boards/Nodes.' });
  await makeNode(DEMO_IDS.nodes.blocked, DEMO_IDS.columns.blocked, 'Analyser les dépendances critiques', 2, { description: 'Identifier boucles potentielles dans le graphe fractal.', blockedReason: 'Attente specs infra' });
  await makeNode(DEMO_IDS.nodes.done, DEMO_IDS.columns.done, 'Annonce interne du lancement', 3, { description: 'Communiquer roadmap Stratum à l’équipe élargie.' });

  await prisma.nodeAssignment.upsert({
    where: { id: DEMO_IDS.assignment },
    update: { nodeId: DEMO_IDS.nodes.inProgress, userId },
    create: { id: DEMO_IDS.assignment, nodeId: DEMO_IDS.nodes.inProgress, userId, role: 'Owner' }
  });
}

async function createDeepHierarchy(prisma: PrismaClient) {
  console.log('🔷 Création hiérarchie profonde (breadcrumb test)');
  const backlogNode = await prisma.node.findUnique({ where: { id: DEMO_IDS.nodes.backlog } });
  if (!backlogNode) return;

  const subBoard = await prisma.board.upsert({
    where: { id: 'board_breadcrumb_sub' },
    update: { nodeId: backlogNode.id },
    create: { id: 'board_breadcrumb_sub', nodeId: backlogNode.id }
  });

  const behaviors = await prisma.columnBehavior.findMany({
    where: { id: { in: Object.values(DEMO_IDS.behaviors) } },
  });
  const backlogBehavior = behaviors.find(b => b.key === ColumnBehaviorKey.BACKLOG);
  const progressBehavior = behaviors.find(b => b.key === ColumnBehaviorKey.IN_PROGRESS);
  if (!backlogBehavior || !progressBehavior) return;

  // Colonnes sous-board
  await prisma.column.upsert({ where: { id: 'col_sub_backlog' }, update: {}, create: { id: 'col_sub_backlog', boardId: subBoard.id, name: 'Sub Backlog', position: 0, behaviorId: backlogBehavior.id } });
  await prisma.column.upsert({ where: { id: 'col_sub_progress' }, update: {}, create: { id: 'col_sub_progress', boardId: subBoard.id, name: 'Sub Progress', position: 1, behaviorId: progressBehavior.id } });

  const level2Node = await prisma.node.upsert({
    where: { id: 'node_level2_design' },
    update: {},
    create: {
      id: 'node_level2_design',
      teamId: DEMO_IDS.team,
      parentId: backlogNode.id,
      columnId: 'col_sub_backlog',
      title: 'Composants de design',
      description: 'Finaliser les composants UI du breadcrumb',
      path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${backlogNode.id}/node_level2_design`,
      depth: 2,
      position: 0,
      createdById: DEMO_IDS.user
    }
  });

  const level2Board = await prisma.board.upsert({ where: { id: 'board_level2_design' }, update: { nodeId: level2Node.id }, create: { id: 'board_level2_design', nodeId: level2Node.id } });
  await prisma.column.upsert({ where: { id: 'col_l2_backlog' }, update: {}, create: { id: 'col_l2_backlog', boardId: level2Board.id, name: 'Design Backlog', position: 0, behaviorId: backlogBehavior.id } });
  await prisma.column.upsert({ where: { id: 'col_l2_progress' }, update: {}, create: { id: 'col_l2_progress', boardId: level2Board.id, name: 'Design Progress', position: 1, behaviorId: progressBehavior.id } });

  await prisma.node.upsert({
    where: { id: 'node_level3_icons' },
    update: {},
    create: {
      id: 'node_level3_icons', teamId: DEMO_IDS.team, parentId: level2Node.id, columnId: 'col_l2_backlog', title: 'Icônes de type', description: 'Créer les icônes S, M, K pour les types de nœuds', path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${backlogNode.id}/node_level2_design/node_level3_icons`, depth: 3, position: 0, createdById: DEMO_IDS.user
    }
  });
  await prisma.node.upsert({
    where: { id: 'node_level3_colors' },
    update: {},
    create: {
      id: 'node_level3_colors', teamId: DEMO_IDS.team, parentId: level2Node.id, columnId: 'col_l2_progress', title: 'Palette de couleurs', description: 'Définir la génération de couleurs HSL pour les couches', path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${backlogNode.id}/node_level2_design/node_level3_colors`, depth: 3, position: 1, createdById: DEMO_IDS.user
    }
  });

  const level3Board = await prisma.board.upsert({ where: { id: 'board_level3_colors' }, update: { nodeId: 'node_level3_colors' }, create: { id: 'board_level3_colors', nodeId: 'node_level3_colors' } });
  await prisma.column.upsert({ where: { id: 'col_l3_tasks' }, update: {}, create: { id: 'col_l3_tasks', boardId: level3Board.id, name: 'Color Tasks', position: 0, behaviorId: progressBehavior.id } });

  await prisma.node.upsert({
    where: { id: 'node_level4_hsl' },
    update: {},
    create: {
      id: 'node_level4_hsl', teamId: DEMO_IDS.team, parentId: 'node_level3_colors', columnId: 'col_l3_tasks', title: 'Algorithme HSL', description: 'Implémentation de la fonction generateLayerColors', path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${DEMO_IDS.nodes.backlog}/node_level2_design/node_level3_colors/node_level4_hsl`, depth: 4, position: 0, createdById: DEMO_IDS.user
    }
  });

  console.log('✅ Hiérarchie profonde créée');
}

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const { user } = await upsertCoreEntities(prisma);
  await upsertColumnBehaviors(prisma);
  const rootNodeId = await createRootBoard(prisma, user.id);
  await seedDemoNodes(prisma, rootNodeId, user.id);
  await createDeepHierarchy(prisma);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedDemoData(prisma)
    .catch((error) => {
      console.error('[seed] failed', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
