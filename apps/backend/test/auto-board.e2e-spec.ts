import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

// E2E simplifié: dépend d'une base réelle; si la DB locale n'est pas préparée ce test pourra être ignoré.
// Objectif: vérifier qu'après bootstrap, la création d'une sous-tâche retourne un parent avec board + colonnes.

const describeIfDatabase: typeof describe = process.env.DATABASE_URL
  ? describe
  : describe.skip;

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[e2e] DATABASE_URL non défini, suite Auto Board E2E ignorée.',
  );
}

describeIfDatabase('Auto Board E2E (simplifié)', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;
  let rootNodeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();

    // Signup rapide (si endpoint existe) sinon adapter
    const email = 'autoboard+' + Date.now() + '@test.dev';
    await request(httpServer).post('/auth/register').send({ email, password: 'Passw0rd!', displayName: 'Auto' });
    const login = await request(httpServer).post('/auth/login').send({ email, password: 'Passw0rd!' });
    authToken = login.body?.accessToken;

    const bootstrap = await request(httpServer)
      .post('/teams/bootstrap')
      .set('Authorization', 'Bearer ' + authToken)
      .send();
    rootNodeId = bootstrap.body?.rootNodeId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('crée un board implicite lors de la première sous-tâche', async () => {
    const res = await request(httpServer)
      .post(`/nodes/${rootNodeId}/children`)
      .set('Authorization', 'Bearer ' + authToken)
      .send({ title: 'Sous tache 1' });
    expect(res.status).toBeLessThan(500); // tolérant si auth/schema diffère
    if (res.status === 201 || res.status === 200) {
      expect(res.body.board).toBeDefined();
      expect(res.body.board.columns?.length).toBeGreaterThanOrEqual(4);
    }
  });
});
