# Módulo de Compras e Reposição

Ajuda a equipe a decidir **o que comprar, quanto e por quê**, a partir do estoque
e das vendas reais, e a acompanhar o pedido até a mercadoria entrar no estoque.
Fica no menu **Compras**.

## Telas

| Tela | Para quê |
|---|---|
| **Compras** (`/compras`) | Painel: quantos itens precisam repor, quantos estão críticos, peças sugeridas, pedidos em aberto e o que chega, parados e excesso. Cada indicador leva à lista correspondente. |
| **Sugestões** (`/compras/sugestoes`) | Lista por variação (tamanho e cor) com estoque, vendas, quantidade sugerida e o motivo ("Por quê?"). Filtros: busca, categoria, fornecedor, situação, período. Marque os itens, ajuste a quantidade e gere o rascunho. |
| **Pedidos** (`/compras/pedidos`) | Lista e acompanhamento por status. |
| **Novo pedido** | Monta o pedido à mão: fornecedor, previsão, observações e itens buscados por nome, referência ou SKU. |
| **Pedido** (detalhe) | Itens, quantidades pedidas, recebidas e pendentes, recebimentos e ações de status. |

## Fluxo de um pedido

```
Rascunho → Pendente → Enviado ao fornecedor → Parcialmente recebido → Recebido
   └──────────┴──────────────┴──→ Cancelado (só antes de qualquer recebimento)
```

- **Rascunho**: editável, não conta como peças a caminho.
- **Pendente**: confirmado (exige fornecedor), editável. Conta como "a caminho".
- **Enviado**: marcado como enviado ao fornecedor. Não é mais editável.
- **Parcialmente recebido / Recebido**: mudam sozinhos conforme os recebimentos.
- **Cancelado**: vale para Rascunho, Pendente e Enviado. Pedido com mercadoria já recebida não é cancelado.

**Criar ou editar um pedido nunca altera o estoque.** O saldo só sobe em
**Registrar recebimento**: cada recebimento (parcial ou total) grava uma
**entrada** pela mesma rotina das entradas manuais, ligada ao pedido (a origem
aparece como "Pedido de compra #N · Fornecedor" no histórico, com link). O custo
informado no recebimento alimenta o custo médio. Se o recebimento foi lançado
por engano, estorne a entrada no Histórico: as quantidades voltam ao pedido.

Proteções: o mesmo envio repetido (duplo clique, rede lenta) não recebe duas
vezes; não se recebe mais do que falta no pedido; dois recebimentos simultâneos
do mesmo pedido são serializados.

## Como a sugestão é calculada

Para cada variação ativa (tamanho + cor), com os parâmetros abaixo:

1. **Ritmo** = peças vendidas nos últimos *janela* dias ÷ dias observados.
   Dias observados = dias desde o primeiro registro da variação, no máximo a
   janela. Vendas estornadas não contam; devoluções de clientes não são
   descontadas (decisão registrada abaixo).
2. **Meta** = ritmo × (*prazo de entrega* + *cobertura*), arredondado para cima, + estoque mínimo da variação.
3. **A caminho** = peças pedidas e ainda não recebidas em pedidos Pendente, Enviado ou Parcialmente recebido.
4. **Sugerido** = meta − estoque atual − a caminho (nunca negativo).

Situações:

| Situação | Quando |
|---|---|
| **Crítico** | Há sugestão e o estoque está zerado ou dura menos que o prazo de entrega. |
| **Repor** | Há sugestão (estoque ainda dura mais que o prazo). |
| **Abaixo do mínimo** | Está no mínimo ou abaixo, mas sem histórico confiável: mostra quantas peças faltam para o mínimo, **sem** inventar uma quantidade de compra. |
| **Parado** | Tem estoque e nenhuma venda na janela (com histórico suficiente). |
| **Excesso** | O estoque dura mais que o limite de excesso, no ritmo atual. |
| **Sem dados** | Poucas vendas ou pouco histórico para recomendar. |
| **Em dia** | Não precisa comprar agora. |

