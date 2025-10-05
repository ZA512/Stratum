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
  // Anciennes checklistItems supprimées
} as const;

type DemoIds = typeof DEMO_IDS;

export const DEMO_PASSWORD = 'stratum';

type ColumnSeed = {
  id: string;
  name: string;
  position: number;
  wipLimit: number | null;
  behaviorId: string;
};

// plus de checklist items

async function upsertCoreEntities(prisma: PrismaClient, ids: DemoIds) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [team, user] = await Promise.all([
    prisma.team.upsert({
      where: { id: ids.team },
      update: {
        name: 'Stratum Core',
        slug: 'stratum-core',
        description: 'Core workspace for Stratum demos.',
      },
      create: {
        id: ids.team,
        name: 'Stratum Core',
        slug: 'stratum-core',
        description: 'Core workspace for Stratum demos.',
      },
    }),
    prisma.user.upsert({
      where: { id: ids.user },
      update: {
        displayName: 'Alice Rivera',
        locale: 'en-US',
        passwordHash,
      },
      create: {
        id: ids.user,
        email: 'alice@stratum.dev',
        displayName: 'Alice Rivera',
        locale: 'en-US',
        passwordHash,
      },
    }),
  ]);

  await prisma.membership.upsert({
    where: { id: ids.membership },
    update: {
      status: MembershipStatus.ACTIVE,
      title: 'Product Owner',
    },
    create: {
      id: ids.membership,
      userId: ids.user,
      teamId: ids.team,
      status: MembershipStatus.ACTIVE,
      title: 'Product Owner',
    },
  });

  return { team, user };
}

async function upsertColumnBehaviors(prisma: PrismaClient, ids: DemoIds) {
  const payload = [
    {
      id: ids.behaviors.backlog,
      key: ColumnBehaviorKey.BACKLOG,
      label: 'Backlog',
      color: '#6b7280',
    },
    {
      id: ids.behaviors.inProgress,
      key: ColumnBehaviorKey.IN_PROGRESS,
      label: 'In Progress',
      color: '#2563eb',
    },
    {
      id: ids.behaviors.blocked,
      key: ColumnBehaviorKey.BLOCKED,
      label: 'Blocked',
      color: '#f97316',
    },
    {
      id: ids.behaviors.done,
      key: ColumnBehaviorKey.DONE,
      label: 'Done',
      color: '#16a34a',
    },
  ];

  await Promise.all(
    payload.map((item) =>
      prisma.columnBehavior.upsert({
        where: { id: item.id },
        update: {
          key: item.key,
          label: item.label,
          color: item.color,
        },
        create: {
          id: item.id,
          teamId: ids.team,
          key: item.key,
          label: item.label,
          color: item.color,
        },
      }),
    ),
  );
}

function buildColumns(ids: DemoIds): ColumnSeed[] {
  return [
    {
      id: ids.columns.backlog,
      name: 'Backlog',
      position: 0,
      wipLimit: null,
      behaviorId: ids.behaviors.backlog,
    },
    {
      id: ids.columns.inProgress,
      name: 'In progress',
      position: 1,
      wipLimit: 5,
      behaviorId: ids.behaviors.inProgress,
    },
    {
      id: ids.columns.blocked,
      name: 'Blocked',
      position: 2,
      wipLimit: null,
      behaviorId: ids.behaviors.blocked,
    },
    {
      id: ids.columns.done,
      name: 'Done',
      position: 3,
      wipLimit: null,
      behaviorId: ids.behaviors.done,
    },
  ];
}

async function upsertRootBoard(
  prisma: PrismaClient,
  ids: DemoIds,
  userId: string,
) {
  const rootNode = await prisma.node.upsert({
    where: { id: ids.rootNode },
    update: {
      title: 'Master Kanban',
      description: 'Master project board showcasing the fractal kanban.',
    },
    create: {
      id: ids.rootNode,
      teamId: ids.team,
      title: 'Master Kanban',
      description: 'Master project board showcasing the fractal kanban.',
      path: [ids.team, ids.rootNode].join('/'),
      depth: 0,
      position: 0,
      createdById: userId,
    },
  });

  await prisma.board.upsert({
    where: { id: ids.board },
    update: {},
    create: {
      id: ids.board,
      nodeId: rootNode.id,
    },
  });

  const columns = buildColumns(ids);
  for (const column of columns) {
    await prisma.column.upsert({
      where: { id: column.id },
      update: {
        name: column.name,
        position: column.position,
        wipLimit: column.wipLimit,
        behaviorId: column.behaviorId,
      },
      create: {
        id: column.id,
        boardId: ids.board,
        name: column.name,
        position: column.position,
        wipLimit: column.wipLimit,
        behaviorId: column.behaviorId,
      },
    });
  }

  return rootNode;
}

