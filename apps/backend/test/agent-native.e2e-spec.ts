import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
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

const DEMO_EMAIL = 'demo@stratum.local';

const describeIfDatabase: typeof describe = process.env.DATABASE_URL
  ? describe
  : describe.skip;

const describeIfAgentE2E: typeof describe = process.env.RUN_AGENT_E2E
  ? describeIfDatabase
  : describe.skip;

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[e2e] DATABASE_URL non défini, suite Agent Native (e2e) ignorée.',
  );
}

if (!process.env.RUN_AGENT_E2E) {
  // eslint-disable-next-line no-console
  console.warn(
    '[e2e] RUN_AGENT_E2E non défini, suite Agent Native (e2e) ignorée (opt-in).',
  );
}

describeIfAgentE2E('Agent Native API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;

  beforeAll(async () => {
    const { AppModule } = await import('./../src/app.module');
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
    await prisma.eventLog.deleteMany();
    await prisma.proposalAction.deleteMany();
    await prisma.proposal.deleteMany();

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /agent/chat returns exploratory answer without mutation endpoint', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${DEMO_IDS.board}/agent/chat`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ message: 'Aide-moi à prioriser cette semaine' })
      .expect(201);

    const body = ensureRecord(response.body, 'chat response');
    expect(ensureString(body.answer, 'chat answer')).toEqual(
      expect.stringContaining('priorisation'),
    );
    const suggested = ensureRecord(
      body.suggestedCommandPayload,
      'chat suggestedCommandPayload',
    );
    expect(ensureString(suggested.intent, 'chat suggested intent')).toBeTruthy();
  });

  it('POST /agent/command creates proposal and apply is blocked when confidence is low', async () => {
    const command = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${DEMO_IDS.board}/agent/command`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ intent: 'Réorganise les tâches bloquées' })
      .expect(201);

    const commandBody = ensureRecord(command.body, 'command response');
    const proposalId = ensureString(commandBody.proposalId, 'proposal id');

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${DEMO_IDS.board}/proposals/${proposalId}/validate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${DEMO_IDS.board}/proposals/${proposalId}/approve`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({})
      .expect(201);

    const apply = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${DEMO_IDS.board}/proposals/${proposalId}/apply`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({})
      .expect(403);

    const applyBody = ensureRecord(apply.body, 'apply error body');
    const applyResponse = ensureRecord(applyBody.response, 'apply error response');
    expect(applyResponse.code).toBe('CONFIDENCE_TOO_LOW');
  });

  it('POST /proposals/:id/reject requires reason then transitions to REJECTED', async () => {
    const command = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${DEMO_IDS.board}/agent/command`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ intent: 'Crée une proposition à rejeter' })
      .expect(201);

    const commandBody = ensureRecord(command.body, 'command response');
    const proposalId = ensureString(commandBody.proposalId, 'proposal id');

    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${DEMO_IDS.board}/proposals/${proposalId}/reject`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({})
      .expect(400);

    const reject = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${DEMO_IDS.board}/proposals/${proposalId}/reject`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ reason: 'Hors périmètre' })
      .expect(201);

    const rejectBody = ensureRecord(reject.body, 'reject response');
    expect(rejectBody.status).toBe('REJECTED');
    expect(rejectBody.rejectionReason).toBe('Hors périmètre');
  });
});