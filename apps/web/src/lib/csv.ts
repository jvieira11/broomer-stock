// Célula de CSV para o Excel em português: separador ";" e aspas quando o
// texto tem ";", aspas ou quebra de linha.
//
// Texto que começa com =, +, -, @, tab ou quebra de linha seria lido pelo
// Excel como fórmula (um motivo digitado como "=HYPERLINK(...)" viraria um
// link ao abrir a planilha). Esses textos ganham um apóstrofo na frente e
// aparecem como texto. Números, como a quantidade -2 de uma venda, não.
const FORMULA_START = /^[=+\-@\t\r\n]/;

export function csvCell(value: string | number | null | undefined) {
  if (typeof value === "number") return String(value);
  let text = value ?? "";
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
