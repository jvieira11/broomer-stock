# Colocando o Broomer Estoque no ar

Guia para rodar em produção num servidor Linux (VPS) com Docker. Tudo roda
com um único `docker compose`: banco, API, web, HTTPS (Caddy) e backups.

```
Internet ──HTTPS──▶ Caddy ──▶ web (Next.js) ──▶ api (NestJS) ──▶ Postgres
                     :443        rede interna     rede interna     │
                                                  backup ◀──────────┘ (pg_dump diário)
```

Só o Caddy fica exposto. API e banco não são acessíveis pela internet.

## 1. O que você precisa contratar

| Item | Sugestão | Custo aproximado |
|---|---|---|
| Servidor (VPS) | 2 vCPU, 4 GB RAM, 40 GB SSD, Ubuntu 24.04. Ex.: Hetzner, DigitalOcean, Magalu Cloud, Locaweb | R$ 30–120/mês |
| Domínio | Registro.br (`.com.br`) | R$ 40/ano |
| Armazenamento para backups fora do servidor | Backblaze B2, Cloudflare R2 ou AWS S3 | centavos/GB |
| Monitoramento de erros (opcional) | sentry.io (plano gratuito) | grátis no início |
| Monitor de disponibilidade | UptimeRobot ou Better Stack (plano gratuito) | grátis |

> **LGPD:** se possível, escolha um servidor no Brasil, ou informe na
> política de privacidade o país onde os dados ficam.

## 2. Preparar o servidor

```bash
# No servidor, como root ou com sudo
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
git clone https://github.com/SEU-USUARIO/broomer-estoque.git /opt/broomer-estoque
cd /opt/broomer-estoque
```

No painel do seu domínio, crie um registro **A** apontando
`estoque.suaempresa.com.br` para o IP do servidor.

## 3. Configurar

```bash
cp .env.production.example .env.production
openssl rand -hex 24       # cole em POSTGRES_PASSWORD
openssl rand -base64 48    # cole em JWT_SECRET
nano .env.production       # preencha DOMAIN e as senhas
chmod 600 .env.production
```


## 4. Subir

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Na primeira subida, a API aplica as migrations sozinha. Em 1–2 minutos o
Caddy emite o certificado HTTPS.

Não há cadastro público. Crie o primeiro administrador no próprio servidor,
com a API já no ar (a senha é digitada sem aparecer e não fica no histórico):

```bash
read -r -p "E-mail do administrador: " ADMIN_EMAIL
read -r -s -p "Senha (12+ caracteres): " ADMIN_PASSWORD; echo
docker compose -f docker-compose.prod.yml --env-file .env.production exec \
  -e SEED_ADMIN_EMAIL="$ADMIN_EMAIL" -e SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  api node dist/scripts/create-admin.js
unset ADMIN_PASSWORD
```

Pode rodar mais de uma vez: se a loja já tiver um administrador ativo, não
faz nada. Troque a senha em **Minha conta** no primeiro acesso.

Se a API não subir, veja o log:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs api
```

A API se recusa a iniciar com configuração perigosa (por exemplo, um
`JWT_SECRET` curto ou de exemplo) e diz o que falta.

## 5. Atualizar para uma versão nova

```bash
cd /opt/broomer-estoque
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations novas são aplicadas automaticamente ao subir a API. O
`migrate deploy` só aplica o que falta e nunca apaga dados. Ainda assim, faça
um backup antes (veja abaixo).

## 6. Backups

O serviço `backup` faz um `pg_dump` por dia (configurável) em `./backups` e
apaga os mais antigos que `BACKUP_KEEP_DAYS`.

**Backup manual agora:**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec backup sh -c 'pg_dump --format=custom --no-owner --file=/backups/stock-manual-$(date +%Y%m%d-%H%M%S).dump'
```

**Provar que o backup restaura** (rode uma vez por mês; não mexe na produção):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec backup sh /scripts/verify-latest.sh
```