**Confiável** = pelo menos *vendas mínimas* operações de venda **e** *histórico mínimo* dias.
Sem isso o sistema diz "histórico insuficiente" (com os números) e não calcula
a quantidade.

Exemplo: vendeu 30 peças em 80 dias (0,375/dia), prazo 15 + cobertura 30 → meta
⌈0,375 × 45⌉ = 17. Com 10 em estoque e nada a caminho: sugerido 7.

### Parâmetros (configuráveis em Sugestões, por administrador e gerente)

| Parâmetro | Padrão | Significado |
|---|---|---|
| Janela de vendas | 90 dias | Quanto tempo de vendas olhar. |
| Prazo de entrega | 15 dias | Do pedido à chegada. |
| Cobertura desejada | 30 dias | Quanto tempo a compra deve durar. |
| Vendas mínimas | 3 | Abaixo disso, sem dados. |
| Histórico mínimo | 14 dias | Variações mais novas: sem dados. |
| Excesso acima de | 180 dias | Cobertura que vira excesso. |

O período pode ser trocado na hora no filtro **Período de vendas**.

## Permissões

| Papel | Pode |
|---|---|
| Administrador, Gerente | Tudo: criar/editar/cancelar pedidos, gerar rascunhos, receber, mudar parâmetros. |
| Operador | Consultar e **registrar recebimento** (é uma entrada de estoque, como já podia). |
| Consulta | Só consultar. |

## Banco de dados

Migration `20261105154117_modulo_compras` (só acrescenta, não altera nem apaga dados):

- `purchase_orders` (pedido: número por loja, fornecedor, status, previsão, observações, chave de idempotência);
- `purchase_order_items` (variação, quantidade pedida e recebida, custo combinado; CHECK: 0 ≤ recebido ≤ pedido);
- `purchase_settings` (parâmetros por loja; CHECK nos limites);
- coluna `stock_operations.purchase_order_id` (opcional): liga a entrada ao pedido.

## Limitações e decisões que dependem da Broomer

1. **Lote/múltiplo de compra** (grade fechada, caixa com N peças): a sugestão não arredonda para múltiplos. Se o fornecedor vende por grade, é preciso informar a regra.
2. **Sazonalidade e lançamentos**: o cálculo usa a média da janela. Coleção nova ou alta temporada pedem ajuste manual da quantidade (a sugestão é um ponto de partida) ou dos parâmetros.
3. **Prazo e cobertura iguais para todos os fornecedores**: se os prazos diferirem muito, vale configurar por fornecedor (ainda não existe).
4. **Recebimento acima do pedido** é recusado (para receber mais, edite o pedido antes de enviá-lo, ou registre uma entrada manual). Confirmar se a loja quer aceitar excedente.
5. **Encerrar pedido parcial** (o fornecedor não vai entregar o resto): hoje o pedido fica "Parcialmente recebido" e não pode ser cancelado. Falta definir o comportamento desejado.
6. **Devolução de cliente** não reduz o giro (só vendas estornadas saem do cálculo). Pode mudar se a Broomer preferir o giro líquido.
7. **Custos** aparecem para todos os papéis (como o valor do estoque já aparece); a decisão D-2 da auditoria (quem vê custos) vale também aqui.
8. **Fornecedor do produto**: o cadastro só guarda um fornecedor por modelo. Um produto comprado de dois fornecedores precisa ser escolhido manualmente no pedido.
9. A análise cobre até 10.000 variações por consulta (uma loja de moda tem bem menos); acima disso a tela avisa e pede filtros.

## Testes

`apps/api/src/purchases/suggestion-rules.spec.ts` (regra de cálculo) e
`apps/api/test/purchases.e2e-spec.ts` (fluxos completos contra o banco de teste:
sugestões, pedidos, recebimento parcial e total, estorno, idempotência,
concorrência, permissões e isolamento entre lojas, painel).
