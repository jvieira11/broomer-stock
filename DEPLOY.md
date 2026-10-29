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

Não há cadastro público: o primeiro administrador é criado pelo seed
(`pnpm --filter api db:seed`, ver README). A imagem de produção não inclui o
`tsx`; até isso ser resolvido, rode o seed de uma máquina de desenvolvimento
apontando `DATABASE_URL` para o banco de produção por um túnel SSH.

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
2. Novo projeto: **Postgres 17** (a mesma versão do desenvolvimento, do CI e
   da imagem de backup) e região **São Paulo** (AWS sa-east-1), se oferecida.
3. A branch `main` do projeto é a produção. Crie também uma branch `dev` para
   testar migrations e restaurações sem tocar na produção.
4. Em **Connect**, anote o host direto, o host com `-pooler`, o usuário, a
   senha e o nome do banco. Eles vão só para o `.env.neon` do servidor.

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

**Primeiro administrador:** de uma máquina de desenvolvimento, com as URLs só
na linha de comando (nada gravado em arquivo):

```bash
DATABASE_URL='URL-DO-POOLER' DIRECT_URL='URL-DIRETA' \
SEED_ADMIN_EMAIL='voce@empresa.com.br' SEED_ADMIN_PASSWORD='senha-com-12+' \
pnpm --filter api db:seed
```

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

1. **Restauração do Neon** a um ponto no tempo (a janela depende do plano).
2. **`pg_dump` diário** do serviço `backup`, em `./backups` no servidor.
3. **Cópia externa** desses arquivos com o rclone, como na seção 6.

O teste mensal (`verify-latest.sh`) funciona igual, trocando o arquivo de
compose e o `--env-file` no comando. Ele cria e apaga um banco temporário no
próprio projeto do Neon.

**Para restaurar, não use o `restore.sh` direto na produção.** Restaure numa
branch nova do Neon (pelo painel, a um ponto no tempo, ou com `pg_restore` de
um dump numa branch vazia), confira os dados e só então troque os hosts do
`.env.neon` para essa branch, ou promova-a no painel, e reinicie a API.

## Checklist antes de usar em produção

- [ ] `.env.production` com senhas geradas e `chmod 600`
- [ ] Primeiro administrador criado pelo seed e senha trocada no primeiro acesso
- [ ] HTTPS funcionando no domínio
- [ ] Backup diário rodando **e copiado para fora do servidor**
- [ ] `verify-latest.sh` executado com sucesso pelo menos uma vez
- [ ] Monitor de disponibilidade com alerta configurado
- [ ] `SENTRY_DSN` configurado
- [ ] Domínio verificado no Resend, `RESEND_API_KEY` e `MAIL_FROM` preenchidos, "esqueci minha senha" testado
- [ ] CI passando no commit que está no ar
