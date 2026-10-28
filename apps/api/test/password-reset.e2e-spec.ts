import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { MailMessage, MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  client,
  createTestApp,
  resetDatabase,
  signUp,
  TEST_PASSWORD,
} from './utils';

const NEW_PASSWORD = 'senha-nova-456789';

describe('Esqueci minha senha (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sent: MailMessage[];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    sent = [];
    // Nenhum e-mail de verdade sai nos testes: só guardamos o que seria enviado.
    jest.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message);
      return Promise.resolve();
    });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app.close();
  });

  const anonymous = () => client(app);

  const requestReset = async (email: string) => {
    await anonymous().post('/api/auth/forgot-password', { email }).expect(204);
    const message = sent.at(-1);
    const token = message?.text.match(/token=([\w-]+)/)?.[1];
    return { message, token };
  };

  const login = (email: string, password: string) =>
    anonymous().post('/api/auth/login', { email, password });

  it('envia o link por e-mail e troca a senha', async () => {
    const admin = await signUp(app);

    const { message, token } = await requestReset(admin.email.toUpperCase());
    expect(message).toMatchObject({
      to: admin.email,
      subject: 'Redefinir sua senha do Broomer Estoque',
    });
    expect(message?.html).toContain(`/reset-password?token=${token}`);
    expect(message?.idempotencyKey).toMatch(/^password-reset\//);

    // O banco guarda só o hash, nunca o token do link.
    const stored = await prisma.passwordResetToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token);

    await anonymous()
      .post('/api/auth/reset-password', { token, password: NEW_PASSWORD })
      .expect(204);

    await login(admin.email, TEST_PASSWORD).expect(401);
    await login(admin.email, NEW_PASSWORD).expect(201);
  });

  it('responde igual para e-mail sem conta, sem enviar nada', async () => {
    await requestReset('ninguem@teste.com');
    expect(sent).toHaveLength(0);
  });

  it('não envia para usuário desativado', async () => {
    const admin = await signUp(app);
    await prisma.user.update({
      where: { id: admin.userId },
      data: { active: false },
    });

    await requestReset(admin.email);
    expect(sent).toHaveLength(0);
  });

  it('o link só funciona uma vez', async () => {
    const admin = await signUp(app);
    const { token } = await requestReset(admin.email);

    await anonymous()
      .post('/api/auth/reset-password', { token, password: NEW_PASSWORD })
      .expect(204);
    const res = await anonymous()
      .post('/api/auth/reset-password', { token, password: 'outra-senha-999' })
      .expect(400);
    expect(res.body).toMatchObject({
      message: 'Este link é inválido ou expirou. Peça um novo.',
    });
  });

  it('um link novo invalida o anterior', async () => {
    const admin = await signUp(app);
    const first = await requestReset(admin.email);
    const second = await requestReset(admin.email);

    await anonymous()
      .post('/api/auth/reset-password', {
        token: first.token,
        password: NEW_PASSWORD,
      })
      .expect(400);
    await anonymous()
      .post('/api/auth/reset-password', {
        token: second.token,
        password: NEW_PASSWORD,
      })
      .expect(204);
  });

  it('link expirado é recusado', async () => {
    const admin = await signUp(app);
    const { token } = await requestReset(admin.email);
    await prisma.passwordResetToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await anonymous()
      .post('/api/auth/reset-password', { token, password: NEW_PASSWORD })
      .expect(400);
  });

  it('trocar a senha encerra as sessões abertas', async () => {
    const admin = await signUp(app);
    await admin.api.get('/api/auth/me').expect(200);

    const { token } = await requestReset(admin.email);
    await anonymous()
      .post('/api/auth/reset-password', { token, password: NEW_PASSWORD })
      .expect(204);

    await admin.api.get('/api/auth/me').expect(401);
    const res = await login(admin.email, NEW_PASSWORD).expect(201);
    await client(app, (res.body as { token: string }).token)
      .get('/api/auth/me')
      .expect(200);
  });

  it('valida a senha nova', async () => {
    const admin = await signUp(app);
    const { token } = await requestReset(admin.email);

    await anonymous()
      .post('/api/auth/reset-password', { token, password: 'curta' })
      .expect(400);
  });
});
