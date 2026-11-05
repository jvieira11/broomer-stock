# Broomer Estoque

Sistema web interno de gestão de estoque da **Broomer** (moda masculina,
Maceió/AL). Controla modelos de produto, variações por tamanho e cor (cada uma
um SKU com saldo próprio), entradas, vendas com várias peças, ajustes,
estornos e o histórico completo, com acesso por perfil.

| Parte | Tecnologia |
|---|---|
| `apps/api` | NestJS 11, Prisma 7, PostgreSQL 17 |
| `apps/web` | Next.js 16 (App Router, Server Actions), React 19, Tailwind 4, Lucide, Montserrat |
| Banco | Postgres no Docker (`docker-compose.yml`, porta **5434**) |
| Compras | Sugestão de reposição, pedidos de compra e recebimento com entrada no estoque — ver [COMPRAS.md](COMPRAS.md) |
| Produção | Docker Compose com Caddy e backups; banco no próprio servidor ou no Neon (Postgres gerenciado, São Paulo) — ver [DEPLOY.md](DEPLOY.md) |

## Como rodar (desenvolvimento)

Pré-requisitos: Node 24+, pnpm 11 e Docker Desktop aberto.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # troque JWT_SECRET e SEED_ADMIN_*
pnpm db:up                               # Postgres na porta 5434
pnpm --filter api exec prisma migrate deploy
pnpm --filter api db:seed                # cria a loja e o primeiro administrador
pnpm dev                                 # API em :3333 e web em :3000
```

> A porta 5434 evita conflito com um Postgres do Windows (5432) ou de outro
> projeto (5433).

### Primeiro administrador

Não existe cadastro público. O primeiro acesso é criado pelo seed, com os
dados de `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (12+ caracteres) e
`SEED_ORGANIZATION_NAME` do `apps/api/.env`:

- Se a loja já tiver um administrador ativo, o seed não faz nada (não troca
  senha nem cria duplicatas).
- Depois de criar, apague `SEED_ADMIN_PASSWORD` do `.env` e troque a senha em
  **Minha conta**.
- Os demais usuários são criados pelo administrador em **Usuários**.

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Sobe API e web juntas |
| `pnpm db:up` | Sobe o Postgres no Docker |
| `pnpm build` | Build de produção das duas apps |
| `pnpm --filter api test` | Testes unitários (regras de estoque) |
| `pnpm --filter api test:e2e` | Testes de ponta a ponta da API (precisa do Postgres local: `pnpm db:up`; recusam banco fora da máquina) |
| `pnpm --filter web test` | Testes do web (funções puras, com `node --test`) |
| `pnpm --filter api db:seed` | Cria o primeiro administrador |
| `pnpm --filter api prisma:studio` | Abre o Prisma Studio |
| `pnpm --filter web lint` | Lint do web |

Os testes e2e usam o banco `stock_database_test`, criado e migrado
automaticamente; o banco de desenvolvimento nunca é tocado.

## Modelo de dados

- **Product** — o modelo comercial (ex.: camisa linho slim): referência (texto,
  preserva zeros à esquerda), nome, categoria, fornecedor, coleção,
  linha/modelagem, preço de venda e estoque mínimo por SKU.
- **ProductVariant** — o SKU: uma combinação de tamanho e cor com saldo
  inteiro próprio e custo médio. SKU único; combinação (produto, tamanho, cor)
  única. Tamanho e cor vazios = "não se aplica" (acessórios). Tamanho e cor
  são gravados em maiúsculas, sem espaços duplicados.
- **StockOperation** — agrupa os itens registrados juntos (uma venda com várias
  peças), com número sequencial, tipo, data/hora, nº da venda, origem, motivo,
  observações e responsável.
- **StockMovement** — um item da operação: variação, quantidade com sinal,
  saldo antes e depois, custo e responsável.
- **Category**, **Supplier**, **User**, **Organization** (a loja).

### Tipos de operação

| Tipo | Efeito | Quem registra |
|---|---|---|
| Entrada | soma | Operador, gerente, administrador |
| Venda | subtrai | Operador, gerente, administrador |
| Devolução de cliente | soma (motivo obrigatório) | Gerente, administrador |
| Devolução ao fornecedor | subtrai (motivo obrigatório) | Gerente, administrador |
| Perda/avaria | subtrai (motivo obrigatório) | Gerente, administrador |
| Ajuste de inventário | define o saldo pela contagem (motivo obrigatório) | Gerente, administrador |
| Estorno | desfaz outra operação (motivo obrigatório) | Gerente, administrador |
| Carga inicial | soma | Só pela importação do relatório do ERP (administrador) |

## Regras de estoque

- O saldo **só muda por operações**; não há edição direta de saldo.
- Quantidades são **peças inteiras e positivas**; saída maior que o saldo é
  recusada. O banco também impede saldo negativo (CHECK).
- Saldo e movimentação são gravados **na mesma transação**: se um item de uma
  venda falhar, nada da venda é gravado.