// buildChecklistItems supprimé

async function seedDemoNodes(
  prisma: PrismaClient,
  ids: DemoIds,
  rootNodeId: string,
  userId: string,
) {
  const backlogNodeId = ids.nodes.backlog;
  const progressNodeId = ids.nodes.inProgress;
  const blockedNodeId = ids.nodes.blocked;
  const doneNodeId = ids.nodes.done;

  await prisma.node.upsert({
    where: { id: backlogNodeId },
    update: {
      columnId: ids.columns.backlog,
      title: 'Finaliser le design breadcrumb',
    },
    create: {
      id: backlogNodeId,
      teamId: ids.team,
      parentId: rootNodeId,
      columnId: ids.columns.backlog,
      title: 'Finaliser le design breadcrumb',
      description: 'Micro-interactions et accessibilité du breadcrumb fractal.',
      path: [ids.team, ids.rootNode, backlogNodeId].join('/'),
      depth: 1,
      position: 0,
      createdById: userId,
      statusMetadata: {},
    },
  });

  // checklist supprimée

  await prisma.node.upsert({
    where: { id: progressNodeId },
    update: {
      columnId: ids.columns.inProgress,
      title: 'Stabiliser les contrats API',
    },
    create: {
      id: progressNodeId,
      teamId: ids.team,
      parentId: rootNodeId,
      columnId: ids.columns.inProgress,
      title: 'Stabiliser les contrats API',
      description: 'Valider schémas OpenAPI pour Teams/Boards/Nodes.',
      path: [ids.team, ids.rootNode, progressNodeId].join('/'),
      depth: 1,
      position: 1,
      createdById: userId,
    },
  });

  await prisma.node.upsert({
    where: { id: blockedNodeId },
    update: {
      columnId: ids.columns.blocked,
      title: 'Analyser les dépendances critiques',
    },
    create: {
      id: blockedNodeId,
      teamId: ids.team,
      parentId: rootNodeId,
      columnId: ids.columns.blocked,
      title: 'Analyser les dépendances critiques',
      description: 'Identifier les boucles potentielles dans le graphe fractal.',
      path: [ids.team, ids.rootNode, blockedNodeId].join('/'),
      depth: 1,
      position: 2,
      createdById: userId,
      statusMetadata: {
        blockedReason: 'Attente specs infra',
      },
    },
  });

  await prisma.node.upsert({
    where: { id: doneNodeId },
    update: {
      columnId: ids.columns.done,
      title: 'Annonce interne du lancement',
    },
    create: {
      id: doneNodeId,
      teamId: ids.team,
      parentId: rootNodeId,
      columnId: ids.columns.done,
      title: 'Annonce interne du lancement',
      description: 'Communiquer roadmap Stratum à l’équipe élargie.',
      path: [ids.team, ids.rootNode, doneNodeId].join('/'),
      depth: 1,
      position: 3,
      createdById: userId,
    },
  });

  await prisma.nodeAssignment.upsert({
    where: { id: ids.assignment },
    update: {
      nodeId: progressNodeId,
      userId,
    },
    create: {
      id: ids.assignment,
      nodeId: progressNodeId,
      userId,
      role: 'Owner',
    },
  });
}

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const { user } = await upsertCoreEntities(prisma, DEMO_IDS);
  await upsertColumnBehaviors(prisma, DEMO_IDS);
  const rootNode = await upsertRootBoard(prisma, DEMO_IDS, user.id);
  await seedDemoNodes(prisma, DEMO_IDS, rootNode.id, user.id);
  await createDeepHierarchy(prisma);
}

