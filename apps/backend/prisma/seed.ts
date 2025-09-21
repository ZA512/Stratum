import {
  ColumnBehaviorKey,
  MembershipStatus,
  NodeType,
  PrismaClient,
} from '@prisma/client';
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
  checklistItems: {
    storybook: 'check_breadcrumb_storybook',
    keyboard: 'check_breadcrumb_keyboard',
    theme: 'check_breadcrumb_theme',
  },
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

type ChecklistItemSeed = {
  id: string;
  content: string;
  isDone: boolean;
  position: number;
};

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
      title: 'Stratum Rollout',
      description: 'Master project board showcasing the fractal kanban.',
    },
    create: {
      id: ids.rootNode,
      teamId: ids.team,
      type: NodeType.COMPLEX,
      title: 'Stratum Rollout',
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

function buildChecklistItems(ids: DemoIds): ChecklistItemSeed[] {
  return [
    {
      id: ids.checklistItems.storybook,
      content: 'Documenter dans Storybook',
      isDone: true,
      position: 0,
    },
    {
      id: ids.checklistItems.keyboard,
      content: 'Tester navigation clavier',
      isDone: false,
      position: 1,
    },
    {
      id: ids.checklistItems.theme,
      content: 'Valider contraste themes',
      isDone: false,
      position: 2,
    },
  ];
}

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
      type: NodeType.MEDIUM,
      title: 'Finaliser le design breadcrumb',
      description: 'Micro-interactions et accessibilité du breadcrumb fractal.',
      path: [ids.team, ids.rootNode, backlogNodeId].join('/'),
      depth: 1,
      position: 0,
      createdById: userId,
      statusMetadata: {
        checklistCompleted: 1,
        checklistTotal: 3,
      },
    },
  });

  const checklist = await prisma.checklist.upsert({
    where: { nodeId: backlogNodeId },
    update: {
      progress: 1,
    },
    create: {
      nodeId: backlogNodeId,
      progress: 1,
    },
  });

  for (const item of buildChecklistItems(ids)) {
    await prisma.checklistItem.upsert({
      where: { id: item.id },
      update: {
        content: item.content,
        isDone: item.isDone,
        position: item.position,
      },
      create: {
        id: item.id,
        checklistId: checklist.id,
        content: item.content,
        isDone: item.isDone,
        position: item.position,
      },
    });
  }

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
      type: NodeType.SIMPLE,
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
      type: NodeType.SIMPLE,
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
      type: NodeType.SIMPLE,
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
