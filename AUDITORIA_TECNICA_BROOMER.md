# AUDITORIA TÉCNICA — BROOMER ESTOQUE

| | |
|---|---|
| **Data** | 05/11/2026 |
| **Código auditado** | branch `claude/melhorias-auditoria` (commit `3a35a8c`), que está **5 commits à frente** da `main` (`5d3a64d`). A `main` também foi avaliada onde isso muda o resultado (dependências). |
| **Método** | Leitura do código + execução real: testes existentes, lint, tipos, build, testes de segurança, de API, de estoque, de concorrência, de falhas, de interface em navegador, de desempenho em escala e de infraestrutura, **somente em ambiente isolado, com banco próprio e dados fictícios**. |
| **Não foi feito** | Nenhuma alteração de código, nenhuma migração em banco real, nenhum deploy, nenhum recurso pago criado, nenhum exploit executado, nenhum dado real tocado. |

---

## Atualização — status das correções (05/11/2026)

O texto abaixo é o registro da auditoria **como foi feita**. Estas são as correções já aplicadas na `main`, com a verificação de cada uma:

| Achado | Status | O que foi feito e como foi verificado |
|---|---|---|
| **F-01** Next.js vulnerável | **Corrigido** (commit `d818fd5`, na `main` desde `8466471`) | `pnpm audit --prod` na `main`: de 5 críticas e 3 altas para 3 moderadas indiretas. CI verde. |
| **F-02** Queda de rede derruba o formulário | **Corrigido** (`aefaec8`) | `safeCall` converte só falhas de rede em aviso e foi aplicado aos 9 pontos que chamam ações do servidor e ao `useFormAction`. No navegador: sem internet e com resposta perdida, o formulário e os dados foram mantidos; confirmar de novo **não duplicou** (8/8). 9 testes unitários novos. |
| **F-04** Validação de limites e nulos | **Corrigido** (`8c64587`) | Limites nos campos numéricos, `null` recusado, filtro global de entrada (caractere nulo e aninhamento), `P2020` → 400, limite na planilha do ERP e aviso na tela. A bateria hostil original (384 requisições) foi de 3 reprovações para **0 anomalias**; testes unitários 49→55, ponta a ponta 75→77; regressões de estoque, quedas, permissões, isolamento e painel sem mudança. |
| **F-03** Proteção contra perda de dados no Neon | **Parcial** | Feito: backups do Neon de 6 em 6 h (antes, diários) e procedimento de ensaio de restauração e de proteção documentados no `DEPLOY.md`. **Pendente, depende de você ou de infraestrutura:** o plano gratuito do Neon **não permite branch protegida** (a API recusou; nada foi alterado) nem mais de 6 h de restauração; e o ensaio de restauração só pode ser feito com o sistema no ar. |

Os demais achados (F-05 a F-30) seguem como descritos abaixo.

---

## A. Resumo executivo

**Estado geral.** O Broomer Estoque é um sistema **bem construído no que mais importa: a integridade do estoque.** Em todos os testes agressivos que apliquei (vendas simultâneas, repetição de pedidos, estornos simultâneos, derrubada forçada da API e do banco no meio de vendas), **o saldo no banco bateu exatamente com a soma independente das movimentações, nunca ficou negativo e nenhuma venda ficou pela metade.** As permissões são aplicadas na API (160 combinações de rota × perfil conferidas sem divergência), as lojas são isoladas entre si e nenhum XSS executou em 15 telas.

**Nível de maturidade.** Produto funcional e bem testado (124 testes automáticos passando, 90,5% das linhas cobertas pelos testes de ponta a ponta), **ainda não implantado**. É um candidato sólido a **piloto controlado** depois de corrigir os bloqueadores abaixo; ainda não está pronto para uso real irrestrito.

**O que a auditoria encontrou (30 achados):**

| Gravidade | Qtde | Os mais importantes |
|---|---|---|
| **CRÍTICO** | 1 | **F-01** — a `main` usa Next.js 16.3.2 com 5 falhas críticas e 3 altas. **Já corrigido na branch, falta mesclar.** |
| **ALTO** | 2 | **F-02** — se a internet cair ao confirmar uma venda, a tela inteira vira página de erro e o que foi digitado se perde; há risco de venda duplicada ao refazer. **F-03** — a proteção contra perda de dados no Neon é insuficiente hoje (restauração só das últimas 6 h, branch de produção sem proteção, backups ainda não rodando). |
| **MÉDIO** | 7 | Validação incompleta de limites (erro 500 com valores absurdos), telas de erro com texto de desenvolvedor e HTTP 500 para URL/datas inválidas, acessibilidade (contraste), custos visíveis a todos os perfis, sem trilha de auditoria administrativa, uso do papel "dono" do banco, repositório sem proteções. |
| **BAIXO** | 12 | Rolagem lateral do painel no celular, exportação que corta sem avisar, política de senha, sem CSP, sem procedimento de reversão, complexidade de alguns arquivos, entre outros. |
| **INFORMATIVO** | 8 | Observações sem falha confirmada. |

**Resultado dos testes (170 verificações na matriz da seção D):** **146 aprovadas · 12 reprovadas** (correspondem a 9 achados) **· 11 não executadas** (dependem de servidor, domínio, contas externas ou Docker) **· 1 não aplicável**.

**Preparado para produção? Ainda não.** Faltam: (1) mesclar as correções de segurança; (2) tratar a queda de rede no formulário de venda (F-02); (3) validar limites e valores nulos na API (F-04); (4) configurar e **ensaiar** backups e restauração no Neon (F-03); (5) o que depende de infraestrutura que ainda não existe (servidor, domínio, HTTPS, e-mail, monitoramento). Detalhes na seção F.

---

## B. Diagnóstico da arquitetura

**Stack.** Monorepo pnpm. `apps/api`: NestJS 11 + Prisma 7 (driver `pg` via `@prisma/adapter-pg`) + PostgreSQL. `apps/web`: Next.js 16.4.3 (App Router, Server Actions) + React 19 + Tailwind 4. Autenticação própria (senha com scrypt, JWT de 7 dias em cookie `httpOnly`). E-mail pelo Resend. Erros da API opcionalmente no Sentry.

**Fluxo.** Navegador → (Caddy/HTTPS) → site Next.js → API NestJS → Postgres. **O navegador nunca fala com a API nem com o banco**: o token fica num cookie `httpOnly` e só o servidor do site o envia à API. Isso foi verificado (nenhuma variável `NEXT_PUBLIC_*`, nenhum acesso ao banco no código do web).

**Tamanho.** API: 5.197 linhas em 63 arquivos (+ 2.615 linhas de testes em 17 arquivos). Web: 6.019 linhas em 57 arquivos. 37 rotas de API, 18 telas.

**Banco.** 9 tabelas de dados (mais a de controle do Prisma), 9 migrações, 29 restrições. Pontos fortes verificados no próprio banco: saldo nunca negativo (`CHECK`), movimento que não fecha a conta é recusado (`balance_after = balance_before + quantity`), SKU e referência únicos por loja, exclusão de operação com itens bloqueada (`RESTRICT`), valores em `numeric` (sem ponto flutuante). Todos os dados são presos a uma loja (`organization_id`), o que permite crescer para mais lojas sem reconstruir.

**Infraestrutura.** Dois arquivos de compose (`docker-compose.prod.yml` com Postgres no servidor e `docker-compose.neon.yml` com banco no Neon), Caddy para HTTPS, serviço de backup com `pg_dump`, cópia externa opcional (rclone). CI no GitHub com 4 etapas (auditoria de dependências, API, web, imagens Docker), verde em todos os commits recentes. **Nada está implantado ainda.** O banco no Neon (Postgres 18, São Paulo) existe e está vazio.

**Integrações.** Neon (banco), Resend (e-mail, **não configurado**), Sentry (opcional, **não configurado**), GitHub Actions.

**A arquitetura comporta a evolução?** Sim. A separação de responsabilidades é clara, os contratos da API são validados, e o modelo de dados já isola lojas. Não há motivo técnico para reconstruir nada.

---

## C. Resultado por categoria

### C.1 Segurança — **Boa; um ponto crítico apenas na `main`**
- **Aprovado (34 de 35 testes de autenticação):** login sem enumeração de contas (mesma resposta e mesmo tempo), tokens forjados/expirados/sem assinatura/de usuário inexistente recusados, usuário desativado perde o acesso na hora, troca de senha derruba as outras sessões, cookie `httpOnly` + `Secure` + `SameSite=Lax`, limite de 10 tentativas de login por minuto, CORS só para a origem do sistema, cabeçalhos de segurança (Helmet) na API.
- **Aprovado:** sem SQL injection (384 requisições hostis, tabelas e usuários intactos), sem XSS em 15 telas, CSRF nas ações do servidor bloqueado e **conferido no banco** (nada criado a partir de origem falsa), sem redirecionamento aberto, sem atribuição em massa (10 tentativas → 400).
- **Segredos:** nenhum segredo no código atual nem em **todo o histórico do Git**; arquivos `.env*` ignorados; logs (4.518 linhas, com centenas de erros provocados) sem senha, hash, token ou chave.
- **Falhas:** F-01 (Next.js na `main`), F-14 (limite de login burlável em topologia específica), F-15 (sem CSP), F-16, F-17.

