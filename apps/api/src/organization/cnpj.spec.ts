import { formatCnpj, isValidCnpj, normalizeCnpj } from './cnpj';

describe('CNPJ', () => {
  it('aceita CNPJ numérico válido, com ou sem pontuação', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('aceita o CNPJ alfanumérico (exemplo da Receita Federal)', () => {
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12abc34501de35')).toBe(true);
  });

  it('recusa dígito verificador errado, tamanho errado e repetidos', () => {
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
    expect(isValidCnpj('12.ABC.345/01DE-36')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
    // Os dígitos verificadores são sempre números.
    expect(isValidCnpj('12ABC34501DEAB')).toBe(false);
  });

  it('normaliza e formata', () => {
    expect(normalizeCnpj(' 12.abc.345/01de-35 ')).toBe('12ABC34501DE35');
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});