- **Concorrência:** as variações são travadas (`SELECT … FOR UPDATE`) em ordem
  de id; duas vendas simultâneas do mesmo SKU nunca consomem o mesmo saldo e
  vendas cruzadas não entram em deadlock.
- **Reenvio:** cada formulário manda uma chave de idempotência; reenviar (duplo
  clique, rede lenta) devolve a operação já gravada em vez de duplicá-la.
- Operações **não são editadas nem apagadas**. Erros se corrigem com
  **estorno**, que cria uma operação inversa ligada à original (no máximo um
  estorno por operação; estorno não é estornado).
- **Custo médio ponderado** por variação: entradas podem informar o custo por
  peça; saídas são registradas pelo custo médio do momento.
- Produto ou variação **desativado** sai da consulta de estoque e não pode ser
  movimentado, mas o histórico fica intacto. Só se excluem produtos, variações
  e categorias que nunca foram usados.
- **Situação do estoque:** zerado (saldo 0), baixo (saldo ≤ mínimo, quando há
  mínimo) ou normal. O mínimo da variação sobrepõe o do modelo.

## Perfis

| Perfil | Pode |
|---|---|
| Administrador | Tudo, inclusive usuários, configurações, ajustes e estornos |
| Gerente | Cadastros, todas as operações, ajustes e estornos |
| Operador | Entradas e vendas; consulta estoque e histórico |
| Consulta | Só ver |

As permissões são aplicadas **na API** (toda rota que altera dados declara os
papéis permitidos); a interface só esconde o que o perfil não pode usar.

## Telas

`/dashboard`, `/estoque`, `/produtos` (`/novo`, `/[id]`, `/[id]/editar`),
`/produtos/importar` (carga inicial pelo relatório do ERP, com prévia),
`/movimentacoes/nova`, `/movimentacoes` (histórico com filtros e exportação
CSV), `/movimentacoes/[id]` (operação com itens e estorno), `/categorias`,
`/usuarios`, `/configuracoes` (dados da loja e backup em .xlsx), `/conta`.

## API

Prefixo `/api`. Todas as rotas exigem `Authorization: Bearer <token>`, exceto
login, recuperação de senha, `GET /api/health` (confere o banco; para
monitores) e `GET /api/health/live` (só a API; para o Docker). Sem token: 401; papel sem
permissão: 403; validação: 400; inexistente: 404; duplicado ou em uso: 409.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | Devolve o token |
| GET | `/auth/me` | Usuário logado |
| POST | `/auth/forgot-password` · `/auth/reset-password` | Recuperação de senha por e-mail |
| PATCH | `/auth/password` | Troca a própria senha |
| GET/POST, PATCH | `/users`, `/users/:id` | Usuários (só administrador) |
| GET/PATCH | `/organization` · GET `/organization/export` | Dados da loja e backup .xlsx |
| GET | `/dashboard?from&to` | Indicadores do período |
| GET/POST, GET/PATCH/DELETE | `/categories`, `/categories/:id` | Categorias (`search`, `active`) |
| GET | `/suppliers` | Fornecedores |
| GET/POST, GET/PATCH/DELETE | `/products`, `/products/:id` | Modelos com variações |
| POST | `/products/:id/variants` | Nova variação |
| POST | `/products/import/preview` · `/products/import` | Prévia e confirmação da carga inicial pelo relatório do ERP (só administrador) |
| GET | `/variants` | Consulta de estoque por SKU (`search`, `categoryId`, `size`, `color`, `status`, `sort`, `page`) |
| GET | `/variants/attributes` | Tamanhos e cores cadastrados |
| PATCH/DELETE | `/variants/:id` | Edita, desativa ou exclui variação |
| GET/POST | `/operations` | Lista / registra operação com itens |
| GET | `/operations/:id` | Operação com todos os itens |
| POST | `/operations/:id/reverse` | Estorno |
| GET | `/movements` | Histórico item a item (período, tipo, produto, SKU, tamanho, cor, categoria, usuário) |

## Variáveis de ambiente

`apps/api/.env` — ver `apps/api/.env.example`: `DATABASE_URL`, `JWT_SECRET`
(obrigatória), `WEB_URL`, `AUTH_RATE_LIMIT`, `RESEND_API_KEY`/`MAIL_FROM`
(e-mail de recuperação de senha; sem chave, o e-mail sai no terminal da API),
`SENTRY_DSN` e `SEED_*`. Com banco gerenciado (Neon), a conexão direta para
as migrations vai em `DIRECT_URL` ou `DATABASE_URL_UNPOOLED` (ver DEPLOY.md).

`apps/web/.env.local` (opcional): `API_URL` (padrão `http://localhost:3333/api`).

## Ainda não tem

- **Atualização periódica pelo ERP:** a importação serve só para a carga
  inicial (recusa SKUs que já existem). Como o sistema convive com o caixa do
  ERP ainda é uma decisão pendente.
- Integração com caixa/emissão fiscal (fora do escopo desta versão).
- A planilha de vendas do ERP (`vendas por cupom`) não é importada: tem CPF e
  celular de clientes, que o controle de estoque não precisa.