### C.2 Banco de dados — **Muito bom no esquema; configuração do provedor precisa de atenção**
- Restrições e índices adequados; **backup e restauração reais funcionam**: `pg_dump` de 1,6 MB em 0,3 s e restauração num banco novo com **todas as 9 tabelas, a soma de saldos e as 29 restrições idênticas**.
- Migração destrutiva (`20261028150000`) bem feita: preserva dados e **aborta com erro** se houver movimentações antigas que não dá para classificar.
- **Falhas:** F-03 (Neon: restauração só 6 h, branch sem proteção), F-09 (aplicação usaria o papel dono do banco), F-23 (histórico alterável por quem tem acesso direto ao banco).

### C.3 Integridade do estoque — **Excelente (21/21 + 5/5 aprovados)**
Os 8 cenários pedidos passaram: entrada 10 → venda 2 → saldo 8; venda acima do saldo recusada sem gravar nada; quantidade negativa/zero/fracionada recusada; estorno devolve o saldo e liga à venda original; estorno duplo e estorno de estorno recusados; **venda de 3 itens em que o último falha não grava nenhum**; operações recusadas não consomem número (numeração sem buracos). Concorrência: 80 vendas simultâneas com saldo 25 → exatamente 25 passam; 30 envios simultâneos da mesma venda → 1 operação; 15 estornos simultâneos → 1 vale; 60 vendas com itens em ordem cruzada → sem deadlock; **400 operações mistas simultâneas** (entradas, vendas, perdas, devoluções, inventários, estornos) → saldo do banco = soma independente dos efeitos. Falhas: API derrubada com `kill -9` no meio de 500 vendas e conexões do banco derrubadas a cada 250 ms durante 300 vendas → **nenhuma venda parcial, nenhuma duplicada ao reenviar, estoque consistente, API se recupera sozinha**.

### C.4 Funcionalidades — **Funcionam; tratamento de erros nas bordas é o ponto fraco**
Painel: 17/17 aprovados (cada indicador comparado com conta independente no banco, inclusive virada do dia em Maceió, estornos excluídos das vendas e itens inativos fora dos totais). Paginação estável com nomes repetidos. Falhas: F-02, F-04, F-05, F-11, F-13.

### C.5 API e backend — **Boa, com defeitos de validação de limites**
160 combinações rota × perfil sem divergência; nenhuma rota de documentação/métricas exposta; JSON malformado → 400; corpo de 2 MB → 413. **Falha confirmada (F-04):** valores extremos, `null` em alguns campos, JSON com 5.000 níveis de aninhamento e o caractere nulo (`\u0000`) causam **HTTP 500** e devolvem o código interno do Prisma.

### C.6 Infraestrutura — **Boa base, nada ensaiado em ambiente real**
Banco cai e volta com a API rodando: `/health/live` continua 200, `/health` vira 503, e a API se reconecta sozinha em ~1 s. Contêineres com usuário sem privilégios e healthchecks; nenhuma porta de banco publicada em produção. Falhas: F-03, F-10, F-18, F-19. **Não executado:** Docker/compose reais, Caddy/HTTPS, Neon real, e-mail, Sentry, cópia externa (seção I).

### C.7 Desempenho e escala — **Muito bom**
Com o volume real da Broomer (4.100 SKUs e 16.378 movimentos em 7.998 operações): importação do ERP em **0,5 s (prévia) + 2,5 s (gravação)**; consultas de tela com p95 de **26 a 92 ms**; 20 usuários simultâneos lendo: p95 de 159 a 256 ms; 94 vendas/s com p95 de 105 ms; backup `.xlsx` em 1,8 s (pico de 575 MB na API); site com 232 KB de JavaScript comprimido e LCP de 76 a 164 ms em rede local. Todas as tabelas grandes usam índices. Limites: F-13 (exportação CSV em 20.000 linhas), F-27 (escrita serializada por um bloqueio global, ~100 vendas/s: irrelevante para 2 a 5 usuários).

### C.8 Qualidade de código — **Boa**
Lint, formatação, tipos e build sem erros; **0 usos de `any`, 0 `TODO`, 0 `@ts-ignore`**. Pontos de manutenção: F-20 (alguns arquivos grandes e complexos). As 3 dependências "sem uso" (`reflect-metadata`, `rxjs`, `react-dom`) são exigências implícitas do Nest e do Next, não sobras.

### C.9 Testes — **Forte no backend, ausente na interface**
Reais: unitários **49/49**, ponta a ponta **75/75**. Cobertura medida: **testes de ponta a ponta 90,67% das instruções, 70,89% dos ramos, 96,83% das funções, 90,49% das linhas; só os unitários 21,75%**. Sem cobertura: `main.ts` (Helmet, CORS, proxy), script de criação do administrador (0%), envio real de e-mail (45%). **Nenhum teste automatizado de interface** (o web tem 4 testes, só do CSV). Ver F-22 e o anexo II.

### C.10 UX e acessibilidade — **Boa usabilidade; acessibilidade precisa de correções**
Aprovado: bloqueio claro de quantidade inválida/acima do saldo, duplo clique em "Confirmar" grava uma vez, atualizar a página não repete a venda, diálogo de confirmação modal (foco preso, Esc fecha), foco visível, idioma declarado, sem rolagem lateral em 12 das 13 telas, nenhum erro de JavaScript no navegador. Falhas: F-02, F-05, F-06, F-11, F-12.

---

## D. Matriz de testes

Resultados: **APROVADO** · **REPROVADO** · **PARCIAL** · **NÃO EXECUTADO** · **NÃO APLICÁVEL**. Cada linha foi gerada a partir do registro da execução. Os 4 casos marcados "reexecutado com critério corrigido" foram refeitos porque o critério do meu primeiro teste estava errado (por exemplo, eu contava o `<dialog>` fechado, que continua no HTML); a segunda execução é a que vale.

