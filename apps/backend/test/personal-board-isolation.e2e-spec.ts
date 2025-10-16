import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { DEMO_PASSWORD, seedDemoData } from './../prisma/seed';

function ensureString(value: unknown, ctx: string): string {
  if (typeof value !== 'string') throw new Error(ctx + ' should be a string');
  return value;
}
function ensureRecord(value: unknown, ctx: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(ctx + ' should be an object');
  }
  return value as Record<string, unknown>;
}

const USER_A_EMAIL = 'alice@stratum.dev'; // seed user
const USER_B_EMAIL = 'bob.personal@example.com';
const USER_B_PASSWORD = 'PersoBoard!123';

describe('Personal board isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessTokenA: string;
  let accessTokenB: string;

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
    // Reset DB minimal
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

    // Login user A (seed)
    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: USER_A_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    accessTokenA = ensureString(
      ensureRecord(loginA.body, 'login A body').accessToken,
      'accessToken A',
    );

    // Register user B (will trigger bootstrap personal team + board)
    const registerB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: USER_B_EMAIL, password: USER_B_PASSWORD })
      .expect(201);
    accessTokenB = ensureString(
      ensureRecord(registerB.body, 'register B body').accessToken,
      'accessToken B',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('User B has a personal board not visible to User A', async () => {
    // Récupérer la team personnelle de B (membership ACTIVE filtrée par isPersonal)
    const membershipsB = await prisma.membership.findMany({
      where: { user: { email: USER_B_EMAIL }, status: 'ACTIVE' },
      include: { team: true },
    });
    const personalTeam = membershipsB.find(
      (m) => (m.team as any).isPersonal === true,
    );
    expect(personalTeam).toBeDefined();
    if (!personalTeam) return;

    // Récupérer board racine personnel via la node root (parentId null + board isPersonal)
    const rootNodesB = await prisma.node.findMany({
      where: { teamId: personalTeam.teamId, parentId: null },
      include: { board: true },
    });
    const personalRoot = rootNodesB.find((n) => (n.board as any)?.isPersonal);
    expect(personalRoot?.board?.id).toBeDefined();
    if (!personalRoot?.board?.id) return;

    // Tentative d'accès par A → 403
    await request(app.getHttpServer())
      .get('/api/v1/boards/' + personalRoot.board.id + '/detail')
      .set('Authorization', 'Bearer ' + accessTokenA)
      .expect(403);
  });

  it('Child boards listing on A does not leak B personal board', async () => {
    // On crée une tâche pour A (simple) et la convertit pour vérifier que la liste ne contient que ses propres sous-boards
    const created = await request(app.getHttpServer())
      .post('/api/v1/nodes')
      .set('Authorization', 'Bearer ' + accessTokenA)
      .send({ title: 'Isolation Check', columnId: 'column_backlog' })
      .expect(201);
    const nodeId = ensureString(
      ensureRecord(created.body, 'created node').id,
      'created node id',
    );
    await request(app.getHttpServer())
      .post(`/api/v1/nodes/${nodeId}/convert`)
      .set('Authorization', 'Bearer ' + accessTokenA)
      .send({ targetType: 'COMPLEX' })
      .expect(200);

    // Récupérer root node de l'espace seed (DEMO) : node_stratum_root
    const response = await request(app.getHttpServer())
      .get('/api/v1/nodes/node_stratum_root/children')
      .set('Authorization', 'Bearer ' + accessTokenA)
      .expect(200);
    const children = response.body as Array<Record<string, unknown>>;
    // Aucune fuite: pas de board personnel B
    const leaked = children.find((c) => {
      const rec = ensureRecord(c, 'child board');
      return rec.boardId && typeof rec.boardId === 'string' && rec.boardId.includes('bob');
    });
    expect(leaked).toBeUndefined();
  });

  it('Cannot create invitation on user B personal team', async () => {
    // Trouver team personnelle B
    const membershipsB = await prisma.membership.findMany({
      where: { user: { email: USER_B_EMAIL }, status: 'ACTIVE' },
      include: { team: true },
    });
    const personalTeam = membershipsB.find(
      (m) => (m.team as any).isPersonal === true,
    );
    expect(personalTeam).toBeDefined();
    if (!personalTeam) return;

    await request(app.getHttpServer())
      .post('/api/v1/auth/invitations')
      .set('Authorization', 'Bearer ' + accessTokenB)
      .send({ email: 'third@example.com', teamId: personalTeam.teamId })
      .expect(400); // BadRequest car team personnelle
  });
});
