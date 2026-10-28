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
  ou WhatsApp. O `GET /api/health` (que também testa o banco) é usado pelos
  health checks internos do Docker.
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
