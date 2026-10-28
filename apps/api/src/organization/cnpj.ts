// CNPJ com 14 caracteres: 12 letras ou números (o formato alfanumérico vale
// desde julho de 2026) e 2 dígitos verificadores. Cada caractere vale seu
// código ASCII menos 48, o que mantém o cálculo antigo para CNPJs só numéricos.

export function normalizeCnpj(value: string) {
  return value.replace(/[.\-/\s]/g, '').toUpperCase();
}

function checkDigit(base: string) {
  let weight = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += (base.charCodeAt(i) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  // 00.000.000/0000-00, 11.111.111/1111-11...: passam na conta, mas não existem.
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const first = checkDigit(cnpj.slice(0, 12));
  const second = checkDigit(cnpj.slice(0, 12) + first);
  return cnpj.endsWith(`${first}${second}`);
}

export function formatCnpj(cnpj: string) {
  return cnpj.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}
