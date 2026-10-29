import assert from "node:assert/strict";
import { test } from "node:test";
import { csvCell } from "./csv.ts";

test("texto comum e vazio ficam como estão", () => {
  assert.equal(csvCell("Camisa linho"), "Camisa linho");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("números, inclusive negativos, continuam números", () => {
  assert.equal(csvCell(-2), "-2");
  assert.equal(csvCell(15), "15");
});

test("texto que começa como fórmula vira texto", () => {
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell('=HYPERLINK("http://x","clique")'), `"'=HYPERLINK(""http://x"",""clique"")"`);
  assert.equal(csvCell("+5521999"), "'+5521999");
  assert.equal(csvCell("-desconto"), "'-desconto");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("\tx"), "'\tx");
});

test("aspas, ponto e vírgula e quebras de linha são protegidos", () => {
  assert.equal(csvCell("a;b"), '"a;b"');
  assert.equal(csvCell('diz "oi"'), '"diz ""oi"""');
  assert.equal(csvCell("linha 1\nlinha 2"), '"linha 1\nlinha 2"');
});
