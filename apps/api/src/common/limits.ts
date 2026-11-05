// Limites de bom senso para o que se digita. Estão bem abaixo do que o banco
// aguenta (inteiro de 32 bits e casas decimais das colunas), para que um zero a
// mais vire um aviso claro e não um erro interno.

// Peças em um item de operação, contagem de inventário e estoque mínimo.
export const MAX_QUANTITY = 1_000_000;

// Reais por peça (custo ou preço de venda).
export const MAX_MONEY = 1_000_000;

// Saldo de uma variação: abaixo de 2.147.483.647, o maior inteiro do banco.
export const MAX_BALANCE = 2_000_000_000;

const nf = new Intl.NumberFormat('pt-BR');
export const fmt = (n: number) => nf.format(n);