| Área | Teste | Resultado | Evidência | Observações |
|---|---|---|---|---|
| Autenticação e sessão | **AUTH-01** login válido devolve token e usuário | APROVADO | status 201 |  |
| Autenticação e sessão | **AUTH-02** resposta do login não vaza hash de senha nem versão de sessão | APROVADO | campos: id,name,email,role,organization |  |
| Autenticação e sessão | **AUTH-04** e-mail em maiúsculas também entra (normalização) | APROVADO | status 201 |  |
| Autenticação e sessão | **AUTH-05** senha errada e e-mail inexistente respondem igual (401, mesma mensagem) | APROVADO | 401/401; "E-mail ou senha incorretos" |  |
| Autenticação e sessão | **AUTH-06** tempo de resposta não revela se o e-mail existe (média existente vs inexistente) | APROVADO | existente 55 ms, inexistente 53 ms |  |
| Autenticação e sessão | **AUTH-07** usuário desativado não consegue entrar (mesma resposta de senha errada) | APROVADO | status 401 |  |
| Autenticação e sessão | **AUTH-08** token já emitido de usuário desativado deixa de valer na hora | APROVADO | status 401 |  |
| Autenticação e sessão | **AUTH-09** login com sem campos é recusado sem erro 500 | APROVADO | status 400, 3 ms |  |
| Autenticação e sessão | **AUTH-10** login com tipos errados é recusado sem erro 500 | APROVADO | status 400, 3 ms |  |
| Autenticação e sessão | **AUTH-11** login com e-mail inválido é recusado sem erro 500 | APROVADO | status 400, 4 ms |  |
| Autenticação e sessão | **AUTH-12** login com senha de 90 mil caracteres é recusado sem erro 500 | APROVADO | status 401, 49 ms |  |
| Autenticação e sessão | **AUTH-13** JSON malformado vira 400 | APROVADO | status 400; mensagem: "Unexpected end of JSON input" |  |
| Autenticação e sessão | **AUTH-14** toda rota privada (GET) exige login | APROVADO | 11 rotas → 401 |  |
| Autenticação e sessão | **AUTH-16** token com algoritmo "none" é recusado | APROVADO | status 401 |  |
| Autenticação e sessão | **AUTH-17** token assinado com outro segredo é recusado | APROVADO | status 401 |  |
| Autenticação e sessão | **AUTH-18** token expirado (assinatura correta) é recusado | APROVADO | status 401 |  |
| Autenticação e sessão | **AUTH-19** token de usuário inexistente é recusado | APROVADO | status 401 |  |
| Autenticação e sessão | **AUTH-20** token com versão de sessão errada é recusado | APROVADO | status 401 |  |
| Autenticação e sessão | **AUTH-22** token na URL não é aceito | APROVADO | status 401 |  |
| Autenticação e sessão | **AUTH-23** trocar a senha invalida o token antigo e devolve um novo | APROVADO | troca 200, antigo 401, novo 200 |  |
| Autenticação e sessão | **AUTH-24** trocar senha exige a senha atual correta | APROVADO | status 400 |  |
| Autenticação e sessão | **AUTH-26** senha com menos de 8 caracteres é recusada | APROVADO | status 400 |  |
| Autenticação e sessão | **AUTH-27** recuperação de senha responde igual para e-mail existente e inexistente | APROVADO | 204/204 |  |
| Autenticação e sessão | **AUTH-28** tempo da recuperação não revela se a conta existe | APROVADO | existente 11 ms, inexistente 6 ms |  |
| Autenticação e sessão | **AUTH-29** link de redefinição inválido é recusado com mensagem clara | APROVADO | status 400; "Este link é inválido ou expirou. Peça um novo." |  |
| Autenticação e sessão | **AUTH-30** redefinição valida o tamanho da senha nova | APROVADO | status 400 |  |
| Autenticação e sessão | **AUTH-31** CORS: nunca autoriza uma origem desconhecida (o cabeçalho traz só o endereço do sistema) | APROVADO | allow-origin="http://localhost:3400" para origem evil.example |  |
| Autenticação e sessão | **AUTH-32** CORS: só a origem do sistema é autorizada | APROVADO | allow-origin="http://localhost:3400" |  |
| Autenticação e sessão | **AUTH-33** API envia cabeçalhos de segurança (helmet) | APROVADO | ok; x-powered-by ausente |  |
| Autenticação e sessão | **AUTH-34** 404 em JSON sem detalhes internos | APROVADO | {"message":"Cannot GET /api/rota-que-nao-existe","error":"Not Found","statusCode":404} |  |
| Autenticação e sessão | **AUTH-35** não há documentação, métricas ou painel expostos | APROVADO | 8 caminhos comuns → 404/401 |  |
| Autenticação e sessão | **AUTH-36** limite de tentativas de login por IP (padrão 10/min) | APROVADO | bloqueio a partir da tentativa 11: 401,401,401,401,401,401,401,401,401,401,429,429,429,429 |  |
| Autenticação e sessão | **AUTH-37** durante o bloqueio nem a senha certa entra (429) | APROVADO | status 429 |  |
| Autenticação e sessão | **AUTH-38** sem proxy configurado, X-Forwarded-For forjado não burla o limite | APROVADO | 429,429,429,429,429,429,429,429,429,429,429,429,429,429,429,429 |  |
| Autenticação e sessão | **AUTH-39** com TRUST_PROXY=1 e API exposta direto, X-Forwarded-For forjado NÃO burla o limite | REPROVADO | 401,401,401,401,401,401,401,401,401,401,401,401,401,401,401,401 (se tudo 401, o limite foi burlado) | Ver F-14 |
| Autorização (matriz rota × perfil) | **AUTHZ-01** matriz rota × perfil: 32 rotas × 5 perfis = 160 combinações conferidas contra as permissões do código | APROVADO | nenhuma divergência, nenhum erro 500 |  |
| Autorização (matriz rota × perfil) | **AUTHZ-02** operador não registra perda, devoluções nem inventário (403) e nada é gravado | APROVADO | {"LOSS":403,"CUSTOMER_RETURN":403,"SUPPLIER_RETURN":403,"INVENTORY":403} |  |
| Autorização (matriz rota × perfil) | **AUTHZ-03** tipos internos (estorno e carga inicial) não podem ser criados direto em /operations | APROVADO | REVERSAL 400, INITIAL_LOAD 400 |  |
| Autorização (matriz rota × perfil) | **AUTHZ-04** operador registra entrada e venda (permitido) | APROVADO | entrada 201, venda 201 |  |
| Autorização (matriz rota × perfil) | **AUTHZ-05** perfil Consulta não consegue vender (403) | APROVADO | status 403 |  |
| Autorização (matriz rota × perfil) | **AUTHZ-06** operador não consegue estornar a própria venda (403) | APROVADO | status 403 |  |
| Autorização (matriz rota × perfil) | **AUTHZ-07** campos que não existem no contrato são rejeitados (400), impedindo atribuição em massa | APROVADO | 10 tentativas → 400 |  |
| Autorização (matriz rota × perfil) | **AUTHZ-08** saldo da variação não mudou com as tentativas de atribuição em massa | APROVADO | saldo conferido no banco |  |
| Autorização (matriz rota × perfil) | **AUTHZ-09** o único administrador não pode se desativar nem rebaixar (evita ficar sem acesso) | APROVADO | desativar 400, rebaixar 400 |  |
| Autorização (matriz rota × perfil) | **AUTHZ-10** quando o administrador redefine a senha, a sessão antiga do usuário cai | APROVADO | redefinição 200, token antigo 401 |  |
| Autorização (matriz rota × perfil) | **AUTHZ-12** lista de usuários não devolve hash de senha | APROVADO | campos: id,name,email,role,active,createdAt |  |
| Autorização (matriz rota × perfil) | **AUTHZ-13** backup .xlsx não contém hash de senha | APROVADO | status 200, 11656 bytes |  |
| Isolamento entre lojas (IDOR) | **IDOR-01** loja B não alcança nenhum dos 12 recursos da loja A (leitura, edição, exclusão, estorno) | APROVADO | tudo 404 |  |
| Isolamento entre lojas (IDOR) | **IDOR-02** loja B não consegue vender peça da loja A (e o saldo da A não muda) | APROVADO | status 404; saldo A=97 |  |
| Isolamento entre lojas (IDOR) | **IDOR-03** loja B não pode criar produto ligado à categoria da loja A | APROVADO | status 400 |  |
| Isolamento entre lojas (IDOR) | **IDOR-04** loja B não pode trocar a categoria de um produto por uma da loja A | APROVADO | status 400 |  |
| Isolamento entre lojas (IDOR) | **IDOR-05** listagens da loja B nunca contêm dados da loja A | APROVADO | {"/products":"1 itens","/variants":"3 itens","/categories":"undefined itens","/suppliers":"1 itens","/operations":"1 itens","/movements":"3 itens"} |  |
| Isolamento entre lojas (IDOR) | **IDOR-06** filtrar o histórico por IDs da loja A não devolve nada à loja B | APROVADO | total 0 |  |
| Isolamento entre lojas (IDOR) | **IDOR-07** painel da loja B só conta a própria loja (3 SKUs, 300 peças) | APROVADO | SKUs 3, peças 300 |  |
| Isolamento entre lojas (IDOR) | **IDOR-08** backup .xlsx da loja B não contém dados da loja A | APROVADO | 10872 bytes |  |
| Isolamento entre lojas (IDOR) | **IDOR-10** IDs malformados ou maliciosos na URL dão 400/404, nunca erro 500 | APROVADO | 5 IDs inválidos → 400/404 |  |
| Validação de entradas e injeção | **VAL-01** busca por "%" e "_" é literal (não age como curinga do SQL) | APROVADO | total 12; "%" → 1; "_" → 1 |  |
| Validação de entradas e injeção | **VAL-02** saldo que estoura o inteiro de 32 bits é recusado com mensagem (não vira erro 500) | REPROVADO | 1ª entrada 201; 2ª (soma 2,2 bi) 500: Erro interno no banco de dados | Ver F-04 |
| Validação de entradas e injeção | **VAL-03** corpo de 2 MB é recusado (413) sem derrubar a API | APROVADO | status 413 |  |
| Validação de entradas e injeção | **VAL-04** API continua de pé depois de todas as entradas hostis | APROVADO | 384 requisições enviadas |  |
| Validação de entradas e injeção | **VAL-05** entre 384 requisições hostis, nenhuma (fora o caractere nulo) causou erro 500 nem vazou detalhes internos | REPROVADO | quantity=2147483648 → 500 VAZAMENTO:"code":"P2020" {"statusCode":500,"message":"Erro interno no banco de dados","code":"P \|\| quantity=10000000000 → 500 VAZAMENTO:"code" | Ver F-04 |
| Validação de entradas e injeção | **VAL-05b** texto com caractere nulo (\u0000) em qualquer campo ou na busca é recusado com 400 | REPROVADO | 13 requisições → 500 com código interno do Prisma (P2039/P2010) no corpo da resposta | Ver F-04 |
| Validação de entradas e injeção | **VAL-06** tentativas de SQL injection não alteraram nem apagaram nada (usuários e tabelas intactos) | APROVADO | tabelas 10→10 |  |
| Validação de entradas e injeção | **VAL-08** estoque continua consistente depois de todos os testes hostis | APROVADO | todas as invariantes ok |  |
| Integridade e concorrência do estoque | **STK-01** entrada de 10 + venda de 2 → saldo 8 (e o histórico registra antes/depois e o autor) | APROVADO | saldo 8; antes 10 → depois 8 |  |
| Integridade e concorrência do estoque | **STK-02** vender 9 com saldo 8 é recusado (400) e nada é gravado | APROVADO | status 400: Item 1 (SKU S113587512-0): Estoque insuficiente: disponível 8, solicitado 9 |  |
| Integridade e concorrência do estoque | **STK-03** quantidade negativa, zero ou fracionada é recusada (400) | APROVADO | status 400,400,400 |  |
| Integridade e concorrência do estoque | **STK-04** estorno devolve as peças (saldo volta a 10) e liga o estorno à venda original | APROVADO | estorno 201; saldo 10 |  |
| Integridade e concorrência do estoque | **STK-05** não dá para estornar duas vezes nem estornar um estorno | APROVADO | duplo 409; estorno do estorno 400 |  |
| Integridade e concorrência do estoque | **STK-06** estornar uma entrada cujas peças já saíram é recusado (sem saldo negativo) | APROVADO | status 400; saldo 1 |  |
| Integridade e concorrência do estoque | **STK-07** venda com 3 itens em que o último falha: NADA é gravado (todos os saldos e o histórico intactos) | APROVADO | saldo insuficiente 400; item inexistente 404; saldos 3,3,3 |  |
| Integridade e concorrência do estoque | **STK-08** operações recusadas não consomem número (sequência sem buracos) | APROVADO | último número 82, próxima venda recebeu 83 |  |
| Integridade e concorrência do estoque | **STK-09** mesmo envio repetido (mesma chave) grava uma vez só e devolve a mesma operação | APROVADO | ids iguais: true; saldo 48 |  |
| Integridade e concorrência do estoque | **STK-11** 30 envios SIMULTÂNEOS da mesma venda criam uma única operação | APROVADO | operações criadas 1; status: 201; saldo 47 |  |
| Integridade e concorrência do estoque | **STK-12** 80 vendas simultâneas de 1 peça com saldo 25: exatamente 25 passam, saldo final 0, nunca negativo | APROVADO | aprovadas 25; recusadas 55; outros nenhum; saldo 0 |  |
| Integridade e concorrência do estoque | **STK-13** histórico dessa variação, na ordem da hora, forma uma cadeia saldo→saldo sem saltos | APROVADO | 0 saltos na ordenação por horário (created_at = início da transação, não o commit) |  |
| Integridade e concorrência do estoque | **STK-14** 60 vendas simultâneas com itens em ordem cruzada (X,Y / Y,X): sem deadlock e saldos exatos | APROVADO | status 201; saldos 140/140; mais lenta 518 ms |  |
| Integridade e concorrência do estoque | **STK-15** 15 estornos simultâneos da mesma venda: só 1 vale (os outros 409) e o saldo volta uma vez só | APROVADO | válidos 1; 409: 14; saldo 10 |  |
| Integridade e concorrência do estoque | **STK-16** carga mista de 400 operações simultâneas (entradas, vendas, perdas, devoluções, inventários, estornos): saldo no banco = soma independente dos efeitos confirmados | APROVADO | 383 operações aceitas; recusadas {"400":11,"409":3}; esperado 22/48/14/50/11/49 obtido 22/48/14/50/11/49 |  |
| Integridade e concorrência do estoque | **STK-17** a carga mista não gerou nenhum erro 500 nem timeout | APROVADO | status de falha: {"400":11,"409":3} |  |
| Integridade e concorrência do estoque | **STK-18** invariantes do banco após a carga: saldo = soma dos movimentos, sem negativos, cadeia contínua, sem operação vazia | APROVADO | todas as invariantes ok |  |
| Integridade e concorrência do estoque | **STK-19** numeração das operações sem duplicatas e sem buracos | APROVADO | 566 operações, maior número 566 |  |
| Integridade e concorrência do estoque | **STK-20** inventário define o saldo pela contagem, exige motivo e recusa contagem negativa | APROVADO | contagem 201, sem motivo 400, negativa 400 |  |
| Integridade e concorrência do estoque | **STK-21** custo médio ponderado correto (10@10 + 10@20 → 15; após vender 5 e comprar 5@30 → 18,75) | APROVADO | 15.0000 e 18.7500 |  |
| Integridade e concorrência do estoque | **STK-23** banco bloqueia saldo negativo, movimento que não fecha a conta, exclusão de operação com itens e SKU duplicado | APROVADO | negativo: BLOQUEADO: new row for relation "product_variants" viol \| conta: BLOQUEADO: new row for relation "stock_movements" viola \| exclusão: BLOQUEADO: update or dele |  |
| Resiliência a quedas | **RES-01** API derrubada à força (kill -9) no meio de 500 vendas de 3 itens: nenhuma venda ficou pela metade e o banco está consistente | APROVADO | 24 confirmadas, 476 sem resposta (0 delas já tinham gravado); vendas parciais 0; todas as invariantes ok |  |
| Resiliência a quedas | **RES-02** reenviar as vendas que ficaram sem resposta (mesma chave) não duplica nenhuma e completa o lote | APROVADO | 476 reenviadas; 500 operações no banco para 500 chaves (esperado 500); duplicadas 0 |  |
| Resiliência a quedas | **RES-03** invariantes do banco depois do reenvio | APROVADO | todas as invariantes ok |  |
| Resiliência a quedas | **RES-04** conexões com o banco derrubadas a cada 250 ms durante 300 vendas: nada fica inconsistente | APROVADO | status das respostas {"201":166,"500":134}; todas as invariantes ok |  |
| Resiliência a quedas | **RES-05** depois da queda das conexões a API se recupera sozinha (próxima venda funciona) | APROVADO | venda 201 |  |
| Painel e indicadores | **DSH-00** dados da virada do dia criados | APROVADO | 201,201,201,201,201,201 |  |
| Painel e indicadores | **DSH-00b** período padrão do painel = últimos 30 dias, terminando hoje (data de Maceió) | APROVADO | 2026-10-07 a 2026-11-05 (30 dias; hoje em Maceió 2026-11-05) |  |
| Painel e indicadores | **DSH-01** indicadores de estoque (produtos, variações, peças, baixo, zerado, valor a custo e a preço) batem com a conta direta no banco, sem contar inativos | APROVADO | API: 74 prod, 49 var, 2000299017 peças, 1 baixo, 22 zerado \| banco: 74, 49, 2000299017, 1, 22 |  |
| Painel e indicadores | **DSH-02** período 2026-08-01 a 2026-08-01: entradas, vendas, estornos, gráfico diário e mais vendidos batem com o banco | APROVADO | API: ent 10, vend 1/1 ops, outras 0, estornos 0 \| banco: 10, 1/1, 0, 0 |  |
| Painel e indicadores | **DSH-03** período 2026-08-02 a 2026-08-02: entradas, vendas, estornos, gráfico diário e mais vendidos batem com o banco | APROVADO | API: ent 0, vend 2/1 ops, outras 1, estornos 0 \| banco: 0, 2/1, 1, 0 |  |
| Painel e indicadores | **DSH-04** período 2026-08-01 a 2026-08-02: entradas, vendas, estornos, gráfico diário e mais vendidos batem com o banco | APROVADO | API: ent 10, vend 3/2 ops, outras 1, estornos 0 \| banco: 10, 3/2, 1, 0 |  |
| Painel e indicadores | **DSH-05** período 2026-08-01 a 2026-08-31: entradas, vendas, estornos, gráfico diário e mais vendidos batem com o banco | APROVADO | API: ent 10, vend 3/2 ops, outras 1, estornos 0 \| banco: 10, 3/2, 1, 0 |  |
| Painel e indicadores | **DSH-06** período padrão (30 dias): entradas, vendas, estornos, gráfico diário e mais vendidos batem com o banco | APROVADO | API: ent 2000301448, vend 2259/910 ops, outras 82, estornos 38 \| banco: 2000301448, 2259/910, 82, 38 |  |
| Painel e indicadores | **DSH-07** fronteira do dia no fuso de Maceió: 23:30 e 23:59:59 caem no primeiro dia; 00:00 e 00:30 no dia seguinte | APROVADO | dia 15: entradas 10, vendas 1; dia 16: vendas 2 (a de 3 foi estornada e não conta), perdas 1 |  |
| Painel e indicadores | **DSH-08** períodos inválidos (invertido, maior que 366 dias, texto) dão 400 | APROVADO | 3 casos → 400 |  |
| Painel e indicadores | **DSH-09** lista de alertas do painel (até 10) tem os mesmos SKUs do banco | APROVADO | 10 no painel, 10 no banco |  |
| Painel e indicadores | **DSH-10** a listagem de estoque (/variants) tem o mesmo total de SKUs ativos que o painel | APROVADO | listagem 49; painel 49; banco 49 |  |
| Painel e indicadores | **DSH-11** paginação por "name" com nomes repetidos: nenhuma variação duplicada nem perdida entre páginas | APROVADO | 6 itens em 3 páginas, 6 únicos, total 6 |  |
| Painel e indicadores | **DSH-12** paginação por "quantity" com nomes repetidos: nenhuma variação duplicada nem perdida entre páginas | APROVADO | 6 itens em 3 páginas, 6 únicos, total 6 |  |
| Painel e indicadores | **DSH-13** paginação por "recent" com nomes repetidos: nenhuma variação duplicada nem perdida entre páginas | APROVADO | 6 itens em 3 páginas, 6 únicos, total 6 |  |
| Painel e indicadores | **DSH-14** página inexistente devolve lista vazia (não erro) | APROVADO | status 200 |  |
| Painel e indicadores | **DSH-15** invariantes de estoque continuam ok | APROVADO | todas as invariantes ok |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-01** página privada sem login redireciona para /login | APROVADO | http://localhost:3400/login |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-02** cookie adulterado, expirado ou de usuário inexistente leva ao login (sem erro nem laço de redirecionamento) | APROVADO | cookie lixo: /login?expired=1 \| token expirado (assinatura certa): /login?expired=1 \| token de usuário inexistente: /login?expired=1 |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-03** login com senha errada mostra mensagem clara e continua na tela de login | APROVADO | "E-mail ou senha incorretos" |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-04** cookie de sessão: HttpOnly, Secure, SameSite=Lax, caminho /, validade 7 dias | APROVADO | httpOnly=true secure=true sameSite=Lax validade=7.00 dias |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-05** JavaScript da página não consegue ler o cookie de sessão | APROVADO | document.cookie contém a sessão: false |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-06** site envia X-Frame-Options, nosniff, Referrer-Policy e Permissions-Policy | APROVADO | presentes: x-frame-options, x-content-type-options, referrer-policy, permissions-policy; x-powered-by: ausente |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-08** páginas privadas não são guardadas em cache (Cache-Control private/no-store) | APROVADO | cache-control: private, no-cache, no-store, max-age=0, must-revalidate |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-09** sair apaga o cookie e o botão "voltar" não mostra a página privada | APROVADO | cookie após sair: removido; url após voltar: /login |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-11** parâmetros de redirecionamento (next, redirect, returnTo, callbackUrl, url) não levam a outro site | APROVADO | destinos: localhost:3400 |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-15** CSRF: a mesma ação enviada de outra origem (evil.example, com o cookie da vítima) é bloqueada e NADA é criado; a de origem legítima funciona | APROVADO | origem falsa → HTTP 500, criou 0; origem legítima → HTTP 200, criou 1 |  |
| Web: sessão, CSRF, XSS, parâmetros | **XSS-01** texto com HTML/JavaScript (<img onerror>) em 15 telas e campos (nome, cor, motivo, observação, fornecedor, usuário, categoria) aparece como texto, sem executar | APROVADO | telas que executaram: nenhuma; alertas disparados: 0 |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-17** adulterar parâmetros na barra de endereço (18 casos) nunca mostra stack/SQL nem erro 500 sem tratamento | REPROVADO | /estoque?page=abc→500 \| /estoque?page=-5→500 \| /estoque?sort=zzz→500 \| /estoque?status=nada→500 \| /estoque?categoryId=nao-uuid→500 \| /produtos?page=0→500 \| /produto | Ver F-05 |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-18** com a API fora do ar, as telas mostram mensagem amigável (sem stack nem tela em branco) | APROVADO | HTTP 500; texto: "Não foi possível carregar esta página Verifique se a API está rodando (pnpm dev:api) e se o banco está de pé (pnpm db:up). Código: 141630725" |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-19** login com a API fora do ar explica o problema ("Não foi possível falar com a API") | APROVADO | "Não foi possível falar com a API. Ela está rodando?" |  |
| Web: sessão, CSRF, XSS, parâmetros | **WEB-20** quando a API volta, o site volta a funcionar sozinho, sem reiniciar e com o login mantido | APROVADO | HTTP 200 em /dashboard |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-01** no painel, datas invertidas ou intervalo > 366 dias mostram uma mensagem clara sobre as datas (e não uma tela de erro genérica) | REPROVADO | invertidas: "Não foi possível carregar esta página Verifique se a API está rodando (pnpm dev:api) e se o banco está de pé (pnpm db:up" \| > 1 ano: "Não foi possível carre | Ver F-05 |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-02** a tela de erro não mostra comandos de desenvolvedor (pnpm dev:api, pnpm db:up) aos funcionários | REPROVADO | texto exibido: "Verifique se a API está rodando (pnpm dev:api) e se o banco está de pé (pnpm db:up)" | Ver F-05 |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-03** cadastrar referência duplicada mostra mensagem em português dizendo o que fazer | APROVADO | "Já existe produto com esta referência, variação com este SKU ou a mesma combinação de tamanho e cor" |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-06** venda: quantidade 0, negativa, fracionada ou maior que o saldo bloqueia o botão e explica o motivo | APROVADO | {"0":{"disabled":true,"aviso":"• Camisa Fictícia A (G · AZUL): quantidade inválida."},"999999":{"disabled":true,"aviso":"• Camisa Fictícia A (G · AZUL): saldo disponível  |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-07** entrada com quantidade absurda (99.999.999.999) mostra aviso compreensível (não "erro interno no banco") | REPROVADO | mensagem: "Erro interno no banco de dados" | Ver F-04 |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-08** duplo clique em "Confirmar" registra a venda uma única vez | APROVADO | operações com o cupom DBL983264: 1 |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-09** atualizar a página depois de uma venda não repete a venda | APROVADO | operações antes/depois: 1267/1267 |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-11** estoque: busca pela referência retorna as 3 variações do produto | APROVADO | 13 linhas |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-12** busca sem resultado mostra mensagem de "nenhum resultado" (estado vazio) | APROVADO | "Estoque Produtos Nova movimentação Histórico Categorias Usuários Configurações Admin A Administrador Sair Estoque Saldo de cada SKU (combina" |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-14** login por teclado: Tab percorre e-mail → senha → "Esqueci minha senha" → Entrar | APROVADO | ordem: Esqueci minha senha → password → Entrar → Gestão de estoqueEntra → email |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-16** foco do teclado é visível nos campos e botões do formulário de produto | APROVADO | 18 elementos percorridos, 0 sem indicador de foco |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-18** idioma da página declarado como português do Brasil | APROVADO | lang="pt-BR" |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **UX-19** nenhuma das 13 telas tem rolagem horizontal da página inteira em 6 larguras (360 a 1920 px) | REPROVADO | /dashboard@360: +30px \| /dashboard@390: +15px | Ver F-11 |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **A11Y-01** axe-core em 15 telas: nenhuma violação crítica ou séria (contraste, rótulos, nomes de botões) | REPROVADO | color-contrast(serious) em 8 telas, 207 elementos, ex. .mt-6 \| label(critical) em 1 telas, 1 elementos, ex. .file\:mr-3 | Ver F-06 |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **PERF-01** páginas principais (conexão local): LCP abaixo de 2,5 s e CLS abaixo de 0,1 | APROVADO | /login: LCP 76 ms, TTFB 11 ms, 217 KB/15 req (JS 150 KB), CLS 0 \| /dashboard: LCP 112 ms, TTFB 37 ms, 126 KB/49 req (JS 0 KB), CLS 0 \| /estoque: LCP 144 ms, TTFB 48 ms, |  |
| Web: formulários, teclado, responsividade, acessibilidade, desempenho | **JS-01** nenhum erro de JavaScript no navegador durante toda a navegação | APROVADO | nenhum |  |
| Web: reexecução dos casos duvidosos | **UX-05** preço de venda negativo é barrado pelo formulário (campo com padrão de formato, validação do navegador) | APROVADO | {"min":"","valid":false,"msg":"Please match the requested format."} | reexecutado com critério corrigido |
| Web: reexecução dos casos duvidosos | **UX-15** diálogo de confirmação (<dialog> nativo): é modal, o foco entra nele, o Tab nunca sai para a página de trás e Esc fecha | APROVADO | modal=true; foco dentro=true; Tab: body,dentro,dentro,body,dentro,dentro,body; aberto após Esc=false | reexecutado com critério corrigido |
| Web: reexecução dos casos duvidosos | **UX-13** histórico: paginação existe e a página 2 mostra registros diferentes da 1 | APROVADO | 50 linhas por página; url /movimentacoes?page=2; 1ª linha mudou: true | reexecutado com critério corrigido |
| Web: reexecução dos casos duvidosos | **UX-10** internet cai ao confirmar a venda: o formulário continua na tela com um aviso, para tentar de novo sem perder o que foi digitado | REPROVADO | durante a queda: formulário na tela=false; alertas=[]; texto da tela="Sem conexão com a internet. As alterações não serão salvas até a conexão voltar. Não foi possível ca | Ver F-02; reexecutado com critério corrigido |
| Desempenho e escala (importação) | **PERF-02** importação: a prévia de 4.100 SKUs responde em menos de 10 s e está apta a importar | APROVADO | 554 ms; 711 modelos, 4.100 SKUs; memória da API 270→312 MB |  |
| Desempenho e escala (importação) | **PERF-03** importação: confirmar 4.100 SKUs grava tudo numa transação em menos de 60 s | APROVADO | 2.524 ms; 711 produtos e 4.100 SKUs criados; memória 423 MB |  |
| Desempenho e escala (importação) | **PERF-04** reimportar o mesmo arquivo é recusado (sem duplicar o estoque) | APROVADO | status 400 |  |
| Desempenho e escala (importação) | **PERF-05** invariantes do banco após a importação grande | APROVADO | todas as invariantes ok |  |
| Desempenho e escala (importação) | **PERF-11** 20 usuários simultâneos lendo estoque, painel e histórico (200 leituras cada) | APROVADO | 135 / 92 / 149 req/s; p95 179 / 256 / 159 ms; 0 erros |  |
| Desempenho e escala (importação) | **PERF-12** backup .xlsx completo (4.100 SKUs + histórico) em menos de 60 s sem estourar a memória | APROVADO | 1.846 ms; 0,9 MB; memória da API 270 → pico 575 MB |  |
| Desempenho e escala (carga) | **PERF-06** entradas grandes: 21 operações de até 200 itens (o máximo permitido por operação) repondo os 4.100 SKUs levam menos de 5 s cada | APROVADO | status 201; mais lenta 365 ms, média 284 ms |  |
| Desempenho e escala (carga) | **PERF-07** dois anos de vendas fictícias (5.000 vendas de 1 a 4 itens, 8 em paralelo): nenhuma falha e latência p95 abaixo de 500 ms | APROVADO | 94 vendas/s; p50 84 ms, p95 105 ms, máx 170 ms; status {"201":5000} |  |
| Desempenho e escala (carga) | **PERF-10** com 4.100 SKUs e 16378 movimentos, nenhuma consulta de tela passa de 500 ms no p95 | APROVADO | estoque (1ª página): p95 36 ms \| estoque: busca: p95 51 ms \| estoque: ordenar por recentes: p95 38 ms \| painel (30 dias): p95 40 ms \| painel (1 ano): p95 39 ms \| his |  |
| Desempenho e escala (carga) | **PERF-13** exportação CSV do histórico não corta dados sem avisar enquanto o histórico tiver menos de 20.000 movimentos | APROVADO | histórico atual 16378 movimentos; o site exporta no máximo 20.000 linhas e não avisa se passar (16375 linhas lidas em 3287 ms) |  |
| Desempenho e escala (carga) | **PERF-16** invariantes do banco depois da carga final | APROVADO | todas as invariantes ok |  |
| Infraestrutura e logs | **INF-01** banco fora do ar: /health/live continua 200 (API viva), /health vira 503 (banco inacessível) e as operações falham com erro 5xx claro | APROVADO | live 200, health 503 {"status":"error","database":"unreachable"}, venda 500 "Erro interno no banco de dados", login 500 |  |
| Infraestrutura e logs | **INF-02** banco volta: a API se reconecta sozinha, sem reiniciar (saúde, venda e login normais) | APROVADO | recuperou ~1 s depois de o banco voltar; venda 201; login 201 |  |
| Infraestrutura e logs | **INF-03** invariantes do estoque após a queda e volta do banco | APROVADO | todas as invariantes ok |  |
| Infraestrutura e logs | **INF-04** logs da API e do site (4518 linhas, com centenas de erros provocados) não contêm senhas, hashes, tokens, chaves nem links de redefinição | APROVADO | nenhum padrão sensível |  |
| Infraestrutura e logs | **INF-07** toda variável de ambiente que o código lê está documentada nos arquivos .env.example | REPROVADO | lidas: API_PORT,API_URL,AUTH_RATE_LIMIT,DATABASE_URL,JWT_SECRET,MAIL_FROM,NODE_ENV,RESEND_API_KEY,SEED_ADMIN_EMAIL,SEED_ADMIN_NAME,SEED_ADMIN_PASSWORD,SEED_ORGANIZATION_N | Ver F-19 |
| Infraestrutura / fora de alcance | Docker: build das imagens e subida do docker-compose.prod/neon | NÃO EXECUTADO | Sem daemon Docker neste ambiente | O CI do GitHub constrói as duas imagens (verde em todos os commits); subir o compose em um servidor real. |
| Infraestrutura / fora de alcance | HTTPS, HSTS e cabeçalhos pelo Caddy | NÃO EXECUTADO | Sem servidor/domínio | Subir no servidor e conferir com `curl -sI https://estoque…` |
| Infraestrutura / fora de alcance | Migrações, seed e conexão real no Neon (produção) | NÃO EXECUTADO | Porta 5432 bloqueada neste ambiente; só consulta somente-leitura da API do Neon | Rodar `prisma migrate deploy` primeiro numa branch do Neon criada a partir da produção. |
| Infraestrutura / fora de alcance | Restauração a um ponto no tempo do Neon | NÃO EXECUTADO | Sem acesso à porta do banco; recurso depende do plano (6 h hoje) | Criar uma branch a partir de um horário passado e conferir os dados. |
| Infraestrutura / fora de alcance | Backup externo (rclone → R2/B2) e verify-latest.sh no contêiner | NÃO EXECUTADO | Download do rclone bloqueado e sem Docker/bucket | Subir `--profile offsite` e conferir "cópia externa ok" e o arquivo no bucket. |
| Infraestrutura / fora de alcance | Envio real de e-mail (Resend), SPF/DKIM e entrega | NÃO EXECUTADO | Sem chave nem domínio verificado | Configurar o domínio e testar "esqueci minha senha" com e-mail real. |
| Infraestrutura / fora de alcance | Sentry (recebimento de erros) e monitor de disponibilidade | NÃO EXECUTADO | Sem DSN/conta | Cadastrar o DSN e provocar um erro 500 controlado. |
| Infraestrutura / fora de alcance | Navegadores Firefox e Safari/iOS; celulares reais | NÃO EXECUTADO | Só Chromium com emulação de celular | Testar com 2 a 3 aparelhos reais da loja. |
| Infraestrutura / fora de alcance | Leitor de tela e teste manual de acessibilidade | NÃO EXECUTADO | Só axe-core automático (cobre parte dos critérios WCAG) | NVDA/VoiceOver nas telas de venda e entrada. |
| Infraestrutura / fora de alcance | Service worker / página offline (PWA instalável) | NÃO EXECUTADO | Fora do escopo funcional desta rodada | Testar no celular em modo avião. |
| Infraestrutura / fora de alcance | Scanner de vulnerabilidades dinâmico (OWASP ZAP/Burp) e Lighthouse | NÃO EXECUTADO | Não instalados; substituídos por testes manuais direcionados ao OWASP Top 10 | Rodar o ZAP em modo baseline contra o ambiente de homologação. |
| Infraestrutura / fora de alcance | Teste de carga contra produção | NÃO APLICÁVEL | Proibido pelo escopo; feito só em ambiente local isolado | — |

---

## E. Lista de vulnerabilidades e problemas

Legenda de **Situação**: *Confirmado* (reproduzido), *Risco potencial* (depende de condição não verificada), *Melhoria recomendada*, *Decisão pendente*.

### CRÍTICO

#### F-01 — Next.js 16.3.2 com falhas críticas na `main` · Segurança/Dependências · **Confirmado** (versão vulnerável); exploração **não testada**
- **Componente:** `apps/web/package.json:14` (na `main`); corrigido na branch (`next@16.4.3`, commit `d818fd5`).
- **Evidência:** `pnpm audit --prod` sobre o `pnpm-lock.yaml` da `main`: **5 críticas, 3 altas, 8 moderadas, 1 baixa**, todas no `next` (execução remota de código, SSRF na otimização de imagens, negação de serviço em Server Actions). Na branch: 0 críticas e 0 altas.
- **Como reproduzir:** `git worktree add /tmp/m origin/main && cd /tmp/m && pnpm audit --prod`.
- **Impacto:** se o sistema subir a partir da `main`, fica exposto a falhas conhecidas e publicadas. O sistema usa `next/image` e Server Actions, que são os pontos afetados por parte delas; a exploração depende de recursos e configurações específicas, e **nenhum exploit foi executado** nesta auditoria.
- **Recomendação:** mesclar a branch na `main` e manter o job de auditoria do CI (já incluído).
- **Prioridade:** P0.

### ALTO

#### F-02 — Falha de rede ao confirmar uma operação derruba o formulário · Funcional/UX/Integridade · **Confirmado** (o risco de duplicidade é **potencial**)
- **Componente:** `apps/web/src/components/operation-form.tsx:150` (`startTransition(async …)` sem `try/catch` em volta de `createOperation`); `apps/web/src/app/error.tsx:19`.
- **Evidência:** com a internet cortada, o clique em "Confirmar" gera `TypeError: Failed to fetch`; o `<dialog>` e todo o formulário **somem**, a tela mostra "Não foi possível carregar esta página — Verifique se a API está rodando (pnpm dev:api)…", nada é gravado. Captura de tela guardada na pasta de evidências desta sessão.
- **Como reproduzir:** abrir uma venda, preencher, clicar em "Registrar venda", desligar a rede e clicar em "Confirmar".
- **Impacto:** em loja com internet instável, o funcionário perde o que digitou. **Risco de venda duplicada:** se o pedido chegar ao servidor e só a resposta se perder, o formulário novo gera uma chave de repetição nova e a venda refeita desconta o estoque de novo. (O servidor protege contra repetição com a **mesma** chave, testado: 30 envios simultâneos criam 1 operação.)
- **Recomendação:** capturar o erro de rede, manter o formulário e a mesma chave de repetição, mostrar "Sem conexão: tente de novo" e permitir reenviar.
- **Prioridade:** P0.

#### F-03 — Proteção contra perda de dados insuficiente na configuração atual do Neon · Banco/Infra · **Confirmado** (configuração); a perda de dados é **risco potencial**
- **Componente:** projeto Neon `red-night-50336791` (consulta somente leitura); `docker-compose.neon.yml` (backup).
- **Evidência:** restauração a um ponto no tempo retém **6 h** (`history_retention_seconds = 21600`); a branch `production` está com `protected = false`; só existe o papel `neondb_owner`; os backups diários e a cópia externa **ainda não estão rodando** (nada foi implantado).
- **Impacto:** um apagamento ou erro percebido no dia seguinte não seria recuperável pelo Neon. Dependeria de dumps que ainda não existem.
- **Recomendação:** (1) colocar o servidor no ar com o backup diário e a cópia externa **e ensaiar a restauração**; (2) avaliar o plano pago com retenção maior; (3) proteger a branch de produção; (4) exportar o backup `.xlsx` periodicamente.
- **Prioridade:** P0 (antes de dados reais).

### MÉDIO

#### F-04 — Validação de limites e de nulos incompleta: erro 500 com código interno do Prisma · API · **Confirmado**
- **Componente:** `apps/api/src/movements/dto/operation.dto.ts:46,52` (sem `@Max`), `apps/api/src/products/dto/create-product.dto.ts:121,126`, `apps/api/src/movements/operations.service.ts:144`, `apps/api/src/prisma/prisma-exception.filter.ts:40`.
- **Evidência (requisições autenticadas):** `quantity` ≥ 2.147.483.648; entrada que faz o saldo passar de 2,1 bilhões (a 1ª de 2.000.000.000 é aceita); `unitCost` de 10¹¹ ou `null`; `salePrice` de 10¹² ou `null`; `minQuantity` 2.147.483.648; JSON com 5.000 níveis de aninhamento; texto com `\u0000` em **qualquer** campo ou na busca → **HTTP 500** e `{"message":"Erro interno no banco de dados","code":"P2020"}` (ou `P2039`/`P2010`). Pela interface, uma entrada de 99.999.999.999 mostra "Erro interno no banco de dados" ao usuário.
- **Como reproduzir:** `POST /api/operations` com `quantity: 10000000000`; `POST /api/categories` com `{"name":"a\u0000b"}`.
- **Impacto:** nenhum dado corrompido (as transações são desfeitas), mas o funcionário vê um erro incompreensível ao digitar um zero a mais, e os 500 poluem o monitoramento.
- **Recomendação:** `@Max` em quantidades e valores, rejeitar `null` onde não é permitido, recusar `\u0000` na validação global, e mapear `P2020` e `P2039` para 400 com mensagem clara.
- **Prioridade:** P0 (correção pequena).

#### F-05 — Parâmetros inválidos na URL e datas do painel geram HTTP 500 e uma tela de erro com texto de desenvolvedor · Web/UX · **Confirmado**
- **Componente:** `apps/web/src/lib/api.ts` (repassa o erro 400 da API), `apps/web/src/app/error.tsx:19-20`; páginas `estoque`, `produtos`, `movimentacoes`, `dashboard`.
- **Evidência:** `/estoque?page=abc`, `?sort=zzz`, `?status=nada`, `/movimentacoes?from=ontem`, `/dashboard?from=abc` e **o caso realista de inverter as datas no painel ou escolher um intervalo maior que 366 dias** → HTTP 500 e a mensagem "Verifique se a API está rodando (**pnpm dev:api**) e se o banco está de pé (**pnpm db:up**)". 12 de 18 casos testados.
- **Impacto:** o funcionário acha que o sistema quebrou, e a mensagem é de desenvolvedor.
- **Recomendação:** validar os parâmetros na página e mostrar a mensagem da API ("A data inicial é depois da final"); trocar o texto do `error.tsx` por um aviso para o usuário com botão "Tentar de novo".
- **Prioridade:** P1.

#### F-06 — Acessibilidade: contraste, campo sem rótulo e landmarks · UX · **Confirmado**
- **Componente:** classe `text-neutral-400` (25 usos); `apps/web/src/components/import-stock.tsx:109`; `confirm-dialog.tsx:37`; telas `/login` e `/forgot-password`.
- **Evidência (axe-core em 15 telas):** **contraste insuficiente em 8 telas, 207 elementos** (texto #a1a1a1 sobre branco = 2,58:1; o mínimo é 4,5:1); **1 campo sem rótulo** (`<input type="file">` em `/produtos/importar`, gravidade crítica); páginas de login sem `<main>`; 4 cabeçalhos de tabela vazios; o `<dialog>` não tem nome acessível; não existe link "pular para o conteúdo".
- **Impacto:** texto secundário (números de operação, referências, datas) difícil de ler, especialmente em celular com sol; leitores de tela não anunciam o campo de arquivo.
- **Recomendação:** trocar `neutral-400` por `neutral-500/600` nos textos, rotular o campo de arquivo, usar `<main>`, `aria-labelledby` no diálogo.
- **Prioridade:** P1 (contraste e rótulo), P2 (restante).

#### F-07 — Custo das peças e valor do estoque visíveis a todos os perfis · Permissões · **Confirmado** (comportamento); **Decisão pendente** (regra de negócio)
- **Componente:** API `/variants`, `/products/:id`, `/movements`, `/dashboard` (campos `averageCost`, `unitCost`, `stockCostValue`); telas de produto, operação e painel.
- **Evidência:** perfis Consulta e Operador recebem e veem custo médio, custo por item e valor do estoque a custo.
- **Impacto:** o custo é informação comercial sensível para quem só vende ou consulta.
- **Recomendação:** decidir com a Broomer quem pode ver custo; se for só administrador/gerente, omitir os campos na API (não só esconder na tela).
- **Prioridade:** P1 (decisão).

#### F-08 — Sem trilha de auditoria das ações administrativas · Rastreabilidade · **Confirmado** (ausência)
- **Componente:** `apps/api/prisma/schema.prisma` (sem tabela de auditoria).
- **Evidência:** as movimentações de estoque guardam autor e hora; criar/desativar usuário, trocar perfil, redefinir senha, alterar preço, editar ou desativar produto/categoria não ficam registrados.
- **Impacto:** impossível saber depois quem mudou um preço ou o perfil de alguém.
- **Recomendação:** tabela `audit_log` (quem, quando, o quê, antes/depois) e tela para o administrador.
- **Prioridade:** P2.

#### F-09 — A aplicação usaria o papel dono do banco · Banco/Segurança · **Risco potencial**
- **Componente:** Neon, papel `neondb_owner` (único); `DATABASE_URL` do compose.
- **Evidência:** um único papel, dono do banco, com permissão para alterar a estrutura e apagar tabelas.
- **Impacto:** uma falha futura de injeção ou vazamento da credencial teria o alcance máximo.
- **Recomendação:** papel de execução só com `SELECT/INSERT/UPDATE` nas tabelas; o dono só para migrações (exige tirar a migração automática do início da API).
- **Prioridade:** P1.

#### F-10 — Repositório sem proteções · Processo · **Confirmado**
- **Evidência:** `main` sem proteção de branch (o recurso não existe no plano gratuito para repositório privado), logo qualquer pessoa com permissão de escrita pode alterá-la diretamente, inclusive reescrever o histórico; Dependabot desligado; CI sem bloco `permissions:` e com *actions* fixadas por tag, não por hash.
- **Impacto:** um push acidental ou uma dependência vulnerável nova passa sem aviso.
- **Recomendação:** ligar o Dependabot e os alertas, declarar `permissions: contents: read` no CI, adotar o fluxo de PR + CI verde antes de mesclar (hoje a auditoria semanal do CI cobre as dependências).
- **Prioridade:** P1.

### BAIXO

- **F-11 — Painel rola 15 a 30 px para o lado no celular** · UX · *Confirmado* · `apps/web/src/app/(app)/dashboard/page.tsx:321`. A tabela "estoque baixo" tem 500 px e estica a página em 360 e 390 px. Reproduzir: abrir `/dashboard` em 390 px. Corrigir com `min-w-0` no cartão. **P2.**
- **F-12 — Celular: tabelas rolam para o lado e botões menores que 44 px** · UX · *Confirmado* · 7 de 13 telas têm tabela com rolagem lateral em 390 px; nenhum alvo abaixo de 24 px, mas todos os botões ficam abaixo de 44 px. Considerar cartões no lugar de tabelas nas telas de estoque e histórico. **P2.**
- **F-13 — Exportação CSV do histórico corta em 20.000 linhas sem avisar** · Funcional · *Confirmado* (código) / *Risco potencial* (hoje) · `apps/web/src/app/(app)/movimentacoes/exportar/route.ts:19`. Com ~8 mil movimentos por ano, o corte só aparece em cerca de 2 anos e meio. Avisar na tela ou exportar em partes. **P3.**
- **F-14 — Limite de login burlável com `X-Forwarded-For` se a API ficar exposta e `TRUST_PROXY=1`** · Segurança · *Confirmado* (nessa topologia) · `apps/api/src/main.ts:19`. Com o proxy confiável, 16 tentativas com cabeçalho trocado não foram bloqueadas. No desenho atual a API **não é publicada** (só o site fala com ela), então o risco é condicional. Manter a API sem porta pública e documentar. **P2.**
- **F-15 — Sem Content-Security-Policy nas páginas; HSTS só via Caddy (não testado)** · Segurança · *Melhoria recomendada* · `apps/web/next.config.ts`. A ausência de XSS foi testada, a CSP seria uma segunda camada. **P3.**
- **F-16 — Política de senha mínima** · Segurança · *Confirmado* · `apps/api/src/auth/dto/auth.dto.ts:36,47`. Exige 8 caracteres e aceita "12345678". Aumentar o mínimo e recusar senhas comuns. **P3.**
- **F-17 — "Sair" não revoga o token** · Segurança · *Confirmado* · `apps/web/src/lib/actions.ts:116`. O token continua válido na API por até 7 dias (o cookie é `httpOnly`, então só importa se vazar). Já existe `sessionVersion`; usar para "sair de todos os aparelhos". **P3.**
- **F-18 — Operação: sem procedimento de reversão, sem limites de recurso e sem rotação de logs; imagens sem versão fixa** · Infra · *Confirmado* · `DEPLOY.md`, `docker-compose.*.yml`. Documentar o rollback (voltar a tag + restaurar o banco numa branch), limitar memória e o tamanho dos logs, fixar as versões das imagens. **P1.**
- **F-19 — `SENTRY_ENVIRONMENT` não documentada; o script `lint` da API usa `--fix` (altera arquivos)** · Documentação · *Confirmado*. **P3.**
- **F-20 — Arquivos grandes e complexos** · Manutenção · *Confirmado*: `OperationForm` (432 linhas, complexidade 31), `parseErpStockReport` (275 / 24), `DashboardPage` (278), `ImportStock` (230 / 19), `export.service.write` (181 / 26). Dividir aos poucos, junto com testes. **P3.**
- **F-21 — Vulnerabilidades moderadas em dependências indiretas** · Dependências · *Risco potencial*: `glob` e `minimatch` (via cadeia de build do Sentry) e `uuid` (via `exceljs`, usado só no trecho não afetado). Sem exploração realista aqui. Acompanhar. **P3.**
- **F-22 — Lacunas de testes automatizados** · Qualidade · *Confirmado*: nenhum teste de interface; `main.ts` (Helmet/CORS/proxy) e criação do administrador com 0% de cobertura; e-mail 45%; sem testes de limites, XSS, CSRF, virada do dia, nem de queda de rede/banco. Ordem sugerida no anexo II. **P1.**

### INFORMATIVO

- **F-23 — Histórico imutável só pela aplicação.** Quem acessa o banco como dono consegue `UPDATE`/`DELETE` em movimentações (testado, em transação desfeita). Mitiga: F-09 e auditoria.
- **F-24 — Datas retroativas sem limite** (aceitou até o ano 1900). Futuro é bloqueado. Decisão de negócio pendente (D-3).
- **F-25 — Mesma chave de repetição com conteúdo diferente devolve a operação original** sem avisar o chamador (protege contra duplicidade; o contrato poderia retornar 409).
- **F-26 — Respostas 409 trazem o código `P2002` do Prisma.** A interface usa esse código para mostrar "já existe"; expõe um detalhe do ORM sem risco prático.
- **F-27 — Escrita serializada por um bloqueio global** (numeração das operações): ~95 a 145 vendas/s medidas. Sem relevância para 2 a 5 usuários.
- **F-28 — E-mail único em todo o sistema** (revela existência entre lojas, irrelevante com uma loja) e datas gravadas como `timestamp without time zone` por convenção UTC (consistente no código, testado na virada do dia).
- **F-29 — A API aceita token sem validade se a assinatura estiver correta.** Só quem tem o segredo consegue assinar; a própria API sempre põe 7 dias.
- **F-30 — Dependências com versões novas disponíveis:** `next` 16.4.5, NestJS 12, ESLint 10, TypeScript 7, Prisma 8 (candidata). Atualizar por rotina, não por urgência.

### Decisões de negócio pendentes (afetam o código)
- **D-1 ERP e caixa:** as vendas continuam no caixa do ERP? Se sim, como o estoque daqui é conciliado (lançamento duplo ou importação periódica de relatório do ERP como ajuste)?
- **D-2 Custos (F-07):** quem pode ver custo?
- **D-3 Datas retroativas (F-24):** até quantos dias atrás cada perfil pode lançar?

---

## F. Preparação para produção

**Bloqueadores (P0):**
1. Mesclar a branch `claude/melhorias-auditoria` na `main` (F-01).
2. Tratar a queda de rede no formulário de operações (F-02).
3. Validar limites e nulos na API (F-04).
4. Backups e restauração ensaiados no Neon, branch protegida (F-03).

**Necessário antes da primeira implantação (P1):** F-05, F-06 (contraste e rótulo), F-07 (decisão), F-09, F-10, F-18, F-22 (testes de interface dos fluxos críticos).

**Depende de infraestrutura que ainda não existe:** servidor (VPS) ou plataforma, domínio, HTTPS, e-mail (Resend + DNS), monitor de disponibilidade, Sentry, cópia externa dos backups, primeiro administrador, carga inicial do estoque, treinamento. A lista de conferência completa está no PDF de pendências.

**Dados pessoais:** o sistema **não guarda CPF nem telefone**. A planilha de vendas do ERP contém CPF e celular de clientes e **não deve ser importada** nem compartilhada; o arquivo de diagnóstico já foi anonimizado. Isso é uma boa prática técnica, **não uma declaração de conformidade com a LGPD**, que depende também de processos e documentos da Broomer.

---

## G. Plano de correção

**Fase 1 — críticos de segurança e integridade (P0)**
1. Mesclar a branch (F-01). *Aceite:* `pnpm audit --prod` sem críticas/altas; CI verde.
2. Tratamento de falha de rede no `OperationForm`, mantendo a chave de repetição (F-02). *Aceite:* teste automatizado com rede cortada: o formulário permanece, aparece aviso, ao reconectar a venda grava **uma** vez.
3. Limites e nulos na API (F-04). *Aceite:* os 384 casos hostis e os novos retornam 400, **0 erros 500**.
4. Backup/restauração ensaiados e branch protegida (F-03). *Aceite:* restauração de um dump numa branch do Neon com contagens idênticas, documentada.

**Fase 2 — banco e infraestrutura (P1)**
5. Papel de execução sem permissão de estrutura (F-09). 6. Rollback documentado, limites de recurso e rotação de logs (F-18). 7. Dependabot, `permissions` no CI, fluxo de PR (F-10). 8. Subir o servidor, HTTPS, e-mail, monitoramento e **ensaiar o deploy**. *Aceite:* lista de conferência do PDF toda marcada.

**Fase 3 — funcionais (P1/P2)**
9. Validar parâmetros de URL e mostrar mensagens claras; novo texto do `error.tsx` (F-05). 10. Custo por perfil (F-07, depois da decisão). 11. Trilha de auditoria administrativa (F-08). 12. Aviso na exportação CSV (F-13).

**Fase 4 — desempenho (P3)**
Nada obrigatório. Reavaliar índices e a exportação em partes quando o histórico passar de ~50 mil movimentos.

**Fase 5 — UX, acessibilidade e manutenção (P1/P2/P3)**
13. Contraste, rótulo do arquivo, `<main>`, nome do diálogo (F-06). 14. Rolagem do painel no celular e cartões nas tabelas (F-11, F-12). 15. Testes de interface no CI (F-22) e, depois, refatorar o `OperationForm` e o leitor do ERP (F-20). 16. CSP, política de senha, "sair de todos os aparelhos" (F-15 a F-17).

---

## H. Parecer final

| Pergunta | Resposta objetiva |
|---|---|
| **O sistema está seguro?** | **Sim na branch, não na `main`.** Os controles de autenticação, permissão, isolamento entre lojas, CSRF e XSS passaram em testes diretos; nenhum segredo vazado. O ponto crítico é o Next.js da `main` (F-01), já corrigido e pendente de mesclagem. Faltam camadas extras (CSP) e ensaiar o HTTPS. |
| **O banco de dados está protegido?** | **Parcialmente.** O esquema é forte (restrições, `RESTRICT`, saldo nunca negativo; restauração testada). Mas a configuração do Neon hoje tem restauração de só 6 h, branch sem proteção e papel único com poder total, e os backups ainda não rodam (F-03, F-09). |
| **O controle de estoque é confiável?** | **Sim.** É a parte mais bem provada: concorrência, repetição, estorno, falha no meio da venda e queda de API/banco terminaram sem nenhuma inconsistência. |
| **As funcionalidades principais estão funcionando?** | **Sim**, inclusive em volume real (4.100 SKUs). Os defeitos estão nas bordas: queda de rede (F-02), valores extremos (F-04) e URLs inválidas (F-05). |
| **A infraestrutura está preparada?** | **Ainda não.** A base está bem desenhada (contêineres, health checks, backup), mas **nada foi implantado nem ensaiado em ambiente real** (seção I). |
| **O sistema está pronto para uso real?** | **Não ainda; está perto.** É um bom candidato a piloto depois dos bloqueadores abaixo. |
| **Quais os impedimentos para produção?** | **(1)** Mesclar as correções de segurança (F-01). **(2)** Falha de rede no formulário de venda (F-02). **(3)** Validação de limites (F-04). **(4)** Backup/restauração ensaiados e proteção do Neon (F-03). **(5)** Servidor, domínio/HTTPS, e-mail e monitoramento ainda inexistentes. **(6)** Decisões de negócio D-1 a D-3. |

Não considero o sistema aprovado só porque o build funciona: o que sustenta o parecer são os testes executados descritos acima, e os limites desta auditoria estão na seção I.

---

## I. Testes não executados, limitações e como executá-los

- **Ambiente:** Linux, Node 22, **Postgres 16** local (o destino é Postgres **18** no Neon; backup e restauração foram testados com 16 nos dois lados), Chromium com emulação de celular (sem Firefox, Safari nem aparelhos reais). A porta do banco do Neon é bloqueada neste ambiente, então **só foi feita consulta somente leitura à API do provedor**.
- **Os itens "NÃO EXECUTADO" da matriz** (Docker/compose, HTTPS via Caddy, Neon real, restauração a um ponto no tempo, cópia externa, e-mail real, Sentry, navegadores e aparelhos reais, leitor de tela, PWA offline, scanner dinâmico) dependem de servidor, domínio, contas ou ferramentas ausentes. A coluna "Observações" diz como executá-los.
- **Acessibilidade:** o axe-core automático cobre só parte dos critérios; um teste manual com leitor de tela ainda é necessário.
- **Testes de desempenho:** locais, com dados fictícios (4.100 SKUs; 16 mil movimentos). Nada foi medido contra produção, por regra.
- **Reprodutibilidade:** os roteiros de teste ficaram na pasta temporária desta sessão. Posso incluí-los no repositório (por exemplo, em `tests/auditoria/`) para repetir a auditoria depois de cada correção.

---

## Anexo II — Matriz de cobertura por funcionalidade e ordem sugerida de novos testes

| Funcionalidade | Testes automatizados no repositório | Avaliação | Lacuna |
|---|---|---|---|
| Login, sessão, recuperação de senha | `auth` (6), `password-reset` (8), `organization` (9) | **Forte** | e-mail real (45%) |
| Perfis e permissões | `roles` (7) | **Forte** | permissões na interface (nenhum teste) |
| Isolamento entre lojas | `tenancy` (6) | **Forte** | — |
| Produtos, variações, categorias | `products` (9), `categories` (5) | **Forte** | limites numéricos extremos |
| Entradas, vendas, estornos, inventário | `movements` (15) | **Forte** | queda de rede/banco; sequência de datas |
| Concorrência e repetição | 3 testes em `movements` | **Boa** | carga mista; `kill -9` |
| Importação do ERP | `import` (4) + `erp-stock-report.spec` (5) | **Boa** | arquivo de 4.100 SKUs (feito só na auditoria) |
| Painel | `dashboard` (3) | **Parcial** | virada do dia, estornos fora das vendas |
| Exportações | 1 (backup .xlsx) + 4 (CSV, só a função) | **Parcial** | CSV de ponta a ponta, limite de 20.000 |
| Cabeçalhos, CORS, proxy (`main.ts`) | nenhum (0%) | **Ausente** | testar a inicialização |
| Interface (telas e formulários) | nenhum | **Ausente** | fluxos críticos no navegador |
| Acessibilidade e responsividade | nenhum | **Ausente** | axe no CI |

**Ordem sugerida de criação:** (1) testes de interface (Playwright) dos fluxos críticos: login, venda, bloqueio por falta de saldo, estorno e **rede cortada**; (2) testes de limites e valores nulos na API; (3) testes da inicialização (`main.ts`: Helmet, CORS, proxy); (4) painel na virada do dia e estornos; (5) envio de e-mail com o Resend simulado; (6) axe-core no CI com limite de regressão; (7) rotina noturna de resiliência (derrubar API/banco no meio de vendas).
