import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password';
import { PrismaClient, Role } from '../src/generated/prisma/client';

// Cria a loja e o primeiro administrador. Não há cadastro público: este é o
// único caminho para o primeiro acesso. Os demais usuários são criados pelo
// administrador em Usuários.
//
// Seguro de rodar mais de uma vez: se a loja já tem um administrador ativo,
// não faz nada (não troca senha nem cria duplicatas).
async function main() {
  const organizationName = process.env.SEED_ORGANIZATION_NAME?.trim() || 'Broomer';
  const name = process.env.SEED_ADMIN_NAME?.trim() || 'Administrador';
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error(
      'Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mínimo 12 caracteres) no .env',
    );
  }
  if (password === 'troque-esta-senha') {
    throw new Error('Troque SEED_ADMIN_PASSWORD no .env antes de rodar o seed');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const organizations = await prisma.organization.findMany({
      include: {
        users: { where: { role: Role.ADMIN, active: true }, select: { id: true } },
      },
    });
    if (organizations.length > 1) {
      throw new Error(
        'O banco tem mais de uma organização; crie o administrador pela tela de Usuários.',
      );
    }
    if (organizations[0]?.users.length) {
      console.log(
        `"${organizations[0].name}" já tem administrador ativo: nada a fazer.`,
      );
      return;
    }
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new Error(`Já existe um usuário com o e-mail ${email}.`);
    }

    const organization =
      organizations[0] ??
      (await prisma.organization.create({ data: { name: organizationName } }));

    await prisma.user.create({
      data: {
        organizationId: organization.id,
        name,
        email,
        passwordHash: await hashPassword(password),
        role: Role.ADMIN,
      },
    });
    console.log(
      `Administrador ${email} criado para "${organization.name}". Apague SEED_ADMIN_PASSWORD do .env e troque a senha no primeiro acesso.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