async function createDeepHierarchy(prisma: PrismaClient) {
  console.log('🏗️  Création d\'une hiérarchie profonde pour tester le breadcrumb...');

  // Convertir le nœud backlog en complexe pour en faire un sous-board
  const backlogNode = await prisma.node.findUnique({ where: { id: DEMO_IDS.nodes.backlog } });
  if (!backlogNode) throw new Error('backlog node introuvable');

  // Créer un board pour ce nœud
  const subBoard = await prisma.board.upsert({
    where: { id: 'board_breadcrumb_sub' },
    update: {},
    create: {
      id: 'board_breadcrumb_sub',
      nodeId: backlogNode.id,
    },
  });

  // Récupérer les behaviors existants
  const behaviors = await prisma.columnBehavior.findMany({
    where: { teamId: DEMO_IDS.team },
  });

  const backlogBehavior = behaviors.find(b => b.key === ColumnBehaviorKey.BACKLOG)!;
  const progressBehavior = behaviors.find(b => b.key === ColumnBehaviorKey.IN_PROGRESS)!;

  // Créer des colonnes pour le sous-board
  await Promise.all([
    prisma.column.upsert({
      where: { id: 'col_sub_backlog' },
      update: {},
      create: {
        id: 'col_sub_backlog',
        boardId: subBoard.id,
        name: 'Sub Backlog',
        position: 0,
        behaviorId: backlogBehavior.id,
      },
    }),
    prisma.column.upsert({
      where: { id: 'col_sub_progress' },
      update: {},
      create: {
        id: 'col_sub_progress',
        boardId: subBoard.id,
        name: 'Sub Progress',
        position: 1,
        behaviorId: progressBehavior.id,
      },
    }),
  ]);

  // Créer des nœuds de niveau 2
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
      createdById: DEMO_IDS.user,
    },
  });

  // Créer un autre board pour le niveau 2
  const level2Board = await prisma.board.upsert({
    where: { id: 'board_level2_design' },
    update: {},
    create: {
      id: 'board_level2_design',
      nodeId: level2Node.id,
    },
  });

  // Créer des colonnes pour le niveau 2
  await Promise.all([
    prisma.column.upsert({
      where: { id: 'col_l2_backlog' },
      update: {},
      create: {
        id: 'col_l2_backlog',
        boardId: level2Board.id,
        name: 'Design Backlog',
        position: 0,
        behaviorId: backlogBehavior.id,
      },
    }),
    prisma.column.upsert({
      where: { id: 'col_l2_progress' },
      update: {},
      create: {
        id: 'col_l2_progress',
        boardId: level2Board.id,
        name: 'Design Progress',
        position: 1,
        behaviorId: progressBehavior.id,
      },
    }),
  ]);

  // Créer des nœuds de niveau 3
  await Promise.all([
    prisma.node.upsert({
      where: { id: 'node_level3_icons' },
      update: {},
      create: {
        id: 'node_level3_icons',
        teamId: DEMO_IDS.team,
        parentId: level2Node.id,
        columnId: 'col_l2_backlog',
        title: 'Icônes de type',
        description: 'Créer les icônes S, M, K pour les types de nœuds',
        path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${backlogNode.id}/node_level2_design/node_level3_icons`,
        depth: 3,
        position: 0,
        createdById: DEMO_IDS.user,
      },
    }),
    prisma.node.upsert({
      where: { id: 'node_level3_colors' },
      update: {},
      create: {
        id: 'node_level3_colors',
        teamId: DEMO_IDS.team,
        parentId: level2Node.id,
        columnId: 'col_l2_progress',
        title: 'Palette de couleurs',
        description: 'Définir la génération de couleurs HSL pour les couches',
        path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${backlogNode.id}/node_level2_design/node_level3_colors`,
        depth: 3,
        position: 1,
        createdById: DEMO_IDS.user,
      },
    }),
  ]);

  // Créer un board pour les couleurs niveau 3
  const level3Board = await prisma.board.upsert({
    where: { id: 'board_level3_colors' },
    update: {},
    create: {
      id: 'board_level3_colors',
      nodeId: 'node_level3_colors',
    },
  });

  // Créer une colonne pour le niveau 3
  await prisma.column.upsert({
    where: { id: 'col_l3_tasks' },
    update: {},
    create: {
      id: 'col_l3_tasks',
      boardId: level3Board.id,
      name: 'Color Tasks',
      position: 0,
      behaviorId: progressBehavior.id,
    },
  });

  // Créer un nœud niveau 4
  await prisma.node.upsert({
    where: { id: 'node_level4_hsl' },
    update: {},
    create: {
      id: 'node_level4_hsl',
      teamId: DEMO_IDS.team,
      parentId: 'node_level3_colors',
      columnId: 'col_l3_tasks',
      title: 'Algorithme HSL',
      description: 'Implémentation de la fonction generateLayerColors',
      path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/${DEMO_IDS.nodes.backlog}/node_level2_design/node_level3_colors/node_level4_hsl`,
      depth: 4,
      position: 0,
      createdById: DEMO_IDS.user,
    },
  });

  console.log('✅ Hiérarchie profonde créée - 4 niveaux disponibles pour tester le breadcrumb !');
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
