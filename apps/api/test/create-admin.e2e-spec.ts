import { createAdmin } from '../src/scripts/create-admin';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword, verifyPassword } from '../src/auth/password';
import { createTestApp, resetDatabase, signUp, TEST_PASSWORD } from './utils';

const NEW_PASSWORD = 'senha-redefinida-12345';

describe('Script do administrador (e2e)', () => {
  let close: () => Promise<void>;
  let prisma: PrismaService;
  const saved = { ...process.env };
  let app: Awaited<ReturnType<typeof createTestApp>>['app'];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    close = () => app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...saved };
  });

  afterAll(async () => {
    await close();
  });

  const configure = (email: string, reset?: string) => {
    process.env.SEED_ADMIN_EMAIL = email;
    process.env.SEED_ADMIN_PASSWORD = NEW_PASSWORD;
    if (reset) process.env.RESET_ADMIN_PASSWORD = reset;
    else delete process.env.RESET_ADMIN_PASSWORD;
  };

  it('com administrador ativo e sem a variável: não troca nada', async () => {
    const { email } = await signUp(app);
    configure('novo@teste.com');
    await createAdmin();
    expect(
      await prisma.user.findUnique({ where: { email: 'novo@teste.com' } }),
    ).toBeNull();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await verifyPassword(TEST_PASSWORD, user.passwordHash)).toBe(true);
  });

  it('RESET_ADMIN_PASSWORD=sim: troca a senha, reativa e derruba sessões, só desse usuário', async () => {
    const { email: otherEmail, organizationId: orgId } = await signUp(app);
    const { email } = await prisma.user.create({
      data: {
        organizationId: orgId,
        name: 'Quem perdeu a senha',
        email: 'perdeu@teste.com',
        passwordHash: await hashPassword(TEST_PASSWORD),
        role: Role.VIEWER,
      },
    });
    const organizationId = orgId;
    await prisma.user.update({
      where: { email },
      data: { active: false, role: Role.VIEWER },
    });
    const before = await prisma.user.findUniqueOrThrow({ where: { email } });
    configure(email, 'sim');
    await createAdmin();

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.organizationId).toBe(organizationId);
    expect(user.active).toBe(true);
    expect(user.role).toBe(Role.ADMIN);
    expect(user.sessionVersion).toBe(before.sessionVersion + 1);
    expect(await verifyPassword(NEW_PASSWORD, user.passwordHash)).toBe(true);

    const other = await prisma.user.findUniqueOrThrow({
      where: { email: otherEmail },
    });
    expect(await verifyPassword(TEST_PASSWORD, other.passwordHash)).toBe(true);
  });

  it('RESET_ADMIN_PASSWORD=sim com e-mail inexistente: recusa', async () => {
    await signUp(app);
    configure('ninguem@teste.com', 'sim');
    await expect(createAdmin()).rejects.toThrow('Não existe usuário');
  });
});
