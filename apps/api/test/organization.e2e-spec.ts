import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  client,
  createTestApp,
  resetDatabase,
  signUp,
  TEST_PASSWORD,
  userWithRole,
  createProduct,
  operate,
} from './utils';

describe('Empresa, senha e exportação (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(() => resetDatabase(prisma));

  afterAll(async () => {
    await app.close();
  });

  describe('trocar a própria senha', () => {
    it('troca a senha, mantém esta sessão e encerra as outras', async () => {
      const admin = await signUp(app);
      const other = await client(app)
        .post('/api/auth/login', {
          email: admin.email,
          password: TEST_PASSWORD,
        })
        .expect(201);
      const otherDevice = client(app, (other.body as { token: string }).token);

      const res = await admin.api
        .patch('/api/auth/password', {
          currentPassword: TEST_PASSWORD,
          newPassword: 'senha-nova-456789',
        })
        .expect(200);
      const token = (res.body as { token: string }).token;

      await client(app, token).get('/api/auth/me').expect(200);
      await otherDevice.get('/api/auth/me').expect(401);
      await client(app)
        .post('/api/auth/login', {
          email: admin.email,
          password: 'senha-nova-456789',
        })
        .expect(201);
    });

    it('exige a senha atual correta', async () => {
      const admin = await signUp(app);
      const res = await admin.api
        .patch('/api/auth/password', {
          currentPassword: 'senha-errada',
          newPassword: 'senha-nova-456789',
        })
        .expect(400);
      expect(res.body).toMatchObject({ message: 'Senha atual incorreta' });
    });

    it('qualquer papel pode trocar a própria senha', async () => {
      const admin = await signUp(app);
      const viewer = await userWithRole(app, admin.organizationId, Role.VIEWER);
      await viewer.api
        .patch('/api/auth/password', {
          currentPassword: TEST_PASSWORD,
          newPassword: 'senha-nova-456789',
        })
        .expect(200);
    });

    it('senha redefinida pelo administrador encerra as sessões da pessoa', async () => {
      const admin = await signUp(app);
      const operator = await userWithRole(
        app,
        admin.organizationId,
        Role.OPERATOR,
      );
      await operator.api.get('/api/auth/me').expect(200);

      await admin.api
        .patch(`/api/users/${operator.user.id}`, { password: 'nova-senha-123' })
        .expect(200);
      await operator.api.get('/api/auth/me').expect(401);
    });
  });

  describe('dados da empresa', () => {
    it('administrador corrige o nome e informa o CNPJ', async () => {
      const admin = await signUp(app);

      const res = await admin.api
        .patch('/api/organization', {
          name: '  Mercado Novo Nome ',
          cnpj: '11.222.333/0001-81',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'Mercado Novo Nome',
        cnpj: '11222333000181',
      });

      // CNPJ alfanumérico (vale desde julho de 2026).
      await admin.api
        .patch('/api/organization', { cnpj: '12.abc.345/01de-35' })
        .expect(200);
      const me = await admin.api.get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({
        organization: { name: 'Mercado Novo Nome' },
      });
      await admin.api
        .get('/api/organization')
        .expect(200)
        .expect((r) =>
          expect(r.body).toMatchObject({ cnpj: '12ABC34501DE35' }),
        );

      // Vazio apaga.
      await admin.api.patch('/api/organization', { cnpj: '' }).expect(200);
      expect(
        (
          await prisma.organization.findUniqueOrThrow({
            where: { id: admin.organizationId },
          })
        ).cnpj,
      ).toBeNull();
    });

    it('recusa CNPJ inválido e nome vazio', async () => {
      const admin = await signUp(app);
      const res = await admin.api
        .patch('/api/organization', { cnpj: '11.222.333/0001-82' })
        .expect(400);
      expect(res.body).toMatchObject({ message: ['CNPJ inválido'] });
      await admin.api.patch('/api/organization', { name: '   ' }).expect(400);
    });

    it('só o administrador altera; todos consultam', async () => {
      const admin = await signUp(app);
      const manager = await userWithRole(
        app,
        admin.organizationId,
        Role.MANAGER,
      );
      await manager.api.get('/api/organization').expect(200);
      await manager.api
        .patch('/api/organization', { name: 'Outro' })
        .expect(403);
    });
  });

  describe('exportação', () => {
    const download = (token: string) =>
      request(app.getHttpServer())
        .get('/api/organization/export')
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

    it('gera a planilha com todos os dados da empresa, e só dela', async () => {
      const admin = await signUp(app, 'Exporta');
      const other = await signUp(app, 'Outra');
      await createProduct(other.api, {
        name: 'De outra loja',
        variants: [{ sku: 'NAO-VAZA' }],
      });

      const category = await admin.api
        .post('/api/categories', { name: 'Camisas' })
        .expect(201);
      const product = await createProduct(admin.api, {
        reference: '0002326',
        name: 'Camisa linho',
        categoryId: (category.body as { id: string }).id,
        variants: [{ sku: '0002326215021', size: 'P', color: 'PRETO' }],
      });
      await operate(
        admin.api,
        'ENTRY',
        [{ variantId: product.variants[0].id, quantity: 12, unitCost: 4.25 }],
        { origin: 'Fornecedor' },
      ).expect(201);

      const res = await download(admin.token).expect(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="broomer-estoque-\d{4}-\d{2}-\d{2}\.xlsx"/,
      );

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as ArrayBuffer);
      expect(workbook.worksheets.map((s) => s.name)).toEqual([
        'Empresa',
        'Estoque',
        'Categorias',
        'Movimentações',
        'Usuários',
      ]);

      const stock = workbook.getWorksheet('Estoque')!;
      expect(stock.rowCount).toBe(2);
      // Códigos com zeros à esquerda saem como texto.
      expect(stock.getRow(2).getCell(1).value).toBe('0002326');
      expect(stock.getRow(2).getCell(3).value).toBe('0002326215021');
      expect(stock.getRow(2).getCell(4).value).toBe('P');
      expect(stock.getRow(2).getCell(6).value).toBe('Camisas');
      expect(stock.getRow(2).getCell(10).value).toBe(12);

      const movements = workbook.getWorksheet('Movimentações')!;
      expect(movements.getRow(2).getCell(3).value).toBe('Entrada');
      expect(movements.getRow(2).getCell(9).value).toBe(12);
      expect(movements.getRow(2).getCell(12).value).toBe(4.25);

      const users = workbook.getWorksheet('Usuários')!;
      expect(users.getRow(2).getCell(2).value).toBe(admin.email);
      // Nada de hash de senha.
      expect(JSON.stringify(users.getSheetValues())).not.toContain('scrypt');
    });

    it('só o administrador exporta', async () => {
      const admin = await signUp(app);
      const manager = await userWithRole(
        app,
        admin.organizationId,
        Role.MANAGER,
      );
      await download(manager.token).expect(403);
    });
  });
});