**Copiar os backups para fora do servidor.** Um backup que só existe no
próprio servidor some junto com ele. Com o [rclone](https://rclone.org)
configurado para o B2/R2/S3, agende no `crontab -e` do servidor:

```cron
30 3 * * * rclone copy /opt/broomer-estoque/backups remoto:stock-backups --max-age 48h
```

**Restaurar em caso de desastre** (substitui os dados atuais):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production stop api web
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec backup sh /scripts/restore.sh /backups/stock-AAAAMMDD-HHMMSS.dump SIM
docker compose -f docker-compose.prod.yml --env-file .env.production start api web
```

## 7. Monitoramento

- **Disponibilidade:** cadastre no UptimeRobot/Better Stack um monitor HTTP
  para `https://SEU_DOMINIO/login`, a cada 5 minutos, com alerta por e-mail
  ou WhatsApp. O `GET /api/health` também testa o banco e serve para esse
  tipo de monitor. Os health checks internos do Docker usam
  `GET /api/health/live`, que não consulta o banco.
- **Erros:** crie um projeto Node.js no sentry.io e cole o DSN em
  `SENTRY_DSN`. Erros inesperados da API (500) passam a chegar lá com o stack
  trace. Sem o DSN, eles vão só para `docker compose logs api`.
- **Logs:** `docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api web`.

## 8. E-mails (Resend)

O "esqueci minha senha" manda um link por e-mail pelo [Resend](https://resend.com).

1. No Resend, em **Domains**, adicione um subdomínio só para envio (por
   exemplo `mail.suaempresa.com.br`) e crie no seu provedor de DNS os
   registros que ele mostrar (SPF, DKIM e MX de retorno). A verificação pode
   levar de minutos a algumas horas.
2. Em **API Keys**, crie uma chave com permissão **Sending access** restrita a
   esse domínio e cole em `RESEND_API_KEY` no `.env.production`.
3. Ajuste `MAIL_FROM` para um endereço desse domínio, por exemplo
   `Broomer Estoque <nao-responda@mail.suaempresa.com.br>`.
4. Reinicie a API e teste em `https://SEU_DOMINIO/forgot-password`. Os envios
   aparecem em **Emails** no painel do Resend.

Enquanto o domínio não estiver verificado, o remetente `onboarding@resend.dev`
só entrega para o e-mail dono da conta Resend.

## 9. CI

Cada push e pull request no GitHub roda `.github/workflows/ci.yml`: lint,
tipos, testes unitários, testes e2e com Postgres e build das imagens Docker.
Veja o resultado na aba **Actions** do repositório. Só atualize o servidor
com commits em que o CI passou.

## 9b. Demonstração online no Render (dados fictícios)

Para o cliente testar pelo navegador antes de existir servidor próprio. Usa o
`render.yaml` (duas imagens Docker: api e web) e um banco **separado** da
produção: uma branch `demo` no Neon. Nunca use a branch `production`.

1. **Neon:** no projeto, crie a branch `demo` (a partir de `production`, que
   está vazia). Em *Connect*, copie as duas conexões da branch `demo`: a com
   `-pooler` (`DATABASE_URL`) e a direta (`DIRECT_URL`).
2. **Render:** crie conta em render.com e conecte o GitHub (permita o
   repositório `broomer-stock`). *New > Blueprint*, escolha o repositório e a
   branch `main`.
3. O Render pede os valores marcados `sync: false`. Digite **só no painel**,
   nunca no chat ou no GitHub: `DATABASE_URL`, `DIRECT_URL` e
   `SEED_ADMIN_PASSWORD` (mín. 12 caracteres). `JWT_SECRET` é gerado sozinho.
4. Aguarde o deploy da API (as migrations e o administrador são criados na
   subida). Confira se os endereços são mesmo
   `https://broomer-demo-api.onrender.com` e `https://broomer-demo-web.onrender.com`;
   se vierem com sufixo, ajuste `WEB_URL` (api) e `API_URL` (web) em
   *Environment* e faça *Manual Deploy*.
5. **Dados fictícios** (uma vez, em qualquer computador com Node 20+):

   ```bash
   DEMO_API_URL=https://broomer-demo-api.onrender.com/api DEMO_PASSWORD='a-mesma-senha-do-passo-3' node deploy/demo/seed.mjs
   ```

   Para a demonstração do módulo de Compras (histórico, pedidos em vários status e
   12 meses de vendas fictícias), rode depois, com os mesmos valores:

   ```bash
   DEMO_API_URL=https://broomer-demo-api.onrender.com/api DEMO_PASSWORD='a-mesma-senha-do-passo-3' node deploy/demo/seed-compras.mjs
   ```

   (retomável: se cair no meio, rode de novo; o arquivo `deploy/demo/vendas-ficticias.xlsx` é fictício e também pode ser importado pela tela Compras › Histórico de vendas.)

6. Abra o endereço do web e entre com `demo@broomer.local` e a senha. Demais
   usuários da equipe fictícia: `marina@`, `rafael@` e `juliana@broomer.local`
   (mesma senha).

Limites do plano gratuito do Render: o serviço dorme após ~15 min sem acesso
e leva cerca de 1 minuto para acordar (abra a página antes de mostrar ao
cliente); não há terminal; confirme os limites vigentes no site do Render.
O deploy não é automático: depois de mudar o código, use *Manual Deploy*.

## 9c. Só o site na Vercel (a API continua fora dela)

O site (`apps/web`) roda bem na Vercel; a API (NestJS) não precisa ir junto e
continua onde estiver (Render, servidor próprio...). O navegador só fala com o
site; é o servidor do site que chama a API, então não há CORS a ajustar.

1. Em vercel.com: **Add New > Project**, autorize o GitHub e importe o
   repositório `broomer-stock`.
2. Em **Root Directory**, clique em **Edit** e escolha `apps/web`. Deixe ligada
   a opção de incluir arquivos fora da pasta raiz (padrão): o site precisa do
   `pnpm-lock.yaml` e do `pnpm-workspace.yaml` da raiz.
3. **Environment Variables** (nenhuma é segredo):
   - `API_URL` = endereço da API terminado em `/api`
     (ex.: `https://broomer-demo-api.onrender.com/api`);
   - `ENABLE_EXPERIMENTAL_COREPACK` = `1` (usa o pnpm 11 do `package.json`; sem
     isso a Vercel escolhe outra versão do pnpm).
4. Em **Settings > Build and Deployment > Node.js Version**, escolha `24.x`.
5. **Deploy.** A região (São Paulo, `gru1`, perto do Neon) e a instalação só do
   que o site usa vêm do `apps/web/vercel.json`.
6. Na **API**, troque `WEB_URL` pelo endereço do site na Vercel (usado nos links
   dos e-mails). No Render, mudar a variável reinicia a API.
7. Abra o site e teste o login. Se mudar o domínio depois, atualize `WEB_URL`.

Cuidados:
- **Plano:** o Hobby (gratuito) da Vercel é só para uso pessoal e não comercial;
  um sistema de loja pede o plano Pro. Confira termos e preço no site da Vercel.
- **Importação de planilhas:** na Vercel cada requisição às funções aceita cerca
  de 4,5 MB (confirme no painel). Os relatórios atuais (1 a 2 MB) cabem; um
  relatório maior teria de ser dividido por período.
- **Build:** na Vercel o site usa o formato dela; o `output: "standalone"` do
  `next.config.ts` só vale fora da Vercel (imagem Docker).
- Se a API dorme (Render gratuito), o primeiro acesso ainda demora cerca de 1
  minuto: a Vercel resolve a lentidão do site, não a da API.

## 10. Alternativa: banco no Neon (PostgreSQL gerenciado)

Em vez do Postgres rodando no próprio servidor, o banco pode ficar no
[Neon](https://neon.tech). O servidor passa a rodar só API, web, Caddy e o
backup; se ele for perdido, os dados continuam no Neon. Nada muda no código
nem no login: o Neon é só o lugar onde o Postgres roda.

```
Internet ──HTTPS──▶ Caddy ──▶ web ──▶ api ──TLS──▶ Neon (pooler)
                                       │ migrations ──▶ Neon (conexão direta)
                     backup (pg_dump) ─┘──────────────▶ Neon (conexão direta)
```

### Criar o banco

1. Crie a conta no Neon com 2FA ativado.
2. Novo projeto na região **São Paulo** (AWS sa-east-1). O projeto da Broomer
   (`red-night-50336791`) usa **Postgres 18**; a imagem do serviço `backup`
   no `docker-compose.neon.yml` precisa ter a mesma versão principal.
3. A branch `main` do projeto é a produção. Crie também uma branch `dev` para
   testar migrations e restaurações sem tocar na produção.
4. Em **Connect**, anote o host direto, o host com `-pooler`, o usuário, a
   senha e o nome do banco. Eles vão só para o `.env.neon` do servidor.

Pela CLI do Neon (`npm i -g neon`), o projeto já está declarado no `neon.ts`
(só Postgres; o login continua sendo o do Broomer). Com a CLI autenticada
(`neon login` ou `NEON_API_KEY`), `neon link` e `neon deploy` gravam
`DATABASE_URL` (pooler) e `DATABASE_URL_UNPOOLED` (direta) no `.env.local`
da raiz, que fica fora do git. A API e o Prisma entendem esses dois nomes:

```bash
set -a; . ./.env.local; set +a
pnpm --filter api exec prisma migrate deploy   # usa DATABASE_URL_UNPOOLED
```

### Configurar e subir

```bash
cp .env.neon.example .env.neon
nano .env.neon          # DB_*, DOMAIN, JWT_SECRET...
chmod 600 .env.neon
docker compose -f docker-compose.neon.yml --env-file .env.neon up -d --build
```

Use `docker-compose.neon.yml` **ou** `docker-compose.prod.yml`, nunca os dois
no mesmo servidor apontando para dados diferentes.

Ao subir, a API aplica as migrations pendentes pela conexão direta
(`DIRECT_URL`) e passa a usar a do pooler (`DATABASE_URL`). Os 2 a 5 usuários
entram pelo mesmo endereço, cada um com o seu login, e veem os mesmos dados.

**Primeiro administrador:** como na seção 4, trocando o arquivo de compose e
o `--env-file` (`-f docker-compose.neon.yml --env-file .env.neon`).

### Cuidados

- **Credenciais:** só no `.env.neon` do servidor. Nunca no GitHub, no web, no
  CI ou no `apps/api/.env`. Se vazarem, troque a senha no painel do Neon,
  atualize o `.env.neon` e reinicie.
- **Desenvolvimento:** nunca aponte o `apps/api/.env` para a branch `main`.
  O `prisma migrate dev` pode propor apagar o banco. Os testes e2e se recusam
  a rodar fora de um Postgres local.
- **Migrations:** antes de atualizar a produção, crie no Neon uma branch a
  partir da `main` e rode `prisma migrate deploy` nela para ver se passa.
- **Banco ocioso:** no plano gratuito o Neon desliga o banco quando ninguém
  usa, e a primeira consulta depois disso demora um pouco mais. O health check
  do Docker não consulta o banco, para não mantê-lo ligado à toa. Um monitor
  externo em `/api/health` a cada 5 minutos o mantém ligado (e consome as
  horas do plano); use `/login` no monitor se preferir deixá-lo dormir.

### Backups e restauração

São três camadas:

1. **Restauração do Neon** a um ponto no tempo. A janela depende do plano: no
   gratuito são **6 horas** (conferido no projeto da Broomer). Um erro
   percebido depois disso só se recupera pelos dumps.
2. **`pg_dump` de 6 em 6 horas** do serviço `backup`, em `./backups` no
   servidor (`BACKUP_INTERVAL_SECONDS=21600`). Assim, no pior caso, perdem-se
   6 h de dados, e não 24 h.
3. **Cópia externa** desses arquivos pelo serviço `offsite` (rclone), sem
   cron no servidor:
   1. Crie um bucket no Cloudflare R2 (ou Backblaze B2) e uma chave com
      permissão só de escrita nele.
   2. Preencha as variáveis `OFFSITE_*` no `.env.neon`.
   3. Suba com o perfil ligado:
      `docker compose -f docker-compose.neon.yml --env-file .env.neon --profile offsite up -d`
   4. Confira em `... logs offsite` a linha "cópia externa ok" e o arquivo no
      painel do bucket.
   5. No bucket, crie uma regra de ciclo de vida que apague arquivos com mais
      de 90 dias: o serviço só envia, nunca apaga.

O teste mensal (`verify-latest.sh`) funciona igual, trocando o arquivo de
compose e o `--env-file` no comando. Ele cria e apaga um banco temporário no
próprio projeto do Neon.

### Ensaio de restauração (uma vez, antes de usar dados reais)

Backup que nunca foi restaurado é só uma esperança. Com o sistema no ar e pelo
menos um dump em `./backups`:

1. Rode o teste de restauração (carrega o dump mais recente num banco
   temporário do projeto, compara as contagens com a produção e apaga o
   temporário; não toca na produção):

   ```bash
   docker compose -f docker-compose.neon.yml --env-file .env.neon \
     exec backup sh /scripts/verify-latest.sh
   ```

   Esperado: `OK: o backup restaura corretamente.`
2. Confira também o outro caminho, a restauração do próprio Neon: no painel,
   **Restore** da branch `production` para um horário de 1 a 2 horas atrás,
   **sempre numa branch nova** (nunca por cima da produção), e abra o sistema
   apontando para ela só para conferir.
3. Anote a data do ensaio. Repita a cada mês.

### Proteção contra exclusão da branch de produção

O Neon protege a branch contra exclusão e reset, mas o plano gratuito **não
oferece** isso (limite de 0 branches protegidas). Enquanto for o gratuito:
a chave de API do Neon fica só no ambiente de quem administra, a conta usa
2FA, e os dumps de 6 em 6 horas com cópia externa são a rede de segurança. Ao
migrar para um plano pago, proteja a branch `production` (Branches → Protect).

**Para restaurar, não use o `restore.sh` direto na produção.** Restaure numa
branch nova do Neon (pelo painel, a um ponto no tempo, ou com `pg_restore` de
um dump numa branch vazia), confira os dados e só então troque os hosts do
`.env.neon` para essa branch, ou promova-a no painel, e reinicie a API.

## Checklist antes de usar em produção

- [ ] Se for usar o Neon: ensaio de restauração feito e anotado (seção "Ensaio de restauração")
- [ ] `.env.production` com senhas geradas e `chmod 600`
- [ ] Primeiro administrador criado pelo seed e senha trocada no primeiro acesso
- [ ] HTTPS funcionando no domínio
- [ ] Backup diário rodando **e copiado para fora do servidor**
- [ ] `verify-latest.sh` executado com sucesso pelo menos uma vez
- [ ] Monitor de disponibilidade com alerta configurado
- [ ] `SENTRY_DSN` configurado
- [ ] Domínio verificado no Resend, `RESEND_API_KEY` e `MAIL_FROM` preenchidos, "esqueci minha senha" testado
- [ ] CI passando no commit que está no ar
