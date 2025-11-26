import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Priority } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { DEMO_IDS, DEMO_PASSWORD, seedDemoData } from './../prisma/seed';

const DEMO_EMAIL = 'alice@stratum.dev';

const describeIfDatabase: typeof describe = process.env.DATABASE_URL
  ? describe
  : describe.skip;

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[e2e] DATABASE_URL non défini, suite Dashboards API (e2e) ignorée.',
  );
}

interface UnknownRecord extends Record<string, unknown> {}

function ensureRecord(value: unknown, context: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} should be an object`);
  }
  return value as UnknownRecord;
}

function ensureArray<T = unknown>(value: unknown, context: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} should be an array`);
  }
  return value as T[];
}

function ensureString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${context} should be a string`);
  }
  return value;
}

async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.boardDailySnapshot.deleteMany();
  await prisma.userSettings.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.automationRule.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.dependency.deleteMany();
  await prisma.nodeAssignment.deleteMany();
  await prisma.node.deleteMany();
  await prisma.column.deleteMany();
  await prisma.columnBehavior.deleteMany();
  await prisma.board.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
}

async function createTaskForBoard(
  prisma: PrismaService,
  boardId: string,
  taskId: string,
  data: Partial<Parameters<PrismaService['node']['create']>[0]['data']> = {},
): Promise<void> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { node: true },
  });
  if (!board?.node) {
    throw new Error(`Board ${boardId} introuvable`);
  }

  const { node } = board;
  const basePath = `${node.path}/${taskId}`;

  await prisma.node.create({
    data: {
      id: taskId,
      teamId: node.teamId,
      workspaceId: boardId,
      parentId: node.id,
      columnId: data.columnId ?? DEMO_IDS.columns.inProgress,
      title: data.title ?? `Task ${taskId}`,
      description: data.description ?? 'Dashboard task',
      path: basePath,
      depth: (node.depth ?? 0) + 1,
      progress: typeof data.progress === 'number' ? data.progress : 0,
      priority: (data.priority as Priority | undefined) ?? Priority.MEDIUM,
      dueAt: data.dueAt ?? null,
      startAt: data.startAt ?? new Date('2025-01-08T00:00:00Z'),
      blockedSince: data.blockedSince ?? null,
      blockedExpectedUnblockAt: data.blockedExpectedUnblockAt ?? null,
      isBlockResolved: data.isBlockResolved ?? false,
      statusMetadata: data.statusMetadata ?? null,
      metadata: data.metadata ?? null,
      createdAt: data.createdAt ?? new Date('2025-01-08T00:00:00Z'),
      updatedAt: data.updatedAt ?? new Date('2025-01-09T00:00:00Z'),
      effort: data.effort ?? null,
    },
  });
}

describeIfDatabase('Dashboards API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await seedDemoData(prisma);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);

    const loginBody = ensureRecord(loginResponse.body, 'login response body');
    accessToken = ensureString(loginBody.accessToken, 'access token');
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/dashboards/execution (SELF) returns execution metrics', async () => {
    await createTaskForBoard(prisma, DEMO_IDS.board, 'dash_exec_task1', {
      columnId: DEMO_IDS.columns.inProgress,
      priority: Priority.HIGH,
      dueAt: new Date('2025-01-10T00:00:00Z'),
    });
    await createTaskForBoard(prisma, DEMO_IDS.board, 'dash_exec_task2', {
      columnId: DEMO_IDS.columns.blocked,
      blockedSince: new Date('2025-01-09T08:00:00Z'),
      createdAt: new Date('2025-01-09T06:00:00Z'),
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/dashboards/execution')
      .query({
        teamId: DEMO_IDS.team,
        boardId: DEMO_IDS.board,
        mode: 'SELF',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = ensureRecord(response.body, 'execution dashboard');
    expect(body.dashboard).toBe('EXECUTION');
    expect(body.mode).toBe('SELF');
    const widgets = ensureArray<UnknownRecord>(body.widgets, 'widgets array');
    expect(widgets.length).toBeGreaterThan(0);
    const priorities = widgets.find((entry) => entry.id === 'exec.priorities');
    expect(priorities).toBeDefined();
    expect(priorities?.status).toBe('ok');
  });

  it('GET /api/v1/dashboards/progress (AGGREGATED) agrège les sous-kanbans', async () => {
    await prisma.boardDailySnapshot.createMany({
      data: [
        {
          id: 'snap_root_day1',
          boardId: DEMO_IDS.board,
          dateUTC: new Date('2025-01-01T00:00:00Z'),
          backlog: 5,
          inProgress: 3,
          blocked: 1,
          done: 0,
          total: 9,
        },
        {
          id: 'snap_root_day2',
          boardId: DEMO_IDS.board,
          dateUTC: new Date('2025-01-02T00:00:00Z'),
          backlog: 4,
          inProgress: 3,
          blocked: 1,
          done: 1,
          total: 9,
        },
        {
          id: 'snap_child_day1',
          boardId: 'board_breadcrumb_sub',
          dateUTC: new Date('2025-01-01T00:00:00Z'),
          backlog: 2,
          inProgress: 1,
          blocked: 0,
          done: 0,
          total: 3,
        },
        {
          id: 'snap_child_day2',
          boardId: 'board_breadcrumb_sub',
          dateUTC: new Date('2025-01-02T00:00:00Z'),
          backlog: 1,
          inProgress: 1,
          blocked: 0,
          done: 1,
          total: 3,
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/dashboards/progress')
      .query({
        teamId: DEMO_IDS.team,
        boardId: DEMO_IDS.board,
        mode: 'AGGREGATED',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = ensureRecord(response.body, 'progress dashboard');
    expect(body.dashboard).toBe('PROGRESS');
    expect(body.mode).toBe('AGGREGATED');
    const metadata = ensureRecord(body.metadata, 'metadata');
    const boardIds = ensureArray<string>(metadata.boardIds, 'board ids');
    expect(boardIds).toEqual(
      expect.arrayContaining(['board_breadcrumb_sub', DEMO_IDS.board]),
    );
  });

  it('GET /api/v1/dashboards/risk (COMPARISON) limite aux enfants directs', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/dashboards/risk')
      .query({
        teamId: DEMO_IDS.team,
        boardId: DEMO_IDS.board,
        mode: 'COMPARISON',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = ensureRecord(response.body, 'risk dashboard');
    expect(body.dashboard).toBe('RISK');
    expect(body.mode).toBe('COMPARISON');
    const metadata = ensureRecord(body.metadata, 'metadata');
    const boardIds = ensureArray<string>(metadata.boardIds, 'board ids');
    expect(boardIds.every((id) => id !== DEMO_IDS.board)).toBe(true);
    expect(boardIds).toContain('board_breadcrumb_sub');
  });

  it('agrège correctement une hiérarchie profonde', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/dashboards/progress')
      .query({
        teamId: DEMO_IDS.team,
        boardId: 'board_breadcrumb_sub',
        mode: 'AGGREGATED',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = ensureRecord(response.body, 'deep hierarchy response');
    const metadata = ensureRecord(body.metadata, 'metadata');
    const boardIds = ensureArray<string>(metadata.boardIds, 'board ids');
    expect(boardIds).toEqual(
      expect.arrayContaining([
        'board_breadcrumb_sub',
        'board_level2_design',
        'board_level3_colors',
      ]),
    );
  });

  it('gère un board sans tâches en renvoyant les widgets masqués', async () => {
    const emptyNode = await prisma.node.create({
      data: {
        id: 'node_empty_dashboard',
        teamId: DEMO_IDS.team,
        workspaceId: 'board_empty_dashboard',
        parentId: DEMO_IDS.rootNode,
        title: 'Empty dashboard node',
        path: `${DEMO_IDS.team}/${DEMO_IDS.rootNode}/node_empty_dashboard`,
        depth: 1,
      },
    });
    const emptyBoard = await prisma.board.create({
      data: {
        id: 'board_empty_dashboard',
        nodeId: emptyNode.id,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/dashboards/execution')
      .query({
        teamId: DEMO_IDS.team,
        boardId: emptyBoard.id,
        mode: 'SELF',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = ensureRecord(response.body, 'empty dashboard response');
    expect(body.widgets).toEqual([]);
    const hidden = ensureArray<UnknownRecord>(
      body.hiddenWidgets,
      'hidden widgets',
    );
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("retourne 403 si l'utilisateur n'appartient pas à l'équipe ciblée", async () => {
    const otherTeam = await prisma.team.create({
      data: {
        id: 'team_secure_guard',
        name: 'Secure Guard',
      },
    });

    const otherNode = await prisma.node.create({
      data: {
        id: 'node_secure_guard',
        teamId: otherTeam.id,
        workspaceId: 'board_secure_guard',
        title: 'Guarded board',
        path: `${otherTeam.id}/node_secure_guard`,
        depth: 0,
      },
    });

    const otherBoard = await prisma.board.create({
      data: {
        id: 'board_secure_guard',
        nodeId: otherNode.id,
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/dashboards/execution')
      .query({
        teamId: otherTeam.id,
        boardId: otherBoard.id,
        mode: 'SELF',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });
});
