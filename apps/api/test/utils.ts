import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/auth/password';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

export const MISSING_ID = '00000000-0000-4000-8000-000000000000';
export const TEST_PASSWORD = 'senha-de-teste-123';

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

export async function resetDatabase(prisma: PrismaService) {
  const url = process.env.DATABASE_URL ?? '';
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('resetDatabase só pode rodar no banco de teste');
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE purchase_order_items, purchase_orders, purchase_settings, stock_movements, stock_operations, product_variants, products, suppliers, categories, password_reset_tokens, users, organizations CASCADE',
  );
}

// Cliente HTTP que envia o token em todas as requisições.
export function client(app: INestApplication<App>, token?: string) {
  const auth = (test: request.Test) =>
    token ? test.set('Authorization', `Bearer ${token}`) : test;
  const server = () => request(app.getHttpServer());

  return {
    get: (url: string) => auth(server().get(url)),
    post: (url: string, body?: object) => auth(server().post(url).send(body)),
    patch: (url: string, body?: object) => auth(server().patch(url).send(body)),
    put: (url: string, body?: object) => auth(server().put(url).send(body)),
    delete: (url: string) => auth(server().delete(url)),
  };
}

let counter = 0;

// Cria uma loja nova com um administrador e devolve o cliente já logado.
// Não há cadastro público: no sistema, o primeiro administrador vem do seed.
export async function signUp(app: INestApplication<App>, name = 'Loja') {
  counter += 1;
  const prisma = app.get(PrismaService);
  const user = await prisma.user.create({
    data: {
      name: `Admin ${counter}`,
      email: `admin${counter}@teste.com`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: Role.ADMIN,
      organization: { create: { name: `${name} ${counter}` } },
    },
  });
  const token = await app.get(JwtService).signAsync({ sub: user.id });
  return {
    token,
    userId: user.id,
    email: user.email,
    organizationId: user.organizationId,
    api: client(app, token),
  };
}

export interface TestVariant {
  id: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
}

export interface TestProduct {
  id: string;
  reference: string;
  variants: TestVariant[];
}

let skuCounter = 0;

// Cadastra um modelo pela API com as variações pedidas (tamanho/cor).
export async function createProduct(
  api: ReturnType<typeof client>,
  data: {
    reference?: string;
    name?: string;
    categoryId?: string;
    minQuantity?: number;
    supplierName?: string;
    variants?: { size?: string; color?: string; sku?: string }[];
  } = {},
): Promise<TestProduct> {
  skuCounter += 1;
  const reference =
    data.reference ?? `REF${String(skuCounter).padStart(4, '0')}`;
  const res = await api
    .post('/api/products', {
      reference,
      name: data.name ?? `Camisa ${skuCounter}`,
      categoryId: data.categoryId,
      minQuantity: data.minQuantity,
      supplierName: data.supplierName,
      variants: (data.variants ?? [{ size: 'M', color: 'PRETO' }]).map(
        (variant, index) => ({
          sku: variant.sku ?? `${reference}-${index}`,
          size: variant.size,
          color: variant.color,
        }),
      ),
    })
    .expect(201);
  return res.body as TestProduct;
}

// Registra uma operação e devolve a resposta (status conferido por quem chama).
export function operate(
  api: ReturnType<typeof client>,
  type: string,
  items: { variantId: string; quantity: number; unitCost?: number }[],
  extra: Record<string, unknown> = {},
) {
  return api.post('/api/operations', { type, items, ...extra });
}

// Cria um usuário com o papel pedido na empresa e devolve o cliente logado.
export async function userWithRole(
  app: INestApplication<App>,
  organizationId: string,
  role: Role,
) {
  counter += 1;
  const prisma = app.get(PrismaService);
  const user = await prisma.user.create({
    data: {
      organizationId,
      role,
      name: `${role} ${counter}`,
      email: `${role.toLowerCase()}${counter}@teste.com`,
      passwordHash: await hashPassword(TEST_PASSWORD),
    },
  });
  const token = await app.get(JwtService).signAsync({ sub: user.id });
  return { user, token, api: client(app, token) };
}
