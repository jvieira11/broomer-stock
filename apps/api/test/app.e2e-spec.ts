import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils';

describe('Saúde (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde sem login e confere o banco', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200, { status: 'ok', database: 'ok' });
  });

  it('GET /api/health/live responde sem login e sem consultar o banco', () => {
    return request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200, { status: 'ok' });
  });

  it('rota inexistente responde 404 em JSON', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/nao-existe')
      .expect(404);
    expect(res.body).toMatchObject({ statusCode: 404 });
  });
});
