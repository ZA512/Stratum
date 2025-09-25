import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { DEMO_IDS, DEMO_PASSWORD, seedDemoData } from './../prisma/seed';

type UnknownRecord = Record<string, unknown>;

function ensureRecord(value: unknown, context: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} should be an object`);
  }
  return value as UnknownRecord;
}

function ensureString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${context} should be a string`);
  }
  return value;
}

function ensureArray<T = unknown>(value: unknown, context: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} should be an array`);
  }
  return value as T[];
}

const DEMO_EMAIL = 'alice@stratum.dev';

describe('App API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let refreshToken: string;

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

    await seedDemoData(prisma);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);

    const loginBody = ensureRecord(loginResponse.body, 'login response body');
    accessToken = ensureString(
      loginBody.accessToken,
      'login response accessToken',
    );
    refreshToken = ensureString(
      loginBody.refreshToken,
      'login response refreshToken',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    const body = ensureRecord(response.body, 'health response');
    expect(body).toEqual(
      expect.objectContaining({
        status: 'ok',
      }),
    );
  });

  it('POST /api/v1/auth/refresh returns fresh tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const body = ensureRecord(response.body, 'refresh response');
    expect(ensureString(body.accessToken, 'refresh accessToken')).toBeTruthy();
    expect(
      ensureString(body.refreshToken, 'refresh refreshToken'),
    ).toBeTruthy();
  });

  it('POST /api/v1/auth/request-reset then /reset updates password', async () => {
    const resetResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/request-reset')
      .send({ email: DEMO_EMAIL })
      .expect(202);

    const resetBody = ensureRecord(
      resetResponse.body,
      'reset request response',
    );
    const resetToken = ensureString(resetBody.resetToken, 'reset token');

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset')
      .send({
        token: resetToken,
        password: 'NewPassword!123',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: DEMO_EMAIL, password: 'NewPassword!123' })
      .expect(200);
  });

  it('POST /api/v1/auth/invitations and accept', async () => {
    const inviteeEmail = 'new.user@example.com';

    const invitation = await request(app.getHttpServer())
      .post('/api/v1/auth/invitations')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ email: inviteeEmail, teamId: DEMO_IDS.team })
      .expect(201);

    const invitationBody = ensureRecord(invitation.body, 'invitation response');
    const invitationToken = ensureString(
      invitationBody.invitationToken,
      'invitation token',
    );

    const accept = await request(app.getHttpServer())
      .post('/api/v1/auth/invitations/accept')
      .send({
        token: invitationToken,
        password: 'InvitePassword!123',
        displayName: 'Invitee',
      })
      .expect(200);

    const acceptBody = ensureRecord(accept.body, 'accept invitation response');
    const acceptUser = ensureRecord(acceptBody.user, 'accept invitation user');
    expect(ensureString(acceptUser.email, 'accept invitation user email')).toBe(
      inviteeEmail,
    );
    expect(
      ensureString(acceptBody.accessToken, 'accept invitation access token'),
    ).toBeTruthy();
  });

  it('GET /api/v1/boards/team/:teamId returns the root board', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/boards/team/' + DEMO_IDS.team)
      .set('Authorization', 'Bearer ' + accessToken)
      .expect(200);

    const body = ensureRecord(response.body, 'root board response');
    expect(ensureString(body.id, 'root board id')).toBe(DEMO_IDS.board);
    const columns = ensureArray<UnknownRecord>(
      body.columns,
      'root board columns',
    );
    expect(columns).toHaveLength(4);
  });

  it('GET /api/v1/boards/:id/detail returns columns with cards', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/boards/' + DEMO_IDS.board + '/detail')
      .set('Authorization', 'Bearer ' + accessToken)
      .expect(200);

    const detail = ensureRecord(response.body, 'board detail response');
    const columns = ensureArray<UnknownRecord>(
      detail.columns,
      'board detail columns',
    );
    expect(columns).toHaveLength(4);
    const backlog = columns.find(
      (column) =>
        ensureString(column.behaviorKey, 'column behaviorKey') === 'BACKLOG',
    );
    expect(backlog).toBeDefined();
    const backlogColumn = ensureRecord(backlog, 'backlog column');
    const backlogNodes = ensureArray<UnknownRecord>(
      backlogColumn.nodes,
      'backlog nodes',
    );
    expect(backlogNodes.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/nodes/:id/breadcrumb returns ancestor chain', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/nodes/' + DEMO_IDS.nodes.inProgress + '/breadcrumb')
      .set('Authorization', 'Bearer ' + accessToken)
      .expect(200);

    const breadcrumb = ensureRecord(response.body, 'breadcrumb response');
    const items = ensureArray<UnknownRecord>(
      breadcrumb.items,
      'breadcrumb items',
    );
    expect(items.length).toBeGreaterThan(1);
    const lastItem = ensureRecord(
      items[items.length - 1],
      'breadcrumb last item',
    );
    const firstItem = ensureRecord(items[0], 'breadcrumb first item');
    expect(ensureString(firstItem.boardId, 'breadcrumb root boardId')).toBe(
      DEMO_IDS.board,
    );
    expect(ensureString(lastItem.id, 'breadcrumb last item id')).toBe(
      DEMO_IDS.nodes.inProgress,
    );
  });
  it('GET /api/v1/nodes/:id/children returns child boards', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/nodes')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ title: 'Child board', columnId: DEMO_IDS.columns.backlog })
      .expect(201);

    const createdBody = ensureRecord(created.body, 'create node response');
    const childId = ensureString(createdBody.id, 'created node id');

    await request(app.getHttpServer())
      .post('/api/v1/nodes/' + childId + '/convert')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ targetType: 'COMPLEX' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/nodes/' + DEMO_IDS.rootNode + '/children')
      .set('Authorization', 'Bearer ' + accessToken)
      .expect(200);

    const children = ensureArray<UnknownRecord>(
      response.body,
      'node children response',
    );
    const match = children.find(
      (item) => ensureString(item.nodeId, 'child node nodeId') === childId,
    );
    expect(match).toBeDefined();
    if (!match) {
      return;
    }
    expect(ensureString(match.boardId, 'child board id')).toBeTruthy();
  });

  it('POST /api/v1/nodes rejects unauthenticated call', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/nodes')
      .send({ title: 'Unauth task', columnId: DEMO_IDS.columns.backlog })
      .expect(401);
  });

  it('POST /api/v1/nodes creates a simple card', async () => {
    const payload = {
      title: 'Write onboarding docs',
      columnId: DEMO_IDS.columns.backlog,
      description: 'Prepare documentation for new joiners',
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/nodes')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload)
      .expect(201);

    const body = ensureRecord(response.body, 'create simple node response');
    expect(ensureString(body.type, 'node type')).toBe('SIMPLE');
  });

  // Test MEDIUM + checklist supprimé (legacy)

  it('POST /api/v1/nodes/:id/convert promotes to complex', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/nodes')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        title: 'Marketing project',
        columnId: DEMO_IDS.columns.backlog,
      })
      .expect(201);

    const createBody = ensureRecord(
      createResponse.body,
      'create node response',
    );
    const nodeId = ensureString(createBody.id, 'created node id');

    const convert = await request(app.getHttpServer())
      .post('/api/v1/nodes/' + nodeId + '/convert')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ targetType: 'COMPLEX' })
      .expect(200);

    const convertBody = ensureRecord(convert.body, 'convert node response');
    expect(ensureString(convertBody.type, 'converted node type')).toBe(
      'COMPLEX',
    );
    const statusMetadata = ensureRecord(
      convertBody.statusMetadata,
      'convert status metadata',
    );
    const convertedBoardId = ensureString(
      statusMetadata.boardId,
      'convert status boardId',
    );
    expect(convertedBoardId).toEqual(expect.stringMatching(/.+/));
  });

  it('POST /api/v1/boards/:id/columns crée une nouvelle colonne', async () => {
    const payload = {
      name: 'QA Review',
      behaviorKey: 'IN_PROGRESS',
      wipLimit: 4,
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/boards/' + DEMO_IDS.board + '/columns')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(payload)
      .expect(201);

    const column = ensureRecord(response.body, 'create column response');
    expect(ensureString(column.id, 'column id')).toEqual(
      expect.stringMatching(/.+/),
    );
    expect(ensureString(column.name, 'column name')).toBe(payload.name);
    expect(column.behaviorKey).toBe(payload.behaviorKey);
    expect(column.position).toEqual(expect.any(Number));

    const detail = await request(app.getHttpServer())
      .get('/api/v1/boards/' + DEMO_IDS.board + '/detail')
      .set('Authorization', 'Bearer ' + accessToken)
      .expect(200);

    const detailBody = ensureRecord(
      detail.body,
      'board detail after column create',
    );
    const columns = ensureArray<UnknownRecord>(
      detailBody.columns,
      'board columns after column create',
    );

    const created = columns.find(
      (entry) => ensureString(entry.id, 'column entry id') === column.id,
    );
    expect(created).toBeDefined();
    if (!created) {
      return;
    }
    const createdRecord = ensureRecord(
      created,
      'created column in board detail',
    );
    expect(ensureString(createdRecord.name, 'created column name')).toBe(
      payload.name,
    );
    expect(createdRecord.wipLimit).toBe(payload.wipLimit);
  });
});
